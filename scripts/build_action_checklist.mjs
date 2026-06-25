import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/arpes_action_checklist";
const workbook = Workbook.create();

const items = [
  ["ID", "日期", "建议/需求", "模块", "优先级", "状态", "对应版本", "下一步", "来源/备注"],
  ["A001", "2026-06-16", "从文献中提取 SnSe2、SnSe2 掺二茂钴、SnSeS、SnS2、SnSe、SnS 等材料信息", "文献提取", "High", "Planned", "v0.1", "先用 WoS/Scholar 导出文件导入，再做字段抽取", "用户初始需求"],
  ["A002", "2026-06-16", "建设可搜索材料/元素并展示文献数据的网站", "网站主流程", "High", "Done", "v0.2-v0.8", "继续接入真实文献数据源", "已做静态网站"],
  ["A003", "2026-06-17", "Superconductor 按钮触发周期表元素跳舞", "周期表", "Medium", "Done", "v0.3", "保留动画但主界面更简洁", "已实现"],
  ["A004", "2026-06-17", "Our Data 可记录并保存个人数据", "个人数据", "High", "Done", "v0.3", "后续可接后端账户系统", "localStorage 保存"],
  ["A005", "2026-06-17", "Overview 需要直观图片对比，图来自文章，数据来自文章", "论文图对比", "High", "In Progress", "v0.4-v0.8", "优先用 DOI/arXiv/出版商/WoS 导出来源核验", "ar5iv 图像仅作预览"],
  ["A006", "2026-06-21", "所有图表颜色保持一致，便于对比", "视觉设计", "Medium", "Done", "v0.5", "继续统一不同图类型色板", "已统一图表类别色"],
  ["A007", "2026-06-23", "登录界面需要邮箱、密码和创建账号", "登录", "High", "Done", "v0.6", "当前为本地模拟登录，后续接真实认证", "localStorage"],
  ["A008", "2026-06-23", "历史图节点全部可点击并显示简介", "历史图", "High", "Done", "v0.7", "后续补 DOI/文献来源", "已增强简介卡片"],
  ["A009", "2026-06-23", "网站所有人可打开，部署到 GitHub Pages", "部署", "High", "Done", "v0.6+", "每次改动后同步 gh-pages", "公开 URL"],
  ["A010", "2026-06-23", "手机版格式正确且不影响电脑版", "响应式", "High", "Done", "v0.6+", "每次发布前做桌面/手机检查", "已多次检查"],
  ["A011", "2026-06-24", "左侧目录随右侧内容滚动自动变化", "目录", "Medium", "In Progress", "v0.8", "简化为三个主入口，并保持 scroll spy", "本版本已简化"],
  ["A012", "2026-06-24", "历史图做成 3D 魔方，可缩放，三个轴为年份、压力、Tc", "3D 魔方", "High", "Done", "v0.7-v0.8", "按参考图继续优化空间布局", "已保留三轴和六面切换"],
  ["A013", "2026-06-24", "模型接口做成界面", "模型接口", "Medium", "Done", "v0.7", "等待真实计算模型接入", "window.ARPESModelHub"],
  ["A014", "2026-06-24", "中科大真实登录图和外部虚拟眼睛登录界面要清楚", "登录视觉", "High", "Done", "v0.8", "可继续按品牌图微调", "已调亮"],
  ["A015", "2026-06-25", "访客登录后增加注销选项退回登录界面", "登录", "High", "Done", "v0.9", "后续可区分 guest/USTC 权限", "本次实现"],
  ["A016", "2026-06-25", "保留现有版本，并给之前版本命名版本号", "版本管理", "High", "Done", "v0.9", "继续为发布点打 tag", "VERSIONS.md + git tags"],
  ["A017", "2026-06-25", "新版本主界面只保留了解历史和选择体系深入探索两个功能", "信息架构", "High", "Done", "v0.9", "按后续参考图继续精修魔方/周期表", "本次简化"],
  ["A018", "2026-06-25", "论文图对比、模板说明等做成菜单栏或折叠项", "资料库", "High", "Done", "v0.9", "必要时拆成更多折叠菜单", "高级资料库 details"],
  ["A019", "2026-06-25", "生成调研报告最好为 PDF 或 Word，不再只是 Markdown", "报告导出", "High", "Done", "v0.9", "后续可加浏览器打印 PDF", "本次改为 .doc"],
  ["A020", "2026-06-25", "档案来源链接有些打不开，数据来源最好用官方文献", "数据来源", "High", "In Progress", "v0.9", "批量校验 DOI/arXiv/出版商链接，降低 ar5iv 依赖", "本次改为优先官方文献入口"],
  ["A021", "2026-06-25", "每次讨论建议放进 Excel 销项清单", "项目管理", "High", "Done", "v0.9", "后续每次迭代追加", "本文件"],
  ["A022", "2026-06-25", "魔方按草图改为左侧大透明六面体、右侧 Chat platform；周期表按草图改为左侧大周期表、右侧 Module/材料索引", "魔方/周期表界面", "High", "Done", "v1.0", "继续按实际使用反馈细调空间比例和模块命名", "用户 2026-06-25 两张手绘草图"]
];

