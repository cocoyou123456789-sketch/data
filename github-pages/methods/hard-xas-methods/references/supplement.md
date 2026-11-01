# Supplementary information

## User-provided Hard X-ray XAS/EXAFS workflow and references

针对你的同步辐射硬线数据（Hard X-ray XAS），我建议建立一套专门的 XAS 数据处理与 EXAFS 配位结构拟合工作流，而不只是简单地做曲线拟合。

你目前的 PbOx/IrOx 研究，尤其需要回答以下问题：
1. 价态变化： Pb、Ir 在不同电势下的氧化态如何变化？
2. 局域配位结构： Ir–O、Ir–Ir、Pb–O 的配位数、键长和无序程度是多少？
3. 结构演变： PbOx 包覆 IrOx 后，Ir 的局域结构是否发生变化？
4. 电势响应： OER 电势增加时，金属–氧配位环境是否发生重构？
5. 定量拟合： 给出 CN、R、σ²、ΔE0、R-factor 等参数，并判断参数是否具有物理合理性。
这类工作可以拆分成 XANES 分析、EXAFS 傅里叶变换、FEFF 路径计算、Artemis 拟合和结构模型验证五个模块。
一、值得使用的 XAS 专业 Skills
我查到一个与你的需求高度匹配的开源项目：
重点推荐
Artemis XAFS Fit Skill

artemis-xafs-fit-skill
- 项目地址：GitHub – artemis-xafs-fit-skill
- 功能：将 Athena、Artemis、FEFF 等程序串联，执行 EXAFS 定量拟合。
- 支持：XANES 近边模拟与候选结构比较。
- 输出：配位数、键长、Debye–Waller 因子、能量校正、拟合残差和参数表。
- 特点：可以保存拟合项目、数据文件和拟合流程，便于复核。
它不是当前 ChatGPT 已安装的内置 Skill，而是一个可以进一步部署到本地 Codex/Agent 环境的开源项目。
GitHub+1

另外三个值得组合使用的专业工具









1. Demeter (Athena + Artemis)
EXAFS拟合主力
- Athena：能量校准、归一化、背景扣除、傅里叶变换。
- Artemis：FEFF 散射路径和 EXAFS 拟合。
- 输出 CN、R、σ²、ΔE0、S0²、R-factor。
- 支持 k¹、k²、k³ 权重拟合。

  Artemis 官方拟合文档 · 拟合参数说明












2. Larch / xraylarch
自动化与批量分析
- XANES 线性组合拟合（LCF）。
- EXAFS 背景扣除、FT、FEFF 路径拟合。
- 小波变换（WT-EXAFS）。
- Python 批量处理多样品、多电势数据。

  Larch 官方文档












3. FEFF
局域结构理论计算
- 根据 CIF 或原子结构建立吸收原子附近的团簇。
- 计算理论散射路径。
- 识别 Ir–O、Ir–Ir、Pb–O 等配位路径。
- 为 Artemis/Larch 提供理论 EXAFS 路径。

  XAFS 软件资源列表



另外，XANES 如果希望从候选原子结构直接计算近边谱，可以考虑 FDMNES，与 FEFF 的 EXAFS 路径拟合形成互补。
GitHub+1

二、它具体能输出哪些拟合参数？
这是最值得关注的部分。对于 EXAFS，建议要求它输出以下完整参数，而不只是拟合曲线。
参数	物理意义	单位
CN	配位数	—
R	原子间键长	Å
σ²	Debye–Waller 因子，反映结构无序	Å²
ΔE0	理论与实验能量零点修正	eV
S0²	振幅缩减因子	—
ΔR	FEFF 理论键长的修正量	Å
R-factor	拟合残差评价	—
Reduced χ²	约化卡方	—
Nind	独立数据点数	—
Nvar	独立拟合变量数	—

其中：
\[
R_{\mathrm{fit}}=R_{\mathrm{eff}}+\Delta R
\]

需要特别注意：EXAFS 得到的 CN 是有效平均配位数，不一定等于晶体结构中的整数配位数。

建议对 S0² 使用相同吸收边的已知配位标准样进行标定，然后固定该参数拟合未知样品。对于室温第一配位壳层，σ² 可以先以 0.003–0.008 Å² 作为初始参考范围，但这些数值不是普适的硬性标准。
GitHub+1

