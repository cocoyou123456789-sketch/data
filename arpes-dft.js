(function initArpesDftModule(global) {
  "use strict";

  const MAX_TEXT_POINTS = 500000;
  const PROJECT_KIND = "arpes-dft-browser-project";
  const PROJECT_VERSION = 1;
  const STORAGE_KEY = "arpes-dft-workbench-v1";
  const USER_STORAGE_KEY = "arpes-explorer-user-v1";
  const PROJECT_DB_NAME = "arpes-dft-workbench";
  const PROJECT_DB_STORE = "projects";

  function finiteNumber(value) {
    const normalized = String(value ?? "")
      .trim()
      .replace(/([0-9.])D([+-]?\d+)/gi, "$1E$2");
    if (!normalized) return NaN;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
  }

  function cleanDataLine(line) {
    return String(line || "")
      .replace(/\s+(?:#|!|\/\/).*$/, "")
      .trim();
  }

  function dataTokens(line) {
    const clean = cleanDataLine(line);
    if (!clean || /^(?:#|!|\/\/)/.test(clean)) return [];
    if (clean.includes(",")) return clean.split(",").map(token => token.trim());
    if (clean.includes(";")) return clean.split(";").map(token => token.trim());
    return clean.split(/\s+/).map(token => token.trim());
  }

  function numericRow(line) {
    return dataTokens(line).map(finiteNumber);
  }

  function usableNumericRow(row) {
    return Array.isArray(row) && row.length >= 2 && Number.isFinite(row[0]);
  }

  function orderedBand(points, name, metadata = {}) {
    const normalized = (points || []).map(point => [finiteNumber(point?.[0]), finiteNumber(point?.[1])]);
    if (normalized.filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1])).length < 2) return null;
    const k = [];
    const energy = [];
    for (const point of normalized) {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        if (k.length && Number.isFinite(energy[energy.length - 1])) {
          k.push(Number.isFinite(point[0]) ? point[0] : NaN);
          energy.push(NaN);
        }
        continue;
      }
      const lastIndex = k.length - 1;
      if (lastIndex >= 0
        && Number.isFinite(k[lastIndex])
        && Number.isFinite(energy[lastIndex])
        && Math.abs(k[lastIndex] - point[0]) <= 1e-12
        && Math.abs(energy[lastIndex] - point[1]) <= 1e-12) {
        energy[lastIndex] = point[1];
      } else {
        k.push(point[0]);
        energy.push(point[1]);
      }
    }
    const sourceKMin = Number(metadata.sourceKMin);
    const sourceKMax = Number(metadata.sourceKMax);
    return {
      name,
      k,
      energy,
      ...(Number.isFinite(sourceKMin) && Number.isFinite(sourceKMax) && sourceKMin !== sourceKMax
        ? { sourceKMin, sourceKMax }
        : {})
    };
  }

  function datasetExtents(bands) {
    let kMin = Infinity;
    let kMax = -Infinity;
    let energyMin = Infinity;
    let energyMax = -Infinity;
    let pointCount = 0;
    for (const band of bands || []) {
      const length = Math.min(band.k?.length || 0, band.energy?.length || 0);
      pointCount += length;
      for (let index = 0; index < length; index += 1) {
        const kValue = Number(band.k[index]);
        const energyValue = Number(band.energy[index]);
        if (Number.isFinite(kValue)) {
          kMin = Math.min(kMin, kValue);
          kMax = Math.max(kMax, kValue);
        }
        if (Number.isFinite(energyValue)) {
          energyMin = Math.min(energyMin, energyValue);
          energyMax = Math.max(energyMax, energyValue);
        }
      }
    }
    return {
      kMin: Number.isFinite(kMin) ? kMin : 0,
      kMax: Number.isFinite(kMax) ? kMax : 1,
      energyMin: Number.isFinite(energyMin) ? energyMin : -1,
      energyMax: Number.isFinite(energyMax) ? energyMax : 1,
      pointCount
    };
  }

  function finalizeDataset(bands, metadata = {}) {
    const cleanBands = (bands || []).filter(Boolean);
    if (!cleanBands.length) throw new Error("No valid DFT bands were found");
    const extents = datasetExtents(cleanBands);
    if (extents.pointCount > MAX_TEXT_POINTS) {
      throw new Error(`DFT input has ${extents.pointCount} points; the browser limit is ${MAX_TEXT_POINTS}`);
    }
    return {
      kind: "dft-bands-v1",
      bands: cleanBands,
      ...extents,
      format: metadata.format || "auto",
      sourceFiles: Array.from(metadata.sourceFiles || []).filter(Boolean),
      importedAt: metadata.importedAt || new Date().toISOString()
    };
  }

  function normalizedHeaderToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function parseNamedLongTable(normalized, filename) {
    const lines = normalized.split("\n").filter(line => dataTokens(line).length);
    if (!lines.length) return null;
    const header = dataTokens(lines[0]);
    const normalizedHeader = header.map(normalizedHeaderToken);
    const bandIndex = normalizedHeader.findIndex(token => /^(band|bandindex|iband|bandid)$/.test(token));
    const kIndex = normalizedHeader.findIndex(token => /^(k|kpath|kdistance|kpathdistance)$/.test(token));
    const energyIndex = normalizedHeader.findIndex(token => /^(e|energy|eigenvalue|eigenenergy)$/.test(token));
    const cartesianKCount = normalizedHeader.filter(token => /^(kx|ky|kz)$/.test(token)).length;
    if (cartesianKCount >= 2 && energyIndex >= 0 && kIndex < 0) {
      throw new Error("Cartesian kx/ky/kz tables need a scalar k-path column before they can be overlaid");
    }
    if (bandIndex < 0 || kIndex < 0 || energyIndex < 0) return null;
    const groups = new Map();
    for (const line of lines.slice(1)) {
      const tokens = dataTokens(line);
      const bandId = tokens[bandIndex];
      const kValue = finiteNumber(tokens[kIndex]);
      const energyValue = finiteNumber(tokens[energyIndex]);
      if (!String(bandId || "").trim() || !Number.isFinite(kValue) || !Number.isFinite(energyValue)) continue;
      if (!groups.has(String(bandId))) groups.set(String(bandId), []);
      groups.get(String(bandId)).push([kValue, energyValue]);
    }
    const bands = [...groups.entries()].map(([bandId, points]) => orderedBand(points, `Band ${bandId}`));
    if (!bands.filter(Boolean).length) throw new Error("The named band/k/energy table contains no valid rows");
    return finalizeDataset(bands, { format: "long table (band, k, E)", sourceFiles: [filename] });
  }

  function parseDftText(text, filename = "bands.dat") {
    const normalized = String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n");
    if (/(?:^|\n)\s*&plot\b|\bnbnd\s*=|\bnks\s*=/i.test(normalized)) {
      throw new Error("Native QE bands.dat is not a plottable two-column file; export bands.dat.gnu first");
    }
    const namedTable = parseNamedLongTable(normalized, filename);
    if (namedTable) return namedTable;
    const meaningfulLines = normalized.split("\n").filter(line => dataTokens(line).length);
    const firstTokens = dataTokens(meaningfulLines[0] || "");
    const firstHeader = firstTokens.map(normalizedHeaderToken);
    const hasTextHeader = firstTokens.some(token => !Number.isFinite(finiteNumber(token)));
    const matrixLikeHeader = /^(k|kpath|kdistance|kpathdistance)$/.test(firstHeader[0] || "")
      && firstHeader.slice(1).every(token => /^(?:e|energy|eigenvalue|eigenenergy|band)?\d*$/.test(token));
    if (hasTextHeader && !matrixLikeHeader) {
      throw new Error("Unsupported DFT table header; use k + energy columns or named band/k/energy columns");
    }
    const rawBlocks = normalized.split(/\n\s*\n+/);
    const blocks = rawBlocks
      .map(block => block.split("\n").map(numericRow).filter(usableNumericRow))
      .filter(rows => rows.length >= 2);
    const allRows = normalized.split("\n").map(numericRow).filter(usableNumericRow);
    if (allRows.length < 2) throw new Error("DFT text needs at least two numeric rows");

    const twoColumnBlocks = blocks.length > 1 && blocks.every(rows => {
      const twoColumnRows = rows.filter(row => row.length === 2).length;
      return twoColumnRows / rows.length >= 0.8;
    });
    if (twoColumnBlocks) {
      const bands = blocks.map((rows, index) => orderedBand(rows.map(row => [row[0], row[1]]), `Band ${index + 1}`));
      return finalizeDataset(bands, { format: "QE blocks (k, E)", sourceFiles: [filename] });
    }

    const widthCounts = new Map();
    for (const row of allRows) widthCounts.set(row.length, (widthCounts.get(row.length) || 0) + 1);
    const dominantWidth = [...widthCounts.entries()]
      .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0] || 2;

    if (dominantWidth >= 3) {
      const matrixRows = allRows.filter(row => row.length >= dominantWidth);
      const bands = [];
      for (let column = 1; column < dominantWidth; column += 1) {
        bands.push(orderedBand(matrixRows.map(row => [row[0], row[column]]), `Band ${column}`));
      }
      return finalizeDataset(bands, { format: `matrix (k + ${dominantWidth - 1} bands)`, sourceFiles: [filename] });
    }

    const band = orderedBand(allRows.map(row => [row[0], row[1]]), "Band 1");
    return finalizeDataset([band], {
      format: "two-column path (k, E)",
      sourceFiles: [filename]
    });
  }

  function mergeDftDatasets(datasets) {
    const valid = (datasets || []).filter(dataset => dataset?.bands?.length);
    if (!valid.length) throw new Error("No DFT datasets to merge");
    const bands = [];
    valid.forEach((dataset, datasetIndex) => {
      dataset.bands.forEach((band, bandIndex) => {
        bands.push({
          name: valid.length > 1
            ? `${dataset.sourceFiles?.[0] || `File ${datasetIndex + 1}`} · ${band.name || `Band ${bandIndex + 1}`}`
            : (band.name || `Band ${bandIndex + 1}`),
          k: Array.from(band.k || []),
          energy: Array.from(band.energy || []),
          sourceKMin: Number.isFinite(Number(band.sourceKMin)) ? Number(band.sourceKMin) : Number(dataset.kMin),
          sourceKMax: Number.isFinite(Number(band.sourceKMax)) ? Number(band.sourceKMax) : Number(dataset.kMax)
        });
      });
    });
    return finalizeDataset(bands, {
      format: [...new Set(valid.map(dataset => dataset.format))].join(" + "),
      sourceFiles: valid.flatMap(dataset => dataset.sourceFiles || [])
    });
  }

  function parseSymmetryPoints(value) {
    const points = [];
    for (const part of String(value || "").split(/[,;，；]+/)) {
      const match = part.trim().match(/^([^=:]+)\s*[=:]\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?)$/);
      if (!match) continue;
      const position = Number(match[2]);
      if (Number.isFinite(position)) points.push({ label: match[1].trim(), position });
    }
    return points.sort((left, right) => left.position - right.position);
  }

  function gaussianSmooth(values, sigma = 2) {
    const numericSigma = Math.max(0.25, Number(sigma) || 2);
    const radius = Math.max(1, Math.ceil(numericSigma * 3));
    const kernel = [];
    let total = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const weight = Math.exp(-(offset * offset) / (2 * numericSigma * numericSigma));
      kernel.push(weight);
      total += weight;
    }
    return values.map((_, index) => {
      let sum = 0;
      let used = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const source = Math.max(0, Math.min(values.length - 1, index + offset));
        const value = Number(values[source]);
        const weight = kernel[offset + radius] / total;
        if (!Number.isFinite(value)) continue;
        sum += value * weight;
        used += weight;
      }
      return used ? sum / used : NaN;
    });
  }

  function estimateFermiFromMatrix(values, rows, cols, energyRange, sigma = 2, options = {}) {
    if (!values || rows < 3 || cols < 1) throw new Error("ARPES preview does not contain a usable 2D matrix");
    const edc = new Array(rows).fill(NaN);
    for (let row = 0; row < rows; row += 1) {
      let sum = 0;
      let count = 0;
      for (let col = 0; col < cols; col += 1) {
        const value = Number(values[row * cols + col]);
        if (!Number.isFinite(value)) continue;
        sum += value;
        count += 1;
      }
      if (count) edc[row] = sum / count;
    }
    const smooth = gaussianSmooth(edc, sigma);
    const first = Number(energyRange?.first);
    const last = Number(energyRange?.last);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === last) {
      throw new Error("The current ARPES energy axis is unavailable");
    }
    const energyAt = index => first + (last - first) * index / Math.max(1, rows - 1);
    const edge = Math.max(1, Math.floor(rows * 0.04));
    const rangeMin = Math.min(first, last);
    const rangeMax = Math.max(first, last);
    const span = rangeMax - rangeMin;
    const preferredCenter = Number(options.center);
    const searchCenter = Number.isFinite(preferredCenter) && preferredCenter >= rangeMin && preferredCenter <= rangeMax
      ? preferredCenter
      : (rangeMin <= 0 && rangeMax >= 0 ? 0 : NaN);
    const searchHalfWidth = Number.isFinite(searchCenter) ? Math.max(span * 0.18, span / Math.max(8, rows)) : Infinity;
    const expectedSign = options.direction === "binding" ? 1 : -1;
    const finiteSmooth = smooth.filter(Number.isFinite);
    const signalMin = finiteSmooth.length ? finiteSmooth.reduce((value, item) => Math.min(value, item), Infinity) : NaN;
    const signalMax = finiteSmooth.length ? finiteSmooth.reduce((value, item) => Math.max(value, item), -Infinity) : NaN;
    const signalSpan = signalMax - signalMin;
    const signalScale = Math.max(Math.abs(signalMin) || 0, Math.abs(signalMax) || 0, 1);
    if (!Number.isFinite(signalSpan) || signalSpan <= Math.max(1e-12, signalScale * 1e-10)) {
      throw new Error("The spectrum has no measurable Fermi-edge contrast");
    }
    const candidates = [];
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let index = edge; index < rows - edge; index += 1) {
      const previous = smooth[Math.max(0, index - 1)];
      const next = smooth[Math.min(rows - 1, index + 1)];
      const deltaEnergy = energyAt(Math.min(rows - 1, index + 1)) - energyAt(Math.max(0, index - 1));
      if (!Number.isFinite(previous) || !Number.isFinite(next) || !deltaEnergy) continue;
      const energy = energyAt(index);
      if (Number.isFinite(searchCenter) && Math.abs(energy - searchCenter) > searchHalfWidth) continue;
      const derivative = (next - previous) / deltaEnergy;
      const signedScore = derivative * expectedSign;
      const score = signedScore > 0 ? signedScore : Math.abs(derivative) * 0.18;
      candidates.push(Math.abs(derivative));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) throw new Error("Could not estimate a finite Fermi edge");
    const sortedCandidates = candidates.filter(Number.isFinite).sort((left, right) => left - right);
    const baseline = sortedCandidates[Math.floor(sortedCandidates.length * 0.5)] || 0;
    const derivativeFloor = signalSpan / Math.max(span, Number.EPSILON) * 1e-6;
    if (!Number.isFinite(bestScore) || bestScore <= derivativeFloor) {
      throw new Error("No measurable Fermi edge was found in the selected energy window");
    }
    const details = {
      value: energyAt(bestIndex),
      confidence: bestScore / Math.max(baseline, derivativeFloor),
      searchedNear: Number.isFinite(searchCenter) ? searchCenter : null
    };
    return options.details ? details : details.value;
  }

  function interpolateBandEnergy(band, kValue) {
    const k = band?.k || [];
    const energy = band?.energy || [];
    if (k.length < 2 || energy.length < 2) return NaN;
    for (let index = 1; index < Math.min(k.length, energy.length); index += 1) {
      const leftK = Number(k[index - 1]);
      const rightK = Number(k[index]);
      if (!Number.isFinite(leftK) || !Number.isFinite(rightK)) continue;
      const lower = Math.min(leftK, rightK);
      const upper = Math.max(leftK, rightK);
      if (kValue < lower || kValue > upper) continue;
      const span = rightK - leftK;
      if (!span) return Number(energy[index - 1]);
      const ratio = (kValue - leftK) / span;
      return Number(energy[index - 1]) + (Number(energy[index]) - Number(energy[index - 1])) * ratio;
    }
    return NaN;
  }

  function clipSegmentToRect(x1, y1, x2, y2, rect) {
    if (![x1, y1, x2, y2, rect?.x, rect?.y, rect?.w, rect?.h].every(Number.isFinite)) return null;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
    let start = 0;
    let end = 1;
    for (let index = 0; index < 4; index += 1) {
      if (Math.abs(p[index]) <= 1e-12) {
        if (q[index] < 0) return null;
        continue;
      }
      const ratio = q[index] / p[index];
      if (p[index] < 0) start = Math.max(start, ratio);
      else end = Math.min(end, ratio);
      if (start > end) return null;
    }
    return {
      x1: x1 + start * dx,
      y1: y1 + start * dy,
      x2: x1 + end * dx,
      y2: y1 + end * dy
    };
  }

  function arpesContextFromPlan(plan, source = {}) {
    if (!plan) return null;
    const filename = String(typeof source === "string" ? source : (source.filename || "")).trim();
    const sourceId = String(typeof source === "object" ? (source.sourceId || "") : "").trim();
    const sourceArchive = String(typeof source === "object" ? (source.sourceArchive || "") : "").trim();
    const rawSourceSize = typeof source === "object" ? source.sourceSize : null;
    const rawSourceLastModified = typeof source === "object" ? source.sourceLastModified : null;
    const sourceSize = rawSourceSize == null ? NaN : Number(rawSourceSize);
    const sourceLastModified = rawSourceLastModified == null ? NaN : Number(rawSourceLastModified);
    const path = String(plan.path || "").trim();
    const name = String(plan.name || "").trim();
    const dtype = String(plan.dtype || "").trim();
    const shape = Array.from(plan.originalShape || plan.shape || []).map(Number).filter(Number.isFinite);
    const rawRanges = plan.__arpesDftRawRanges || {};
    const rawLabels = plan.__arpesDftRawLabels || {};
    const axesByDimension = new Map();
    [
      [plan.xDim, "x", plan.xLabel, plan.xRange],
      [plan.yDim, "y", plan.yLabel, plan.yRange],
      [plan.fixedDim, "fixed", plan.fixedLabel, plan.fixedRange]
    ].forEach(([dimension, fallback, label, range]) => {
      if (!range) return;
      const key = Number.isInteger(dimension) ? String(dimension) : fallback;
      const raw = rawRanges[key] || range;
      const rawFirst = Number(raw?.first);
      const rawLast = Number(raw?.last);
      const finiteEndpoints = Number.isFinite(rawFirst) && Number.isFinite(rawLast);
      axesByDimension.set(key, {
        dimension: key,
        label: String(rawLabels[key] || label || ""),
        // Axis direction can flip when the preview is re-oriented or calibrated.
        // The physical extent is part of source identity; display direction is not.
        first: finiteEndpoints ? Math.min(rawFirst, rawLast) : null,
        last: finiteEndpoints ? Math.max(rawFirst, rawLast) : null,
        length: Number.isFinite(Number(raw?.length)) ? Number(raw.length) : null
      });
    });
    const axes = [...axesByDimension.values()].sort((left, right) => left.dimension.localeCompare(right.dimension));
    const identity = [
      sourceId,
      sourceArchive,
      filename,
      path,
      name,
      dtype,
      shape.join("x"),
      JSON.stringify(axes),
      Number.isFinite(sourceSize) ? sourceSize : "",
      Number.isFinite(sourceLastModified) ? sourceLastModified : ""
    ];
    if (!identity.some(Boolean)) return null;
    return {
      fingerprint: JSON.stringify(identity),
      sourceId,
      sourceArchive,
      sourceSize: Number.isFinite(sourceSize) ? sourceSize : null,
      sourceLastModified: Number.isFinite(sourceLastModified) ? sourceLastModified : null,
      filename,
      path,
      name,
      dtype,
      shape,
      axes
    };
  }

  function normalizedArpesContext(value) {
    if (!value || typeof value !== "object") return null;
    const filename = String(value.filename || "").trim();
    const sourceId = String(value.sourceId || "").trim();
    const sourceArchive = String(value.sourceArchive || "").trim();
    const sourceSize = value.sourceSize == null ? NaN : Number(value.sourceSize);
    const sourceLastModified = value.sourceLastModified == null ? NaN : Number(value.sourceLastModified);
    const path = String(value.path || "").trim();
    const name = String(value.name || "").trim();
    const dtype = String(value.dtype || "").trim();
    const shape = Array.from(value.shape || []).map(Number).filter(Number.isFinite);
    const axes = Array.isArray(value.axes) ? value.axes.map(axis => ({
      dimension: String(axis?.dimension || ""),
      label: String(axis?.label || ""),
      first: axis?.first != null && Number.isFinite(Number(axis.first)) ? Number(axis.first) : null,
      last: axis?.last != null && Number.isFinite(Number(axis.last)) ? Number(axis.last) : null,
      length: axis?.length != null && Number.isFinite(Number(axis.length)) ? Number(axis.length) : null
    })) : [];
    const fingerprint = String(value.fingerprint || JSON.stringify([
      sourceId,
      sourceArchive,
      filename,
      path,
      name,
      dtype,
      shape.join("x"),
      JSON.stringify(axes),
      Number.isFinite(sourceSize) ? sourceSize : "",
      Number.isFinite(sourceLastModified) ? sourceLastModified : ""
    ]));
    return fingerprint ? {
      fingerprint,
      sourceId,
      sourceArchive,
      sourceSize: Number.isFinite(sourceSize) ? sourceSize : null,
      sourceLastModified: Number.isFinite(sourceLastModified) ? sourceLastModified : null,
      filename,
      path,
      name,
      dtype,
      shape,
      axes
    } : null;
  }

  function sameArpesContext(left, right) {
    return !!left?.fingerprint && left.fingerprint === right?.fingerprint;
  }

  function resolveEnergyDirection(label, preference = "auto") {
    if (preference === "binding" || preference === "electron") return preference;
    return /binding|结合能|e[_\s-]?b\b/i.test(String(label || "")) ? "binding" : "electron";
  }

  function energyUnitScale(label) {
    const value = String(label || "").toLowerCase().replace(/μ/g, "u");
    if (/\bmev\b/.test(value)) return 1e-3;
    if (/\b(?:uev|microelectronvolt)/.test(value)) return 1e-6;
    if (/\bkev\b/.test(value)) return 1e3;
    if (/\bev\b/.test(value.replace(/[()[\]]/g, " "))) return 1;
    return null;
  }

  function transformEnergyRange(range, fermi, direction = "electron", unitScale = 1) {
    if (!range || !Number.isFinite(Number(range.first)) || !Number.isFinite(Number(range.last))) return range;
    const ef = Number(fermi) || 0;
    const scale = Number.isFinite(Number(unitScale)) ? Number(unitScale) : 1;
    const convert = direction === "binding"
      ? value => ef - Number(value) * scale
      : value => Number(value) * scale - ef;
    return { ...range, first: convert(range.first), last: convert(range.last) };
  }

  function mapKToRange(rawK, sourceMin, sourceMax, targetMin, targetMax) {
    const values = [rawK, sourceMin, sourceMax, targetMin, targetMax].map(Number);
    if (!values.every(Number.isFinite) || values[1] === values[2]) return Number(rawK);
    return values[3] + (values[0] - values[1]) / (values[2] - values[1]) * (values[4] - values[3]);
  }

  function validateProject(project) {
    if (!project || project.kind !== PROJECT_KIND || Number(project.version) !== PROJECT_VERSION) {
      throw new Error("This is not a supported ARPES–DFT project file");
    }
    let dft = null;
    if (project.dft?.bands?.length) {
      dft = finalizeDataset(project.dft.bands.map((band, index) => orderedBand(
        (band.k || []).map((kValue, pointIndex) => [kValue, band.energy?.[pointIndex]]),
        band.name || `Band ${index + 1}`,
        { sourceKMin: band.sourceKMin, sourceKMax: band.sourceKMax }
      )), {
        format: project.dft.format || "project",
        sourceFiles: project.dft.sourceFiles || [],
        importedAt: project.dft.importedAt
      });
    }
    return {
      dft,
      settings: { ...(project.settings || {}) },
      arpesContext: normalizedArpesContext(project.arpesContext),
      savedAt: project.savedAt || ""
    };
  }

  const Core = {
    PROJECT_KIND,
    PROJECT_VERSION,
    arpesContextFromPlan,
    clipSegmentToRect,
    energyUnitScale,
    estimateFermiFromMatrix,
    finiteNumber,
    interpolateBandEnergy,
    mapKToRange,
    mergeDftDatasets,
    parseDftText,
    parseSymmetryPoints,
    resolveEnergyDirection,
    sameArpesContext,
    transformEnergyRange,
    validateProject
  };

  global.ArpesDftCore = Core;
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
  if (typeof document === "undefined") return;

  const TEXT = {
    zh: {
      title: "ARPES × DFT 联合分析",
      subtitle: "在浏览器中读取理论能带，并叠加到当前可调节的 ARPES 谱图；数据不会上传到服务器。",
      browser: "浏览器本地运行",
      waiting: "请先从上方上传区载入 ARPES 数据，再选择 DFT 能带文件",
      chooseDft: "选择 DFT 文件",
      importProject: "导入分析项目",
      clearDft: "清除 DFT",
      noDft: "尚未载入 DFT；支持 QE bands.dat.gnu、k+多能带矩阵，以及 band/k/E 长表。",
      dftFermi: "DFT 费米能 EF (eV)",
      arpesFermi: "ARPES 费米能 EF (eV)",
      energyDirection: "ARPES 能量约定",
      energyDirectionAuto: "自动（按轴名称识别 Binding Energy）",
      energyDirectionElectron: "电子能量 / 动能：E − EF",
      energyDirectionBinding: "Binding Energy：EF − EB",
      sigma: "自动 EF 平滑 σ（采样点）",
      kScale: "直接映射时 k 比例",
      kOffset: "直接映射时 k 偏移",
      lineColor: "DFT 线条颜色",
      opacity: "叠加透明度",
      symmetry: "高对称点标注（仅独立预览，例如 Γ=0,M=1.25）",
      alignK: "按范围缩放 DFT k 轴到 ARPES",
      showOverlay: "在 ARPES 主图叠加 DFT",
      estimateEf: "启发式估计 ARPES EF",
      pickEf: "在图上点选 EF",
      cancelPickEf: "取消点选 EF",
      bindCurrent: "关联当前 ARPES",
      saveProject: "导出项目 JSON",
      resetSettings: "重置校准",
      note: "“按范围缩放”只是把 DFT 的最小/最大 k 线性映射到实验范围，不等同于按晶格或高对称点做物理配准；角度轴叠加也未进行 θ→k 转换，仅供视觉比较。取消勾选后可用 k 比例/偏移直接映射。超出能量窗的线段会裁切隐藏。项目 JSON 不含 ARPES 原始矩阵，换设备时仍需重新载入原文件。",
      chartTitle: "DFT 独立预览",
      metricBands: "能带",
      metricK: "k 范围",
      metricEnergy: "能量范围",
      noChart: "载入 DFT 文件后在这里显示理论能带",
      loaded: "已读取 {files}：{bands} 条能带，{points} 个点（{format}）",
      projectLoaded: "已恢复分析项目",
      restored: "已恢复上次本地分析",
      cleared: "DFT 已清除；ARPES 预览保持不变",
      arpesWaiting: "当前还没有可交互的 ARPES 谱图",
      axisWarning: "当前主图 y 轴不像能量轴；DFT 保留在独立预览中。",
      energyUnitWarning: "当前电子能量轴缺少可识别单位（eV/meV/keV）；为避免数量级错误，暂不校准或叠加。",
      axisRangeWarning: "当前主图缺少可读的物理坐标范围；DFT 不会叠加到像素索引轴。",
      horizontalAxisWarning: "当前主图横轴不是动量或角度轴；为避免错误配准，DFT 仅保留在独立预览中。",
      angleOverlayWarning: "DFT k 轴已按范围视觉映射到角度轴；未进行 θ→k 转换，不能用于定量物理配准。",
      overlayReady: "DFT 已与当前 ARPES 能量图联动",
      efEstimated: "已估计 ARPES EF = {value} eV，并从原始能量轴重新校准",
      efEstimatedLow: "估计 EF = {value} eV，但边缘置信度较低；建议在图上点选确认。",
      efPickPrompt: "请在 ARPES 主图上点击费米能位置",
      efPicked: "已从图上设置 ARPES EF = {value} eV",
      contextBound: "已关联当前 ARPES 数据；EF 已重置，请重新估计或点选",
      contextMismatch: "已保存的 DFT/EF 属于另一份 ARPES 数据；请点“关联当前 ARPES”后再校准。",
      contextUnbound: "DFT 已载入，但尚未关联 ARPES 数据；独立预览可用。",
      efEstimateFailed: "无法估计 ARPES EF：{message}",
      invalidDft: "无法读取 DFT 文件：{message}",
      invalidProject: "无法导入项目：{message}",
      savedLocal: "参数和 DFT 数据已自动保存在当前浏览器",
      projectExported: "分析项目 JSON 已下载（含 DFT、校准参数和 ARPES 数据引用）",
      storageFailed: "当前分析可以继续，但浏览器保存失败：{message}。请导出项目 JSON。",
      noProjectData: "目前没有 DFT 数据；仍会导出当前校准参数。",
      resetDone: "ARPES/DFT 校准参数已重置"
    },
    en: {
      title: "ARPES × DFT analysis",
      subtitle: "Read theoretical bands in the browser and overlay them on the current interactive ARPES map. Nothing is uploaded.",
      browser: "Runs locally in browser",
      waiting: "Load ARPES data in the upload area above, then choose DFT band files",
      chooseDft: "Choose DFT files",
      importProject: "Import analysis project",
      clearDft: "Clear DFT",
      noDft: "No DFT loaded. Supports QE bands.dat.gnu, k + multi-band matrices, and named band/k/E tables.",
      dftFermi: "DFT Fermi level EF (eV)",
      arpesFermi: "ARPES Fermi level EF (eV)",
      energyDirection: "ARPES energy convention",
      energyDirectionAuto: "Auto (detect Binding Energy from axis label)",
      energyDirectionElectron: "Electron / kinetic energy: E − EF",
      energyDirectionBinding: "Binding Energy: EF − EB",
      sigma: "Auto-EF smoothing σ (samples)",
      kScale: "Direct-map k scale",
      kOffset: "Direct-map k offset",
      lineColor: "DFT line color",
      opacity: "Overlay opacity",
      symmetry: "High-symmetry labels (standalone preview only; e.g. Γ=0,M=1.25)",
      alignK: "Scale DFT k range onto ARPES",
      showOverlay: "Overlay DFT on the ARPES plot",
      estimateEf: "Heuristically estimate ARPES EF",
      pickEf: "Pick EF on plot",
      cancelPickEf: "Cancel EF picking",
      bindCurrent: "Bind current ARPES",
      saveProject: "Export project JSON",
      resetSettings: "Reset calibration",
      note: "Range scaling linearly maps the DFT k minimum/maximum onto the experiment; it is not a lattice or high-symmetry-point registration. An angle-axis overlay also has no θ→k conversion and is visual only. Uncheck range scaling to use direct k scale/offset. Out-of-window segments are clipped. Project JSON does not contain the raw ARPES matrix, so reload the source file on another device.",
      chartTitle: "Standalone DFT preview",
      metricBands: "Bands",
      metricK: "k range",
      metricEnergy: "Energy range",
      noChart: "Load DFT files to preview the theoretical bands here",
      loaded: "Read {files}: {bands} bands, {points} points ({format})",
      projectLoaded: "Analysis project restored",
      restored: "Restored the last local analysis",
      cleared: "DFT cleared; the ARPES preview was not changed",
      arpesWaiting: "There is no interactive ARPES map yet",
      axisWarning: "The current main-plot y axis does not look like energy; DFT remains in the standalone preview.",
      energyUnitWarning: "The electron-energy axis has no recognized unit (eV/meV/keV), so calibration and overlay are disabled to prevent a scale error.",
      axisRangeWarning: "The main plot has no readable physical axis range; DFT will not be overlaid on pixel indices.",
      horizontalAxisWarning: "The current horizontal axis is neither momentum nor angle. DFT remains standalone to prevent a false registration.",
      angleOverlayWarning: "DFT k was range-mapped onto an angle axis for visual comparison only; no θ→k conversion was performed.",
      overlayReady: "DFT is linked to the current ARPES energy map",
      efEstimated: "Estimated ARPES EF = {value} eV and recalibrated from the original energy axis",
      efEstimatedLow: "Estimated EF = {value} eV with low edge confidence; confirm it by picking the plot.",
      efPickPrompt: "Click the Fermi-level position on the ARPES main plot",
      efPicked: "Set ARPES EF = {value} eV from the plot",
      contextBound: "Bound the current ARPES dataset. EF was reset; estimate or pick it again.",
      contextMismatch: "The saved DFT/EF belongs to another ARPES dataset. Bind the current ARPES before calibrating.",
      contextUnbound: "DFT is loaded but is not bound to ARPES data yet; the standalone preview remains available.",
      efEstimateFailed: "Could not estimate ARPES EF: {message}",
      invalidDft: "Could not read DFT files: {message}",
      invalidProject: "Could not import project: {message}",
      savedLocal: "Parameters and DFT data were saved in this browser",
      projectExported: "Analysis project JSON downloaded (DFT, calibration, and ARPES reference included)",
      storageFailed: "The analysis remains usable, but browser storage failed: {message}. Export the project JSON.",
      noProjectData: "There is no DFT data yet; the current calibration settings will still be exported.",
      resetDone: "ARPES/DFT calibration settings reset"
    }
  };

  const defaultSettings = Object.freeze({
    dftFermi: 0,
    arpesFermi: 0,
    energyDirection: "auto",
    efSigma: 2,
    alignK: true,
    kScale: 1,
    kOffset: 0,
    showOverlay: true,
    lineColor: "#f43f5e",
    opacity: 0.86,
    symmetry: "Γ=0,M=1.25"
  });

  const state = {
    dft: null,
    settings: { ...defaultSettings },
    arpesContext: null,
    storageOwnerKey: "",
    calibratingEf: false,
    initialized: false,
    lastStatusKey: "waiting",
    lastStatusParams: {},
    lastStatusTone: ""
  };

  const nodes = {};

  function language() {
    return String(document.documentElement.lang || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function phrase(key, params = {}) {
    let value = TEXT[language()][key] || TEXT.zh[key] || key;
    Object.entries(params).forEach(([name, replacement]) => {
      value = value.split(`{${name}}`).join(String(replacement));
    });
    return value;
  }

  function setStatus(key, params = {}, tone = "") {
    state.lastStatusKey = key;
    state.lastStatusParams = params;
    state.lastStatusTone = tone;
    if (!nodes.status) return;
    nodes.status.textContent = phrase(key, params);
    nodes.status.dataset.tone = tone;
  }

  function updateTranslations() {
    document.querySelectorAll("[data-arpes-dft-i18n]").forEach(node => {
      const key = node.dataset.arpesDftI18n;
      if (key) node.textContent = phrase(key);
    });
    document.querySelectorAll("[data-arpes-dft-placeholder]").forEach(node => {
      const key = node.dataset.arpesDftPlaceholder;
      if (key) node.placeholder = phrase(key);
    });
    setStatus(state.lastStatusKey, state.lastStatusParams, state.lastStatusTone);
    renderFileSummary();
    drawStandaloneChart();
  }

  function formatNumber(value, digits = 3) {
    if (!Number.isFinite(Number(value))) return "–";
    const number = Number(value);
    const absolute = Math.abs(number);
    if (absolute >= 1000 || (absolute > 0 && absolute < 0.001)) return number.toExponential(2);
    return number.toFixed(digits).replace(/\.?0+$/, "");
  }

  function isEnergyAxis(label) {
    const value = String(label || "").toLowerCase();
    if (/photon|excitation|incident|pump|probe|h\s*[νv]|光子|激发光/.test(value)) return false;
    return /energy|binding|kinetic|e[_\s-]?kin|e[_\s-]?b|能量|结合能|动能/.test(value)
      || /\bev\b/.test(value.replace(/[()[\]]/g, " "));
  }

  function horizontalAxisKind(label) {
    const value = String(label || "").toLowerCase();
    if (/theta|phi|angle|\bdeg\b|角度|角分辨/.test(value)) return "angle";
    if (/temperature|\btemp\b|kelvin|温度/.test(value)) return "other";
    if (/momentum|wave.?vector|k.?path|动量|波矢|倒空间/.test(value)
      || /\bk[_\s-]?[xyz]\b/.test(value)
      || /^\s*k\s*(?:$|[\[(])/.test(value)
      || /(?:1\s*\/\s*[aåÅ]|[aåÅ]\s*[-^]?1)/i.test(value)) return "momentum";
    return "other";
  }

  function originalYRange(plan) {
    const dimension = Number.isInteger(plan?.yDim) ? plan.yDim : "y";
    return plan?.__arpesDftRawRanges?.[dimension] || plan?.yRange || null;
  }

  function rawLabelsForPlan(plan) {
    const labels = { ...(plan?.__arpesDftRawLabels || {}) };
    [
      [plan?.xDim, "x", plan?.xLabel],
      [plan?.yDim, "y", plan?.yLabel],
      [plan?.fixedDim, "fixed", plan?.fixedLabel]
    ].forEach(([dimension, fallback, label]) => {
      const key = Number.isInteger(dimension) ? dimension : fallback;
      if (label && !labels[key]) labels[key] = String(label);
    });
    return labels;
  }

  function originalYLabel(plan) {
    const dimension = Number.isInteger(plan?.yDim) ? plan.yDim : "y";
    return plan?.__arpesDftRawLabels?.[dimension] || plan?.yLabel || "";
  }

  function originalXLabel(plan) {
    const dimension = Number.isInteger(plan?.xDim) ? plan.xDim : "x";
    return plan?.__arpesDftRawLabels?.[dimension] || plan?.xLabel || "";
  }

  function normalizedOriginalYRange(plan) {
    const range = originalYRange(plan);
    const scale = Core.energyUnitScale(originalYLabel(plan));
    if (!range || !Number.isFinite(scale)) return null;
    return { ...range, first: Number(range.first) * scale, last: Number(range.last) * scale };
  }

  function previewArpesContext(previewState = currentPreviewState()) {
    return Core.arpesContextFromPlan(previewState?.plan, {
      ...(previewState?.sourceIdentity || {}),
      filename: previewState?.sourceIdentity?.filename || previewState?.filename || ""
    });
  }

  function contextMatchesPreview(previewState = currentPreviewState()) {
    return Core.sameArpesContext(state.arpesContext, previewArpesContext(previewState));
  }

  function bindPreviewContext(previewState = currentPreviewState(), options = {}) {
    if (!previewState || previewState.staticPreview) return false;
    const context = previewArpesContext(previewState);
    if (!context) return false;
    const changed = !Core.sameArpesContext(state.arpesContext, context);
    state.arpesContext = context;
    if (options.resetFermi || (changed && options.resetWhenChanged !== false)) {
      state.settings.arpesFermi = 0;
      state.settings.energyDirection = "auto";
      state.settings.alignK = true;
      state.settings.kScale = 1;
      state.settings.kOffset = 0;
      if (nodes.arpesFermi) nodes.arpesFermi.value = "0";
    }
    return true;
  }

  function rawRangesForPlan(plan) {
    const ranges = { ...(plan?.__arpesDftRawRanges || {}) };
    [
      [plan?.xDim, "x", plan?.xRange],
      [plan?.yDim, "y", plan?.yRange],
      [plan?.fixedDim, "fixed", plan?.fixedRange]
    ].forEach(([dimension, fallback, range]) => {
      const key = Number.isInteger(dimension) ? dimension : fallback;
      if (range && !ranges[key]) ranges[key] = { ...range };
    });
    return ranges;
  }

  function transformPreviewPlan(plan, source = {}) {
    if (!plan) return plan;
    const incomingContext = Core.arpesContextFromPlan(plan, source);
    const contextMatches = Core.sameArpesContext(state.arpesContext, incomingContext);
    const rawRanges = rawRangesForPlan(plan);
    const rawLabels = rawLabelsForPlan(plan);
    const transformed = {
      ...plan,
      __arpesDftRawRanges: rawRanges,
      __arpesDftRawLabels: rawLabels,
      _hdf5AxisMeta: null
    };
    [
      ["x", plan.xDim, plan.xLabel],
      ["y", plan.yDim, plan.yLabel],
      ["fixed", plan.fixedDim, plan.fixedLabel]
    ].forEach(([axis, dimension, label]) => {
      const key = Number.isInteger(dimension) ? dimension : axis;
      const raw = rawRanges[key];
      const rawLabel = rawLabels[key] || label;
      if (!raw) return;
      const unitScale = Core.energyUnitScale(rawLabel);
      const calibrateEnergy = contextMatches && isEnergyAxis(rawLabel) && Number.isFinite(unitScale);
      transformed[`${axis}Range`] = calibrateEnergy
        ? Core.transformEnergyRange(
          raw,
          state.settings.arpesFermi,
          Core.resolveEnergyDirection(rawLabel, state.settings.energyDirection),
          unitScale
        )
        : { ...raw };
      transformed[`${axis}Label`] = calibrateEnergy ? "E − EF (eV)" : rawLabel;
    });
    return {
      ...transformed
    };
  }

  function axisValue(range, index, length) {
    const first = Number(range?.first);
    const last = Number(range?.last);
    if (!Number.isFinite(first) || !Number.isFinite(last) || length <= 1) return Number(index) || 0;
    return first + (last - first) * index / (length - 1);
  }

  function displayAxisEndpoints(range, length, flipped) {
    return flipped
      ? [axisValue(range, length - 1, length), axisValue(range, 0, length)]
      : [axisValue(range, 0, length), axisValue(range, length - 1, length)];
  }

  function previewPlotGeometry(previewState) {
    if (!previewState?.layout || !previewState?.sample || !previewState?.plan) return null;
    const layout = previewState.layout;
    const rect = layout.erlabStyle
      ? layout.mainRect
      : (layout.margin ? { x: layout.margin.left, y: layout.margin.top, w: layout.plotW, h: layout.plotH } : null);
    if (!rect) return null;
    const [xTop, xBottom] = displayAxisEndpoints(previewState.plan.xRange, previewState.sample.xLen, !!layout.flipX);
    const [yTop, yBottom] = displayAxisEndpoints(previewState.plan.yRange, previewState.sample.yLen, !!layout.flipY);
    if (![xTop, xBottom, yTop, yBottom].every(Number.isFinite) || xTop === xBottom || yTop === yBottom) return null;
    return {
      rect,
      xTop,
      xBottom,
      yTop,
      yBottom,
      toX: value => rect.x + (value - xTop) / (xBottom - xTop) * rect.w,
      toY: value => rect.y + (value - yTop) / (yBottom - yTop) * rect.h,
      fromY: pixel => yTop + (pixel - rect.y) / rect.h * (yBottom - yTop)
    };
  }

  function mappedDftK(rawK, geometry, band) {
    if (!state.settings.alignK) {
      return Number(rawK) * (Number(state.settings.kScale) || 0) + (Number(state.settings.kOffset) || 0);
    }
    if (!state.dft || state.dft.kMax === state.dft.kMin) return Number(rawK);
    const targetMin = Math.min(geometry.xTop, geometry.xBottom);
    const targetMax = Math.max(geometry.xTop, geometry.xBottom);
    const sourceMin = Number.isFinite(Number(band?.sourceKMin)) ? Number(band.sourceKMin) : state.dft.kMin;
    const sourceMax = Number.isFinite(Number(band?.sourceKMax)) ? Number(band.sourceKMax) : state.dft.kMax;
    return Core.mapKToRange(rawK, sourceMin, sourceMax, targetMin, targetMax);
  }

  function drawBandPath(ctx, band, geometry, options = {}) {
    const energyShift = Number(state.settings.dftFermi) || 0;
    ctx.beginPath();
    const length = Math.min(band.k.length, band.energy.length);
    const step = Math.max(1, Math.ceil(length / Math.max(100, Number(options.maxPoints) || 1600)));
    const indexSet = new Set();
    for (let index = 0; index < length; index += step) indexSet.add(index);
    for (let index = 0; index < length; index += 1) {
      if (Number.isFinite(Number(band.k[index])) && Number.isFinite(Number(band.energy[index]))) continue;
      if (index > 0) indexSet.add(index - 1);
      indexSet.add(index);
      if (index + 1 < length) indexSet.add(index + 1);
    }
    if (length > 1) indexSet.add(length - 1);
    const indices = [...indexSet].sort((left, right) => left - right);
    let previous = null;
    let lastEnd = null;
    for (const index of indices) {
      const kValue = options.rawK ? band.k[index] : mappedDftK(band.k[index], geometry, band);
      const energyValue = Number(band.energy[index]) - energyShift;
      const current = { x: geometry.toX(kValue), y: geometry.toY(energyValue) };
      if (!Number.isFinite(current.x) || !Number.isFinite(current.y)) {
        previous = null;
        lastEnd = null;
        continue;
      }
      if (previous) {
        const clipped = Core.clipSegmentToRect(previous.x, previous.y, current.x, current.y, geometry.rect);
        if (clipped) {
          const continuous = lastEnd
            && Math.abs(lastEnd.x - clipped.x1) < 0.5
            && Math.abs(lastEnd.y - clipped.y1) < 0.5;
          if (!continuous) ctx.moveTo(clipped.x1, clipped.y1);
          ctx.lineTo(clipped.x2, clipped.y2);
          lastEnd = { x: clipped.x2, y: clipped.y2 };
        } else {
          lastEnd = null;
        }
      }
      previous = current;
    }
    ctx.stroke();
  }

  function drawOverlay(ctx, previewState) {
    updateArpesMetric(previewState);
    if (!state.dft || !state.settings.showOverlay || previewState?.staticPreview) return false;
    if (!state.arpesContext) {
      if (!["contextUnbound", "storageFailed"].includes(state.lastStatusKey)) setStatus("contextUnbound", {}, "warn");
      return false;
    }
    if (!contextMatchesPreview(previewState)) {
      if (!["contextMismatch", "storageFailed"].includes(state.lastStatusKey)) setStatus("contextMismatch", {}, "warn");
      return false;
    }
    const rawYLabel = originalYLabel(previewState?.plan);
    if (!isEnergyAxis(rawYLabel)) {
      if (!["axisWarning", "storageFailed"].includes(state.lastStatusKey)) setStatus("axisWarning", {}, "warn");
      return false;
    }
    if (!Number.isFinite(Core.energyUnitScale(rawYLabel))) {
      if (!["energyUnitWarning", "storageFailed"].includes(state.lastStatusKey)) setStatus("energyUnitWarning", {}, "warn");
      return false;
    }
    const physicalRanges = [previewState?.plan?.xRange, previewState?.plan?.yRange];
    if (!physicalRanges.every(range => Number.isFinite(Number(range?.first))
      && Number.isFinite(Number(range?.last))
      && Number(range.first) !== Number(range.last))) {
      if (!["axisRangeWarning", "storageFailed"].includes(state.lastStatusKey)) setStatus("axisRangeWarning", {}, "warn");
      return false;
    }
    const horizontalKind = horizontalAxisKind(originalXLabel(previewState?.plan));
    if (horizontalKind === "other") {
      if (!["horizontalAxisWarning", "storageFailed"].includes(state.lastStatusKey)) {
        setStatus("horizontalAxisWarning", {}, "warn");
      }
      return false;
    }
    const geometry = previewPlotGeometry(previewState);
    if (!geometry) return false;
    ctx.save();
    ctx.beginPath();
    ctx.rect(geometry.rect.x, geometry.rect.y, geometry.rect.w, geometry.rect.h);
    ctx.clip();
    ctx.strokeStyle = state.settings.lineColor;
    ctx.globalAlpha = Math.max(0.08, Math.min(1, Number(state.settings.opacity) || 0.86));
    ctx.lineWidth = 1.35;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const band of state.dft.bands) drawBandPath(ctx, band, geometry);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = state.settings.lineColor;
    ctx.globalAlpha = 0.92;
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`DFT · ${state.dft.bands.length}`, geometry.rect.x + geometry.rect.w - 7, geometry.rect.y + 16);
    ctx.restore();
    if (!["efEstimated", "efEstimatedLow", "efPicked", "storageFailed"].includes(state.lastStatusKey)) {
      setStatus(horizontalKind === "angle" ? "angleOverlayWarning" : "overlayReady", {}, horizontalKind === "angle" ? "warn" : "good");
    }
    return true;
  }

  function canvasPoint(canvas, event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) * canvas.height / Math.max(1, bounds.height)
    };
  }

  function handlePreviewClick(event, canvas) {
    if (!state.calibratingEf) return false;
    const previewState = canvas?.__hdf5PreviewState;
    const rawYLabel = originalYLabel(previewState?.plan);
    if (!previewState || previewState.staticPreview || !isEnergyAxis(rawYLabel)) {
      setStatus("axisWarning", {}, "warn");
      stopEfCalibration();
      return true;
    }
    const unitScale = Core.energyUnitScale(rawYLabel);
    if (!Number.isFinite(unitScale)) {
      setStatus("energyUnitWarning", {}, "warn");
      stopEfCalibration();
      return true;
    }
    const rawRange = originalYRange(previewState.plan);
    if (!rawRange || !Number.isFinite(Number(rawRange.first)) || !Number.isFinite(Number(rawRange.last)) || Number(rawRange.first) === Number(rawRange.last)) {
      setStatus("axisRangeWarning", {}, "warn");
      stopEfCalibration();
      return true;
    }
    const geometry = previewPlotGeometry(previewState);
    if (!geometry) return false;
    const point = canvasPoint(canvas, event);
    const rect = geometry.rect;
    if (point.x < rect.x || point.x > rect.x + rect.w || point.y < rect.y || point.y > rect.y + rect.h) return false;
    const wasBound = contextMatchesPreview(previewState);
    bindPreviewContext(previewState, { resetWhenChanged: true });
    const displayedEnergy = geometry.fromY(point.y);
    const currentFermi = Number(state.settings.arpesFermi) || 0;
    const direction = Core.resolveEnergyDirection(rawYLabel, state.settings.energyDirection);
    const rawFermi = !wasBound
      ? displayedEnergy * unitScale
      : (direction === "binding" ? currentFermi - displayedEnergy : displayedEnergy + currentFermi);
    state.settings.arpesFermi = rawFermi;
    if (nodes.arpesFermi) nodes.arpesFermi.value = rawFermi.toFixed(6);
    stopEfCalibration();
    queueSaveLocalState();
    redrawPreview();
    setStatus("efPicked", { value: formatNumber(rawFermi, 6) }, "good");
    return true;
  }

  function stopEfCalibration() {
    state.calibratingEf = false;
    document.body.classList.remove("arpes-dft-calibrating");
    if (nodes.pickEf) {
      nodes.pickEf.setAttribute("aria-pressed", "false");
      nodes.pickEf.textContent = phrase("pickEf");
    }
  }

  function redrawOverlay() {
    const canvas = document.querySelector("#hdf5PreviewCanvas");
    if (canvas?.__hdf5PreviewState && typeof global.drawHDF5PreviewOverlay === "function") {
      global.drawHDF5PreviewOverlay(canvas, canvas.__hdf5PreviewState);
    }
  }

  function redrawPreview() {
    const canvas = document.querySelector("#hdf5PreviewCanvas");
    if (canvas?.__hdf5PreviewState && typeof global.redrawHDF5PreviewSelection === "function") {
      global.redrawHDF5PreviewSelection(canvas);
    } else {
      redrawOverlay();
    }
  }

  function preservePreviewSelectionForCalibration() {
    const previewState = currentPreviewState();
    if (!previewState || previewState.staticPreview || !previewState.selection || !previewState.sample) return;
    const nextPlan = transformPreviewPlan(previewState.plan, {
      ...(previewState.sourceIdentity || {}),
      filename: previewState.sourceIdentity?.filename || previewState.filename || ""
    });
    const nextFlipX = Number.isFinite(Number(nextPlan?.xRange?.first))
      && Number.isFinite(Number(nextPlan?.xRange?.last))
      && Number(nextPlan.xRange.first) > Number(nextPlan.xRange.last);
    const nextFlipY = !nextPlan?.preserveYOrder
      && Number.isFinite(Number(nextPlan?.yRange?.first))
      && Number.isFinite(Number(nextPlan?.yRange?.last))
      && Number(nextPlan.yRange.last) > Number(nextPlan.yRange.first);
    if (!!previewState.layout?.flipX !== nextFlipX && Number.isFinite(Number(previewState.selection.col))) {
      previewState.selection.col = Math.max(0, previewState.sample.cols - 1 - Number(previewState.selection.col));
    }
    if (!!previewState.layout?.flipY !== nextFlipY && Number.isFinite(Number(previewState.selection.row))) {
      previewState.selection.row = Math.max(0, previewState.sample.rows - 1 - Number(previewState.selection.row));
    }
  }

  function currentPreviewState() {
    return document.querySelector("#hdf5PreviewCanvas")?.__hdf5PreviewState || null;
  }

  function currentPreviewMatrix(previewState) {
    const sample = previewState?.sample;
    if (!sample) return null;
    if (sample.values?.length === sample.rows * sample.cols) return sample.values;
    if (sample._hdf5DisplayValues) return sample._hdf5DisplayValues;
    if (typeof global.buildHDF5DisplayMatrix === "function") return global.buildHDF5DisplayMatrix(sample);
    return null;
  }

  function estimateCurrentFermi() {
    const previewState = currentPreviewState();
    if (!previewState || previewState.staticPreview) {
      setStatus("arpesWaiting", {}, "warn");
      return;
    }
    const rawYLabel = originalYLabel(previewState.plan);
    if (!isEnergyAxis(rawYLabel)) {
      setStatus("axisWarning", {}, "warn");
      return;
    }
    if (!Number.isFinite(Core.energyUnitScale(rawYLabel))) {
      setStatus("energyUnitWarning", {}, "warn");
      return;
    }
    if (!normalizedOriginalYRange(previewState.plan)) {
      setStatus("axisRangeWarning", {}, "warn");
      return;
    }
    try {
      bindPreviewContext(previewState, { resetWhenChanged: true });
      const values = currentPreviewMatrix(previewState);
      const range = normalizedOriginalYRange(previewState.plan);
      const estimate = Core.estimateFermiFromMatrix(
        values,
        previewState.sample.rows,
        previewState.sample.cols,
        range,
        state.settings.efSigma,
        {
          center: state.settings.arpesFermi,
          direction: Core.resolveEnergyDirection(rawYLabel, state.settings.energyDirection),
          details: true
        }
      );
      state.settings.arpesFermi = estimate.value;
      if (nodes.arpesFermi) nodes.arpesFermi.value = estimate.value.toFixed(6);
      queueSaveLocalState();
      redrawPreview();
      const lowConfidence = Number.isFinite(estimate.confidence) && estimate.confidence < 3;
      setStatus(lowConfidence ? "efEstimatedLow" : "efEstimated", { value: formatNumber(estimate.value, 6) }, lowConfidence ? "warn" : "good");
    } catch (error) {
      setStatus("efEstimateFailed", { message: error?.message || String(error) }, "error");
    }
  }

  function renderFileSummary() {
    if (!nodes.fileSummary) return;
    if (!state.dft) {
      nodes.fileSummary.innerHTML = `<span>${escapeHtml(phrase("noDft"))}</span>`;
      return;
    }
    const files = state.dft.sourceFiles?.join(", ") || "DFT";
    nodes.fileSummary.innerHTML = [
      `<strong>${escapeHtml(files)}</strong>`,
      `<span>${state.dft.bands.length} ${escapeHtml(phrase("metricBands"))} · ${state.dft.pointCount.toLocaleString()} points · ${escapeHtml(state.dft.format)}</span>`
    ].join("<br>");
  }

  function updateMetrics() {
    if (nodes.metricBands) nodes.metricBands.textContent = state.dft ? String(state.dft.bands.length) : "–";
    if (nodes.metricK) nodes.metricK.textContent = state.dft
      ? `${formatNumber(state.dft.kMin)} … ${formatNumber(state.dft.kMax)}`
      : "–";
    if (nodes.metricEnergy) nodes.metricEnergy.textContent = state.dft
      ? `${formatNumber(state.dft.energyMin - state.settings.dftFermi)} … ${formatNumber(state.dft.energyMax - state.settings.dftFermi)} eV`
      : "–";
  }

  function updateArpesMetric(previewState = currentPreviewState()) {
    if (!nodes.arpesMetric) return;
    if (!previewState || previewState.staticPreview) {
      nodes.arpesMetric.textContent = phrase("arpesWaiting");
      return;
    }
    nodes.arpesMetric.textContent = `${previewState.plan?.xLabel || "x"} × ${previewState.plan?.yLabel || "y"}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]);
  }

  function drawChartMessage(ctx, width, height, message) {
    ctx.fillStyle = "#080d14";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#7890a5";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, width / 2, height / 2);
  }

  function drawStandaloneChart() {
    const canvas = nodes.chart;
    if (!canvas) return;
    const ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    const cssWidth = Math.max(520, Math.round(canvas.clientWidth || 720));
    const cssHeight = Math.max(250, Math.round(canvas.clientHeight || 320));
    if (canvas.width !== Math.round(cssWidth * ratio)) canvas.width = Math.round(cssWidth * ratio);
    if (canvas.height !== Math.round(cssHeight * ratio)) canvas.height = Math.round(cssHeight * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!state.dft) {
      drawChartMessage(ctx, cssWidth, cssHeight, phrase("noChart"));
      updateMetrics();
      return;
    }

    const margin = { left: 58, right: 18, top: 18, bottom: 44 };
    const rect = {
      x: margin.left,
      y: margin.top,
      w: cssWidth - margin.left - margin.right,
      h: cssHeight - margin.top - margin.bottom
    };
    const dftFermi = Number(state.settings.dftFermi) || 0;
    let yMin = state.dft.energyMin - dftFermi;
    let yMax = state.dft.energyMax - dftFermi;
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yPad = Math.max(0.05, (yMax - yMin) * 0.06);
    yMin -= yPad;
    yMax += yPad;
    const geometry = {
      rect,
      xTop: state.dft.kMin,
      xBottom: state.dft.kMax,
      yTop: yMax,
      yBottom: yMin,
      toX: value => rect.x + (value - state.dft.kMin) / Math.max(1e-12, state.dft.kMax - state.dft.kMin) * rect.w,
      toY: value => rect.y + (yMax - value) / Math.max(1e-12, yMax - yMin) * rect.h
    };

    ctx.fillStyle = "#080d14";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#0c1520";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "rgba(100, 139, 163, 0.22)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#7890a5";
    ctx.font = "11px system-ui, sans-serif";
    for (let index = 0; index <= 4; index += 1) {
      const x = rect.x + rect.w * index / 4;
      const kValue = state.dft.kMin + (state.dft.kMax - state.dft.kMin) * index / 4;
      ctx.beginPath();
      ctx.moveTo(x, rect.y);
      ctx.lineTo(x, rect.y + rect.h);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(formatNumber(kValue, 2), x, rect.y + rect.h + 18);
    }
    for (let index = 0; index <= 4; index += 1) {
      const y = rect.y + rect.h * index / 4;
      const energy = yMax - (yMax - yMin) * index / 4;
      ctx.beginPath();
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.w, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(formatNumber(energy, 2), rect.x - 8, y + 4);
    }
    if (yMin <= 0 && yMax >= 0) {
      const zeroY = geometry.toY(0);
      ctx.save();
      ctx.strokeStyle = "rgba(45, 212, 191, 0.58)";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(rect.x, zeroY);
      ctx.lineTo(rect.x + rect.w, zeroY);
      ctx.stroke();
      ctx.restore();
    }

    const symmetryPoints = Core.parseSymmetryPoints(state.settings.symmetry);
    for (const point of symmetryPoints) {
      if (point.position < state.dft.kMin || point.position > state.dft.kMax) continue;
      const x = geometry.toX(point.position);
      ctx.save();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.38)";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, rect.y);
      ctx.lineTo(x, rect.y + rect.h);
      ctx.stroke();
      ctx.fillStyle = "#cbd5e1";
      ctx.textAlign = "center";
      ctx.fillText(point.label, x, rect.y + rect.h + 34);
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.strokeStyle = state.settings.lineColor;
    ctx.globalAlpha = Math.max(0.08, Math.min(1, Number(state.settings.opacity) || 0.86));
    ctx.lineWidth = 1.25;
    for (const band of state.dft.bands) drawBandPath(ctx, band, geometry, { rawK: true });
    ctx.restore();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("k path", rect.x + rect.w / 2, cssHeight - 5);
    ctx.save();
    ctx.translate(15, rect.y + rect.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("E − EF (eV)", 0, 0);
    ctx.restore();
    updateMetrics();
  }

  function serializableState() {
    return {
      kind: PROJECT_KIND,
      version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      settings: { ...state.settings },
      arpesContext: state.arpesContext ? { ...state.arpesContext, shape: Array.from(state.arpesContext.shape || []) } : null,
      dft: state.dft
    };
  }

  function ownerHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "anonymous")) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function currentStorageOwnerKey() {
    try {
      const user = JSON.parse(global.localStorage?.getItem(USER_STORAGE_KEY) || "{}");
      const identity = String(user.email || "").trim().toLowerCase()
        || `mode:${String(user.account_mode || "anonymous").trim().toLowerCase()}`;
      return ownerHash(identity);
    } catch {
      return ownerHash("mode:anonymous");
    }
  }

  function projectRecordId(ownerKey = state.storageOwnerKey || currentStorageOwnerKey()) {
    return `last:${ownerKey}`;
  }

  function fallbackStorageKey(ownerKey = state.storageOwnerKey || currentStorageOwnerKey()) {
    return `${STORAGE_KEY}:${ownerKey}`;
  }

  function openProjectDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = global.indexedDB.open(PROJECT_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_DB_STORE)) {
          db.createObjectStore(PROJECT_DB_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab"));
    });
  }

  async function writeProjectToIndexedDb(project, ownerKey) {
    const db = await openProjectDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(PROJECT_DB_STORE, "readwrite");
        transaction.objectStore(PROJECT_DB_STORE).put({ id: projectRecordId(ownerKey), project });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB write failed"));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB write was aborted"));
      });
    } finally {
      db.close();
    }
  }

  async function readProjectFromIndexedDb(ownerKey) {
    const db = await openProjectDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(PROJECT_DB_STORE, "readonly");
        const request = transaction.objectStore(PROJECT_DB_STORE).get(projectRecordId(ownerKey));
        request.onsuccess = () => resolve(request.result?.project || null);
        request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
      });
    } finally {
      db.close();
    }
  }

  async function persistProject(project, ownerKey = state.storageOwnerKey || currentStorageOwnerKey()) {
    let indexedDbError = null;
    try {
      await writeProjectToIndexedDb(project, ownerKey);
      try { global.localStorage?.removeItem(fallbackStorageKey(ownerKey)); } catch { /* best-effort migration cleanup */ }
      return { ok: true, backend: "indexeddb" };
    } catch (error) {
      indexedDbError = error;
    }

    try {
      if (!global.localStorage) throw new Error("localStorage is unavailable");
      const serialized = JSON.stringify(project);
      if (serialized.length > 3500000) throw new Error("the project is too large for localStorage");
      global.localStorage.setItem(fallbackStorageKey(ownerKey), serialized);
      return { ok: true, backend: "localstorage" };
    } catch (error) {
      try { global.localStorage?.removeItem(fallbackStorageKey(ownerKey)); } catch { /* remove stale fallback */ }
      const message = [indexedDbError?.message, error?.message].filter(Boolean).join("; ") || "unknown storage error";
      console.warn("Could not persist ARPES–DFT state", indexedDbError || error);
      return { ok: false, error: message };
    }
  }

  let saveChain = Promise.resolve();
  function saveLocalState() {
    const project = serializableState();
    // Capture the owner with the snapshot. A queued write must never move into
    // another account's namespace if the user changes accounts before it runs.
    const ownerKey = state.storageOwnerKey || currentStorageOwnerKey();
    const persist = () => persistProject(project, ownerKey);
    saveChain = saveChain.then(persist, persist);
    return saveChain;
  }

  async function restoreLocalState(ownerKey = state.storageOwnerKey || currentStorageOwnerKey()) {
    const candidates = [];
    try {
      const project = await readProjectFromIndexedDb(ownerKey);
      if (project) candidates.push({ backend: "indexeddb", project });
    } catch (error) {
      console.warn("Could not read ARPES–DFT IndexedDB state", error);
    }
    try {
      const raw = global.localStorage?.getItem(fallbackStorageKey(ownerKey));
      if (raw) candidates.push({ backend: "localstorage", project: JSON.parse(raw) });
    } catch (error) {
      console.warn("Could not read ARPES–DFT localStorage state", error);
    }
    const valid = [];
    for (const candidate of candidates) {
      try {
        valid.push({
          ...candidate,
          restored: Core.validateProject(candidate.project),
          savedTime: Date.parse(candidate.project.savedAt || "") || 0
        });
      } catch (error) {
        console.warn(`Could not validate ARPES–DFT ${candidate.backend} state`, error);
      }
    }
    if (!valid.length || state.storageOwnerKey !== ownerKey) return false;
    const selected = valid.sort((left, right) => right.savedTime - left.savedTime)[0];
    state.dft = selected.restored.dft;
    state.settings = { ...defaultSettings, ...selected.restored.settings };
    state.arpesContext = selected.restored.arpesContext;
    if (selected.backend === "localstorage") {
      persistProject(selected.project, ownerKey).catch(error => console.warn("Could not migrate ARPES–DFT fallback state", error));
    }
    return true;
  }

  let saveTimer = 0;
  function queueSaveLocalState() {
    if (saveTimer) global.clearTimeout(saveTimer);
    saveTimer = global.setTimeout(async () => {
      saveTimer = 0;
      const result = await saveLocalState();
      if (!result.ok) setStatus("storageFailed", { message: result.error }, "error");
    }, 180);
  }

  function syncKControls() {
    const directMappingDisabled = !!state.settings.alignK;
    if (nodes.kScale) nodes.kScale.disabled = directMappingDisabled;
    if (nodes.kOffset) nodes.kOffset.disabled = directMappingDisabled;
  }

  function syncInputsFromState() {
    if (nodes.dftFermi) nodes.dftFermi.value = String(state.settings.dftFermi);
    if (nodes.arpesFermi) nodes.arpesFermi.value = String(state.settings.arpesFermi);
    if (nodes.energyDirection) nodes.energyDirection.value = state.settings.energyDirection;
    if (nodes.efSigma) nodes.efSigma.value = String(state.settings.efSigma);
    if (nodes.alignK) nodes.alignK.checked = !!state.settings.alignK;
    if (nodes.kScale) nodes.kScale.value = String(state.settings.kScale);
    if (nodes.kOffset) nodes.kOffset.value = String(state.settings.kOffset);
    if (nodes.showOverlay) nodes.showOverlay.checked = !!state.settings.showOverlay;
    if (nodes.lineColor) nodes.lineColor.value = state.settings.lineColor;
    if (nodes.opacity) nodes.opacity.value = String(state.settings.opacity);
    if (nodes.opacityValue) nodes.opacityValue.textContent = `${Math.round(state.settings.opacity * 100)}%`;
    if (nodes.symmetry) nodes.symmetry.value = state.settings.symmetry;
    syncKControls();
  }

  async function applyStateUpdate({ redrawMain = false, persist = true, reportStorageFailure = true } = {}) {
    renderFileSummary();
    drawStandaloneChart();
    updateMetrics();
    if (redrawMain) {
      preservePreviewSelectionForCalibration();
      redrawPreview();
    }
    else redrawOverlay();
    if (!persist) return { ok: true, backend: "none" };
    const result = await saveLocalState();
    if (!result.ok && reportStorageFailure) setStatus("storageFailed", { message: result.error }, "error");
    return result;
  }

  async function importDftFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    try {
      const datasets = [];
      for (const file of list) {
        const text = await file.text();
        datasets.push(Core.parseDftText(text, file.name));
        await new Promise(resolve => global.setTimeout(resolve, 0));
      }
      state.dft = Core.mergeDftDatasets(datasets);
      bindPreviewContext(currentPreviewState(), { resetWhenChanged: true });
      syncInputsFromState();
      const saved = await applyStateUpdate({ redrawMain: true, reportStorageFailure: false });
      if (!saved.ok) {
        setStatus("storageFailed", { message: saved.error }, "error");
      } else {
        setStatus("loaded", {
          files: state.dft.sourceFiles.join(", ") || "DFT",
          bands: state.dft.bands.length,
          points: state.dft.pointCount.toLocaleString(),
          format: state.dft.format
        }, "good");
      }
    } catch (error) {
      setStatus("invalidDft", { message: error?.message || String(error) }, "error");
    } finally {
      if (nodes.dftInput) nodes.dftInput.value = "";
    }
  }

  async function importProjectFile(file) {
    if (!file) return;
    try {
      const restored = Core.validateProject(JSON.parse(await file.text()));
      state.dft = restored.dft;
      state.settings = { ...defaultSettings, ...restored.settings };
      state.arpesContext = restored.arpesContext;
      stopEfCalibration();
      syncInputsFromState();
      const saved = await applyStateUpdate({ redrawMain: true, reportStorageFailure: false });
      if (!saved.ok) setStatus("storageFailed", { message: saved.error }, "error");
      else setStatus("projectLoaded", {}, "good");
    } catch (error) {
      setStatus("invalidProject", { message: error?.message || String(error) }, "error");
    } finally {
      if (nodes.projectInput) nodes.projectInput.value = "";
    }
  }

  function exportProject() {
    const project = serializableState();
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = URL.createObjectURL(blob);
    link.download = `arpes-dft-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatus(state.dft ? "projectExported" : "noProjectData", {}, state.dft ? "good" : "warn");
  }

  async function clearDft() {
    state.dft = null;
    stopEfCalibration();
    const saved = await applyStateUpdate({ reportStorageFailure: false });
    if (!saved.ok) setStatus("storageFailed", { message: saved.error }, "error");
    else setStatus("cleared", {}, "");
  }

  async function resetSettings() {
    state.settings = { ...defaultSettings };
    stopEfCalibration();
    syncInputsFromState();
    const saved = await applyStateUpdate({ redrawMain: true, reportStorageFailure: false });
    if (!saved.ok) setStatus("storageFailed", { message: saved.error }, "error");
    else setStatus("resetDone", {}, "good");
  }

  async function bindCurrentArpes() {
    const previewState = currentPreviewState();
    if (!bindPreviewContext(previewState, { resetFermi: true })) {
      setStatus("arpesWaiting", {}, "warn");
      return;
    }
    stopEfCalibration();
    syncInputsFromState();
    const saved = await applyStateUpdate({ redrawMain: true, reportStorageFailure: false });
    if (!saved.ok) setStatus("storageFailed", { message: saved.error }, "error");
    else setStatus("contextBound", {}, "good");
  }

  let ownerSwitchPromise = null;
  function switchStorageOwnerIfNeeded() {
    const nextOwner = currentStorageOwnerKey();
    if (!state.initialized || nextOwner === state.storageOwnerKey) return Promise.resolve(false);
    if (ownerSwitchPromise) return ownerSwitchPromise;
    ownerSwitchPromise = (async () => {
      state.storageOwnerKey = nextOwner;
      state.dft = null;
      state.settings = { ...defaultSettings };
      state.arpesContext = null;
      stopEfCalibration();
      const restored = await restoreLocalState();
      syncInputsFromState();
      renderFileSummary();
      drawStandaloneChart();
      updateMetrics();
      redrawPreview();
      setStatus(restored ? "restored" : "waiting", {}, restored ? "good" : "");
      return true;
    })().finally(() => { ownerSwitchPromise = null; });
    return ownerSwitchPromise;
  }

  function bindInput(node, setting, transform = value => value, options = {}) {
    node?.addEventListener(options.event || "change", async () => {
      const inputValue = node.type === "checkbox" ? node.checked : node.value;
      if (options.bindArpes) {
        const previewState = currentPreviewState();
        const changed = previewState && !contextMatchesPreview(previewState);
        bindPreviewContext(previewState, { resetWhenChanged: true });
        if (changed) syncInputsFromState();
      }
      state.settings[setting] = transform(inputValue);
      if (node.type !== "checkbox") node.value = String(state.settings[setting]);
      if (setting === "opacity" && nodes.opacityValue) {
        nodes.opacityValue.textContent = `${Math.round(state.settings.opacity * 100)}%`;
      }
      if (setting === "alignK") syncKControls();
      await applyStateUpdate({ redrawMain: !!options.redrawMain });
    });
  }

  function bindEvents() {
    nodes.chooseDft?.addEventListener("click", () => nodes.dftInput?.click());
    nodes.importProject?.addEventListener("click", () => nodes.projectInput?.click());
    nodes.clearDft?.addEventListener("click", clearDft);
    nodes.exportProject?.addEventListener("click", exportProject);
    nodes.reset?.addEventListener("click", resetSettings);
    nodes.bindCurrent?.addEventListener("click", bindCurrentArpes);
    nodes.estimateEf?.addEventListener("click", estimateCurrentFermi);
    nodes.dftInput?.addEventListener("change", () => importDftFiles(nodes.dftInput.files));
    nodes.projectInput?.addEventListener("change", () => importProjectFile(nodes.projectInput.files?.[0]));
    nodes.pickEf?.addEventListener("click", () => {
      state.calibratingEf = !state.calibratingEf;
      document.body.classList.toggle("arpes-dft-calibrating", state.calibratingEf);
      nodes.pickEf.setAttribute("aria-pressed", String(state.calibratingEf));
      nodes.pickEf.textContent = phrase(state.calibratingEf ? "cancelPickEf" : "pickEf");
      setStatus(state.calibratingEf ? "efPickPrompt" : "waiting", {}, state.calibratingEf ? "warn" : "");
    });

    bindInput(nodes.dftFermi, "dftFermi", value => Number(value) || 0);
    bindInput(nodes.arpesFermi, "arpesFermi", value => Number(value) || 0, { redrawMain: true, bindArpes: true });
    bindInput(nodes.energyDirection, "energyDirection", value => ["auto", "electron", "binding"].includes(value) ? value : "auto", { redrawMain: true });
    bindInput(nodes.efSigma, "efSigma", value => Math.max(0.25, Number(value) || 2));
    bindInput(nodes.alignK, "alignK", Boolean);
    bindInput(nodes.kScale, "kScale", value => Number.isFinite(Number(value)) ? Number(value) : 1);
    bindInput(nodes.kOffset, "kOffset", value => Number.isFinite(Number(value)) ? Number(value) : 0);
    bindInput(nodes.showOverlay, "showOverlay", Boolean);
    bindInput(nodes.lineColor, "lineColor", String);
    bindInput(nodes.symmetry, "symmetry", String);
    nodes.opacity?.addEventListener("input", () => {
      state.settings.opacity = Math.max(0.08, Math.min(1, Number(nodes.opacity.value) || 0.86));
      if (nodes.opacityValue) nodes.opacityValue.textContent = `${Math.round(state.settings.opacity * 100)}%`;
      drawStandaloneChart();
      redrawOverlay();
    });
    nodes.opacity?.addEventListener("change", queueSaveLocalState);
    global.addEventListener?.("pagehide", () => {
      if (saveTimer) global.clearTimeout(saveTimer);
      saveTimer = 0;
      saveLocalState();
    });

    if ("MutationObserver" in global) {
      const languageObserver = new global.MutationObserver(mutations => {
        if (mutations.some(mutation => mutation.attributeName === "lang")) updateTranslations();
      });
      languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
      const ownerObserver = new global.MutationObserver(() => {
        global.setTimeout(() => { switchStorageOwnerIfNeeded(); }, 0);
      });
      ownerObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    let resizeFrame = 0;
    if ("ResizeObserver" in global && nodes.chart) {
      new ResizeObserver(() => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          drawStandaloneChart();
        });
      }).observe(nodes.chart.parentElement);
    }
  }

  function cacheNodes() {
    const ids = {
      status: "arpesDftStatus",
      chooseDft: "arpesDftChooseBtn",
      importProject: "arpesDftImportProjectBtn",
      clearDft: "arpesDftClearBtn",
      exportProject: "arpesDftExportBtn",
      reset: "arpesDftResetBtn",
      bindCurrent: "arpesDftBindCurrentBtn",
      estimateEf: "arpesDftEstimateEfBtn",
      pickEf: "arpesDftPickEfBtn",
      dftInput: "arpesDftFileInput",
      projectInput: "arpesDftProjectInput",
      fileSummary: "arpesDftFileSummary",
      dftFermi: "arpesDftFermiInput",
      arpesFermi: "arpesDftArpesFermiInput",
      energyDirection: "arpesDftEnergyDirection",
      efSigma: "arpesDftEfSigmaInput",
      alignK: "arpesDftAlignK",
      kScale: "arpesDftKScaleInput",
      kOffset: "arpesDftKOffsetInput",
      showOverlay: "arpesDftShowOverlay",
      lineColor: "arpesDftLineColor",
      opacity: "arpesDftOpacity",
      opacityValue: "arpesDftOpacityValue",
      symmetry: "arpesDftSymmetryInput",
      chart: "arpesDftCanvas",
      metricBands: "arpesDftMetricBands",
      metricK: "arpesDftMetricK",
      metricEnergy: "arpesDftMetricEnergy",
      arpesMetric: "arpesDftArpesMetric"
    };
    Object.entries(ids).forEach(([key, id]) => { nodes[key] = document.getElementById(id); });
  }

  async function initialize() {
    if (state.initialized || !document.getElementById("arpesDftWorkbench")) return;
    state.initialized = true;
    state.storageOwnerKey = currentStorageOwnerKey();
    cacheNodes();
    const restored = await restoreLocalState();
    syncInputsFromState();
    bindEvents();
    updateTranslations();
    renderFileSummary();
    drawStandaloneChart();
    updateMetrics();
    updateArpesMetric();
    setStatus(restored ? "restored" : "waiting", {}, restored ? "good" : "");
    if (restored) redrawOverlay();
  }

  global.ArpesDftWorkbench = {
    Core,
    drawOverlay,
    handlePreviewClick,
    transformPreviewPlan,
    bindPreviewContext,
    contextMatchesPreview,
    refresh: () => {
      updateArpesMetric();
      redrawOverlay();
    },
    getState: () => state
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})(typeof window !== "undefined" ? window : globalThis);