const versions = [
  ["版本", "提交", "日期", "说明"],
  ["v0.1", "0d2c166", "2026-06-15", "初版 ARPES 文献提取器"],
  ["v0.2", "ee0fce1", "2026-06-15", "可信材料搜索 Web App"],
  ["v0.3", "Google Scholar import", "2026-06-16", "增加 Scholar/BibTeX 导入"],
  ["v0.6", "9485203", "2026-06-23", "移动端响应式布局"],
  ["v0.7", "77dfeea", "2026-06-24", "3D Tc-年份-压力坐标"],
  ["v0.8", "48bcc6a", "2026-06-24", "登录视觉清晰化"],
  ["v0.9", "be9470c", "2026-06-25", "简洁主界面、注销、Word 报告、版本和销项清单"],
  ["v1.0", "current", "2026-06-25", "按手绘草图重排魔方和周期表工作台"]
];

function styleHeader(range) {
  range.format.fill.color = "#0F766E";
  range.format.font.color = "#FFFFFF";
  range.format.font.bold = true;
  range.format.borders = { preset: "bottom", style: "medium", color: "#0B4F4A" };
}

function styleTable(sheet, rangeAddress, headerAddress) {
  sheet.showGridLines = false;
  styleHeader(sheet.getRange(headerAddress));
  const range = sheet.getRange(rangeAddress);
  range.format.borders = { preset: "insideHorizontal", style: "thin", color: "#D7DEE8" };
  range.format.wrapText = true;
  range.format.font.name = "Arial";
  range.format.font.size = 10;
}

const checklist = workbook.worksheets.add("Action Checklist");
checklist.getRangeByIndexes(0, 0, items.length, items[0].length).values = items;
styleTable(checklist, `A1:I${items.length}`, "A1:I1");
checklist.freezePanes.freezeRows(1);
checklist.getRange("A:A").format.columnWidth = 10;
checklist.getRange("B:B").format.columnWidth = 14;
checklist.getRange("C:C").format.columnWidth = 48;
checklist.getRange("D:D").format.columnWidth = 16;
checklist.getRange("E:E").format.columnWidth = 10;
checklist.getRange("F:F").format.columnWidth = 14;
checklist.getRange("G:G").format.columnWidth = 14;
checklist.getRange("H:H").format.columnWidth = 36;
checklist.getRange("I:I").format.columnWidth = 28;

const summary = workbook.worksheets.add("Summary");
summary.getRange("A1:D1").values = [["指标", "数量", "说明", "更新时间"]];
summary.getRange("A2:D6").values = [
  ["总建议数", items.length - 1, "从本轮和前序讨论整理", "2026-06-25"],
  ["已完成", items.slice(1).filter(r => r[5] === "Done").length, "状态为 Done", "2026-06-25"],
  ["进行中", items.slice(1).filter(r => r[5] === "In Progress").length, "状态为 In Progress", "2026-06-25"],
  ["计划中", items.slice(1).filter(r => r[5] === "Planned").length, "状态为 Planned", "2026-06-25"],
  ["当前目标", "简洁主界面", "只保留了解历史和选择体系深入探索", "2026-06-25"]
];
styleTable(summary, "A1:D6", "A1:D1");
summary.getRange("A:A").format.columnWidth = 18;
summary.getRange("B:B").format.columnWidth = 14;
summary.getRange("C:C").format.columnWidth = 48;
summary.getRange("D:D").format.columnWidth = 16;

const versionSheet = workbook.worksheets.add("Versions");
versionSheet.getRangeByIndexes(0, 0, versions.length, versions[0].length).values = versions;
styleTable(versionSheet, `A1:D${versions.length}`, "A1:D1");
versionSheet.freezePanes.freezeRows(1);
versionSheet.getRange("A:A").format.columnWidth = 12;
versionSheet.getRange("B:B").format.columnWidth = 18;
versionSheet.getRange("C:C").format.columnWidth = 14;
versionSheet.getRange("D:D").format.columnWidth = 56;

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "Action Checklist", range: "A1:I12", scale: 1 });
await fs.writeFile(`${outputDir}/action_checklist_preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/arpes_discussion_action_items.xlsx`);
