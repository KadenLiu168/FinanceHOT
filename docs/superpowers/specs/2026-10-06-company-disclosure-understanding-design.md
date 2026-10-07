# FinanceHOT v0.2：Company Disclosure Understanding MVP 设计

状态：设计和持续实施已获授权；实现已完成，真实模型端到端验收仍受HTTP402阻塞。

## 1. 目标与范围

在现有 65 个 source、24 家 A/H/US watchlist 公司和原有公告发现范围内，让官方材料经过获取正文、保留证据、提取事实、安全结构化、生成摘要。读者应知道发生了什么、关键数字/条款、原文明示的变化、事件类别以及值得关注的原因。不能根据标题、表格名、常识或历史知识补写缺失数字、阶段或财务比较。

来源保持 SSE、SZSE、HKEXnews、SEC EDGAR 与现有 Company IR；不新增公司，不扩大到全市场。优先覆盖财报/业绩/指引、分红回购融资、并购重组出售、重大合同、诉讼处罚财务风险、关键管理层变化，以及 10-K / 10-Q / 8-K / DEF 14A。Form 4 保留已有发现能力，并专门验证 issuer/reporting owner 分离。

不建设财务数据库、通用浏览器或全格式平台，不新增公司专用 collector，不使用第三方媒体代替官方正文，不依赖付费抓取、不绕过付费墙。公开全文许可继续由 site_fulltext / syndicate_fulltext 控制，默认 false。正文用于内部理解不等于允许公开全文。

## 2. 当前代码与实施前必要性证明

基线 revision：fa2062c55075bd7faa505fc5daf6407e7e5d9d04。开始本设计前工作区干净。源码检查、HTTP 响应与下载材料证据记录在 `/tmp/financehot-disclosure-probe/read-only-assessment.md`；这些是诊断证据，不是最终验收。

| 已核实问题 | 当前代码/真实材料 | 为什么 industry 配置不足 |
|---|---|---|
| 列表 metadata 被视为正文 | json-list.ts / web-list.ts 的 summaryIsBody=true 产生 bodyText 和 bodyStatus=ok；waitsForPage 不再抓正文 | 改配置可解决新记录，但正文状态、历史记录及理解输入必须具备可靠证据语义 |
| PDF 无直接解析 | content/extract.ts 只解析 HTML；腾讯 2025 中期报告实际为 122 页可提取文字 PDF | 配置不能解析二进制 PDF；需要一个通用格式解析器 |
| SEC 文本不解析、下载上限不足 | Apple 2025 10-K submission 返回 text/plain，9,392,337 bytes；腾讯 PDF 7,267,254 bytes；当前上限 6 MiB | 需要识别 SEC submission 容器并有受限的文档下载能力 |
| HTTP 200 不保证正文 | 茅台官方列表给出的 PDF URL 本次返回 text/html 验证页，readable 无结果 | 状态码和后缀都不足以判断正文，需要响应格式和有效文本检查 |
| 长文截断漏财务表格 | Apple 10-K 现有 readable 提取 206,204 字符；Net income 首次在 127,087，EPS 在 127,126；理解只取 60,000 字符，廉价摘要进一步取 6,000 | 提示词不能读取未传入内容；必须处理整篇文档的分段证据 |
| 结构和摘要缺事实契约 | FactSchema 无指标、报告期和阶段字段；normalizeStructure 只检查 evidence/conditions 包含关系；finalizeCopy 只做长度和身份约束 | 新字段会被现有 schema 丢弃，且 quote 存在不等于数字含义、阶段和公司角色正确 |

## 3. 方案选择

采用“现有流程 + 最小格式解析 + 证据事实包”。只改 prompt 无法解决二进制和截断；建立独立公告平台会重复采集、去重、回执和发布流程，不采用。

PDF 采用 Poppler 的 pdftotext，使用布局保持模式，并按换页符保留页码。真实腾讯 PDF 已在本机证明可解析。Docker 的 Debian base 增加 poppler-utils；非 Docker 部署明确安装方法。无需新增付费服务或 npm PDF SDK。解析器通过受限子进程调用，使用随机临时目录，传入已下载文件，禁止 shell 拼接，不由解析器自行联网；限制执行时间与输出量，finally 删除临时文件。缺少解析器不是正文成功，返回可诊断失败。

