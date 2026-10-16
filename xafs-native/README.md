# EXAFS 原生桥接服务

这个本地服务让静态网页安全地检测并启动本机的 Athena、Artemis、
Hephaestus、FEFF 和 HAMA。服务只监听 `127.0.0.1:8766`，HTTP 请求不能传入
任意命令或任意文件路径。

## 其他电脑一键安装

从网页点击“一键安装本机桥接和全部拟合环境”，下载并运行 GitHub Release 中唯一的
`XAFS-Native-Bridge-Setup.exe`。安装程序会安装桥接器和自动化 skill，从固定官方地址
下载并配置 HAMA，再静默安装 Demeter 套件（Athena、Artemis、Hephaestus 与 FEFF），
最后启动桥接服务并注册登录后自动启动。目标电脑无需预装 Python，也无需逐项判断软件状态。

从旧版本升级时可直接运行新版安装器：安装器会先静默停止旧桥接进程，完成覆盖后重新启动。
1.0.3 起，软件状态探测及拟合辅助命令均以无控制台窗口方式运行，不再周期性闪出终端窗口。
1.0.4 起，手动检测会从正在运行的 Demeter/Perl 进程反推出非默认安装目录，并使用其中自带的 FEFF6 从 CIF 生成第一壳层路径。

状态接口会分别返回每个软件的“已安装”和“正在运行”状态及进程 PID。因此网页
不仅能发现 Athena、Artemis、Hephaestus、FEFF 和 HAMA 的安装路径，也能在程序
打开后确认其进程正在运行。

桥接器不会把 Demeter/HAMA 本体塞进自身安装包。1.2.0 起，完整安装包会在安装阶段只从
硬编码的官方 HTTPS 地址获取环境：HAMA 从 ESRF 官方 ZIP 安全解压到当前用户目录，Demeter
使用官方安装程序的静默模式。安装后仍可在网页中对单个缺失组件执行修复安装。也可以把下面的
示例配置复制为：

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
环境构建单文件 EXE 和唯一的 Inno Setup 完整安装程序。推送形如
`xafs-bridge-v1.2.0` 的 tag 后，安装包会自动发布到 GitHub Releases，网页按钮始终指向
最新 release；不再发布便携 ZIP。
