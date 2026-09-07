(function (root) {
  "use strict";
  const ELEMENTS =
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(
      " ",
    );
  const COLORS = ["#88d8c0", "#a8a0e0", "#dbac80", "#86b5df", "#d9cb8f"];
  const color = (symbol) =>
    COLORS[ELEMENTS.indexOf(symbol) % COLORS.length] || COLORS[0];
  function normalize(raw) {
    if (!Array.isArray(raw) || raw.length > 118)
      throw new Error("Invalid composition");
    const map = new Map();
    for (const item of raw) {
      const count = Number(item.count);
      if (
        !ELEMENTS.includes(item.symbol) ||
        !Number.isFinite(count) ||
        count <= 0 ||
        count > 99
      )
        throw new Error("Use an element symbol and a ratio from 0.01 to 99");
      map.set(
        item.symbol,
        Math.round(((map.get(item.symbol) || 0) + count) * 100) / 100,
      );
    }
    if ([...map.values()].some((value) => value < 0.01 || value > 99))
      throw new Error("Each element ratio must be between 0.01 and 99");
    return [...map].map(([symbol, count]) => ({ symbol, count }));
  }
  function parseFormula(text) {
    const input = String(text).trim();
    if (!input || input.length > 200)
      throw new Error("Enter a simple formula, for example MgB2 or FeSe");
    const tokens = [...input.matchAll(/([A-Z][a-z]?)(\d+(?:\.\d+)?)?/g)];
    if (tokens.map((t) => t[0]).join("") !== input)
      throw new Error(
        "Use a simple formula without brackets, for example YBa2Cu3O7",
      );
    return normalize(
      tokens.map((t) => ({
        symbol: t[1],
        count: t[2] === undefined ? 1 : Number(t[2]),
      })),
    );
  }
  const formula = (counts) =>
    normalize(counts)
      .map((c) => c.symbol + (c.count === 1 ? "" : c.count))
      .join("");
  function mesh(name, color, vertices, faces) {
    return { name, color, vertices, faces };
  }
  function box(name, center, size, color, angle = 0) {
    const vertices = [];
    for (const z of [-1, 1])
      for (const y of [-1, 1])
        for (const x of [-1, 1]) {
          const a = (x * size[0]) / 2,
            b = (z * size[2]) / 2;
          vertices.push([
            center[0] + a * Math.cos(angle) - b * Math.sin(angle),
            center[1] + (y * size[1]) / 2,
            center[2] + a * Math.sin(angle) + b * Math.cos(angle),
          ]);
        }
    return mesh(name, color, vertices, [
      [0, 2, 3],
      [0, 3, 1],
      [4, 5, 7],
      [4, 7, 6],
      [0, 1, 5],
      [0, 5, 4],
      [2, 6, 7],
      [2, 7, 3],
      [0, 4, 6],
      [0, 6, 2],
      [1, 3, 7],
      [1, 7, 5],
    ]);
  }
  function torus(name, center, radius, tube, color, segments = 48, sides = 6) {
    const v = [],
      f = [];
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < sides; j++) {
        const a = (i / segments) * Math.PI * 2,
          b = (j / sides) * Math.PI * 2;
        v.push([
          center[0] + (radius + tube * Math.cos(b)) * Math.cos(a),
          center[1] + tube * Math.sin(b),
          center[2] + (radius + tube * Math.cos(b)) * Math.sin(a),
        ]);
        const p = i * sides + j,
          q = ((i + 1) % segments) * sides + j,
          r = ((i + 1) % segments) * sides + ((j + 1) % sides),
          s = i * sides + ((j + 1) % sides);
        f.push([p, q, r], [p, r, s]);
      }
    return mesh(name, color, v, f);
  }
  function cylinder(
    name,
    center,
    radius,
    height,
    color,
    segments = 24,
    open = false,
  ) {
    const v = [],
      f = [];
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        v.push([
          center[0] + radius * Math.cos(a),
          center[1] + (j - 0.5) * height,
          center[2] + radius * Math.sin(a),
        ]);
      }
    for (let i = 0; i < segments; i++) {
      const n = (i + 1) % segments;
      f.push([i, n, n + segments], [i, n + segments, i + segments]);
    }
    if (!open) {
      v.push(
        [center[0], center[1] - height / 2, center[2]],
        [center[0], center[1] + height / 2, center[2]],
      );
      for (let i = 0; i < segments; i++) {
        const n = (i + 1) % segments;
        f.push(
          [2 * segments, n, i],
          [2 * segments + 1, i + segments, n + segments],
        );
      }
    }
    return mesh(name, color, v, f);
  }
  function sphere(name, center, radius, color) {
    const v = [],
      f = [],
      cols = 10,
      rows = 6;
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const a = (i / cols) * 2 * Math.PI,
          b = (j / rows) * Math.PI;
        v.push([
          center[0] + radius * Math.sin(b) * Math.cos(a),
          center[1] + radius * Math.cos(b),
          center[2] + radius * Math.sin(b) * Math.sin(a),
        ]);
        if (i < cols && j < rows) {
          const p = j * (cols + 1) + i;
          f.push([p, p + 1, p + cols + 2], [p, p + cols + 2, p + cols + 1]);
        }
      }
    return mesh(name, color, v, f);
  }
  function scene(mode, raw = [], exploded = false) {
    const counts = normalize(raw),
      out = [],
      teal = "#61bda9",
      metal = "#577185",
      gold = "#d5a773",
      floor = "#172b38";
    out.push(cylinder("Display plinth", [0, -1.25, 0], 5.2, 0.18, floor, 48));
    if (mode === "ring") {
      out.push(torus("Electron storage orbit", [0, 0, 0], 3, 0.08, teal));
      out.push(torus("Support ring", [0, -0.5, 0], 3, 0.16, metal));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2,
          radius = exploded ? 3.55 : 3;
        out.push(
          box(
            `Magnet ${i + 1}`,
            [radius * Math.cos(a), exploded ? 0.35 : 0, radius * Math.sin(a)],
            [0.48, 0.48, 0.68],
            i % 2 ? metal : teal,
            a,
          ),
        );
        if (i % 2 === 0)
          out.push(
            box(
              `Support ${i}`,
              [3 * Math.cos(a), -0.9, 3 * Math.sin(a)],
              [0.18, 0.6, 0.18],
              metal,
            ),
          );
      }
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + 0.35;
        out.push(
          box(
            `Illustrative beamline ${i + 1}`,
            [
              3.4 * Math.cos(a) - 0.8 * Math.sin(a),
              0.1,
              3.4 * Math.sin(a) + 0.8 * Math.cos(a),
            ],
            [0.1, 0.12, 2.6],
            gold,
            a,
          ),
        );
        out.push(
          cylinder(
            `Endstation ${i + 1}`,
            [
              3.4 * Math.cos(a) - 2 * Math.sin(a),
              -0.1,
              3.4 * Math.sin(a) + 2 * Math.cos(a),
            ],
            0.36,
            0.8,
            metal,
          ),
        );
      }
      out.push(
        box(
          "Injector schematic",
          [-3.7, -0.2, -2.6],
          [2.1, 0.22, 0.22],
          "#9992c8",
          -0.25,
        ),
      );
    } else if (mode === "beamline") {
      out.push(box("Optical bench", [0, -0.8, 0], [8, 0.2, 1.2], metal));
      out.push(box("Photon path", [0, 0.15, 0], [8, 0.055, 0.055], gold));
      for (let i = 0; i < 3; i++) {
        const x = -3 + i * 1.8;
        out.push(
          cylinder(
            ["Entrance slit", "Monochromator housing", "Focusing optics"][i],
            [x, exploded ? 0.8 : 0, 0],
            0.42,
            0.85,
            i === 1 ? "#9992c8" : metal,
          ),
        );
        out.push(
          box(`Bench support ${i}`, [x, -1, 0], [0.17, 0.35, 0.8], metal),
        );
      }
      out.push(sphere("ARPES vacuum chamber", [2.7, 0.2, 0], 0.85, metal));
      out.push(
        box(
          "Sample plane",
          [2.7, 0.25, exploded ? 1.6 : 0.9],
          [0.6, 0.6, 0.05],
          teal,
        ),
      );
      out.push(
        cylinder(
          "Electron analyzer schematic",
          [3.3, 1.1, 0.2],
          0.35,
          0.9,
          teal,
        ),
      );
    } else if (mode === "crucible") {
      out.push(
        cylinder("Crucible wall", [0, -0.2, 0], 1.75, 1.35, metal, 36, true),
      );
      out.push(
        cylinder("Crucible interior", [0, -0.64, 0], 1.72, 0.12, "#193d43", 36),
      );
      out.push(torus("Crucible rim", [0, 0.48, 0], 1.75, 0.11, teal));
      out.push(torus("Crucible base", [0, -0.88, 0], 1.75, 0.1, metal));
      let n = 0;
      counts.forEach((c, k) => {
        const amount = Math.min(8, Math.max(1, Math.round(c.count)));
        for (let i = 0; i < amount; i++) {
          const a = n++ * 2.399;
          const radius = 0.35 + (n % 4) * 0.29;
          out.push(
            sphere(
              `${c.symbol} composition marker ${i + 1}`,
              [
                radius * Math.cos(a),
                0.45 + (n % 3) * 0.45 + (exploded ? k * 0.45 : 0),
                radius * Math.sin(a),
              ],
              0.2,
              color(c.symbol),
            ),
          );
        }
      });
    } else {
      const symbols = counts.map((c) => c.symbol);
      // This is a composition illustration, never a proposed crystal structure.
      for (let x = -1; x <= 1; x++)
        for (let y = -1; y <= 1; y++)
          for (let z = -1; z <= 1; z++) {
            const k = (x + y + z + 9) % Math.max(1, symbols.length),
              symbol = symbols[k] || "?",
              spacing = exploded ? 1.7 : 1.2;
            out.push(
              sphere(
                `${symbol} illustrative site ${x},${y},${z}`,
                [x * spacing, y * spacing + 0.6, z * spacing],
                0.22,
                color(symbol),
              ),
            );
            if (!exploded) {
              if (x < 1)
                out.push(
                  box(
                    "Illustrative X connection",
                    [(x + 0.5) * spacing, y * spacing + 0.6, z * spacing],
                    [spacing, 0.022, 0.022],
                    metal,
                  ),
                );
              if (y < 1)
                out.push(
                  box(
                    "Illustrative Y connection",
                    [x * spacing, (y + 0.5) * spacing + 0.6, z * spacing],
                    [0.022, spacing, 0.022],
                    metal,
                  ),
                );
              if (z < 1)
                out.push(
                  box(
                    "Illustrative Z connection",
                    [x * spacing, y * spacing + 0.6, (z + 0.5) * spacing],
                    [0.022, 0.022, spacing],
                    metal,
                  ),
                );
            }
          }
    }
    return out;
  }
  function gltf(objects) {
    const buffers = [],
      views = [],
      accessors = [],
      meshes = [],
      nodes = [],
      materials = [];
    let offset = 0;
    const add = (array, type, componentType, target, bounds) => {
      const bytes = new Uint8Array(array.buffer);
      buffers.push(bytes);
      const view = views.length;
      views.push({
        buffer: 0,
        byteOffset: offset,
        byteLength: bytes.length,
        target,
      });
      offset += bytes.length;
      const acc = accessors.length;
      accessors.push({
        bufferView: view,
        componentType,
        count: array.length / (type === "VEC3" ? 3 : 1),
        type,
        ...bounds,
      });
      return acc;
    };
    for (const obj of objects) {
      const positions = new Float32Array(obj.vertices.flat());
      const normals = new Float32Array(positions.length);
      for (const [a, b, c] of obj.faces) {
        const A = obj.vertices[a],
          B = obj.vertices[b],
          C = obj.vertices[c];
        const u = B.map((n, i) => n - A[i]),
          v = C.map((n, i) => n - A[i]);
        const n = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        for (const i of [a, b, c])
          for (let k = 0; k < 3; k++) normals[i * 3 + k] += n[k];
      }
      for (let i = 0; i < normals.length; i += 3) {
        const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
        if (len < 1e-12) {
          // Duplicate sphere pole vertices may belong only to degenerate
          // triangles. glTF still requires a unit normal for these vertices.
          normals[i] = 0;
          normals[i + 1] = 1;
          normals[i + 2] = 0;
        } else {
          for (let k = 0; k < 3; k++) normals[i + k] /= len;
        }
      }
      const min = [0, 1, 2].map((i) =>
          Math.min(...obj.vertices.map((v) => v[i])),
        ),
        max = [0, 1, 2].map((i) => Math.max(...obj.vertices.map((v) => v[i])));
      const pos = add(positions, "VEC3", 5126, 34962, { min, max }),
        normal = add(normals, "VEC3", 5126, 34962, {});
      // Uint32 ensures every following buffer view stays four-byte aligned.
      const idx = add(
        new Uint32Array(obj.faces.flat()),
        "SCALAR",
        5125,
        34963,
        {},
      );
      const rgb = obj.color.match(/\w\w/g).map((h) => parseInt(h, 16) / 255);
      const material = materials.length;
      materials.push({
        name: obj.color,
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [...rgb, 1],
          metallicFactor: 0.35,
          roughnessFactor: 0.42,
        },
      });
      meshes.push({
        name: obj.name,
        primitives: [
          {
            attributes: { POSITION: pos, NORMAL: normal },
            indices: idx,
            material,
          },
        ],
      });
      nodes.push({ name: obj.name, mesh: meshes.length - 1 });
    }
    const combined = new Uint8Array(offset);
    let cursor = 0;
    for (const b of buffers) {
      combined.set(b, cursor);
      cursor += b.length;
    }
    let base64;
    if (typeof Buffer !== "undefined")
      base64 = Buffer.from(combined).toString("base64");
    else {
      let binary = "";
      for (let i = 0; i < combined.length; i += 8192)
        binary += String.fromCharCode(...combined.subarray(i, i + 8192));
      base64 = btoa(binary);
    }
    return {
      asset: {
        version: "2.0",
        generator: "PHOTON educational scene",
        copyright: "Illustrative geometry; not an NSRL engineering model",
      },
      scene: 0,
      scenes: [{ nodes: nodes.map((_, i) => i) }],
      nodes,
      meshes,
      materials,
      buffers: [
        {
          byteLength: offset,
          uri: `data:application/octet-stream;base64,${base64}`,
        },
      ],
      bufferViews: views,
      accessors,
    };
  }
  const api = {
    ELEMENTS,
    color,
    normalize,
    parseFormula,
    formula,
    scene,
    gltf,
  };
  root.PhotonLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
