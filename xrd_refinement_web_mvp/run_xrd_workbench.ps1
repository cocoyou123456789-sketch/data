param([string]$HostAddress = "127.0.0.1", [int]$Port = 8000)
$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir
if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process") }
  }
}
if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "未找到 .venv，请先执行: python -m venv .venv; .venv\Scripts\python -m pip install -r requirements.txt"
  exit 1
}
$Python = (Resolve-Path ".venv\Scripts\python.exe").Path
$Arguments = @("-m", "uvicorn", "app.main:app", "--host", $HostAddress, "--port", "$Port")
$Server = Start-Process -FilePath $Python -ArgumentList $Arguments -WorkingDirectory $ProjectDir -WindowStyle Hidden -PassThru
$Url = "http://${HostAddress}:$Port/"
$Ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if ($Server.HasExited) { break }
  try {
    $Health = Invoke-RestMethod "http://${HostAddress}:$Port/api/v1/health" -TimeoutSec 2
    if ($Health.status -eq "ok") { $Ready = $true; break }
  } catch {}
}
if (-not $Ready) {
  Write-Error "XRD 服务启动失败，请检查依赖安装和端口 $Port。"
  exit 1
}
Write-Host "XRD 工作台已启动：$Url"
Start-Process $Url
Wait-Process -Id $Server.Id