三、针对 PbOx/IrOx，应该如何建立配位结构？
这是我认为最值得进一步开发的功能。
1. Ir 吸收边：分析 Ir 局域结构





重点建立以下散射路径：
- 第一壳层：Ir–O
- 第二壳层：Ir–Ir
- 界面模型：根据实际结构检查 Ir–Pb 路径



















也可以推荐相关的文章












思考了 30s







二、与你的 PbOx/IrOx 研究直接相关的文献
我把文献分为三类：EXAFS 拟合方法、Ir 基 OER 结构分析、Pb 基物相与配位分析。
A. EXAFS 拟合方法类：建议优先阅读
优先级 1
In Situ/Operando Electrocatalyst Characterization by X-ray Absorption Spectroscopy

Chemical Reviews, 2021

DOI：10.1021/acs.chemrev.0c00396

Timoshenko & Roldan Cuenya

推荐原因：非常适合作为你的 XAS 分析理论基础。
- XANES 和 EXAFS 的物理原理。
- 原位、操作态 XAS 的数据分析。
- 催化剂局域结构和氧化态分析。
- 金属–氧键长、配位结构与催化性能关联。
免费阅读全文（PubMed Central）。
PMC



优先级 2
ATHENA, ARTEMIS, HEPHAESTUS: data analysis for X-ray absorption spectroscopy using IFEFFIT

Journal of Synchrotron Radiation, 2005, 12, 537–541

DOI：10.1107/S0909049505012719

推荐原因：直接讲解 Athena 和 Artemis 的软件分析体系。
- Athena 的能量校准、归一化、背景扣除。
- Artemis 的 FEFF 散射路径。
- EXAFS 数据拟合与项目保存。
- 理论计算与实验谱线匹配。
阅读原文（IUCr）。
IUCr 期刊在线



优先级 3
Design of Single-Atom Catalysts and Tracking Their Fate Using Operando and Advanced X-ray Spectroscopic Tools

Chemical Reviews, 2023

DOI：10.1021/acs.chemrev.2c00495

推荐原因：重点理解 EXAFS 拟合参数和物理意义。
- CN：配位数。
- R：原子间键长。
- σ²：Debye–Waller 因子。
- ΔE0：能量校正。
- k¹、k²、k³ 加权拟合。
- 独立数据点数量和拟合参数约束。
文章还讨论了参数数量、统计误差等拟合可靠性问题。
ACS Publications+1



B. IrOx 催化剂与 OER：最值得参考的研究论文
这几篇对你的 PbOx/IrOx 项目更有直接价值。









1. Iridium metallene oxide for acidic oxygen evolution catalysis

Nature Communications, 2021

DOI：10.1038/s41467-021-26336-2

重点看 Figure 3。

文章给出了 Ir L₃-edge XANES、EXAFS 和配位拟合结果：
配位路径	CN	R
Ir–O	6.0	2.00 Å
Ir–Ir	6.0	3.12 Å

这组数据可以作为特定 1T-IrO₂ 结构的拟合参考，帮助你理解如何确定 Ir–O 和 Ir–Ir 两个配位壳层。
Nature Communications













2. Increased Ir–Ir Interaction in Iridium Oxide during the Oxygen Evolution Reaction at High Potentials Probed by Operando Spectroscopy

ACS Catalysis, 2021

阅读 ACS 原文

重点学习：
- 不同电势下 Ir L₃-edge 的变化。
- PCA 分析。
- FEFF9 理论计算。
- Ir–Ir 局域结构与 OER 过程的关系。
适合参考你要做的电势分辨 XAS。
ACS Publications













3. Role of Electrolyte pH on Water Oxidation for Iridium Oxides

Journal of the American Chemical Society, 2024

DOI：10.1021/jacs.3c12011

重点学习：
- Operando XAS。
- Ir 氧化态与 OER 电势关系。
- SEIRAS 界面水结构。
- 电解液环境对氧中间体的影响。
这篇与你研究的界面电子耦合、界面水和 OER 动力学尤其相关。
PMC+1













重点推荐
4. Identifying Active Sites of IrOx Catalysts for OER: A Combined Operando XAS, SEIRAS, and Theoretical Study

JACS, 2025

DOI：10.1021/jacs.4c18510