下载与重定向继续经过 guardedFetch，保留 SSRF、凭据与重定向约束。普通行业网页维持原 6 MiB 下载语义和既有 Jina 路径；现有 disclosureRole=statutory/issuer_ir 的官方披露采用免费直读路径、32 MiB 下载上限、30 秒下载超时，PDF 子进程最多 30 秒。任何上限失败都明确降级，不能截断二进制再称成功。限制值需用真实样本验证，不能通过降低验收要求接受未覆盖的必需样本。

## 4. 正文与证据契约

### 4.1 数据与状态

沿用 body_status 的 pending / ok / unconfirmed / none，不扩大现有数据库枚举。新增可空的 articles.body_evidence JSONB，以及 article_revisions.body_evidence JSONB，并添加 articles.disclosure_progress JSONB，用末尾新迁移追加；记录与对应 revision 一起保存，不回写已发布迁移，不删除用户数据。

body_evidence 包含：schemaVersion=1、status、sourceUrl、resolvedUrl、format、parser、fetchedAt、contentHash、textHash、pages（PDF 页码及正文字符区间）、failureReason。contentHash 是获取的文档字节哈希，textHash 是保存正文的哈希；没有成功获取字节时 contentHash=null。失败原因不包含凭据、响应中的秘密或整份验证页。

status 对外验收语义严格为：

- metadata-only：只有官方索引/列表/摘要证据，正文尚未取得或该记录未进入正文获取；body_status=pending/none。
- fulltext available：取得并成功提取有效官方正文，body_status=ok；并不声称模型已完整理解。
- fulltext extraction failed：已尝试获取/解析但失败，body_status=unconfirmed，保留 metadata 和失败原因。

另记录理解覆盖 coverage：complete / partial / unavailable，以及已处理和未处理的正文区间。禁止把 partial 描述成完整读取。

列表 metadata 留在 excerpt，不能作为 body_text。现有真实 feed content 或已读取详情正文可以作为正文，但同样注明取得方式。仅修改 summaryIsBody 的已知 metadata 配置，不能把全部 RSS content 误降级。47 个官方 source 逐一核对实际字段含义；65 个 source 的 ID、URL 发现范围、身份过滤与许可不变。正文成功后来源名称中“未读取正文”的历史措辞不能覆盖实际材料状态；模型输入明确以证据状态为准。

### 4.2 格式处理

- HTML：复用 Readability 和现有清洗，保留财务表格单元格边界、表头和上下文，不能把数值与行列含义拆散。针对真实 IR/SEC 文档验证；挑战页、登录页、导航页、空文本不算正文。
- PDF：先检查真实文档字节与响应类型，再使用 pdftotext -layout。页码从提取输出获得；乱码、零有效文本、加密、扫描型或损坏文档失败。MVP 不提供 OCR，不把扫描件成功下载当成正文成功。
- SEC submission：依据文档内 DOCUMENT / TYPE / TEXT 结构读取主 filing，以及 8-K 明确附带的相关正文附件；排除 XBRL/XML 数据文件、图像、二进制段。保留 accession、document 名、TYPE 和各文本区间。DEF 14A 按披露原文处理，不臆造投票结果。
- 内嵌/链接附件：仅跟随当前官方文档明确给出的相关文档链接，继续 guardedFetch 和现有已验证 publisher URL 规则；限制层级为 1、附件最多 5 个，记录每个附件来源。拒绝猜测 URL 或扩大搜索范围，未读取附件明确列出。附件也受相同格式/大小/超时约束，不允许付费兜底。

身份以既有交易所代码、CIK、发行人专属来源和文档明确角色为依据。SSE/SZSE/HKEX 共享域名不能证明任意公司归属。Form 4 必须解析 issuer 和 reporting owner 各自 CIK/名称，不能将查询 CIK、来源 owner_entity_id 或文中一次提及强行当 issuer。角色冲突或无法核验时保留关联角色，主体事实不作确定归属。

