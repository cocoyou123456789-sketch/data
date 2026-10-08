'use strict';

let lastEnergyResult = null;
let lastWaveletResult = null;

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-14) throw new Error('所选能量区间无法稳定完成多项式拟合。');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= scale;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map(row => row[n]);
}

function polynomialFit(xs, ys, degree) {
  const size = degree + 1;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const vector = Array(size).fill(0);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) matrix[row][col] = xs.reduce((sum, x) => sum + x ** (row + col), 0);
    vector[row] = xs.reduce((sum, x, i) => sum + ys[i] * x ** row, 0);
  }
  return solveLinearSystem(matrix, vector);
}

function polynomialValue(coefficients, x) {
  return coefficients.reduce((sum, value, power) => sum + value * x ** power, 0);
}

function preprocessEnergy(text) {
  const rows = numbers(text);
  const energyColumn = Number($('#energy-col').value);
  const muColumn = Number($('#mu-col').value);
  const factor = $('#energy-unit').value === 'keV' ? 1000 : 1;
  const selected = rows
    .filter(row => row.length > Math.max(energyColumn, muColumn))
    .map(row => [row[energyColumn] * factor, row[muColumn]])
    .sort((a, b) => a[0] - b[0]);
  if (selected.length < 30) throw new Error('能量数据有效点少于 30；请检查列号、单位和文件格式。');
  for (let i = 1; i < selected.length; i++) if (!(selected[i][0] > selected[i - 1][0])) throw new Error('能量轴必须严格单调且不能包含重复值。');
  const energy = selected.map(row => row[0]);
  const mu = selected.map(row => row[1]);
  const derivatives = energy.slice(1, -1).map((value, index) => ({
    energy: value,
    value: (mu[index + 2] - mu[index]) / (energy[index + 2] - energy[index]),
  }));
  const manualE0 = Number($('#energy-e0').value);
  const e0 = Number.isFinite(manualE0) && $('#energy-e0').value.trim()
    ? manualE0
    : derivatives.reduce((best, item) => item.value > best.value ? item : best).energy;
  const pre1 = Number($('#pre1').value), pre2 = Number($('#pre2').value);
  const norm1 = Number($('#norm1').value), norm2 = Number($('#norm2').value);
  if (!(pre1 < pre2 && pre2 < 0 && norm1 > 0 && norm2 > norm1)) throw new Error('能量区间需满足 pre1 < pre2 < 0 < norm1 < norm2。');
  const take = (low, high) => selected.filter(row => row[0] - e0 >= low && row[0] - e0 <= high);
  const preRows = take(pre1, pre2), postRows = take(norm1, norm2);
  if (preRows.length < 5 || postRows.length < 5) throw new Error('前边或后边区间少于 5 个数据点，或超出实测能量范围。');
  const centered = energy.map(value => value - e0);
  const preCoefficients = polynomialFit(preRows.map(row => row[0] - e0), preRows.map(row => row[1]), 1);
  const postCoefficients = polynomialFit(postRows.map(row => row[0] - e0), postRows.map(row => row[1]), 2);
  const preEdge = centered.map(value => polynomialValue(preCoefficients, value));
  const postEdge = centered.map(value => polynomialValue(postCoefficients, value));
  const edgeStep = polynomialValue(postCoefficients, 0) - polynomialValue(preCoefficients, 0);
  if (!(edgeStep > 0) || !Number.isFinite(edgeStep)) throw new Error('拟合得到的边跃小于或等于零；请检查 μ(E) 列和归一化区间。');
  const normalized = mu.map((value, index) => (value - preEdge[index]) / edgeStep);
  const chiPairs = [];
  for (let i = 0; i < energy.length; i++) {
    const delta = energy[i] - e0;
    if (delta <= 0) continue;
    const k = Math.sqrt(delta / 3.80998212);
    chiPairs.push([k, (mu[i] - postEdge[i]) / edgeStep]);
  }
  if (chiPairs.length < 30) throw new Error('E₀ 后可转换为 χ(k) 的点数不足。');
  return {
    method: 'browser polynomial pre-edge(1) + post-edge(2); not AUTOBK',
    e0, edgeStep, ranges: { pre1, pre2, norm1, norm2 }, energy, mu, preEdge, postEdge, normalized,
    k: chiPairs.map(row => row[0]), chi: chiPairs.map(row => row[1]),
  };
}

