'use strict';

const nativeState = { status: null, jobId: null, feffJobId: null, connected: false, installing: false };
window.xafsNativeState = nativeState;

function nativeEndpoint() {
  return ($('#native-endpoint').value || 'http://127.0.0.1:8766').replace(/\/+$/, '');
}

async function nativeRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 6000);
  let response;
  try {
    response = await fetch(`${nativeEndpoint()}${path}`, {
      ...options, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('连接超时：桥接器没有在 6 秒内响应');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function renderNativeStatus(status) {
  nativeState.status = status;
  nativeState.connected = true;
  const tools = status.tools || {};
  const visibleTools = ['athena', 'artemis', 'hama', 'hephaestus'];
  $('#native-tools').innerHTML = visibleTools.map(name => {
    const item = tools[name] || {};
    const label = item.running && !item.installed ? '正在运行（路径未知）' : item.running ? '正在运行' : item.installed ? '已安装' : '未检测到';
    const pids = item.process_ids?.length ? `PID ${item.process_ids.join(', ')}` : '';
    const path = item.path || (item.running ? `已发现进程；未定位启动路径，可配置 ${item.env_override}` : `可配置 ${item.env_override}`);
    const capability = item.installed ? '可从网页启动' : item.running ? '仅可监测' : '不可用';
    const product = name === 'hama' ? 'HAMA' : 'Demeter 套件';
    const install = item.installed ? '' : `<button class="install-tool secondary" data-install-tool="${name}" type="button">下载安装 ${product}</button>`;
    return `<div class="tool-state ${item.installed ? 'installed' : ''} ${item.running ? 'running' : ''}"><b>${name.toUpperCase()} · ${label}</b><small>${path}</small><div class="state-row"><em>${capability}</em>${pids ? `<em>${pids}</em>` : ''}</div>${install}</div>`;
  }).join('');
  const installed = visibleTools.filter(name => tools[name]?.installed).length;
  const runningCount = visibleTools.filter(name => tools[name]?.running).length;
  const skill = status.artemis_skill && status.artemis_skill.installed ? '已检测到自动化 skill' : '未检测到自动化 skill';
  $('#native-status').className = 'status ok';
  const automation = status.automation_ready ? 'Demeter 自动拟合已就绪' : 'Demeter 自动拟合尚未就绪';
  const pathEngine = tools.feff?.installed ? 'CIF 路径引擎已就绪' : '尚未定位 Demeter 内置路径引擎';
  $('#native-status').textContent = `本次检测完成：桥接服务已连接；发现 ${runningCount}/4 个运行进程，可从网页启动 ${installed}/4 个工具；${pathEngine}；${skill}；${automation}。页面不会自动复查。`;
  const running = Object.entries(tools).filter(([, item]) => item.running).map(([name]) => name.toUpperCase());
  const health = $('#bridge-health');
  health.className = 'bridge-pill ok'; health.textContent = '桥接器已连接';
  $('#bridge-version').className = 'bridge-pill ok';
  $('#bridge-version').textContent = `桥接器 ${status.app_version || '旧版'} · 协议 v${status.version || '?'}`;
  $('#bridge-capability').className = `bridge-pill ${status.automation_ready ? 'ok' : ''}`;
  $('#bridge-capability').textContent = running.length ? `运行中：${running.join('、')}` : automation;
  for (const button of document.querySelectorAll('.native-launch')) {
    const item = tools[button.dataset.tool] || {};
    button.disabled = !item.installed || item.running;
    button.title = !item.installed ? '未检测到该程序' : item.running ? '程序已经运行' : '';
  }
  for (const button of document.querySelectorAll('.install-tool')) {
    button.disabled = nativeState.installing;
    button.onclick = () => installNativeTools(button.dataset.installTool);
  }
  if (status.installation && status.installation.status !== 'idle') showInstallation(status.installation);
  window.dispatchEvent(new CustomEvent('xafs-native-status', { detail: status }));
}

function showInstallation(task) {
  const root = $('#install-status');
  root.hidden = false;
  const product = (task.current_product || task.product || 'tool').toUpperCase();
  const progress = Number.isFinite(task.progress) ? ` ${task.progress}%` : '';
  const messages = {
    starting: `正在准备 ${product} 官方下载……`,
    downloading: `正在下载 ${product}……${progress}`,
    installing: task.message || `正在安装 ${product}……`,
    waiting_user: 'Demeter 官方安装向导已打开。请在桌面完成安装，然后点击“重新检测”。',
    complete: '工具安装完成。请点击“重新检测”验证本机软件。',
    failed: `安装失败：${task.error || task.message || '未知错误'}`,
  };
  root.textContent = messages[task.status] || task.message || `安装状态：${task.status}`;
  root.className = `status install-progress ${task.status === 'failed' ? 'error' : task.status === 'complete' || task.status === 'waiting_user' ? 'ok' : ''}`;
}

async function pollInstallation() {
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    const task = await nativeRequest('/api/native-tools/install-status');
    showInstallation(task);
    if (['complete', 'waiting_user', 'failed'].includes(task.status)) {
      nativeState.installing = false;
      for (const button of document.querySelectorAll('.install-tool')) button.disabled = false;
      return task;
    }
  }
}

async function installNativeTools(tool = 'all') {
  if (!nativeState.connected) throw new Error('请先安装并启动本机桥接器，然后点击“重新检测”。');
  nativeState.installing = true;
  for (const button of document.querySelectorAll('.install-tool')) button.disabled = true;
  try {
    const task = await nativeRequest(`/api/native-tools/${tool}/install`, {
      method: 'POST', body: '{}', timeout: 15000,
    });
    showInstallation(task);
    await pollInstallation();
  } catch (error) {
    nativeState.installing = false;
    const message = /HTTP 404/.test(error.message)
      ? '当前桥接器版本过旧，不支持一键安装。请先下载并覆盖安装最新版桥接器。'
      : error.message;
    showInstallation({ status: 'failed', error: message });
    if (nativeState.status) renderNativeStatus(nativeState.status);
  }
}

async function detectNative(refresh = false) {
  $('#native-status').className = 'status';
  $('#native-status').textContent = '正在检测本机 Demeter、FEFF 与 HAMA……';
  try {
    const status = await nativeRequest(refresh ? '/api/native-tools/refresh' : '/api/status', refresh ? { method: 'POST', body: '{}' } : {});
    renderNativeStatus(status);
    return status;
  } catch (error) {
    nativeState.connected = false;
    $('#native-tools').innerHTML = '';
    $('#native-status').className = 'status error';
    const detail = error.message === 'Failed to fetch'
      ? '浏览器无法访问 127.0.0.1:8766。请更新并启动桥接器，再检查防火墙或安全软件是否拦截。'
      : error.message;
    $('#native-status').textContent = `未连接本机桥接服务：${detail} 请运行“一键安装本机桥接和全部拟合环境”；安装完成后点击“重新检测”。源码开发环境才需要运行 start-native-bridge.ps1，普通用户不需要运行 PowerShell 脚本。`;
    $('#bridge-health').className = 'bridge-pill error';
    $('#bridge-health').textContent = '桥接器未连接';
    $('#bridge-version').className = 'bridge-pill'; $('#bridge-version').textContent = '版本未知';
    $('#bridge-capability').className = 'bridge-pill'; $('#bridge-capability').textContent = '原生能力不可用';
    for (const button of document.querySelectorAll('.native-launch')) button.disabled = true;
    window.dispatchEvent(new CustomEvent('xafs-native-status', { detail: null }));
    return null;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function encodeFile(file, role) {
  return { name: file.name, role, content_base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())) };
}

function encodeTextFile(name, content, role) {
  return { name, role, content_base64: bytesToBase64(new TextEncoder().encode(content)) };
}

async function prepareNativeFeffPaths(generated) {
  if (!nativeState.connected) throw new Error('尚未连接本机桥接器。请先点击“重新检测”，确认 FEFF 已安装。');
  if (Number(nativeState.status?.version || 0) < 5) throw new Error('本机桥接器版本过旧，请点击“一键安装本机桥接和全部拟合环境”升级到 1.4.0 或更高版本。');
  if (!nativeState.status?.tools?.feff?.installed) throw new Error('本机桥接器未检测到 FEFF；请先完成一键环境安装并重新检测。');
  const result = await nativeRequest('/api/feff/paths', {
    method: 'POST', timeout: 310000,
    body: JSON.stringify({project_name: generated.summary?.formula || 'cif-paths',content_base64: encodeTextFile(generated.name,generated.content,'feff_input').content_base64}),
  });
  nativeState.feffJobId = result.job_id;
  await globalThis.setGeneratedFeffPaths(result);
  return result;
}
globalThis.prepareNativeFeffPaths = prepareNativeFeffPaths;

function nativeOptions(form) {
  return {
    method: 'paper-constrained-first-shell-demeter',
    analysis_role: $('#analysis-role').value,
    constraint_profile: $('#constraint-profile').value,
    parameter_suggestion: globalThis.xafsParameterSuggestion || null,
    input_kind: $('#input-kind').value,
    fit_space: form.fitspace.value,
    requested_k_range: [Number(form.kmin.value), Number(form.kmax.value)],
    requested_r_range: [Number(form.fit_rmin.value), Number(form.fit_rmax.value)],
    final_kweights: [1, 2, 3], window: 'Hanning', dk: 1,
    constraints: {
      extraction_e0_separate_from_fit_delta_e0: true,
      reject_negative_sigma2: true, max_absolute_correlation: 0.95,
      require_nvar_less_than_nind: true,
      paper_metal_domain: { s02: [0.75, 1.2], cn: [4, 13], delta_r_A: [-0.2, 0.2], sigma2_A2: [0.001, 0.02], delta_e0_eV: [-10, 10] },
      warning_thresholds: { absolute_delta_r_A: 0.10, absolute_delta_e0_eV: 10, sigma2_A2: 0.015, correlation: 0.90 },
    },
  };
}

function setExecutionMode() {
  const browser = $('#execution-mode').value === 'browser';
  $('#path-files').required = browser;
  $('#browser-path-fallback').hidden = !browser;
  $('#native-panel').classList.toggle('browser-selected', browser);
}

async function prepareNativeJob(form) {
  if (!nativeState.connected) throw new Error('尚未连接本机桥接器。请先点击“重新检测”，确认桥接器与所需软件状态。');
  const data = $('#data-file').files[0];
  if (!data) throw new Error('请选择原始 XAFS 数据。');
  const files = [await encodeFile(data, 'sample_raw')];
  const cif = $('#cif-file').files[0];
  if (cif) files.push(await encodeFile(cif, 'structure_cif'));
  else if (window.xafsCifSelection) files.push(encodeTextFile(window.xafsCifSelection.name, window.xafsCifSelection.content, 'structure_cif'));
  for (const path of $('#path-files').files) files.push(await encodeFile(path, 'feff_path'));
  if ($('#native-input-stage').value === 'chi') files[0].role = 'chi_k';
  if ($('#native-input-stage').value === 'chi') {
    const generated = window.xafsGeneratedFeffInput || await window.prepareFeffFromCif();
    files.push(encodeTextFile(generated.name, generated.content, 'feff_input'));
  }
  const payload = {
    project_name: data.name.replace(/\.[^.]+$/, '') || 'xafs-fit',
    files, options: nativeOptions(form),
  };
  const result = await nativeRequest('/api/workflow/prepare', { method: 'POST', body: JSON.stringify(payload) });
  nativeState.jobId = result.job_id;
  return result;
}

async function pollNativeJob(jobId) {
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const job = await nativeRequest(`/api/workflow/${jobId}/status`);
    $('#status').textContent = `原生任务 ${jobId}：${job.status}`;
    if (!['starting', 'running'].includes(job.status)) return job;
  }
}

async function runDemeterFirstShell(result, form) {
  const s02 = Number($('#native-s02').value);
  const profile = $('#constraint-profile').value;
  const role = $('#analysis-role').value;
  if (!['standard', 'unknown'].includes(role)) throw new Error('原生自动拟合必须选择“晶体标准样”或“未知样”；手动模式只用于浏览器探索与可辨识性检查。');
  if (!Number.isFinite(s02) || s02 <= 0 || s02 > 1.5) throw new Error('S₀² 必须大于 0 且不超过 1.5。');
  if (profile === 'paper-metal' && (s02 < 0.75 || s02 > 1.2)) throw new Error('文献金属第一壳层严格域要求 S₀² 位于 0.75–1.20。');
  const payload = {
    job_id: result.job_id, s02,
    analysis_role: role, constraint_profile: profile,
    paths: $('#native-paths').value.trim(), sigma_groups: $('#native-sigma-groups').value.trim(),
    kmin: Number(form.kmin.value), kmax: Number(form.kmax.value),
    rmin: Number(form.fit_rmin.value), rmax: Number(form.fit_rmax.value),
  };
  await nativeRequest('/api/workflow/run', { method: 'POST', body: JSON.stringify(payload) });
  return pollNativeJob(result.job_id);
}

async function finalizeNativeJob() {
  if (!nativeState.jobId) throw new Error('没有可完成的原生任务。');
  const result = await nativeRequest('/api/workflow/finalize', {
    method: 'POST', body: JSON.stringify({
      job_id: nativeState.jobId, dpj_reopened: $('#dpj-reopened').checked,
      hama_reviewed: $('#hama-reviewed').checked,
    }),
  });
  $('#status').className = 'status ok';
  $('#status').textContent = `九文件交付包已通过验证：${result.delivery_dir}`;
}

async function launchNative(tool) {
  const body = nativeState.jobId ? { job_id: nativeState.jobId } : {};
  const result = await nativeRequest(`/api/native-tools/${tool}/launch`, { method: 'POST', body: JSON.stringify(body) });
  $('#native-status').className = 'status ok';
  $('#native-status').textContent = `${tool.toUpperCase()} 已启动（PID ${result.pid}）。如需确认运行状态，请点击“重新检测”。`;
}

$('#refresh-native').onclick = () => detectNative(true);
$('#execution-mode').onchange = setExecutionMode;
$('#native-input-stage').onchange = setExecutionMode;
$('#finalize-native').onclick = () => finalizeNativeJob().catch(error => {
  $('#status').className = 'status error'; $('#status').textContent = error.message;
});
for (const button of document.querySelectorAll('.native-launch')) {
  button.onclick = () => launchNative(button.dataset.tool).catch(error => {
    $('#native-status').className = 'status error';
    $('#native-status').textContent = error.message;
  });
}

$('#fit-form').addEventListener('submit', async event => {
  if ($('#execution-mode').value !== 'native') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  $('#status').className = 'status';
  $('#status').textContent = '正在复制输入并建立可审计的原生任务……';
  try {
    const result = await prepareNativeJob(event.currentTarget);
    if ($('#native-input-stage').value === 'raw') {
      $('#status').className = 'status ok';
      $('#status').textContent = `原生任务 ${result.job_id} 已准备。请在 Athena 完成校准、归一化和 AUTOBK，再把未加权 χ(k) 作为“已导出 χ(k)”重新提交。`;
      if (nativeState.status.tools.athena && nativeState.status.tools.athena.installed) await launchNative('athena');
      return;
    }
    $('#status').textContent = `原生任务 ${result.job_id} 正在由 CIF 生成第一配位层理论路径并执行 Demeter 拟合……`;
    const job = await runDemeterFirstShell(result, event.currentTarget);
    if (job.status === 'failed') throw new Error(job.error || 'Demeter 拟合失败');
    $('#status').className = job.status === 'fit_complete_unreviewed' ? 'status ok' : 'status error';
    $('#status').textContent = `原生拟合已完成，状态：${job.status}。结果位于 ${job.results_dir || '任务目录'}；必须检查审计、残差和相关性后才能接受。`;
    $('#native-finalize').hidden = false;
    if (nativeState.status.tools.artemis && nativeState.status.tools.artemis.installed) await launchNative('artemis');
  } catch (error) {
    $('#status').className = 'status error';
    $('#status').textContent = error.message;
  }
}, true);

setExecutionMode();

if (typeof module !== 'undefined' && module.exports) module.exports = { nativeOptions, bytesToBase64 };
