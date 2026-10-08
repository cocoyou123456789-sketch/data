# EXAFS 原生桥接服务

这个本地服务让静态网页安全地检测并启动本机的 Athena、Artemis、
Hephaestus、FEFF 和 HAMA。服务只监听 `127.0.0.1:8766`，HTTP 请求不能传入
任意命令或任意文件路径。

## 其他电脑一键安装

从网页点击“下载安装本机桥接器”，或直接下载 GitHub Release 中的
`XAFS-Native-Bridge-Setup.exe`。安装程序按当前用户安装，不要求管理员权限，
并注册登录后自动启动。安装包已经包含 Python 运行时和自动化 skill；目标电脑
无需安装 Python，也不依赖构建安装包的电脑。

状态接口会分别返回每个软件的“已安装”和“正在运行”状态及进程 PID。因此网页
不仅能发现 Athena、Artemis、Hephaestus、FEFF 和 HAMA 的安装路径，也能在程序
打开后确认其进程正在运行。

桥接器不会捆绑 Demeter/HAMA 本体。它会自动检测目标电脑已有的软件；未检测到时，
请安装官方软件，或把下面的示例配置复制为：

```text
%LOCALAPPDATA%\SynchroChemAI\XAFSNativeBridge\xafs-native.local.json
```

## 启动

```powershell
.\xafs-native\start-native-bridge.ps1 -Probe
.\xafs-native\start-native-bridge.ps1
```

网页会自动连接 `http://127.0.0.1:8766/api/status`。如自动探测不到软件，复制
`xafs-native.local.example.json` 为 `xafs-native.local.json` 并修改路径；也可设置
`XAFS_ATHENA_EXE`、`XAFS_ARTEMIS_EXE`、`XAFS_FEFF_EXE`、`XAFS_HAMA_EXE`。

“准备原生任务”只复制输入、计算 SHA-256、写入论文约束和工作流清单；只有
Demeter/HAMA 实际运行并产生结果后，才能把输出标记为原生拟合结果。

## 两阶段运行

1. 上传原始 `μ(E)` 时，网页创建任务并打开 Athena。请在 Athena 中完成参考箔
   校准、归一化和 AUTOBK，检查 glitch、重复扫描与高 k 噪声，然后导出未加权
   `k, χ(k)`。提取用的 `E0` 与拟合的 `ΔE0` 必须分开记录。
2. 选择“已导出的未加权 χ(k)”，同时上传 `feff.inp`，填写同边标准得到的固定
   `S0²`、零基 FEFF 路径编号和 `σ²` 分组。网页将调用 vendored skill 的
   `run_demeter.ps1` 与 `demeter_first_shell_fit.pl`，在复数 R 空间同时拟合
   k-weight 1/2/3，并运行日志审计。

自动结果初始状态始终是 `unreviewed`。在 Artemis 中检查完整相关矩阵、参数边界、
残差和窗口稳定性，在 HAMA 中对数据/模型/复数残差使用共同色标复核后，才可接受。
最终九文件包还要求实际重新打开 DPJ；桥接服务不会虚构这个检查。

## 发布安装包

GitHub Actions 工作流 `.github/workflows/build-xafs-native-bridge.yml` 会在 Windows
环境构建单文件 EXE、Inno Setup 安装程序和便携 ZIP。推送形如
`xafs-bridge-v1.0.0` 的 tag 后，两个文件会自动发布到 GitHub Releases，网页的
下载按钮会始终指向最新 release。
