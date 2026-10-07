# 官方公告正文与事实理解

本能力仅用于现有 24 家 watchlist 的既有官方披露源。65 个 source 的数量、ID、公司、发现入口和全文许可不变。

## 工作流

列表摘要保留为 metadata，正文走现有 extract-body 队列。官方披露免费直接读取 HTML、PDF 和 SEC submission；失败不调用付费 Jina。PDF 使用 Poppler `pdftotext -layout`，保留页码与表格布局；SEC 保留主 filing 和 EX-99/EX-2 正文附件，排除 XBRL/图像二进制。HTML 在清洗前移除隐藏节点，表格保留行列分隔。详情明确链接的相关文档最多读取一层、五个，同源或来源明确配置的 publisher 前缀才允许；继续 SSRF/重定向保护。

每个文档下载最多32 MiB、30秒；PDF解析最多30秒、输出16 MiB。无文字/扫描型、加密/损坏PDF、验证码/拒绝页面或超出限制，均不算正文成功。MVP不包含OCR、反爬突破、通用浏览器、无限分页或附件递归。

`body_evidence` 记录官方URL、实际URL、解析器、格式、字节与正文哈希、正文区间/页码和失败原因；`article_revisions` 同时保存证据。影响事实解释的证据变化也产生新revision；刷新获取时间不制造新revision。迟到提取受revision检查保护。

材料状态是 `metadata-only`、`fulltext available`、`fulltext extraction failed`。获取到正文不等于模型已经完整理解。长文按段落边界分成最多48,000字符、最多1,000字符重叠的块，处理所有字符区间。`disclosure_progress` 记录 complete/partial/unavailable 与成功、失败、未处理区间；预算/未知回执/模型失败仍进入既有恢复路径，partial 不伪装成完整分析。

理解结果在 analyses.output.disclosure 中，包括主体/角色、公告类型、官方发布日期及精度、报告期、当前阶段、关键指标与条款、连续原文quote及定位。数字保持原文，不换算、不自动计算同比；表格不同期间/币种/GAAP口径分开。期间表头、编制口径及币种说明可保存独立原文位置，核验其与数值行的同表同列/适用关系；表头不能补金额。独立核验调用逐条检查含义，应用另核对位置、数字和阶段；写作只拼接核验通过的中文事实句。公司主体依据发行人来源与原文角色，不能按顺带提及归属。Form4 明确显示实际issuer与reporting owner，不把查询公司当issuer。

正文缺失/失败使用确定性短摘要，明确说明未读取或获取失败；不让模型补金额、交易方向或业绩。公开全文仍默认关闭，所有公开摘要继续从 publication/ 读取。

## 自动回归与真实验收

`tests/fixtures/disclosures/manifest.json` 固定 A/H/US 各6条不同真实官方材料；gzip文件是官方原始字节，记录来源、日期、哈希。另有真实 Berkshire 关联 Form4，其发行人是 LENNAR、不是查询公司。18条材料的离线正文解析、全文分块覆盖及真实财务金标检查进入 npm test。

六类 injected failure 基于真实metadata，经本地HTTP和假模型完整走提取/分析/公开读取：metadata-only、403、损坏PDF、200验证页、HTML空正文、超限响应。它们不被描述成六起真实网络故障。附有数字符号、阶段、Form4、公司错绑、同表多期间与口径、证据修订、迟到响应以及分块中途失败回归。

真实模型验收独立执行，不能用本地假模型代替。只允许 *_test/_ci 库，采集worker、推送和IndexNow关闭；模型调用必须显式打开且仍走回执/预算。示例：

```bash
DATABASE_URL=postgres://127.0.0.1:5432/financehot_disclosure_acceptance_test \
MODEL_CALLS_ENABLED=true COLLECT_ENABLED=false \
FEISHU_CONTENT_PUSH_ENABLED=false INDEXNOW_SUBMIT_ENABLED=false \
PREFILTER_MODEL=default SCORE_MODEL=default STRUCTURE_MODEL=default \
DISCLOSURE_REPORT_DIR=/tmp/financehot-disclosure-acceptance \
node --env-file=.env scripts/verify-disclosure-understanding.ts
```

先在该隔离库执行迁移。不得与 npm test 共用模板库或让 API 持有模板连接。脚本直接读取官方URL、核对归档字节、运行应用分析并读取公开摘要，核验核心事件/阶段和财务数值、期间、币种、单位、口径与原文明示比较。缺样本、缺事实、模型额度不足、摘要遗漏主要金标或公开读取失败返回非零。HTTP402后停止后续批次，避免重复无意义请求。

2026-10-07 新模型 `opencode-go / deepseek-v4.1-flash` 的固定18条真实材料验收已通过；此前HTTP402已解除。最终运行复用请求hash一致的真实模型回执，并核对当前事实/摘要金标和publication。详细样本、覆盖边界、金标校正与运行证据见同目录验收报告。

## 更新部署

Docker镜像新增 poppler-utils，需要重建。非Docker部署先安装 Poppler，并确认 worker PATH 中可运行 pdftotext；macOS可用 `brew install poppler`，Debian可用 `apt-get install poppler-utils`。

新迁移只追加可空证据/进度字段，不删除已有数据。seed不会覆盖管理员已经保存的source config：已有部署需逐项审阅官方源的 summaryIsBody/fetchPublicContent，不能只运行seed便宣称配置生效。不要把官方列表摘要当body，也不要误改RSS实际content。旧metadata仅被保守识别，历史正文补齐需要管理员明确范围、重排现有任务；本实现与验收不自动重处理运营文章、不覆盖生产配置。
