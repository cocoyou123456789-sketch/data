'use strict';

const nativeState = { status: null, jobId: null, connected: false };

function nativeEndpoint() {
  return ($('#native-endpoint').value || 'http://127.0.0.1:8766').replace(/\/+$/, '');
}

async function nativeRequest(path, options = {}) {
  const response = await fetch(`${nativeEndpoint()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function renderNativeStatus(status) {
  nativeState.status = status;
  nativeState.connected = true;
  const tools = status.tools || {};
  $('#native-tools').innerHTML = ['athena', 'artemis', 'feff', 'hama', 'hephaestus'].map(name => {
    const item = tools[name] || {};
    const label = item.installed ? '已安装' : '未检测到';
    return `<div class="tool-state ${item.installed ? 'installed' : ''}"><b>${name.toUpperCase()} · ${label}</b><small>${item.path || item.env_override || ''}</small></div>`;
  }).join('');
  const installed = Object.values(tools).filter(item => item.installed).length;
  const skill = status.artemis_skill && status.artemis_skill.installed ? '已检测到自动化 skill' : '未检测到自动化 skill';
  $('#native-status').className = installed ? 'status ok' : 'status error';
  const automation = status.automation_ready ? 'Demeter 自动拟合已就绪' : 'Demeter 自动拟合尚未就绪';
  $('#native-status').textContent = `桥接服务已连接；检测到 ${installed}/5 个原生工具；${skill}；${automation}。`;
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
    $('#native-status').textContent = `未连接本机桥接服务：${error.message}。请先运行 xafs-native/start-native-bridge.ps1。`;
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

function nativeOptions(form) {
  return {
    method: 'paper-constrained-first-shell-demeter',
    input_kind: $('#input-kind').value,
    fit_space: form.fitspace.value,
    requested_k_range: [Number(form.kmin.value), Number(form.kmax.value)],
    requested_r_range: [Number(form.fit_rmin.value), Number(form.fit_rmax.value)],
    final_kweights: [1, 2, 3], window: 'Hanning', dk: 1,
    constraints: {
      extraction_e0_separate_from_fit_delta_e0: true,
      reject_negative_sigma2: true, max_absolute_correlation: 0.95,
      require_nvar_less_than_nind: true,
    },
  };
}

function setExecutionMode() {
  const browser = $('#execution-mode').value === 'browser';
  $('#path-files').required = browser;
  $('#native-feff-file').required = !browser && $('#native-input-stage').value === 'chi';
}

async function prepareNativeJob(form) {
  if (!nativeState.connected) await detectNative();
  if (!nativeState.connected) throw new Error('本机桥接服务未启动，不能执行原生拟合。');
  const data = $('#data-file').files[0];
  if (!data) throw new Error('请选择原始 XAFS 数据。');
  const files = [await encodeFile(data, 'sample_raw')];
  const cif = $('#cif-file').files[0];
  if (cif) files.push(await encodeFile(cif, 'structure_cif'));
  for (const path of $('#path-files').files) files.push(await encodeFile(path, 'feff_path'));
  const feff = $('#native-feff-file').files[0];
  if (feff) files.push(await encodeFile(feff, 'feff_input'));
  if ($('#native-input-stage').value === 'chi') files[0].role = 'chi_k';
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
  const payload = {
    job_id: result.job_id, s02: Number($('#native-s02').value),
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
  $('#native-status').textContent = `${tool.toUpperCase()} 已启动（PID ${result.pid}）。`;
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
    $('#status').textContent = `原生任务 ${result.job_id} 正在调用 Demeter/FEFF……`;
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

detectNative();
setExecutionMode();

if (typeof module !== 'undefined' && module.exports) module.exports = { nativeOptions, bytesToBase64 };