重点学习：
- Operando XAS 与 SEIRAS 联合分析。
- 活性位点识别。
- 理论计算与实验谱学相互验证。
- 反应过程中的 Ir 局域结构变化。
与你正在构建的 APXPS–DFT–原位红外交叉验证思路非常接近。
PubMed+1




5. Unravelling the mechanistic complexity of the oxygen evolution reaction and Ir dissolution in highly dimensional amorphous hydrous iridium oxides

Energy & Environmental Science, 2024

DOI：10.1039/D4EE02839B

重点是不同电势下 Ir L₃-edge XANES 和 EXAFS，尤其是第一配位壳层 Ir–O 键长的动态变化。对研究非晶、水合 IrOx 的结构重构很有参考价值。
皇家化学会出版物



C. PbOx 配位结构与物相识别
与你的 PbOx 体系直接相关
Unraveling the Chemical Environment and L₃ Absorption-Edge Shift in Lead Compounds Using X-Ray Absorption Spectroscopy

X-Ray Spectrometry, 2025, 54, 471–477

DOI：10.1002/xrs.3482

这篇文章同时研究了：
- PbO
- PbO₂
- PbSO₄
- Pb(NO₃)₂
- PbCl₂
采用 Pb L₃-edge XAS 分析化学环境、吸收边位移，并使用小波变换分析 EXAFS。
Wiley Online Library


为什么对你重要？

你之前一直关注 PbOx 在 0.5 M H₂SO₄ 中是否发生 PbSO₄ 转化。可以借鉴这篇文章，建立 PbO、PbO₂、PbSO₄ 的 XANES 指纹和 EXAFS 局域结构对照。

特别建议结合 Pb L₃-edge WT-EXAFS，而不是只根据傅里叶变换峰的位置判断物相。

三、这些文章中的拟合参数应该如何学习？
我建议你重点掌握下面这张参数表。
参数	物理含义	主要科学信息
CN / N	配位数	周围有多少个配位原子
R	原子间距离（Å）	金属–氧键长、金属–金属距离

| σ² | 均方相对位移（Å²） | 热振动和

















推荐一些文献，分析如何拟合数据，处理数据












思考了 43s







1. 最值得阅读的 XAS 数据处理与拟合文献
下面这些文献不是单纯介绍 XAS 原理，而是重点帮助你解决实际问题：如何从同步辐射原始数据得到标准化谱图、如何提取 EXAFS 信号、如何构建 FEFF 路径，以及如何判断拟合参数是否可信。
第一组：从原始数据到 EXAFS 拟合
建议按这个顺序阅读
1. Fundamentals of XAFS
- 作者：Matthew Newville
- 期刊：Reviews in Mineralogy and Geochemistry, 2014, 78, 33–74
- DOI：10.2138/rmg.2014.78.2
- 全文及 PDF
这是我最推荐的一篇入门与进阶结合的文献。

重点学习：
内容	需要掌握的技术
原始数据	I0、It、If 与吸收系数 μ(E)
能量校准	E0 的确定与校准
标准化	Pre-edge、Post-edge
背景扣除	AUTOBK、RbkG
EXAFS 提取	χ(k)
傅里叶变换	χ(R)
结构拟合	CN、R、σ²、ΔE0

2. ATHENA, ARTEMIS, HEPHAESTUS: data analysis for X-ray absorption spectroscopy using IFEFFIT
- 作者：B. Ravel, M. Newville
- 期刊：Journal of Synchrotron Radiation, 2005, 12, 537–541
- DOI：10.1107/S0909049505012719
- IUCr 免费阅读
这篇文章对应你实际使用的 Athena 和 Artemis。

建议重点学习：
- Athena 如何处理原始同步辐射数据。
- 如何对多次扫描进行能量对齐和合并。
- 如何进行归一化和背景扣除。
- 如何将 χ(k) 转换为 R 空间。
- Artemis 如何结合 FEFF 计算结果拟合实验 EXAFS。
这篇是软件方法学的基础文献。
MSAPUBS+1


3. A method for normalization of X-ray absorption spectra
- 作者：T.-C. Weng, G. S. Waldo, J. E. Penner-Hahn
- 期刊：Journal of Synchrotron Radiation, 2005, 12, 506–510
- DOI：10.1107/S0909049504034193
重点学习 MBACK 归一化方法。

尤其适合比较不同探测模式下的 XANES 数据，以及不同样品的吸收边和白线强度。
IUCr 期刊在线