### 4.3 历史状态与修订

本文实施不自动重处理运营库。新迁移仅追加可空证据字段。现有 metadata 记录即使 body_status=ok，也不能因旧状态而被新流程称为已核验正文；对有明确 metadata 标记但无正文证据的官方记录，分析输入必须按 metadata 对待。

需要补齐历史正文时使用显式、限定 source/日期的管理员操作，经现有 reviseMaterial 和任务队列进行；操作说明包含 seed 不覆盖现有 source config 的实际行为。不得未经授权批量覆盖管理员配置、历史分析结果或持久数据。

提取结果提交继续使用 revision 校验及事务。迟到结果不能覆盖新正文或新的人工编辑；正文/证据改变须使相关分析失效，已有付费回执不得用于不同证据输入。

## 5. 事实理解与摘要

### 5.1 事实结构

在现有 StructureSchema 增加可选 disclosure 对象，保存于现有 analysis output JSON，不新增财务表。对象包含：

- company：实体 ID、官方名称、证券标识及 issuer / reporting_owner / associated / unknown 角色；绑定证据。
- announcementType：原文明示类型或表格类型，不以模型常识补充。
- publishedAt：来自现有官方发布日期字段，精度 day / datetime / unknown；不是 occurredAt，采集时间不能替代。
- sourceUrl：应用提供的实际官方 URL，模型无权修改。
- coreEvent：主体、动作、对象及连续原文 quote；与现有 fact 保持一致，不单独创造新的事件归组规则。
- stage：proposed / approved / completed / unknown；须有支持当前事件而非背景事件的 quote。
- reportingPeriod：原文报告期与 quote，保留财年和自然年区别。
- metrics：指标、原文 value 字符串、unit、currency、period、accountingBasis、comparison、quote、evidence locator。至少支持 revenue、net_income/profit、EPS、guidance、dividend、buyback；同一个财报允许多期和 GAAP/non-GAAP，但不能错配。
- keyTerms：核心合同/交易/诉讼/管理层条款及 quote；不能为完成结构强行填满字段。
- coverage：complete / partial / unavailable、已处理区间、失败区间。

值、单位、期间和比较项未知则 null；不计算同比/环比，不自行换算数值，不根据常识补币种。指标比较只有原文明示才能进入 comparison。保留原始数值便于核对，中文摘要可以展示原文已有的等价单位表述，但不得引入新计算。

每条 quote 连续来自对应文档的保存文本，locator 为 document/source URL + 文本起止位置，PDF 另带页码。表格 quote 可以包含原文表头和行，但不能把远处文字拼成一条伪原文引用。

### 5.2 长文读取

完整保存成功提取的正文。官方文档按段落/页/表格边界分块，每块最多 48,000 字符，边界最多重叠 1,000 字符；单个超长段落按字符拆分并标明连续区间。所有正文区间都须进入事实提取，不只抽选关键词命中的开头。每个块调用仍经过既有 chatJson、receipts、模型选择与预算熔断；subject/promptVersion 区分 revision、文档、区间和证据版本，使重试可复用对应回执。

一个 source article 的各块顺序处理，避免每份长财报额外扩大模型并发。任何块预算耗尽、超时或输出无效都记录 partial；不能把剩余块省略后声称 complete，也不能退回标题猜测。事实汇总在应用中按指标/报告期/口径/证据去重；互相冲突的数值保留原文区别或不写摘要，不能随意挑一个。

财报 structure/understand/summarize 使用已验证事实包及引用，不再各自盲目截取原文前段。预筛和评分保留现有标准、双独立评分和门槛，加入正确材料质量及财报证据摘要；普通行业维持原调用路径。不存在新模型预算豁免。

### 5.3 防幻觉与输出

应用验证 quote 连续包含、locator、数值原文存在、source URL、公司角色和时期/口径关联。模型提出的阶段和核心事件不能仅因某个单词出现就被认定正确。真实模型验收逐条检查语义支持，特别是拟议分红、董事会批准与实际完成、背景公司与披露主体。

