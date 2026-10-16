'use strict';

(function () {
  const PAPER_RULES = { s02: [0.75, 1.2], cn: [4, 13], dr: [-0.2, 0.2], sigma2: [0.001, 0.02], de0: [-10, 10] };
  const GENERAL_RULES = { s02: [0.01, 1.5], cn: [0.01, 24], dr: [-0.2, 0.2], sigma2: [0, 0.04], de0: [-15, 15] };
  let currentSuggestion = null;

  function rms(values) {
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
  }

  function movingAverage(values, halfWidth = 3) {
    return values.map((_, index) => {
      const low = Math.max(0, index - halfWidth), high = Math.min(values.length, index + halfWidth + 1);
      return values.slice(low, high).reduce((sum, value) => sum + value, 0) / (high - low);
    });
  }

  function fourierMagnitude(k, chi, kmin, kmax, rmax = 6) {
    const selected = k.map((value, index) => [value, chi[index]]).filter(row => row[0] >= kmin && row[0] <= kmax);
    if (selected.length < 20) throw new Error('建议范围内的数据点不足，无法估算第一壳层 R 窗口。');
    const dk = (selected.at(-1)[0] - selected[0][0]) / Math.max(1, selected.length - 1);
    const r = Array.from({ length: 301 }, (_, index) => index * rmax / 300);
    const magnitude = r.map(distance => {
      let real = 0, imaginary = 0;
      selected.forEach(([waveNumber, value], index) => {
        const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / Math.max(1, selected.length - 1));
        const weighted = value * waveNumber ** 3 * window;
        real += weighted * Math.cos(2 * waveNumber * distance) * dk;
        imaginary += weighted * Math.sin(2 * waveNumber * distance) * dk;
      });
      return Math.hypot(real, imaginary);
    });
    return { r, magnitude };
  }

  function estimateCurveSuggestions(kInput, chiInput, reff) {
    const pairs = kInput.map((value, index) => [Number(value), Number(chiInput[index])])
      .filter(row => Number.isFinite(row[0]) && Number.isFinite(row[1]) && row[0] > 0)
      .sort((a, b) => a[0] - b[0]);
    const unique = pairs.filter((row, index) => index === 0 || row[0] > pairs[index - 1][0]);
    if (unique.length !== pairs.length) throw new Error('k 轴包含重复值；请先在 Athena 中检查并导出严格单调的 χ(k)。');
    if (unique.length < 30) throw new Error('有效 k–χ(k) 数据少于 30 点，无法生成可靠建议。');
    const k = unique.map(row => row[0]), chi = unique.map(row => row[1]);
    const measuredMin = k[0], measuredMax = k.at(-1);
    let kmin = Math.max(2, Math.min(3, measuredMax - 3));
    kmin = Math.ceil(Math.max(kmin, measuredMin + 0.25) * 10) / 10;
    const weighted = chi.map((value, index) => value * k[index] ** 2);
    const smooth = movingAverage(weighted, 3), residual = weighted.map((value, index) => value - smooth[index]);
    const tailStart = Math.floor(residual.length * 0.8), noise = Math.max(1e-12, rms(residual.slice(tailStart)));
    const windowSize = Math.max(10, Math.floor(unique.length / 18));
    let reliableK = k[Math.max(0, k.length - windowSize - 1)], bestSnr = 0;
    for (let start = 0; start + windowSize <= k.length; start += Math.max(2, Math.floor(windowSize / 3))) {
      const signal = rms(smooth.slice(start, start + windowSize));
      const localNoise = Math.max(noise, rms(residual.slice(start, start + windowSize)));
      const snr = signal / localNoise;
      if (snr >= 2.5) reliableK = k[start + windowSize - 1];
      if (k[start + windowSize - 1] >= reliableK - 0.5) bestSnr = Math.max(bestSnr, snr);
    }
    let kmax = Math.floor(Math.min(measuredMax - 0.35, reliableK) * 10) / 10;
    if (kmax - kmin < 3) kmax = Math.floor((measuredMax - 0.35) * 10) / 10;
    if (!(kmax > kmin)) throw new Error('可用 k 范围不足，无法建立第一壳层拟合建议。');

    const transform = fourierMagnitude(k, chi, kmin, kmax);
    const searchMax = Math.min(3.8, Math.max(2.2, reff + 0.45));
    const candidates = transform.r.map((value, index) => ({ value, amp: transform.magnitude[index], index }))
      .filter(item => item.value >= 0.6 && item.value <= searchMax);
    const peak = candidates.reduce((best, item) => item.amp > best.amp ? item : best);
    const threshold = peak.amp * 0.30;
    let left = peak.index, right = peak.index;
    while (left > 0 && transform.magnitude[left] > threshold) left--;
    while (right < transform.r.length - 1 && transform.magnitude[right] > threshold) right++;
    let rmin = Math.max(0.5, transform.r[left]), rmax = Math.min(reff + 0.55, transform.r[right]);
    if (rmax - rmin < 0.6) { rmin = Math.max(0.5, peak.value - 0.6); rmax = Math.min(reff + 0.55, peak.value + 0.6); }
    rmin = Math.round(rmin * 10) / 10; rmax = Math.round(rmax * 10) / 10;
    const nind = 2 * (kmax - kmin) * (rmax - rmin) / Math.PI + 2;
    return {
      measured_k_range_Ainv: [measuredMin, measuredMax], suggested_k_range_Ainv: [kmin, kmax],
      suggested_r_range_A: [rmin, rmax], uncorrected_r_peak_A: peak.value,
      high_k_signal_to_noise_heuristic: bestSnr, nind_estimate: nind,
      methods: {
        kmin: '3 A^-1 literature starting point clipped to measured coverage; final value requires FEFF scan from 2-4 A^-1',
        kmax: 'largest provisional high-k segment with smoothed k2 signal/residual ratio >=2.5 and taper margin',
        r: 'k3 Hanning Fourier magnitude, strongest first-shell peak, adjacent 30% crossings',
      },
    };
  }

  function buildSuggestion(curve, structure, options = {}) {
    const shell = structure?.first_shell;
    if (!shell || !Number.isFinite(shell.coordination_number) || !Number.isFinite(shell.distance_mean_A)) {
      throw new Error('CIF 尚未生成可用的第一配位层摘要。');
    }
    const role = options.role || 'unknown', requestedProfile = options.profile || 'paper-metal';
    const warnings = ['参数建议是拟合初值/窗口提案，不是实验测量结果。'];
    let profile = requestedProfile;
    if (profile === 'paper-metal' && (shell.coordination_number < 4 || shell.coordination_number > 13)) {
      profile = 'professional-general';
      warnings.push('CIF 第一壳层 CN 超出金属训练域 4–13，已建议切换到专业通用审查域。');
    }
    if (shell.confidence !== 'medium') warnings.push('CIF 未出现清晰的第一径向间隙，第一壳层归属可信度较低，须检查 FEFF paths.dat。');
    const diagnostics = estimateCurveSuggestions(curve.k, curve.chi, shell.distance_mean_A);
    if (diagnostics.high_k_signal_to_noise_heuristic < 2.5) warnings.push('高 k 信噪比启发式较弱，kmax 必须结合高 R 噪声窗人工复核。');
    if (diagnostics.nind_estimate < 6) warnings.push('建议窗口的独立点数较少，应进一步减少自由参数。');
    const rules = profile === 'paper-metal' ? PAPER_RULES : GENERAL_RULES;
    return {
      schema: 'xafs-parameter-suggestion/v1', generated_at: new Date().toISOString(),
      status: 'proposal_not_fit', role, requested_profile: requestedProfile, recommended_profile: profile,
      structure: {
        source: structure.structure_source, formula: structure.formula, absorber: structure.absorber, edge: structure.edge,
        coordination_number: shell.coordination_number, scatterers: shell.scatterers,
        reff_initial_A: shell.distance_mean_A, distance_range_A: [shell.distance_min_A, shell.distance_max_A],
        shell_assignment_method: shell.assignment_method, shell_assignment_confidence: shell.confidence,
      },
      curve: diagnostics,
      parameters: {
        n: { initial: shell.coordination_number, bounds: rules.cn, status: role === 'standard' ? 'fixed_crystallographic' : 'candidate_initial_only' },
        s02: { initial: Number.isFinite(options.s02) ? options.s02 : 0.9, bounds: rules.s02, status: role === 'standard' ? 'vary_from_standard' : 'fixed_external_same_edge_standard', estimated_from_curve: false },
        delta_e0_eV: { initial: 0, bounds: rules.de0, status: 'vary' },
        delta_r_A: { initial: 0, bounds: rules.dr, status: 'vary_from_feff_reff' },
        sigma2_A2: { initial: 0.006, bounds: rules.sigma2, status: 'vary', basis: 'conservative room-temperature first-shell starting value; not curve-derived' },
      },
      warnings,
    };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  async function readCurrentCurve() {
    const file = document.querySelector('#data-file').files[0];
    if (!file) throw new Error('请先选择实验曲线文件。');
    const text = await file.text();
    if (document.querySelector('#input-kind').value === 'energy') {
      const processed = preprocessEnergy(text);
      return { k: processed.k, chi: processed.chi, source: file.name, preprocessing: processed.method };
    }
    const form = document.querySelector('#fit-form'), kcol = Number(form.elements.kcol.value), chicol = Number(form.elements.chicol.value);
    const rows = numbers(text).filter(row => row.length > Math.max(kcol, chicol));
    return { k: rows.map(row => row[kcol]), chi: rows.map(row => row[chicol]), source: file.name, preprocessing: 'uploaded k-chi' };
  }

  function renderSuggestion(suggestion) {
    const p = suggestion.parameters, s = suggestion.structure, c = suggestion.curve;
    document.querySelector('#fit-suggestion-results').innerHTML = `<table><thead><tr><th>项目</th><th>建议值</th><th>依据/状态</th></tr></thead><tbody>
      <tr><td>第一壳层</td><td>CN=${s.coordination_number}；Reff≈${s.reff_initial_A.toFixed(4)} Å；${escapeHtml(Object.entries(s.scatterers).map(([key,value])=>`${key}×${value}`).join(' + '))}</td><td>CIF ${escapeHtml(s.shell_assignment_method)}；${s.shell_assignment_confidence}</td></tr>
      <tr><td>k 范围</td><td>${c.suggested_k_range_Ainv[0].toFixed(1)}–${c.suggested_k_range_Ainv[1].toFixed(1)} Å⁻¹</td><td>曲线覆盖与高 k 信噪比启发式；仍需 FEFF 扫描</td></tr>
      <tr><td>R 范围</td><td>${c.suggested_r_range_A[0].toFixed(1)}–${c.suggested_r_range_A[1].toFixed(1)} Å</td><td>第一峰 30% 交点；峰位 ${c.uncorrected_r_peak_A.toFixed(3)} Å 未作相移校正</td></tr>
      <tr><td>N</td><td>${p.n.initial} [${p.n.bounds.join(', ')}]</td><td>${escapeHtml(p.n.status)}</td></tr>
      <tr><td>S₀²</td><td>${p.s02.initial} [${p.s02.bounds.join(', ')}]</td><td>${escapeHtml(p.s02.status)}；不由未知谱估算</td></tr>
      <tr><td>ΔE₀ / ΔR / σ²</td><td>${p.delta_e0_eV.initial} eV / ${p.delta_r_A.initial} Å / ${p.sigma2_A2.initial} Å²</td><td>保守初值，必须由拟合与敏感性检查更新</td></tr>
      <tr><td>Nind 估计</td><td>${c.nind_estimate.toFixed(2)}</td><td>多 k 权重不重复增加信息量</td></tr>
      </tbody></table><p class="hint"><strong>警告：</strong>${escapeHtml(suggestion.warnings.join('；'))}</p>`;
  }

  function applySuggestion(suggestion) {
    const form = document.querySelector('#fit-form'), p = suggestion.parameters, c = suggestion.curve;
    const profile = document.querySelector('#constraint-profile');
    if (profile.value !== suggestion.recommended_profile) { profile.value = suggestion.recommended_profile; profile.dispatchEvent(new Event('change')); }
    form.elements.kmin.value = c.suggested_k_range_Ainv[0]; form.elements.kmax.value = c.suggested_k_range_Ainv[1];
    form.elements.fit_rmin.value = c.suggested_r_range_A[0]; form.elements.fit_rmax.value = c.suggested_r_range_A[1];
    form.elements.s02.value = p.s02.initial; form.elements.de0.value = p.delta_e0_eV.initial;
    document.querySelector('#native-s02').value = p.s02.initial;
    const values = { '#quick-n': p.n.initial, '#core-n': p.n.initial, '#quick-sigma2': p.sigma2_A2.initial, '#core-sigma2': p.sigma2_A2.initial, '#quick-dr': p.delta_r_A.initial, '#core-dr': p.delta_r_A.initial, '#quick-s02': p.s02.initial, '#quick-de0': p.delta_e0_eV.initial };
    Object.entries(values).forEach(([selector, value]) => { const element = document.querySelector(selector); if (element) element.value = value; });
    if (globalThis.applyExafsPathSuggestion) globalThis.applyExafsPathSuggestion(suggestion);
    const status = document.querySelector('#fit-suggestion-status');
    status.className = 'status ok'; status.textContent = '建议值已应用。它们仍是初值；请运行拟合并检查边界、相关性、残差和窗口敏感性。';
  }

  function bindUi() {
    const generate = document.querySelector('#suggest-fit-parameters');
    if (!generate) return;
    generate.addEventListener('click', async () => {
      const status = document.querySelector('#fit-suggestion-status');
      status.className = 'status'; status.textContent = '正在联合分析实验曲线与 CIF 第一配位层……';
      try {
        const curve = await readCurrentCurve();
        const generated = globalThis.xafsGeneratedFeffInput || await globalThis.prepareFeffFromCif();
        currentSuggestion = buildSuggestion(curve, generated.summary, {
          role: document.querySelector('#analysis-role').value,
          profile: document.querySelector('#constraint-profile').value,
          s02: Number(document.querySelector('#native-s02').value),
        });
        if (document.querySelectorAll('#path-list .path').length > 1) currentSuggestion.warnings.push('浏览器中存在多条首壳路径；总 CN 不会自动重复分配到每条路径，须按 FEFF 简并度核对人口。');
        currentSuggestion.curve.source = curve.source; currentSuggestion.curve.preprocessing = curve.preprocessing;
        globalThis.xafsParameterSuggestion = currentSuggestion;
        renderSuggestion(currentSuggestion);
        document.querySelector('#apply-fit-suggestions').disabled = false;
        document.querySelector('#download-fit-suggestions').disabled = false;
        status.className = 'status ok'; status.textContent = '参数建议已生成；请先阅读依据和警告，再决定是否应用。';
      } catch (error) { status.className = 'status error'; status.textContent = error.message; }
    });
    document.querySelector('#apply-fit-suggestions').addEventListener('click', () => currentSuggestion && applySuggestion(currentSuggestion));
    document.querySelector('#download-fit-suggestions').addEventListener('click', () => {
      if (!currentSuggestion) return;
      download('xafs-parameter-suggestions.json', JSON.stringify(currentSuggestion, null, 2), 'application/json;charset=utf-8');
    });
    const invalidate = () => {
      currentSuggestion = null; globalThis.xafsParameterSuggestion = null;
      document.querySelector('#apply-fit-suggestions').disabled = true;
      document.querySelector('#download-fit-suggestions').disabled = true;
      document.querySelector('#fit-suggestion-results').innerHTML = '';
      const status = document.querySelector('#fit-suggestion-status');
      status.className = 'status'; status.textContent = '输入已改变，请重新生成参数建议。';
    };
    document.querySelector('#data-file').addEventListener('change', invalidate);
    ['#cif-absorber', '#cif-edge', '#cif-radius'].forEach(selector => document.querySelector(selector).addEventListener('change', invalidate));
    window.addEventListener('xafs-cif-source-changed', invalidate);
  }

  if (typeof document !== 'undefined') bindUi();
  if (typeof module !== 'undefined' && module.exports) module.exports = { estimateCurveSuggestions, buildSuggestion, fourierMagnitude };
})();