第二组：EXAFS 拟合参数与可靠性
4. Multiple solutions in data fitting: a trap in EXAFS structural analysis and some ideas to avoid it
- 作者：A. Michalowicz, G. Vlaic
- 期刊：Journal of Synchrotron Radiation, 1998, 5, 1317–1320
- DOI：10.1107/S0909049598002970
- IUCr 免费阅读
非常重要
这篇尤其值得认真阅读，因为它讨论了 EXAFS 拟合中容易被忽略的问题：
- 不同初始参数可能得到不同的局部最优解。
- R 和 ΔE0 之间可能存在相关性。
- 拟合曲线看起来很好，不代表结构参数正确。
- 多壳层拟合可能出现不合理的金属–氧键长。
例如，作者展示了即使曲线看起来合理，也可能拟合出错误的 M–O 距离。

这对你判断 Ir–O 配位键长尤其重要。
IUCr 期刊在线


5. Number of relevant independent points in x-ray-absorption fine-structure spectra
- 作者：E. A. Stern
- 期刊：Physical Review B, 1993, 48, 9825–9827
- DOI：10.1103/PhysRevB.48.9825
重点掌握 EXAFS 拟合中的独立数据点数量。

常用估算关系为：
\[
N_{\mathrm{ind}}\approx
\frac{2\Delta k\Delta R}{\pi}+2
\]

它决定了你在当前 k 和 R 拟合窗口内，能够合理约束多少个自由参数。

不能为了让拟合曲线更好看而无限增加拟合参数。
Phys. Rev. B+1


6. The Difficult Chore of Measuring Coordination by EXAFS
- 作者：S. D. Kelly, B. Ravel
- DOI：10.1063/1.2644458
重点关注 CN 配位数的准确性，以及振幅因子、结构无序和配位数之间的相关性。适合在实际报告 CN 之前阅读。
xrayabsorption.org


7. Fitting EXAFS data using molecular dynamics outputs and a histogram approach
- 作者：B. Ravel, S. W. Price, N. Zonias 等
- 期刊：Physical Review B, 2012, 85, 075439
- DOI：10.1103/PhysRevB.85.075439
- NIST 论文介绍及 PDF
特别适合非晶 IrOx
这篇文章对你非常有价值。

传统 EXAFS 拟合通常将原子间距离分布近似为高斯分布。但对于高度无序的结构，单纯使用 CN 和 σ² 可能不能准确描述局域结构。

文章提出利用分子动力学结构产生原子对距离分布，再结合 EXAFS 进行拟合。

建议重点研究：
- 原子对分布函数（PDF/RDF）。
- CN 与 σ² 的相关性。
- 非高斯配位分布。
- 高阶累积量（Higher cumulants）。
- MD 结构与 EXAFS 的交叉验证。
这与你未来使用 AIMD/MLMD 研究 IrOx 表面结构非常契合。
NIST


8. Theoretical approaches to x-ray absorption fine structure
- 作者：J. J. Rehr, R. C. Albers
- 期刊：Reviews of Modern Physics, 2000, 72, 621–654
- DOI：10.1103/RevModPhys.72.621
重点学习 FEFF 背后的理论：
- 光电子散射理论。
- 单重散射与多重散射。
- 散射振幅和相位。
- 原子间距离与 EXAFS 振荡之间的关系。
- 结构无序对谱线的影响。
如果你想自己建立 PbOx、IrOx 的结构模型，并从 CIF 或 DFT 结构生成 FEFF 路径，这篇很重要。
Rev. Mod. Phys.

第三组：XANES 数据处理与定量拟合
如果你的目标不仅是 EXAFS 配位结构，还希望分析 Ir、Pb 的价态变化，建议看以下两篇。

9. Development and exploration of a new methodology for the fitting and analysis of XAS data
- 作者：M. U. Delgado-Jaime, P. Kennepohl
- 期刊：Journal of Synchrotron Radiation, 2010, 17, 119–128
- DOI：10.1107/S090904950904655X
- PMC 免费全文
重点内容：
- XANES 背景拟合。
- 多个吸收峰的拟合。
- Monte Carlo 搜索初始参数。
- 多组拟合结果的可靠性评估。
- 降低人工选择初始参数带来的偏差。
适合你后续做不同电势下 Ir L₃-edge XANES 拟合。
PMC


