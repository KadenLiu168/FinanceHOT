# FinanceHOT v0.2 验收记录

状态：2026-10-07 当前实现的真实模型端到端验收 **18/18通过**，模型为 `opencode-go / deepseek-v4.1-flash`。旧 `HTTP 402: Insufficient Balance` 阻塞已解除。最终报告为 `/tmp/financehot-v02-evidence/newmodel-report-v15/report.json`。验收完成后用户另行授权提交并同步 GitHub `main`；本次不包含部署。

## 真实官方材料

下列18条来自当前官方source，A/H/US各6条；各市场至少2份财报/业绩公告。fixture保留官方原始gzip字节、来源、发布日期、哈希与财务金标。当前解析器对18条原始材料的正文解析及完整分块覆盖通过；18条均通过真实模型事实、财务元组、公开摘要与publication读取核验。

| 样本 | 市场/公司 | 官方材料 | 格式 | 正文 | 真实理解 |
|---|---|---|---|---|---|
| A01 | A / catl | [宁德时代：关于2026年度第八期绿色科技创新债券发行完成的公告](https://disc.static.szse.cn/download/disc/disk03/finalpage/2026-09-28/a305d573-0daf-4bd0-b836-e6cb506e6a28.PDF) | pdf | available，1,333字符 | 通过，真实模型/publication |
| A02 | A / catl | [宁德时代：关于2026年度第七期绿色科技创新债券发行完成的公告](https://disc.static.szse.cn/download/disc/disk03/finalpage/2026-09-22/384836eb-8f7e-41fe-839f-c015f44838c6.PDF) | pdf | available，1,759字符 | 通过，真实模型/publication |
| A03 | A / catl | [宁德时代：关于接受关联方担保的公告](https://disc.static.szse.cn/download/disc/disk03/finalpage/2026-10-01/5f452374-13d9-46c8-a9eb-bbc6b10b8fdd.PDF) | pdf | available，5,190字符 | 通过，真实模型/publication |
| A04 | A / catl | [宁德时代：关于向控股子公司提供财务资助的公告](https://disc.static.szse.cn/download/disc/disk03/finalpage/2026-10-01/fee68cf5-84a8-4b73-b06e-64fefdf97466.PDF) | pdf | available，5,620字符 | 通过，真实模型/publication |
| A05 | A / cmb | [2026年半年度报告摘要](https://s3gw.cmbimg.com/lb5001-cmbweb-prd-1255000097/cmbir/20260828/e19d1e7e-6ad8-4bef-a5fa-99ee29a042a8.pdf) | pdf | available，28,904字符 | 通过，真实模型/publication |
| A06 | A / midea | [美的集团：2026年半年度报告摘要](https://disc.static.szse.cn/download/disc/disk03/finalpage/2026-08-29/62ab6d1f-df6d-4e9b-99f2-438c13382b90.PDF) | pdf | available，7,218字符 | 通过，真实模型/publication |
| H01 | H / tencent | [中期報告 2026](https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0825/2026082500557_c.pdf) | pdf | available，169,184字符 | 通过，真实模型/publication |
| H02 | H / tencent | [截至二零二六年六月三十日止三個月及六個月業績公佈](https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0812/2026081200297_c.pdf) | pdf | available，70,318字符 | 通过，真实模型/publication |
| H03 | H / tencent | [截至二零二六年三月三十一日止三個月業績公佈](https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0513/2026051300335_c.pdf) | pdf | available，58,748字符 | 通过，真实模型/publication |
| H04 | H / hkex | [截至2026年12月31日止年度的中期股息及暫停辦理股份過戶登記手續](https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0819/2026081900216_c.pdf) | pdf | available，1,480字符 | 通过，真实模型/publication |
| H05 | H / hkex | [2026年中期業績、中期股息及暫停辦理股份過戶登記手續](https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0819/2026081900214_c.pdf) | pdf | available，91,333字符 | 通过，真实模型/publication |
| H06 | H / hkex | [截至2026年3月31日止三個月的季度業績](https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0429/2026042900420_c.pdf) | pdf | available，42,654字符 | 通过，真实模型/publication |
| US01 | US / apple | [苹果（NASDAQ:AAPL）：SEC 8-K/A filing](https://www.sec.gov/Archives/edgar/data/320193/0001140361-26-035325.txt) | sec | available，5,476字符 | 通过，真实模型/publication |
| US02 | US / apple | [苹果（NASDAQ:AAPL）：SEC 10-Q filing](https://www.sec.gov/Archives/edgar/data/320193/0000320193-26-000020.txt) | sec | available，92,845字符 | 通过，真实模型/publication |
| US03 | US / apple | [苹果（NASDAQ:AAPL）：SEC 8-K filing](https://www.sec.gov/Archives/edgar/data/320193/0000320193-26-000018.txt) | sec | available，16,647字符 | 通过，真实模型/publication |
| US04 | US / apple | [苹果（NASDAQ:AAPL）：SEC 10-Q filing](https://www.sec.gov/Archives/edgar/data/320193/0000320193-26-000013.txt) | sec | available，94,665字符 | 通过，真实模型/publication |
| US05 | US / apple | [苹果（NASDAQ:AAPL）：SEC 8-K filing](https://www.sec.gov/Archives/edgar/data/320193/0000320193-26-000011.txt) | sec | available，16,969字符 | 通过，真实模型/publication |
| US06 | US / apple | [Apple 2025 SEC 10-K](https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm) | html | available，219,880字符 | 通过，真实模型/publication |

另有真实 Berkshire 关联 SEC Form4 fixture，issuer为 LENNAR CORP /NEW/，reporting owner为Berkshire相关申报方；角色提取与完整分析路径不会把查询公司绑定为issuer。六类失败均标记为 injected failure：真实metadata-only、403、损坏PDF、200验证页、HTML空正文、超限响应，完整走提取/分析/公开读取且不虚构数值。

## 哪些路径已验证正文

- SZSE：真实债券发行、担保/资助公告及美的半年度摘要PDF。
- Company IR：招商银行官方IR半年度摘要PDF。
- HKEXnews：腾讯中期报告、半年度/季度业绩；港交所股息和业绩PDF。
- SEC：Apple 10-Q、8-K及EX-99正文、8-K/A submission；Apple 10-K HTML；Berkshire关联Form4 XML角色。

这些结果证明所列文档及通用解析路径，不代表全部24家公司、全部历史或所有IR网页已能读取。

仍受阻/尚未覆盖：SSE茅台详情URL本次返回验证HTML，不能算PDF成功；ICBC IR本次HTTP406；其他官方IR逐一长期部署覆盖未验证。CATL IR直接读取曾取得真实PDF，但未计入本18条金标样本，不能由此宣称长期稳定。所有失败均保持metadata降级。

## 通用能力与必要性

| industry外模块 | 必要性与边界 |
|---|---|
| content/documents.ts、extract.ts | 当前HTML/Jina路径不能直接解析真实PDF/SEC文本，且官方PDF/SEC超过6MiB；新增受限免费格式解析、表格/隐藏文本处理、官方链接附件及证据，不按公司编写collector |
| content/materials.ts、migration0053 | 原有正文状态不能保存页码/来源/哈希或模型分块进度；新增可空字段和revision证据快照，有意义证据变化也使分析失效，不删用户数据 |
| editorial/input.ts、analyze.ts、disclosure.ts | 旧schema无财务事实包，前6万字符遗漏财报后段；全区间提取、数字/阶段/身份约束、核验事实写作、partial进度、metadata确定性降级；无disclosureRole的普通行业仍走原流程 |
| Dockerfile | 本机Poppler存在不代表容器可用；仅增加免费poppler-utils，不增付费依赖或新服务 |
| scripts/verify-disclosure-understanding.ts、scripts/lib/disclosure-acceptance.ts | 独立真实模型/存储/publication验收，精确财务元组与当前阶段金标；缺额度/事实/公开摘要失败返回非零，不进入npm test |
| tests及真实fixtures | 现有回归只覆盖metadata与归组；新增真实解析、金标和故障/恶意输出/修订回归。假模型不计入真实理解通过 |
| docs与设计/计划 | 说明新能力、运行依赖、证据语义、既有seed不覆盖管理员config、历史重处理授权边界以及验收未完成状态 |

industry内修改仅调整已有官方metadata的summaryIsBody/fetchPublicContent，以及增加金融事实提取与核验prompt；65 source ID、24 watchlist、发现URL/过滤/范围与许可均核对保持，评分门槛未改。

## 验收判定与限制

A：18条真实正文成功材料和格式覆盖已有当前离线证据。D：真实fixture与六类注入故障、Form4/阶段/身份/数字/修订回归通过。E：现有完整测试与源范围不变检查通过。

B/C/Done：**本MVP验收范围已完成**。18条材料均通过真实模型结构化事实与摘要金标，涵盖revenue/net_income/EPS/IFRS/同比/分红/回购，以及融资金额、当前阶段、主体和公开读取一致性。此结论限定为本次固定材料，不扩大到24家公司全部披露或历史覆盖。

限制：无OCR、反爬突破、无限附件/分页、财务数据库或自动同比计算；32MiB下载、30秒下载/解析、PDF输出16MiB和单层五附件均有上限。读取成功不扩大公开全文许可。新迁移不自动改生产配置或重处理运营历史，本次仅同步源码至 GitHub `main`，不部署、不修改运营数据或自动重处理历史公告。

## 检查证据

最终同一源码快照核验：typecheck通过；完整后端测试743/743；web构建通过，web测试29/29；独立API/web在localhost:3500 smoke全部检查通过；独立代码审查未留下Important。测试使用Node.js v25.8.2；Node24 Docker镜像本次未构建，不将本机测试称为Node24运行证据。来源范围、ID、全文许可不变检查通过。

证据日志、源文件指纹、真实模型最终报告与诊断报告保存在 `/tmp/financehot-v02-evidence/`。完整测试使用独立 `financehot_disclosure_regression_test`，真实模型使用另一独立测试库；没有运营数据写入。早期失败（pg_dump缺PATH、验收库混作模板、smoke持有模板连接）已定位并在隔离环境修正，不用于成功声明。

真实验收使用 `financehot_disclosure_final_20261007_test`，完整本地回归使用另一独立模板库。v12在全新验收库重新下载官方材料；主文档正文哈希与归档金标一致。US06同时读取两个真实链接的SEC认证附件，主正文219,880字符未改变，合并正文225,133字符，覆盖5个块。v15在同一隔离库执行当前实现的全部18条；请求hash未变的模型调用复用真实付费回执，A02核验重新调用；不将回执复用称为18条全部重新付费生成。此前v1–v14均为诊断，不能替代v15通过证据。

本次修正严格保留数值、期间、币种和口径：A06按原文明示改正摊薄EPS为3.50，只有“千元/元”而无币种声明时金标保持未知币种；英文日期的准确中文期间表达及股息increase of 4 percent的“增长4%”仅补等价表述，不接受缺比较、错误方向或其他数值。SEC归档字节发生变化时单独记录live/archived raw hash，仍要求主文档可读正文哈希严格一致。

财务表头、编制口径和币种说明分别保留连续原文定位，独立核验同表同列及适用范围。表头年份不能提供金额或同比数值。阶段关联仅采用核验通过的同次事项event-stage定位，不按相同主题或label拼接旧阶段。首次片段允许一次有依据的核心事实修正，其他片段不重试；所有调用继续受回执与预算约束。

## 实际修改文件

- `Dockerfile`
- `database/migrations/0053_body_evidence.sql`
- `docs/deploy.md`
- `docs/disclosure-understanding.md`
- `docs/sources.md`
- `docs/superpowers/plans/2026-10-06-company-disclosure-understanding.md`
- `docs/superpowers/specs/2026-10-06-company-disclosure-understanding-design.md`
- `industry/README.md`
- `industry/prompts/disclosure-facts.md`
- `industry/prompts/disclosure-verify.md`
- `industry/sources.json`
- `packages/backend/src/content/documents.ts`
- `packages/backend/src/content/extract.ts`
- `packages/backend/src/content/materials.ts`
- `packages/backend/src/editorial/analyze.ts`
- `packages/backend/src/editorial/disclosure.ts`
- `packages/backend/src/editorial/input.ts`
- `scripts/lib/disclosure-acceptance.ts`
- `scripts/verify-disclosure-understanding.ts`
- `tests/disclosure-acceptance-gold.test.ts`
- `tests/disclosure-collection.test.ts`
- `tests/disclosure-extraction.test.ts`
- `tests/disclosure-lifecycle.test.ts`
- `tests/disclosure-mapping.test.ts`
- `tests/disclosure-pipeline.test.ts`
- `tests/disclosure-real-regression.test.ts`
- `tests/disclosure-understanding.test.ts`
- `tests/fixtures/disclosures/A01.raw.gz`
- `tests/fixtures/disclosures/A02.raw.gz`
- `tests/fixtures/disclosures/A03.raw.gz`
- `tests/fixtures/disclosures/A04.raw.gz`
- `tests/fixtures/disclosures/A05.raw.gz`
- `tests/fixtures/disclosures/A06.raw.gz`
- `tests/fixtures/disclosures/H01.raw.gz`
- `tests/fixtures/disclosures/H02.raw.gz`
- `tests/fixtures/disclosures/H03.raw.gz`
- `tests/fixtures/disclosures/H04.raw.gz`
- `tests/fixtures/disclosures/H05.raw.gz`
- `tests/fixtures/disclosures/H06.raw.gz`
- `tests/fixtures/disclosures/US01.raw.gz`
- `tests/fixtures/disclosures/US02.raw.gz`
- `tests/fixtures/disclosures/US03.raw.gz`
- `tests/fixtures/disclosures/US04.raw.gz`
- `tests/fixtures/disclosures/US05.raw.gz`
- `tests/fixtures/disclosures/US06.raw.gz`
- `tests/fixtures/disclosures/form4.json`
- `tests/fixtures/disclosures/form4.raw.gz`
- `tests/fixtures/disclosures/manifest.json`
- `docs/disclosure-understanding-acceptance.md`