事实包未经验证的条目不得进入写作。写作输出须带支持该句的 evidence 引用；应用校验引用有效、金额/比例/日期/主体只来自该句引用的已验证事实。数值匹配只是必要条件，不视为语义证明。阶段、口径或公司主体无法证明的句子删除或退回确定的保守表达；不能只丢掉证据却保留句子。

正文缺失/失败时采用确定性 metadata 摘要：公司/关联角色、官方发布日期、披露标题/表格和原文链接，并明确“正文未读取”或“正文获取失败”。不调用正文理解去生成金额、业绩、交易方向、完成状态或经营影响。原 metadata 已明示的数字仅在其含义明确且可定位时允许保留，不推断标题之外结果。

正文成功时，标题和摘要覆盖核心事件、主要数字/条款、报告期、事件类型；只有原文有比较才写变化。阅读价值基于已验证事实的一层解释，不承诺股价或投资回报，不荐股。现有摘要长度规则不能裁掉金额单位、阶段、否定或报告期；无法保持含义时用更少完整事实。

公开读取仍全部经过 publication/，不新建独立公开出口或前端查询数据库。现有读者摘要作为交付载体；结构化证据保存在分析结果与验收报告，MVP 不增加新页面或公开财务 API。

## 6. 预计修改边界

每个实现任务开始前复核下面的模块必要性，新增文件只承担列出的职责，不顺带重构。

| 文件/模块 | 修改目的及 industry 外必要性 | 避免影响其他行业 |
|---|---|---|
| industry/sources.json、industry/prompts/structure.md、content-understanding.md、understand.md、summarize-article.md、rules-anti-hallucination.md 及必要 prompt partial | 修正 metadata 配置并规定公告理解与证据输出 | 不改 source 数量、公司、发现范围、评分门槛；普通内容保持现有字段语义 |
| content/extract.ts；新增 content/documents.ts | 响应格式判定、PDF/SEC 解析、官方链接附件及来源证据；现有模块不支持这些格式 | 格式通用，不按公司名称分支；非 disclosure 来源保留既有提取路径 |
| Dockerfile、docs/deploy.md | 安装免费 Poppler、记录非 Docker 和历史更新边界；本机已安装不代表容器存在 | 只增加运行所需工具，不改变运行角色或服务 |
| database/migrations/0053_body_evidence.sql | 为正文与 revision 保存可追溯证据；现有字段只有正文/状态不能保留页码和失败原因 | 追加可空字段，不删除/重处理运营数据；已有记录可正常读取 |
| content/materials.ts、editorial/input.ts | 证据与正文 revision 同步，正确材料质量和身份；prompt 不能修复入库状态和调用链 | 可选字段，不改变原 URL 去重和时间线规则 |
| editorial/analyze.ts、writing.ts；新增 editorial/disclosure.ts | 分块事实提取、验证、事实包写作、metadata 确定性降级；仅改 prompt 无法增加 schema 或传入尾部 | disclosureRole 判定适用路径，不新增假 API 开关；原行业 structure/writing 路径保留 |
| jobs/content.ts（只在现有路由/重试确实需要时） | 保证失败提取进入明确降级、复用已有任务；不得新建公告调度系统 | 保留现有 revision、重试、预算和 shutdown 行为 |
| tests/disclosure-understanding.test.ts、disclosure-extraction.test.ts、disclosure-real-regression.test.ts；tests/fixtures/disclosures/；scripts/verify-disclosure-understanding.ts | 真实材料离线回归及独立端到端验收，现有测试不覆盖正文能力 | 自动测试仅本地 HTTP/假模型，独立真实验收不进入 npm test |
| docs/sources.md、industry/README.md、docs/disclosure-understanding.md | 状态、格式、证据和验收边界的持久说明 | 不宣称全市场、全历史或部署已生效 |

既有 source config、公开契约与架构测试随实际变化更新必要断言。无需新增 contracts 公共 API 字段、collector 或模型 provider。若执行中发现必须扩大这些边界，先补真实证据和设计说明。

## 7. 验收与要求映射

