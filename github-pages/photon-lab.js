/* PHOTON: local exhibit controls, composition design and explicit research handoff. */
(function () {
  "use strict";
  const C = window.PhotonLab,
    $ = (id) => document.getElementById(id);
  const state = {
    mode: "ring",
    counts: [],
    undo: [],
    exploded: false,
    auto: false,
    yaw: -0.5,
    pitch: 0.62,
    zoom: 1,
    energy: 60,
    temperature: 20,
    lang: "en",
    analysis: null,
  };
  const curated =
    "H B C N O Mg Al Si Ca Ti Fe Co Ni Cu Se Sr Y Zr Nb Mo Sn Te Ba La W Bi".split(
      " ",
    );
  const copy = (en, zh) => (state.lang === "zh" ? zh : en);
  const stations = {
    ring: {
      label: "HLS / STORAGE RING",
      title: [
        "A ring that turns electrons into light.",
        "让电子带来一束光的储存环。",
      ],
      description: [
        "Electrons circulate in the storage ring. Magnets bend their path, producing synchrotron light for the experimental stations. This schematic is inspired by the Hefei Light Source at NSRL.",
        "电子在储存环中循环运行，磁铁使电子轨道弯转，产生供实验站使用的同步辐射光。这里是以国家同步辐射实验室合肥光源为灵感的示意模型。",
      ],
    },
    beamline: {
      label: "BEAMLINE / ARPES ENDSTATION",
      title: ["Follow the photons to the sample.", "沿着光束，抵达样品。"],
      description: [
        "Optics select and focus the light onto a sample. An ARPES analyzer measures emitted electrons to study electronic structure. Explore the components with Explode; the planned settings below travel with your research brief.",
        "光学元件选择并聚焦光子，使其照射样品。ARPES 分析器通过测量出射电子研究电子结构。点击“拆解”观察部件；下方计划参数会随研究简报一起导出。",
      ],
    },
    crucible: {
      label: "MATERIAL DESIGN / CRUCIBLE",
      title: [
        "Compose a material, one element at a time.",
        "用元素搭建你的材料想法。",
      ],
      description: [
        "Drop elements into the crucible and adjust their ratios. The markers visualize your composition. Analyze runs the website’s existing local composition model; synthesis and stability still need structural and experimental evidence.",
        "将元素拖入坩埚，调整配比。彩色标记表示所选成分；“分析材料”会运行网站已有的本地成分模型，合成与稳定性仍需要结构和实验依据。",
      ],
    },
    crystal: {
      label: "ATOM MODEL / ILLUSTRATIVE SITES",
      title: [
        "A spatial sketch for your next model.",
        "为下一个模型准备空间草图。",
      ],
      description: [
        "A stylized grid of element markers, not a solved crystal structure. Ratios are stored in the recipe; the visual site counts are illustrative. Export the scene to Blender for editing. Use a verified CIF before any DFT calculation.",
        "这里展示元素标记的空间网格，不是已求解的晶体结构。配方保存真实配比，画面点位数量仅为示意。可导入 Blender 继续编辑；DFT 计算前须使用可靠的 CIF 结构。",
      ],
    },
  };
  let objects = [],
    filter = "curated",
    toastTimer,
    lastFrame = 0,
    dirty = true;
  const canvas = $("sceneCanvas"),
    ctx = canvas.getContext("2d"),
    viewport = $("viewport");
  function el(tag, text, className) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  }
  function toast(text) {
    $("toast").textContent = text;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
  }
  function message(text, user = false) {
    const node = el("div", text, `message${user ? " user" : ""}`);
    $("messages").append(node);
    while ($("messages").children.length > 12)
      $("messages").firstChild.remove();
    $("messages").scrollTop = $("messages").scrollHeight;
  }
  function station() {
    const s = stations[state.mode],
      i = state.lang === "zh" ? 1 : 0;
    $("sceneLabel").textContent = s.label;
    $("stationNumber").textContent =
      `STATION 0${Object.keys(stations).indexOf(state.mode) + 1} / ${state.mode.toUpperCase()}`;
    $("stationTitle").textContent = s.title[i];
    $("stationDescription").textContent = s.description[i];
  }
  function rebuild() {
    objects = C.scene(state.mode, state.counts, state.exploded);
    $("objectCount").textContent = `${objects.length} OBJECTS`;
    dirty = true;
  }
  function mode(name) {
    if (!stations[name]) return;
    state.mode = name;
    state.exploded = false;
    $("explode").classList.remove("selected");
    document
      .querySelectorAll("[data-scene]")
      .forEach((b) => b.classList.toggle("selected", b.dataset.scene === name));
    station();
    rebuild();
  }
  function setCounts(counts, remember = true) {
    const next = C.normalize(counts);
    if (remember) {
      state.undo.push(state.counts.map((c) => ({ ...c })));
      if (state.undo.length > 30) state.undo.shift();
    }
    state.counts = next;
    state.analysis = null;
    $("analysis").classList.remove("active");
    renderComposition();
    rebuild();
  }
  function add(symbol, count = 1) {
    if (!C.ELEMENTS.includes(symbol)) throw new Error("Unknown element");
    setCounts([...state.counts, { symbol, count }]);
    mode("crucible");
    toast(copy(`${symbol} added to crucible`, `${symbol} 已加入坩埚`));
  }
  function renderElements() {
    const search = $("elementSearch").value.trim().toLowerCase();
    const list = search || filter === "all" ? C.ELEMENTS : curated;
    $("elements").replaceChildren();
    for (const s of list) {
      const z = C.ELEMENTS.indexOf(s) + 1;
      if (search && !s.toLowerCase().includes(search) && String(z) !== search)
        continue;
      const b = el("button", undefined, "element");
      b.type = "button";
      b.draggable = true;
      b.setAttribute(
        "aria-label",
        copy(`Add ${s}, atomic number ${z}`, `添加 ${s}，原子序数 ${z}`),
      );
      b.style.setProperty("--element-color", C.color(s));
      b.append(el("small", String(z).padStart(2, "0")), el("strong", s));
      b.addEventListener("click", () => attempt(() => add(s)));
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", s);
        e.dataTransfer.effectAllowed = "copy";
      });
      $("elements").append(b);
    }
    if (!$("elements").children.length)
      $("elements").append(
        el("p", copy("No matching symbol", "没有匹配的元素符号"), "micro"),
      );
  }
  function renderComposition() {
    const total = state.counts.reduce((sum, c) => sum + c.count, 0);
    $("formula").textContent = C.formula(state.counts) || "∅";
    $("compositionMeta").textContent = state.counts.length
      ? copy(
          `${state.counts.length} elements · relative ratio ${Number(total.toFixed(2))}`,
          `${state.counts.length} 种元素 · 总配比 ${Number(total.toFixed(2))}`,
        )
      : copy("Your crucible is waiting for an idea.", "坩埚正在等待你的想法。");
    $("composition").replaceChildren();
    for (const c of state.counts) {
      const row = el("div", undefined, "composition-row");
      row.style.setProperty("--element-color", C.color(c.symbol));
      row.append(
        el("span", c.symbol, "symbol"),
        el("span", `${((c.count / total) * 100).toFixed(1)}%`, "fraction"),
      );
      const minus = el("button", "−"),
        plus = el("button", "+"),
        input = el("input");
      minus.setAttribute("aria-label", `Remove one ${c.symbol}`);
      plus.setAttribute("aria-label", `Add one ${c.symbol}`);
      input.type = "number";
      input.min = "0.01";
      input.max = "99";
      input.step = "0.01";
      input.value = c.count;
      input.setAttribute("aria-label", `${c.symbol} ratio`);
      const update = (n) =>
        attempt(() => {
          setCounts(
            state.counts
              .map((x) =>
                x.symbol === c.symbol ? { symbol: x.symbol, count: n } : x,
              )
              .filter((x) => x.count > 0),
          );
        });
      minus.onclick = () => update(Math.max(0, c.count - 1));
      plus.onclick = () => update(c.count + 1);
      input.onchange = () => {
        const n = Number(input.value);
        if (!Number.isFinite(n) || n < 0.01 || n > 99) {
          input.value = c.count;
          toast(
            copy("Use a ratio from 0.01 to 99", "配比须在 0.01 到 99 之间"),
          );
          return;
        }
        update(n);
      };
      row.append(minus, input, plus);
      $("composition").append(row);
    }
    $("undo").disabled = !state.undo.length;
    $("analyze").disabled = !state.counts.length;
    $("save").disabled = !state.counts.length;
  }
  function attempt(fn) {
    try {
      fn();
    } catch (error) {
      toast(error.message);
    }
  }
  function nextSteps() {
    const f = C.formula(state.counts);
    return copy(
      `Research plan for ${f}:\n1. Resolve a crystal structure and record its source.\n2. Check phase stability with independent calculations.\n3. Plan ARPES at ${state.energy} eV and ${state.temperature} K; verify beamline and sample constraints.\n4. Compare measured bands with calculated bands and document uncertainty.`,
      `${f} 研究计划：\n1. 确认晶体结构并记录来源。\n2. 用独立计算核对相稳定性。\n3. 规划 ${state.energy} eV、${state.temperature} K 的 ARPES 测量，并核对线站及样品限制。\n4. 对照实测与计算能带，记录不确定性。`,
    );
  }
  function analyze() {
    if (!state.counts.length) {
      toast(copy("Add elements first", "请先加入元素"));
      return;
    }
    const p = window.ARPESMaterialBaseline?.predictCounts(state.counts);
    if (p?.state !== "ready") {
      toast(
        copy(
          "The local model is unavailable. Try reloading.",
          "本地模型暂不可用，请刷新重试。",
        ),
      );
      return;
    }
    state.analysis = p;
    const area = $("analysis");
    area.replaceChildren();
    area.classList.add("active");
    area.append(
      el(
        "strong",
        copy("Composition baseline · ML estimate", "成分基线 · ML 估算"),
      ),
    );
    const metric = (name, value) => {
      const row = el("div", undefined, "metric");
      row.append(el("span", name), el("b", value));
      area.append(row);
    };
    metric(
      copy("Formation energy", "形成能"),
      `${p.formation_energy_eV_atom} eV/atom`,
    );
    area.append(
      el(
        "p",
        copy(
          `90th-percentile held-out absolute error: ${p.formation_error_q90_eV_atom} eV/atom. This is a dataset error, not a sample-specific interval.`,
          `留出数据绝对误差第 90 百分位：${p.formation_error_q90_eV_atom} eV/atom。这是数据集误差，并非该样品的置信区间。`,
        ),
      ),
    );
    metric(
      copy("Metallicity tendency", "金属性趋势分数"),
      String(p.metallic_tendency_score),
    );
    area.append(
      el(
        "p",
        copy(
          `Domain: ${p.domain}. Composition alone does not establish a crystal structure, stability, or superconductivity.`,
          `模型适用域：${p.domain}。仅凭成分不能确定晶体结构、稳定性或超导性。`,
        ),
      ),
    );
    if (p.unknown_elements.length)
      area.append(
        el(
          "p",
          copy(
            `Outside training elements: ${p.unknown_elements.join(", ")}`,
            `训练范围外元素：${p.unknown_elements.join("、")}`,
          ),
        ),
      );
    message(nextSteps());
  }
  function brief() {
    const f = C.formula(state.counts) || "Not selected";
    return `# PHOTON materials research brief\n\nComposition: ${f}\nRatios: ${JSON.stringify(state.counts)}\nPlanned photon energy: ${state.energy} eV\nPlanned sample temperature: ${state.temperature} K\nScene: ${state.mode}\n\nThese are planning settings, not live instrument readings. Scene geometry and atom positions are illustrative, not a crystal structure or a physical simulation.\n\n${state.counts.length ? nextSteps() : "Select a composition to prepare a material research plan."}\n\n## Local composition model\n${state.analysis ? JSON.stringify(state.analysis, null, 2) : "Not run. No computed material properties are claimed."}\n\n## Facility reference\nhttps://www.nsrl.ustc.edu.cn/dkxzz/list.htm\n\nResolve a verified CIF and review structural and experimental evidence before making scientific claims.\n`;
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function exportScene() {
    const document = C.gltf(objects);
    document.extras = {
      composition: state.counts,
      photonEnergy_eV: state.energy,
      sampleTemperature_K: state.temperature,
      scene: state.mode,
      note: "Educational concept model. No measured crystal structure or apparatus geometry.",
    };
    download(
      `photon-${state.mode}.gltf`,
      JSON.stringify(document),
      "model/gltf+json",
    );
    toast(
      copy(
        "Downloaded .gltf — Blender: File → Import → glTF 2.0",
        "已下载 .gltf — Blender：文件 → 导入 → glTF 2.0",
      ),
    );
  }
  function readSaved() {
    try {
      const data = JSON.parse(
        localStorage.getItem("photon-recipes-v1") || "[]",
      );
      if (!Array.isArray(data)) return [];
      return data.slice(0, 12).filter((r) => {
        try {
          C.normalize(r.counts);
          return (
            r.counts.length &&
            Number.isFinite(r.energy) &&
            r.energy >= 20 &&
            r.energy <= 150 &&
            Number.isFinite(r.temperature) &&
            r.temperature >= 10 &&
            r.temperature <= 300
          );
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }
  function savedOptions() {
    const select = $("saved");
    select.replaceChildren();
    const blank = el("option", copy("Saved recipes", "已保存配方"));
    blank.value = "";
    select.append(blank);
    readSaved().forEach((r, i) => {
      const option = el("option", `${C.formula(r.counts)} · ${r.energy} eV`);
      option.value = String(i);
      select.append(option);
    });
  }
  function tour() {
    mode("ring");
    message(
      copy(
        "Welcome to the light source. Start with the storage ring, then select Beamline to follow the photons. Open Crucible and drop in Mg and B, or load MgB₂. Analyze prepares a local model result and research plan; Atom model offers a spatial sketch you can export to Blender.",
        "欢迎来到光源展厅。从储存环出发，点击“光束线”追踪光子。进入“元素坩埚”，拖入 Mg 和 B，或加载 MgB₂。点击“分析材料”获得本地模型结果和研究计划；“原子模型”提供可导入 Blender 的空间草图。",
      ),
    );
  }
  function command(raw) {
    const text = raw.trim();
    if (!text) return;
    message(text, true);
    const lower = text.toLowerCase();
    try {
      if (/^(tour|guide me|导览|展厅导览)$/.test(lower)) tour();
      else if (/^(analy[sz]e|research plan|分析|研究计划)$/.test(lower))
        analyze();
      else if (/^(export|blender|导出)$/.test(lower)) exportScene();
      else if (/^(reset|clear|清空)$/.test(lower)) setCounts([]);
      else if (stations[lower]) mode(lower);
      else if (/^(add|加入|添加)\s+/i.test(text)) {
        const m = text.match(
          /^(?:add|加入|添加)\s+([A-Z][a-z]?)(?:\s+(\d+(?:\.\d+)?))?$/i,
        );
        if (!m) throw new Error(copy("Try: add Cu 2", "试试：add Cu 2"));
        const symbol = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
        add(symbol, m[2] ? Number(m[2]) : 1);
        message(
          copy(
            `Added ${symbol}. Adjust the ratio in Material Builder.`,
            `已加入 ${symbol}，可在材料设计区调整配比。`,
          ),
        );
      } else {
        setCounts(C.parseFormula(text));
        mode("crucible");
        message(
          copy(
            `Loaded ${C.formula(state.counts)}. Ready for analysis.`,
            `已加载 ${C.formula(state.counts)}，可以开始分析。`,
          ),
        );
      }
    } catch {
      message(
        copy(
          "I can run: add Cu 2, MgB2, analyze, tour, ring, beamline, crucible, crystal, reset, or export. For open-ended scientific questions, continue with Research Agent below.",
          "可以执行：add Cu 2、MgB2、分析、导览、ring、beamline、crucible、crystal、清空、导出。开放式科研问题请交给下方 Research Agent。",
        ),
      );
    }
  }
  function translate() {
    document.documentElement.lang = state.lang;
    document
      .querySelectorAll("[data-en]")
      .forEach((n) => (n.textContent = n.dataset[state.lang]));
    $("language").textContent = state.lang === "en" ? "中文" : "EN";
    $("elementSearch").placeholder = copy(
      "Symbol / atomic number",
      "元素符号 / 原子序数",
    );
    $("command").placeholder = copy(
      "Try: add Cu 2 / MgB2 / analyze",
      "试试：添加 Cu 2 / MgB2 / 分析",
    );
    station();
    renderElements();
    renderComposition();
    savedOptions();
    if (state.analysis) {
      state.analysis = null;
      $("analysis").classList.remove("active");
    }
    $("messages").replaceChildren();
    message(
      copy(
        "I'm your local lab copilot. Try a recipe or drag an element into the scene. I can guide the exhibit and prepare your research handoff.",
        "我是你的本地实验室助手。选择配方，或把元素拖入场景；我可以介绍展厅、执行指令并准备研究任务。",
      ),
    );
  }
  function projection(v, w, h) {
    const cy = Math.cos(state.yaw),
      sy = Math.sin(state.yaw),
      cp = Math.cos(state.pitch),
      sp = Math.sin(state.pitch);
    const x = v[0] * cy - v[2] * sy,
      z = v[0] * sy + v[2] * cy,
      y = v[1];
    const depth = -y * sp + z * cp,
      vertical = y * cp + z * sp;
    const scale = Math.min(w / 12, h / 8) * state.zoom * (16 / (16 + depth));
    return [w / 2 + x * scale, h * 0.55 - vertical * scale, depth];
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (now - lastFrame < 40) return;
    const elapsed = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (state.auto) {
      state.yaw += elapsed * 0.00012;
      dirty = true;
    }
    if (!dirty || !ctx) return;
    dirty = false;
    const w = viewport.clientWidth,
      h = viewport.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "#35505f44";
    for (let i = -7; i <= 7; i++) {
      for (const points of [
        [
          [i, -1.38, -7],
          [i, -1.38, 7],
        ],
        [
          [-7, -1.38, i],
          [7, -1.38, i],
        ],
      ]) {
        const a = projection(points[0], w, h),
          b = projection(points[1], w, h);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
    const triangles = [];
    objects.forEach((obj) => {
      const points = obj.vertices.map((v) => projection(v, w, h));
      const rgb = obj.color.match(/\w\w/g).map((v) => parseInt(v, 16));
      obj.faces.forEach((face) => {
        const [a, b, c] = face.map((i) => points[i]),
          [A, B, D] = face.map((i) => obj.vertices[i]);
        const u = B.map((v, i) => v - A[i]),
          v = D.map((v, i) => v - A[i]);
        const n = [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ],
          len = Math.hypot(...n) || 1;
        const light =
          0.53 + 0.47 * Math.abs((n[0] * 0.3 + n[1] * 0.8 + n[2] * 0.5) / len);
        triangles.push({
          points: [a, b, c],
          // The exhibition floor is a backdrop. Its large cap triangles must
          // not obscure the apparatus when sorting triangle centroids.
          z: obj.name === "Display plinth" ? 100 : (a[2] + b[2] + c[2]) / 3,
          color: `rgb(${rgb.map((x) => Math.round(x * light)).join(",")})`,
        });
      });
    });
    triangles.sort((a, b) => b.z - a.z);
    for (const t of triangles) {
      ctx.beginPath();
      ctx.moveTo(t.points[0][0], t.points[0][1]);
      ctx.lineTo(t.points[1][0], t.points[1][1]);
      ctx.lineTo(t.points[2][0], t.points[2][1]);
      ctx.closePath();
      ctx.fillStyle = t.color;
      ctx.fill();
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  }
  let pointer = null;
  canvas.addEventListener("pointerdown", (e) => {
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    state.auto = false;
    $("rotate").classList.remove("selected");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    state.yaw += (e.clientX - pointer.x) * 0.008;
    state.pitch = Math.max(
      0.1,
      Math.min(1.4, state.pitch + (e.clientY - pointer.y) * 0.008),
    );
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    dirty = true;
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(event, () => (pointer = null));
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      state.zoom = Math.max(
        0.5,
        Math.min(2.2, state.zoom * Math.exp(-e.deltaY * 0.001)),
      );
      dirty = true;
    },
    { passive: false },
  );
  viewport.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    viewport.classList.add("dragging");
  });
  viewport.addEventListener("dragleave", (e) => {
    if (!viewport.contains(e.relatedTarget))
      viewport.classList.remove("dragging");
  });
  viewport.addEventListener("drop", (e) => {
    e.preventDefault();
    viewport.classList.remove("dragging");
    const symbol = e.dataTransfer.getData("text/plain").trim();
    if (C.ELEMENTS.includes(symbol)) attempt(() => add(symbol));
    else toast(copy("Drop an element from the library", "请从元素库拖入元素"));
  });
  document.addEventListener("dragend", () =>
    viewport.classList.remove("dragging"),
  );
  document
    .querySelectorAll("[data-scene]")
    .forEach((b) => (b.onclick = () => mode(b.dataset.scene)));
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        document
          .querySelectorAll("[data-filter]")
          .forEach((n) => n.classList.toggle("selected", n === b));
        renderElements();
      }),
  );
  document.querySelectorAll("[data-recipe]").forEach(
    (b) =>
      (b.onclick = () => {
        setCounts(C.parseFormula(b.dataset.recipe));
        mode("crucible");
      }),
  );
  document
    .querySelectorAll("[data-command]")
    .forEach((b) => (b.onclick = () => command(b.dataset.command)));
  $("elementSearch").oninput = renderElements;
  $("analyze").onclick = analyze;
  $("clear").onclick = () => setCounts([]);
  $("tour").onclick = tour;
  $("undo").onclick = () => {
    const previous = state.undo.pop();
    if (previous) setCounts(previous, false);
  };
  $("explode").onclick = () => {
    state.exploded = !state.exploded;
    $("explode").classList.toggle("selected", state.exploded);
    rebuild();
  };
  $("rotate").onclick = () => {
    state.auto = !state.auto;
    $("rotate").classList.toggle("selected", state.auto);
  };
  $("resetView").onclick = () => {
    state.yaw = -0.5;
    state.pitch = 0.62;
    state.zoom = 1;
    dirty = true;
  };
  $("zoomIn").onclick = () => {
    state.zoom = Math.min(2.2, state.zoom + 0.15);
    dirty = true;
  };
  $("zoomOut").onclick = () => {
    state.zoom = Math.max(0.5, state.zoom - 0.15);
    dirty = true;
  };
  ["energy", "temperature"].forEach(
    (key) =>
      ($(key).oninput = () => {
        state[key] = Number($(key).value);
        $(key + "Value").textContent =
          state[key] + (key === "energy" ? " eV" : " K");
      }),
  );
  $("commandForm").onsubmit = (e) => {
    e.preventDefault();
    command($("command").value);
    $("command").value = "";
  };
  $("language").onclick = () => {
    state.lang = state.lang === "en" ? "zh" : "en";
    translate();
  };
  $("save").onclick = () => {
    try {
      const saved = readSaved();
      saved.unshift({
        counts: state.counts,
        energy: state.energy,
        temperature: state.temperature,
      });
      localStorage.setItem(
        "photon-recipes-v1",
        JSON.stringify(saved.slice(0, 12)),
      );
      savedOptions();
      toast(copy("Recipe saved on this device", "配方已保存在此设备"));
    } catch {
      toast(
        copy(
          "Local storage is unavailable; export your research brief instead.",
          "无法使用本地存储，请导出研究简报。",
        ),
      );
    }
  };
  $("saved").onchange = () => {
    if ($("saved").value === "") return;
    const recipe = readSaved()[Number($("saved").value)];
    if (!recipe) return;
    setCounts(recipe.counts);
    for (const k of ["energy", "temperature"]) {
      state[k] = recipe[k];
      $(k).value = recipe[k];
      $(k + "Value").textContent = recipe[k] + (k === "energy" ? " eV" : " K");
    }
    mode("crucible");
  };
  $("exportScene").onclick = exportScene;
  $("exportPlan").onclick = () =>
    download(
      `photon-${C.formula(state.counts) || "exhibit"}-brief.md`,
      brief(),
      "text/markdown;charset=utf-8",
    );
  $("agent").onclick = () => {
    try {
      sessionStorage.setItem("arpes-research-agent-context-v1", brief());
      // Keep the brief and the authorized session on this origin. The existing
      // GitHub mirror otherwise redirects agent.html to Netlify.
      window.location.href = "./agent.html?stay_on_github=1";
    } catch {
      toast(
        copy(
          "Context storage unavailable. Export a brief and paste it into Research Agent.",
          "无法保存交接内容，请导出简报后粘贴到 Research Agent。",
        ),
      );
    }
  };
  $("narrate").onclick = () => {
    if (!("speechSynthesis" in window)) {
      toast(
        copy(
          "Read-aloud is unavailable in this browser.",
          "此浏览器不支持朗读。",
        ),
      );
      return;
    }
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      return;
    }
    const speech = new SpeechSynthesisUtterance(
      $("stationTitle").textContent + " " + $("stationDescription").textContent,
    );
    speech.lang = state.lang === "en" ? "en-US" : "zh-CN";
    speech.rate = 0.95;
    speechSynthesis.speak(speech);
  };
  window.addEventListener("pagehide", () => window.speechSynthesis?.cancel());
  new ResizeObserver(() => (dirty = true)).observe(viewport);
  translate();
  rebuild();
  requestAnimationFrame(frame);
})();