10. Normalization of XANES spectra
- 作者：Samuel M. Webb
- International Tables for Crystallography, 2024
- DOI：10.1107/S1574870720016699
这是较新的 XANES 标准化方法参考资料。

重点关注：
- 不同背景扣除方法。
- 归一化区间选择。
- 归一化误差对 PCA 和 LCF 的影响。
- 多组 XANES 数据的可比性。
特别适合你做不同电势、不同温度样品之间的 XANES 比较。
Wiley Online Library


2. 配套软件及操作教程
仅仅阅读论文还不够，建议同时使用下面的官方教程。









Athena 数据处理教程
Normalization and Background Removal学习内容：
- Pre-edge / Post-edge。
- E0 和能量校准。
- AUTOBK。
- Rbkg 参数。
- k 空间背景扣除。












Artemis EXAFS 拟合
Demeter 官方文档学习内容：
- 导入 FEFF 路径。
- 选择第一、第二配位壳层。
- 设置 CN、R、σ²、ΔE0。
- 参数约束与拟合。
- 查看 R-factor 和残差。












Larch / Larix
XANES Analysis 官方教程学习内容：
- XANES 线性组合拟合（LCF）。
- PCA。
- XANES 预边峰拟合。
- Python 批量分析。




3. 实际数据应该如何处理？
结合你在上海光源 BL14W1 获取的硬线数据，我建议按照下面的流程进行。
同步辐射硬线 XAS 标准分析流程
1. 原始数据处理

   输入原始能量和探测器信号，检查 I0、It、If，转换为吸收系数 μ(E)。

   输出：μ(E)。
2. 能量校准与扫描合并

   使用金属箔标准校准能量，进行多次扫描对齐、去除异常点和合并。

   输出：校准后的 μ(E)。
3. 标准化与背景扣除

   Athena 中设置 Pre-edge、Post-edge、E0、Normalization 和 AUTOBK。

   输出：Normalized XANES、χ(k)。
4. XANES 分析

   比较吸收边、白线强度、导数谱，进行 PCA 和 LCF。

   输出：价态变化及物种比例。
5. EXAFS 傅里叶变换

   选择 k 区间、k 权重、窗函数，进行 FT。

   输出：χ(R)。
6. FEFF 路径计算

   根据晶体结构或 DFT 优化结构生成散射路径。

   输出：理论 Ir–O、Ir–Ir、Pb–O 等路径。
7. Artemis 定量拟合

   逐步增加配位壳层，优化拟合参数并检查参数相关性。

   输出：CN、R、σ²、ΔE0、R-factor。
8. 拟合可靠性验证

   改变 k 区间、R 区间、k 权重和背景扣除参数，检查拟合结果是否稳定。

   输出：最终结构参数和误差。

4. 拟合过程中需要输出哪些参数？
建议最终形成这样的数据表：
参数	Ir–O	Ir–Ir	Pb–O
CN	待拟合	待拟合	待拟合
R (Å)	待拟合	待拟合	待拟合
σ² (Å²)	待拟合	待拟合	待拟合
ΔE0 (eV)	待拟合	待拟合	待拟合
Error	待计算	待计算	待计算

还需要记录：
- S0²：振幅缩减因子。
- R-factor：拟合残差指标。
- Reduced χ²：约化卡方。
- Nind：独立数据点数量。
- Fit range：k 和 R 拟合区间。
特别提醒： R-factor 没有适用于所有 XAS 数据的统一合格阈值。不能单凭 R-factor 小就认为配位结构正确，还需要考察参数误差、相关性、拟合残差和不同拟合窗口下的稳定性。
Wiley Online Library+2


5. 针对 PbOx/IrOx，我建议重点做的拟合
A. Ir L₃-edge







nature.com


主要关注：
- 第一配位壳层：Ir–O。
- 第二配位壳层：Ir–Ir。
- 不同电势下 Ir–O 键长和配位数。
- IrOx 包覆后局域结构是否发生变化。


B. Pb L₃-edge





主要关注：
- Pb–O 第一配位壳层。
- Pb–Pb 及其他近邻散射路径。
- PbO、PbO₂、PbSO₄ 标准物质对比。
- PbOx 在酸性电解液中的物相转变。


我建议使用以下参考物质：
吸收边	参考物质	主要用途
Ir L₃	Ir foil	金属 Ir 参考