真实材料须来自现有 source 对应的官方历史链接，每条有 source ID、公司、市场、标题、官方日期及精度、URL、原文格式、获取时间、字节哈希、正文哈希、提取状态、理解覆盖、模型/提示词/回执、结构化结果、摘要及人工可复核的原文定位。事实金标从官方原文建立，不以模型自己的答案作为金标。

| 要求 | 必需证据 |
|---|---|
| A 正文 | 至少 18 条不同真实正文成功材料，A/H/US 各 >=6；覆盖 HTML、SEC filing HTML/文本、PDF。逐条报告三种状态；SSE/SZSE/HKEX/SEC/IR 路径明确列出成功和受阻情况 |
| B 结构 | 正文可用样本输出公司、公告类型、官方发布日期、核心事件、原文存在的数字/条款、阶段、财报报告期、source URL；缺失字段不猜 |
| C 财报 | A/H/US 各 >=2 份真实财报/业绩公告；逐项核对原文存在的 revenue、net income/profit、EPS、guidance、dividend、buyback；时期、币种、单位、GAAP/non-GAAP 与明确比较正确 |
| D 回归 | 18 个正文成功 fixture +6 个基于真实官方 metadata 的缺失/失败案例；覆盖 PDF/HTML 拒绝、验证页、损坏/空文本、metadata-only、Form 4 owner/issuer；阶段和身份对抗模型输出被拒绝 |
| E 不退化 | 65 source ID、24 watchlist 保持一致；现有发现、IR、去重、statutory canonical、事件归组、双评分/门槛 tests 全部通过；新证据旧回执/迟到 revision 不污染结果 |
| Done | 真实官方材料经应用正文提取、真实模型事实理解/写作、证据验证、存储与 publication 摘要读取，逐条核验；假服务只能证明流程/约束，不算真实理解完成 |

六条失败案例使用真实公告 metadata 和真实格式材料，离线模拟无正文、403、200 验证页、PDF 解析失败、HTML 提取失败和受限下载；分别标明 observed failure 或 injected failure，不能把注入失败称为真实网络事故。18 条成功不能用同一公告中英文两版重复凑数。

真实验收使用独立 `_test`/`_ci` 库，固定 source 范围、官方 fixture 和有限模型调用；付费模型仍走回执与预算，推送/IndexNow 全程关闭。不得启用运营 worker、覆盖生产 source config 或重跑运营文章。测试套件里的采集/模型只连本地假服务；真实外网获取和真实模型验收单独运行并记录限制，未完成时明确报告未达标。

必须完成：

```bash
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/financehot_disclosure_test npm test
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3000
```

smoke 的 API/web 指向同一独立验收库，启动前核对端口及服务配置，不影响现有运营服务。验收脚本缺样本、覆盖不足、无可用模型结果、预算受阻或超时都返回非零并记录 incomplete；不能只输出绿色下载统计。

最终交付报告逐项列出：实际修改文件、新增通用能力、18+真实样本及结果、已可读正文来源、仍只有 metadata 的来源、剩余限制、测试结果、industry 外每项修改必要性。证据必须绑定最终 revision/源文件指纹，不能引用改动前绿灯。

## 8. 已知限制与实施顺序

免费 MVP 不承诺 OCR、任意嵌套附件、全历史分页、平台反爬突破或所有市场全文。正文不可用时仍明确输出 metadata，但这不抵消至少 18 条正文成功和真实理解的验收要求。当前茅台 SSE 验证页属于待进一步验证路径；可使用该公司现有官方 IR 材料完成真实样本，不能用第三方材料替换。报告需分别说明 SSE 与 IR 能力，不能由 IR 成功推出 SSE 成功。

实施顺序：材料状态/修订证据 → 免费正文提取 → 长文事实与身份验证 → 事实驱动写作 → 真实样本回归及独立端到端验收 → 全项目检查与交付。验收材料搜集与金标建立贯穿各步；下载不代表理解完成。本文审阅通过后再写细化实施计划、选择执行方式；提交、推送、部署和运营历史重处理均不属于当前自动动作。
