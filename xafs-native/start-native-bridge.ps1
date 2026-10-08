param(
  [int]$Port = 8766,
  [switch]$Probe
)
$ErrorActionPreference = 'Stop'
$bridge = Join-Path $PSScriptRoot 'native_bridge.py'
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (-not $python) { throw '未找到 Python。请安装 Python 3.10+，或将 python/py 加入 PATH。' }
$arguments = @($bridge, '--port', $Port)
if ($Probe) { $arguments += '--probe' }
& $python.Source @arguments