function renderEnergyResult(result) {
  plot('#energyplot', [
    { name: '原始 μ(E)', x: result.energy, y: result.mu },
    { name: '前边', x: result.energy, y: result.preEdge },
    { name: '后边背景', x: result.energy, y: result.postEdge },
    { name: '标准化 μ(E)', x: result.energy, y: result.normalized },
  ], 'Energy (eV)', 'μ(E) / normalized');
  $('#energy-metrics').innerHTML = [
    ['E₀', `${result.e0.toFixed(2)} eV`], ['边跃', result.edgeStep.toPrecision(5)],
    ['能量点', result.energy.length], ['k 覆盖', `0–${result.k.at(-1).toFixed(2)} Å⁻¹`],
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><b>${value}</b></div>`).join('');
  $('#download-energy-csv').hidden = false;
}

function morletMap(k, values, rmax, centers = 64, radialPoints = 60) {
  const kmin = k[0], kmax = k.at(-1), sigmaK = Math.max(0.45, (kmax - kmin) / 18);
  const kAxis = Array.from({ length: centers }, (_, i) => kmin + i * (kmax - kmin) / (centers - 1));
  const rAxis = Array.from({ length: radialPoints }, (_, i) => i * rmax / (radialPoints - 1));
  const magnitude = rAxis.map(r => kAxis.map(center => {
    let real = 0, imaginary = 0, norm = 0;
    for (let i = 0; i < k.length; i++) {
      const weight = Math.exp(-0.5 * ((k[i] - center) / sigmaK) ** 2);
      real += values[i] * weight * Math.cos(2 * k[i] * r);
      imaginary += values[i] * weight * Math.sin(2 * k[i] * r);
      norm += weight * weight;
    }
    return Math.hypot(real, imaginary) / Math.sqrt(norm || 1);
  }));
  return { k: kAxis, r: rAxis, magnitude, sigma_k: sigmaK, kernel: 'Morlet/Gabor localized Fourier diagnostic' };
}

function heatColor(value) {
  const t = Math.max(0, Math.min(1, value));
  const stops = [[7, 20, 61], [17, 86, 139], [28, 144, 153], [126, 210, 79], [253, 231, 37]];
  const scaled = t * (stops.length - 1), index = Math.min(stops.length - 2, Math.floor(scaled)), fraction = scaled - index;
  return stops[index].map((channel, i) => Math.round(channel + fraction * (stops[index + 1][i] - channel)));
}

function drawWavelet(canvasSelector, wavelet, maxValue) {
  const canvas = $(canvasSelector), context = canvas.getContext('2d');
  const rows = wavelet.r.length, columns = wavelet.k.length;
  const image = context.createImageData(columns, rows);
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const [red, green, blue] = heatColor(wavelet.magnitude[rows - 1 - row][col] / (maxValue || 1));
    const offset = 4 * (row * columns + col);
    image.data[offset] = red; image.data[offset + 1] = green; image.data[offset + 2] = blue; image.data[offset + 3] = 255;
  }
  const buffer = document.createElement('canvas'); buffer.width = columns; buffer.height = rows;
  buffer.getContext('2d').putImageData(image, 0, 0);
  context.imageSmoothingEnabled = true; context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(buffer, 42, 10, canvas.width - 52, canvas.height - 38);
  context.fillStyle = '#52677d'; context.font = '11px sans-serif';
  context.fillText(`${wavelet.k[0].toFixed(1)}  k (Å⁻¹)  ${wavelet.k.at(-1).toFixed(1)}`, 44, canvas.height - 9);
  context.save(); context.translate(12, canvas.height / 2 + 20); context.rotate(-Math.PI / 2); context.fillText(`R (Å), 0–${wavelet.r.at(-1).toFixed(1)}`, 0, 0); context.restore();
}

function buildWavelets(result) {
  const data = result.k_space, weight = result.fit_settings.kweight;
  const weightedData = data.chi_data.map((value, i) => value * data.k[i] ** weight);
  const weightedModel = data.chi_fit.map((value, i) => value * data.k[i] ** weight);
  const weightedResidual = weightedData.map((value, i) => value - weightedModel[i]);
  const rmax = Number(result.fit_settings.rplotmax || 6);
  const output = {
    data: morletMap(data.k, weightedData, rmax), model: morletMap(data.k, weightedModel, rmax),
    residual: morletMap(data.k, weightedResidual, rmax), kweight: weight,
    limitations: ['finite-window edge effects', 'no cone-of-influence or significance mask', 'diagnostic only'],
  };
  const maximum = Math.max(...output.data.magnitude.flat(), ...output.model.magnitude.flat(), ...output.residual.magnitude.flat(), 1e-15);
  drawWavelet('#wavelet-data', output.data, maximum); drawWavelet('#wavelet-model', output.model, maximum); drawWavelet('#wavelet-residual', output.residual, maximum);
  $('#download-wavelet-csv').hidden = false;
  return output;
}

function reportMarkdown(result) {
  const settings = result.fit_settings, statistics = result.statistics;
  const global = result.global_parameters;
  const lines = [
    '# EXAFS 在线拟合报告', '', `生成时间：${new Date().toISOString()}`, '',
    '## 后端与方法', '',
    '- 后端：浏览器 JavaScript 数值实现（非原生 Athena/Artemis/HAMA）',
    `- 能量预处理：${lastEnergyResult ? lastEnergyResult.method : '输入为已提取 χ(k)，上游预处理未在本次运行中验证'}`,
    `- 拟合空间：${settings.fitspace === 'r' ? '复数 R 空间' : '加权原始 k 空间'}`,
    `- k 范围：${settings.kmin}–${settings.kmax} Å⁻¹；R 范围：${settings.rmin}–${settings.rmax} Å`,
    `- k-weight：${settings.kweight}；窗口：${settings.window}`,
    '- 小波：Morlet/Gabor 型局部傅里叶诊断，实验/模型/复数残差共用色标', '',
    '## 拟合统计', '',
    `- R-factor：${Number(statistics.r_factor).toPrecision(7)} (${Number(statistics.r_factor_percent).toFixed(4)}%)`,
    `- 独立点估计：${Number(statistics.n_independent).toFixed(3)}`,
    `- 自由变量：${statistics.n_variables}`, '',
    '## 全局参数', '',
    '| 参数 | 值 | 状态 | 边界 |', '|---|---:|---|---|',
    `| S₀² | ${global.s02.value} | ${global.s02.vary ? 'varied' : 'fixed'} | ${global.s02.bounds.join('–')} |`,
    `| ΔE₀ (eV) | ${global.delta_e0.value} | ${global.delta_e0.vary ? 'varied' : 'fixed'} | ${global.delta_e0.bounds.join('–')} |`, '',
    '## 路径参数', '',
    '| 壳层 | 路径 | 类型 | Reff (Å) | N/振幅 | ΔR (Å) | R (Å) | σ² (Å²) |', '|---:|---|---|---:|---:|---:|---:|---:|',
    ...result.paths.map(path => `| ${path.shell} | ${path.name} | ${path.scattering} | ${path.reff} | ${path.amplitude} | ${path.delta_r} | ${path.distance ?? '—'} | ${path.sigma2} |`), '',
    '## 解释边界', '',
    '- 当前浏览器求解器不提供可验证的协方差误差；导出中的 stderr 为 null，不应解释为零误差。',
    '- S₀² 与配位数对单条谱振幅不可同时唯一辨识；应固定其中一个并记录外部依据。',
    '- 未相移校正的傅里叶或小波 R 峰位不是键长；单散射距离读取 Reff + ΔR。',
    '- 小波仅作诊断，有限窗口边界效应仍存在，未实现影响锥或显著性掩膜。',
    '- 需要发表级不确定度、AUTOBK、真实 FEFF 运行或 HAMA 时，请使用服务器/桌面完整后端复核。', '',
  ];
  return lines.join('\n');
}

const inputKind = $('#input-kind');
inputKind.onchange = () => { $('#energy-settings').hidden = inputKind.value !== 'energy'; };

const completeFitHandler = $('#fit-form').onsubmit;
$('#fit-form').onsubmit = async event => {
  const input = $('#data-file');
  const originalFiles = input.files;
  try {
    lastResult = null; lastEnergyResult = null; lastWaveletResult = null;
    if (inputKind.value === 'energy') {
      const source = input.files[0];
      if (!source) throw new Error('请先选择能量空间实验数据。');
      lastEnergyResult = preprocessEnergy(await source.text());
      renderEnergyResult(lastEnergyResult);
      const text = lastEnergyResult.k.map((value, i) => `${value}\t${lastEnergyResult.chi[i]}`).join('\n');
      const transfer = new DataTransfer(); transfer.items.add(new File([text], 'browser-preprocessed.chi', { type: 'text/plain' })); input.files = transfer.files;
      event.target.kcol.value = 0; event.target.chicol.value = 1;
    } else {
      $('#energy-metrics').innerHTML = '';
      $('#energyplot').innerHTML = '<p class="hint" style="padding:16px">本次输入为已提取 χ(k)；能量标准化不在本次运行记录内。</p>';
      $('#download-energy-csv').hidden = true;
    }
    await completeFitHandler(event);
    if (!lastResult) return;
    if (lastEnergyResult) lastResult.energy_preprocessing = lastEnergyResult;
    lastWaveletResult = buildWavelets(lastResult); lastResult.wavelet = lastWaveletResult;
    lastResult.report_markdown = reportMarkdown(lastResult);
    $('#download-report').hidden = false;
  } catch (error) {
    event.preventDefault(); setStatus(error.message, 'error');
  } finally {
    try { input.files = originalFiles; } catch (_) { /* browser may expose an immutable FileList */ }
  }
};

$('#download-energy-csv').onclick = () => {
  if (!lastEnergyResult) return;
  const header = 'energy_eV,mu_raw,pre_edge,post_edge,normalized';
  const rows = lastEnergyResult.energy.map((value, i) => [value, lastEnergyResult.mu[i], lastEnergyResult.preEdge[i], lastEnergyResult.postEdge[i], lastEnergyResult.normalized[i]].join(','));
  download('exafs-energy-normalized.csv', `${header}\n${rows.join('\n')}`, 'text/csv;charset=utf-8');
};

$('#download-wavelet-csv').onclick = () => {
  if (!lastWaveletResult) return;
  const sections = ['data', 'model', 'residual'].map(name => {
    const item = lastWaveletResult[name];
    return [`# ${name}; rows=R_A; columns=k_A-1`, `R_A,${item.k.join(',')}`, ...item.r.map((r, i) => `${r},${item.magnitude[i].join(',')}`)].join('\n');
  });
  download('exafs-wavelet-matrices.csv', sections.join('\n\n'), 'text/csv;charset=utf-8');
};

$('#download-report').onclick = () => lastResult && download('exafs-fit-report.md', lastResult.report_markdown || reportMarkdown(lastResult), 'text/markdown;charset=utf-8');
