(function (root) {
  "use strict";

  const PACKED_RECORD_MASK = 0x7fff;
  const TEXT_DECODER = new TextDecoder("utf-8", { fatal: false });
  const TYPE_TABLE = {
    2: { name: "float32", size: 4, read: (view, offset, little) => view.getFloat32(offset, little) },
    4: { name: "float64", size: 8, read: (view, offset, little) => view.getFloat64(offset, little) },
    8: { name: "int8", size: 1, read: (view, offset) => view.getInt8(offset) },
    0x10: { name: "int16", size: 2, read: (view, offset, little) => view.getInt16(offset, little) },
    0x20: { name: "int32", size: 4, read: (view, offset, little) => view.getInt32(offset, little) },
    0x48: { name: "uint8", size: 1, read: (view, offset) => view.getUint8(offset) },
    0x50: { name: "uint16", size: 2, read: (view, offset, little) => view.getUint16(offset, little) },
    0x60: { name: "uint32", size: 4, read: (view, offset, little) => view.getUint32(offset, little) }
  };

  function asArrayBuffer(input) {
    if (input instanceof ArrayBuffer) return input;
    if (ArrayBuffer.isView(input)) {
      return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    }
    throw new Error("Expected an ArrayBuffer");
  }

  function bytes(buffer, start = 0, length = buffer.byteLength - start) {
    return new Uint8Array(buffer, start, Math.max(0, length));
  }

  function cString(buffer, start, length) {
    const data = bytes(buffer, start, length);
    let end = data.indexOf(0);
    if (end < 0) end = data.length;
    return TEXT_DECODER.decode(data.slice(0, end)).trim();
  }

  function textFromBytes(data) {
    const arr = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    let end = arr.indexOf(0);
    if (end < 0) end = arr.length;
    return TEXT_DECODER.decode(arr.slice(0, end)).trim();
  }

  function validVersion(version) {
    return version === 1 || version === 2 || version === 3 || version === 5;
  }

  function chooseEndianForVersion(view, offset = 0) {
    const littleVersion = view.getInt16(offset, true);
    const bigVersion = view.getInt16(offset, false);
    if (validVersion(littleVersion)) return { little: true, version: littleVersion };
    if (validVersion(bigVersion)) return { little: false, version: bigVersion };
    throw new Error(`Unsupported Igor binary wave version: ${littleVersion}/${bigVersion}`);
  }

  function readFloat64Array(view, offset, count, little) {
    const values = [];
    for (let index = 0; index < count; index++) {
      values.push(view.getFloat64(offset + index * 8, little));
    }
    return values;
  }

  function readInt32Array(view, offset, count, little) {
    const values = [];
    for (let index = 0; index < count; index++) {
      values.push(view.getInt32(offset + index * 4, little));
    }
    return values;
  }

  function product(values) {
    return values.reduce((acc, value) => acc * Math.max(1, Number(value) || 0), 1);
  }

  function normalizeShape(shape, npnts) {
    const cleaned = shape.map(Number).filter(value => value > 0);
    if (cleaned.length) return cleaned;
    return [Math.max(0, Number(npnts) || 0)];
  }

  function defaultDimName(index) {
    return ["W", "X", "Y", "Z"][index] || `dim_${index}`;
  }

  function axisKind(name) {
    const text = String(name || "").toLowerCase();
    if (/(^|[^a-z])(ev|energy|binding|kinetic)([^a-z]|$)/.test(text)) return "energy";
    if (/(alpha|beta|theta|phi|angle|deg)/.test(text)) return "angle";
    if (/(^|[^a-z])k[xyz]?([^a-z]|$)|momentum/.test(text)) return "momentum";
    if (/temp|kelvin/.test(text)) return "temperature";
    return "axis";
  }

  function axisLabel(dim) {
    const name = dim?.name || "axis";
    const kind = axisKind(name);
    if (kind === "energy") return /kinetic/i.test(name) ? "Kinetic Energy [eV]" : "Energy [eV]";
    if (kind === "angle") return `${name} [deg]`;
    if (kind === "temperature") return "Temperature [K]";
    return name;
  }

  function readNoteAttrs(note) {
    const attrs = {};
    String(note || "").split(/\r?\n/).forEach(line => {
      const pos = line.indexOf("=");
      if (pos <= 0) return;
      const key = line.slice(0, pos).trim();
      const raw = line.slice(pos + 1).trim();
      if (!key) return;
      const number = Number(raw);
      attrs[key] = Number.isFinite(number) && raw !== "" ? number : raw;
    });
    return attrs;
  }

  function readWaveData(view, offset, shape, typeInfo, little) {
    const total = product(shape);
    const values = new Float32Array(total);
    for (let index = 0; index < total; index++) {
      const value = typeInfo.read(view, offset + index * typeInfo.size, little);
      values[index] = Number.isFinite(value) ? value : NaN;
    }
    return values;
  }

  function parseDimensionLabels(buffer, start, sizes, fallbackDims) {
    const labels = [];
    let offset = start;
    for (let dim = 0; dim < 4; dim++) {
      const size = Math.max(0, Number(sizes[dim]) || 0);
      if (!size) {
        labels.push("");
        continue;
      }
      const firstLabel = cString(buffer, offset, Math.min(32, size));
      labels.push(firstLabel || "");
      offset += size;
    }
    return labels.map((label, index) => label || fallbackDims[index] || "");
  }

  function parseIBW(buffer, fallbackName = "wave") {
    buffer = asArrayBuffer(buffer);
    const view = new DataView(buffer);
    const { little, version } = chooseEndianForVersion(view, 0);
    if (version !== 5) return parseLegacyIBW(buffer, fallbackName, little, version);

    const binOffset = 2;
    const waveOffset = 64;
    const checksum = view.getInt16(binOffset, little);
    const wfmSize = view.getInt32(binOffset + 2, little);
    const formulaSize = view.getInt32(binOffset + 6, little);
    const noteSize = view.getInt32(binOffset + 10, little);
    const dataEUnitsSize = view.getInt32(binOffset + 14, little);
    const dimEUnitsSize = readInt32Array(view, binOffset + 18, 4, little);
    const dimLabelsSize = readInt32Array(view, binOffset + 34, 4, little);
    const sIndicesSize = view.getInt32(binOffset + 50, little);
    const npnts = view.getInt32(waveOffset + 12, little);
    const waveType = view.getInt16(waveOffset + 16, little);
    const typeInfo = TYPE_TABLE[waveType];
    if (!typeInfo) throw new Error(`Unsupported Igor wave type ${waveType || "text/complex"}`);

    const name = cString(buffer, waveOffset + 28, 32) || fallbackName;
    const nDim = normalizeShape(readInt32Array(view, waveOffset + 68, 4, little), npnts);
    const sfA = readFloat64Array(view, waveOffset + 84, 4, little);
    const sfB = readFloat64Array(view, waveOffset + 116, 4, little);
    const dimUnits = [];
    for (let dim = 0; dim < 4; dim++) {
      dimUnits.push(cString(buffer, waveOffset + 152 + dim * 4, 4));
    }

    const headerSize = 320;
    const dataOffset = waveOffset + headerSize;
    const dataByteLength = product(nDim) * typeInfo.size;
    if (dataOffset + dataByteLength > buffer.byteLength) {
      throw new Error("Igor wave data is truncated");
    }

    let extraOffset = dataOffset + dataByteLength + Math.max(0, formulaSize);
    const note = cString(buffer, extraOffset, Math.max(0, noteSize));
    extraOffset += Math.max(0, noteSize) + Math.max(0, dataEUnitsSize);
    const extDimUnits = [];
    for (let dim = 0; dim < 4; dim++) {
      const size = Math.max(0, dimEUnitsSize[dim] || 0);
      extDimUnits.push(size ? cString(buffer, extraOffset, size) : "");
      extraOffset += size;
    }
    const dimNames = parseDimensionLabels(buffer, extraOffset, dimLabelsSize, dimUnits.map((unit, index) => unit || defaultDimName(index)));
    extraOffset += dimLabelsSize.reduce((sum, size) => sum + Math.max(0, size || 0), 0) + Math.max(0, sIndicesSize);

    const dims = nDim.map((length, index) => {
      const nameText = dimNames[index] || extDimUnits[index] || dimUnits[index] || defaultDimName(index);
      const coords = new Float64Array(length);
      const step = Number.isFinite(sfA[index]) ? sfA[index] : 1;
      const start = Number.isFinite(sfB[index]) ? sfB[index] : 0;
      for (let point = 0; point < length; point++) coords[point] = start + step * point;
      return { name: nameText, length, coords, kind: axisKind(nameText), label: axisLabel({ name: nameText }) };
    });

    return {
      name,
      path: `/${name}`,
      version,
      dtype: typeInfo.name,
      shape: nDim,
      dims,
      attrs: { ...readNoteAttrs(note), checksum, wfmSize },
      data: readWaveData(view, dataOffset, nDim, typeInfo, little),
      order: "fortran"
    };
  }

  function parseLegacyIBW(buffer, fallbackName, little, version) {
    const view = new DataView(buffer);
    let binOffset = 2;
    let waveOffset;
    let wfmSize;
    let noteSize = 0;
    if (version === 1) {
      wfmSize = view.getInt32(binOffset, little);
      waveOffset = 8;
    } else if (version === 2) {
      wfmSize = view.getInt32(binOffset, little);
      noteSize = view.getInt32(binOffset + 4, little);
      waveOffset = 16;
    } else if (version === 3) {
      wfmSize = view.getInt32(binOffset, little);
      noteSize = view.getInt32(binOffset + 4, little);
      waveOffset = 20;
    } else {
      throw new Error(`Unsupported Igor binary wave version ${version}`);
    }

    const waveType = view.getInt16(waveOffset, little);
    const typeInfo = TYPE_TABLE[waveType];
    if (!typeInfo) throw new Error(`Unsupported Igor wave type ${waveType || "text/complex"}`);
    const name = cString(buffer, waveOffset + 6, 20) || fallbackName;
    const npnts = view.getInt32(waveOffset + 42, little);
    const hsA = view.getFloat64(waveOffset + 50, little);
    const hsB = view.getFloat64(waveOffset + 58, little);
    const headerSize = 110;
    const dataOffset = waveOffset + headerSize;
    const shape = [Math.max(0, npnts)];
    const dataBytes = Math.max(0, wfmSize - headerSize - 16);
    const count = Math.min(shape[0], Math.floor(dataBytes / typeInfo.size));
    const coords = new Float64Array(count);
    for (let index = 0; index < count; index++) coords[index] = hsB + hsA * index;
    const data = readWaveData(view, dataOffset, [count], typeInfo, little);
    return {
      name,
      path: `/${name}`,
      version,
      dtype: typeInfo.name,
      shape: [count],
      dims: [{ name: "W", length: count, coords, kind: "axis", label: "W" }],
      attrs: { noteSize },
      data,
      order: "fortran"
    };
  }

  function parsePackedHeader(view, offset, little) {
    if (offset + 8 > view.byteLength) return null;
    const recordTypeRaw = view.getUint16(offset, little);
    const recordType = recordTypeRaw & PACKED_RECORD_MASK;
    const version = view.getInt16(offset + 2, little);
    const numDataBytes = view.getInt32(offset + 4, little);
    if (numDataBytes < 0 || offset + 8 + numDataBytes > view.byteLength) return null;
    return { recordTypeRaw, recordType, version, numDataBytes };
  }

  function choosePackedEndian(view, offset) {
    const little = parsePackedHeader(view, offset, true);
    const big = parsePackedHeader(view, offset, false);
    if (little && !big) return true;
    if (big && !little) return false;
    if (little && little.recordType < 128) return true;
    if (big && big.recordType < 128) return false;
    return true;
  }

  function parsePackedExperiment(buffer, filename = "experiment.pxt") {
    buffer = asArrayBuffer(buffer);
    const view = new DataView(buffer);
    let offset = 0;
    let little = choosePackedEndian(view, 0);
    const folderStack = [];
    const waves = [];
    let recordIndex = 0;
    while (offset + 8 <= buffer.byteLength && recordIndex < 250000) {
      let header = parsePackedHeader(view, offset, little);
      if (!header) {
        const alternate = parsePackedHeader(view, offset, !little);
        if (!alternate) break;
        little = !little;
        header = alternate;
      }
      offset += 8;
      const recordStart = offset;
      const recordEnd = recordStart + header.numDataBytes;
      if (header.recordType === 3) {
        try {
          const waveBuffer = buffer.slice(recordStart, recordEnd);
          const wave = parseIBW(waveBuffer, `wave_${waves.length + 1}`);
          const parent = folderStack.length ? `/${folderStack.join("/")}` : "";
          wave.path = `${parent}/${wave.name}`.replace(/\/+/g, "/");
          waves.push(wave);
        } catch (error) {
          waves.push({
            name: `unreadable_wave_${waves.length + 1}`,
            path: `/${folderStack.concat(`unreadable_wave_${waves.length + 1}`).join("/")}`,
            error: String(error?.message || error),
            shape: [],
            dims: [],
            attrs: {}
          });
        }
      } else if (header.recordType === 9) {
        const name = cString(buffer, recordStart, header.numDataBytes) || `folder_${folderStack.length + 1}`;
        folderStack.push(name);
      } else if (header.recordType === 10) {
        folderStack.pop();
      }
      offset = recordEnd;
      recordIndex++;
    }
    const readable = waves.filter(wave => wave.data && wave.shape && wave.shape.length);
    if (!readable.length) throw new Error(`No readable Igor wave records found in ${filename}`);
    return readable;
  }

  function waveScore(wave) {
    if (!wave?.data || !wave.shape || wave.shape.length < 1) return -Infinity;
    const size = product(wave.shape);
    let score = Math.log10(Math.max(size, 10));
    if (wave.shape.length >= 2) score += 60;
    const text = `${wave.path || ""} ${wave.name || ""} ${wave.dims?.map(dim => dim.name).join(" ") || ""}`.toLowerCase();
    [
      ["fine_cut", 100],
      ["cut", 70],
      ["map", 55],
      ["spectrum", 42],
      ["intensity", 35],
      ["image", 20],
      ["wave", 8]
    ].forEach(([word, points]) => {
      if (text.includes(word)) score += points;
    });
    return score;
  }

  function choosePrimaryWave(waves) {
    const readable = waves.filter(wave => wave?.data);
    if (!readable.length) throw new Error("No numeric Igor wave was found");
    return readable.slice().sort((a, b) => waveScore(b) - waveScore(a))[0];
  }

  function fortranIndex(shape, coords) {
    let stride = 1;
    let index = 0;
    for (let dim = 0; dim < shape.length; dim++) {
      index += (coords[dim] || 0) * stride;
      stride *= shape[dim];
    }
    return index;
  }

  function selectPreviewDims(wave) {
    const shape = wave.shape || [];
    if (shape.length === 1) return { xDim: 0, yDim: 0, fixedDim: null, fixedIndex: 0 };
    const dims = wave.dims || [];
    const energy = dims.map((dim, index) => ({ dim, index })).find(item => item.dim?.kind === "energy");
    const angle = dims.map((dim, index) => ({ dim, index })).find(item => item.dim?.kind === "angle" || item.dim?.kind === "momentum");
    let yDim = energy?.index ?? 0;
    let xDim = angle?.index ?? (yDim === 0 ? 1 : 0);
    if (xDim === yDim) xDim = yDim === 0 ? 1 : 0;
    let fixedDim = null;
    for (let index = 0; index < shape.length; index++) {
      if (index !== xDim && index !== yDim) {
        fixedDim = index;
        break;
      }
    }
    return { xDim, yDim, fixedDim, fixedIndex: fixedDim == null ? 0 : Math.floor(shape[fixedDim] / 2) };
  }

  function qualityFilteredScale(values) {
    const finite = Array.from(values).filter(Number.isFinite);
    if (!finite.length) throw new Error("No finite values in Igor wave");
    finite.sort((a, b) => a - b);
    const q1 = finite[Math.floor((finite.length - 1) * 0.25)];
    const q3 = finite[Math.floor((finite.length - 1) * 0.75)];
    const iqr = Math.max(1e-12, q3 - q1);
    const lowGuard = q1 - iqr * 8;
    const highGuard = q3 + iqr * 8;
    const filtered = finite.filter(value => value >= lowGuard && value <= highGuard);
    const scale = filtered.length ? filtered : finite;
    return {
      finite,
      min: scale[0],
      max: scale[scale.length - 1],
      low: scale[Math.floor((scale.length - 1) * 0.02)],
      high: scale[Math.floor((scale.length - 1) * 0.98)]
    };
  }

  function sampleWave(wave, dims, options = {}) {
    const maxCols = options.maxCols || 760;
    const maxRows = options.maxRows || 420;
    const xLen = Math.max(1, wave.shape[dims.xDim] || 1);
    const yLen = Math.max(1, dims.yDim === dims.xDim ? 1 : (wave.shape[dims.yDim] || 1));
    const cols = Math.min(maxCols, xLen);
    const rows = Math.min(maxRows, yLen);
    const values = new Float32Array(cols * rows);
    const coords = new Array(wave.shape.length).fill(0);
    if (dims.fixedDim != null) coords[dims.fixedDim] = dims.fixedIndex;
    for (let row = 0; row < rows; row++) {
      coords[dims.yDim] = dims.yDim === dims.xDim ? 0 : Math.min(yLen - 1, Math.floor(row * yLen / rows));
      for (let col = 0; col < cols; col++) {
        coords[dims.xDim] = Math.min(xLen - 1, Math.floor(col * xLen / cols));
        values[row * cols + col] = wave.data[fortranIndex(wave.shape, coords)];
      }
    }
    const scale = qualityFilteredScale(values);
    return {
      values,
      cols,
      rows,
      min: scale.min,
      max: scale.max,
      low: scale.low,
      high: scale.high > scale.low ? scale.high : scale.max,
      xLen,
      yLen,
      byteSwapApplied: false
    };
  }

  function axisRange(wave, dimIndex) {
    const coords = wave.dims?.[dimIndex]?.coords;
    if (!coords || coords.length < 2) return { first: 0, last: Math.max(0, (wave.shape?.[dimIndex] || 1) - 1) };
    return { first: Number(coords[0]), last: Number(coords[coords.length - 1]) };
  }

  function buildPreviewPlan(wave) {
    const dims = selectPreviewDims(wave);
    return {
      name: wave.name || "Igor wave",
      path: wave.path || `/${wave.name || "wave"}`,
      shape: wave.shape || [],
      dtype: wave.dtype || "numeric",
      xDim: dims.xDim,
      yDim: dims.yDim,
      fixedDim: dims.fixedDim,
      fixedIndex: dims.fixedIndex,
      fixedLabel: dims.fixedDim == null ? "" : axisLabel(wave.dims?.[dims.fixedDim]),
      xLabel: axisLabel(wave.dims?.[dims.xDim]),
      yLabel: dims.yDim === dims.xDim ? "Intensity" : axisLabel(wave.dims?.[dims.yDim]),
      xRange: axisRange(wave, dims.xDim),
      yRange: dims.yDim === dims.xDim ? { first: 0, last: 1 } : axisRange(wave, dims.yDim)
    };
  }

  function parseFileBuffer(buffer, filename = "igor-file") {
    const lower = String(filename || "").toLowerCase();
    const waves = /\.(pxt|pxp)$/i.test(lower)
      ? parsePackedExperiment(buffer, filename)
      : [parseIBW(buffer, filename.replace(/\.[^.]+$/, "") || "wave")];
    const primary = choosePrimaryWave(waves);
    const plan = buildPreviewPlan(primary);
    const sample = sampleWave(primary, selectPreviewDims(primary));
    return {
      kind: "igor-pxt-preview-v1",
      filename,
      waves,
      primary,
      plan,
      sample,
      summary: {
        wave_count: waves.length,
        primary_path: primary.path,
        primary_shape: primary.shape,
        primary_dtype: primary.dtype
      }
    };
  }

  const api = {
    parseIBW,
    parsePackedExperiment,
    parseFileBuffer,
    choosePrimaryWave,
    buildPreviewPlan,
    selectPreviewDims,
    sampleWave
  };

  root.IgorPxtReader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
