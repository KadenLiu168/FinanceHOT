# FinanceHOT v0.1 行业包

面向中文投资者，覆盖 A股、港股、美股、中国与美国宏观，以及有明确金融传导的全球事件。内容是事实摘要、热点和金融日报，不提供荐股、目标价或买卖建议。

分类固定为 `macro`、`policy`、`company`、`capital`、`asset`、`analysis`。每类的正例与边界反例在 `taxonomy.ts` 的 `guide` 中，由结构化步骤实际读取。7 种 `ITEM_TYPES` 与评分、结构化、内容理解提示词一致。评分继续使用五维整数加权和两次独立结果，沿用现有安全、去重与归组流程。

`watchlist.json` 是固定 24 家上市公司的观察名单，A/H/US 各 8 家；`taxonomy.ts` 中的同 id 主体包含相同市场、交易所代码与别名。公司主题 24 个，市场主题 6 个（沿用框架 `field` 分组），内容形态 4 个，共 34 个。不因为来源、裸股票代码或顺带提及而猜主体。

`sources.json` 包含 65 个公开来源：原有 18 个机构／媒体源原样保留，23 个官方公司公告查询源及 24 个 Company IR 源，共 63 个 T1、2 个 T2。原有机构源包括中国官方 5 个、美国官方 6 个、香港官方 2 个，另有 ECB、BOJ、BIS。仅使用已有 `rss`、`web_list`、`json_list`，不需要登录、付费采集服务或新依赖。FT 只读取公开订阅摘要和原文链接，不破解付费墙；所有来源的站内全文与全文再分发都关闭。

CSRC 使用官网当前列表请求的 JSON 接口，SZSE 使用官方栏目 `index.json`；HTML 不执行网页脚本。EIA RSS 的相对链接和 BEA RSS 中缺少协议的 `www.bea.gov/` 链接，通过已有 `itemUrlPrefixRewrite` 补成官方绝对链接。列表采集不提供通用分页，也没有专用 PDF 正文解析，不承诺全市场公司公告完整覆盖。新增公告查询覆盖固定的 24 家 watchlist 公司，不用媒体或第三方镜像代替披露源。

BLS 使用官方 `bls_latest.rss` 的主要经济指标汇总，将 RSS 提供的指标摘要作为内部处理正文；它不是逐篇新闻稿订阅，同一汇总链接的内容更新沿用已有修订机制。BLS 与 HKMA 在某些网络可能出现 HTTP 403 或 TLS 连接失败，需在部署网络用实际 collector 验证，不能把配置存在计作抓取通过。`finance-hkex` 仍是交易所新闻稿；发行人披露由新增 `finance-disclosure-*` 源单独采集。

采集代理使用 `.env` 中的 `EGRESS_PROXY_URL`；仅设置系统 `HTTP_PROXY` / `HTTPS_PROXY` 不会让现有采集器自动使用代理。代理地址必须能从实际运行 API / worker 的环境访问；Docker 容器中的 `127.0.0.1` 指向容器自身，不能直接套用宿主机的本地代理地址。

## 官方公司公告

SSE 使用官网当前 `queryCompanyBulletinNew.do`，按 `SECURITY_CODE` 查询主公告（同组附件不重复导入），原文指向 `static.sse.com.cn`。该入口按单一证券代码查询，6 家公司分别配置。SZSE 用一次官方 `annList` POST 同时查询宁德时代、美的集团，响应再按 `secCode.0` 精确过滤。两者提供发行人、标题、日期及可用的公告分类。

HKEXnews 以官方清单的内部 `stockId` 查询，不把股票代码直接充作 `stockId`。每家公司一个 source，同时读取中英文列表，排除“另一语言版刚发布公告”的占位提示，避免漏掉中文或英文专属披露。日/月/年按 `+08:00` 解析，两个列表合并后按发布时间排序。日常月报表及非回购的翌日披露报表过滤；股份回购保留，继续走原精选门槛。相同 URL 只导入一次；不同 URL 的真实语言版本沿用既有事实归组与精选去重，不新增重复热度来源。任一语言列表失败时整轮失败，不推进成功位置。

SEC 使用官方 `data.sec.gov/submissions/CIK##########.json`，将 `filings.recent` 列式数组逐行映射，在采集前精确保留 `10-K`、`10-Q`、`8-K`、`DEF 14A`、`4` 及配置中的修订表格。发行人查询接口以 CIK 为单位，因此 8 家公司分别配置；不订阅全市场流，也不将被大量结构性产品文件挤出的 Atom 首页当成完整覆盖。原文链接使用已验证的官方 accession `.txt` 完整提交文件，提交时间读取带时区的 `acceptanceDateTime`。Form 4 索引中的公司可能是发行人，也可能是申报持有人（例如伯克希尔申报其所持其他公司的股票）；元数据只标“官方关联查询公司”，不伪称证券发行人，不猜交易方向。

这些来源把**官方列表／提交记录元数据**作为基础处理内容，明确未读取公告正文；HKEX 来源名称也明确这一点。它能支持公告发现、身份上下文、粗分类及不超出标题／分类事实的短摘要，不能支持正文中的财务指标、交易条款或业绩结论。`summaryIsBody=true` 只表示使用已提供的元数据进入分析队列，不表示解析了 PDF 或完整 filing。不会为这些新源启动付费 Jina 补正文，也没有新增依赖。原有安全规则、五维评分和阈值保持，提示词禁止按元数据补写事实。

| 市场 | 公司／证券 | 官方查询身份 | source id |
|---|---|---|---|
| A | 贵州茅台 `SSE:600519` | `SECURITY_CODE=600519` | `finance-disclosure-kweichow-moutai` |
| A | 宁德时代 `SZSE:300750` | `stock=300750` | `finance-disclosure-szse` |
| A | 招商银行 `SSE:600036` | `SECURITY_CODE=600036` | `finance-disclosure-cmb` |
| A | 工商银行 `SSE:601398` | `SECURITY_CODE=601398` | `finance-disclosure-icbc` |
| A | 中国平安 `SSE:601318` | `SECURITY_CODE=601318` | `finance-disclosure-ping-an` |
| A | 美的集团 `SZSE:000333` | `stock=000333` | `finance-disclosure-szse` |
| A | 伊利股份 `SSE:600887` | `SECURITY_CODE=600887` | `finance-disclosure-yili` |
| A | 长江电力 `SSE:600900` | `SECURITY_CODE=600900` | `finance-disclosure-yangtze-power` |
| H | 腾讯控股 `HKEX:00700` | `stockId=7609` | `finance-disclosure-tencent` |
| H | 阿里巴巴 `HKEX:09988` | `stockId=1000015694` | `finance-disclosure-alibaba` |
| H | 美团 `HKEX:03690` | `stockId=198419` | `finance-disclosure-meituan` |
| H | 小米集团 `HKEX:01810` | `stockId=190371` | `finance-disclosure-xiaomi` |
| H | 香港交易所 `HKEX:00388` | `stockId=781` | `finance-disclosure-hkex` |
| H | 友邦保险 `HKEX:01299` | `stockId=54299` | `finance-disclosure-aia` |
| H | 中国海洋石油 `HKEX:00883` | `stockId=2088` | `finance-disclosure-cnooc` |
| H | 中芯国际 `HKEX:00981` | `stockId=7249` | `finance-disclosure-smic` |
| US | 苹果 `NASDAQ:AAPL` | `CIK0000320193` | `finance-disclosure-apple` |
| US | 微软 `NASDAQ:MSFT` | `CIK0000789019` | `finance-disclosure-microsoft` |
| US | 英伟达 `NASDAQ:NVDA` | `CIK0001045810` | `finance-disclosure-nvidia` |
| US | 亚马逊 `NASDAQ:AMZN` | `CIK0001018724` | `finance-disclosure-amazon` |
| US | Alphabet `NASDAQ:GOOGL` | `CIK0001652044` | `finance-disclosure-alphabet` |
| US | Meta `NASDAQ:META` | `CIK0001326801` | `finance-disclosure-meta` |
| US | 摩根大通 `NYSE:JPM` | `CIK0000019617` | `finance-disclosure-jpmorgan` |
| US | 伯克希尔哈撒韦 `NYSE:BRK.B` | `CIK0001067983` | `finance-disclosure-berkshire` |

验证快照（2026-10-05）：23 个公告源均经真实官方返回及实际 collector 验证；独立测试数据库中 24 家公司均有材料，960 条材料进入既有分析队列，付费回执为 0。24 家公司的真实入库输入均通过既有 entity lexicon 与 writing identity guard 检查。A/H/US 各核对 3 条历史样本的标题、原文 URL、官方日期／时间及公司身份上下文，包括茅台、宁德时代、美的集团，友邦、中芯国际、腾讯，以及 Apple 10-K、Microsoft Form 4、Berkshire 关联 Form 4；SEC 五类目标表格均有入库样本。SZSE 连续抓取验证相同公告不新增、不修订；本地假服务验证新增公告进入、无关公司的公告即使提到 watchlist 公司仍被过滤。

三轮自检覆盖官方字段映射、公司范围／噪声及回归：原有 18 个源与改动前一致；类型检查、637 个后端测试、网页构建、29 个网页测试及独立站点 smoke 通过。测试包括列长度不一致拒绝、日期／时区、语言占位、Form 4 角色、入库／排队／去重及 seed 不覆盖管理员配置。真实模型的 subjects 输出和精选准确率未作外部付费实跑；这份证据验证采集输入与队列，不宣称模型正确率或长期部署 SLA。

限制：SSE 只给公告日，存储为日期精度，不捏造时分秒；SZSE 无时区时间按 `+08:00`，HKEX 按日/月/年及 `+08:00`。SSE PDF 详情在本次网络返回反爬页，但官方列表元数据及原文链接可用；其他 PDF 也未解析正文。列表没有通用翻页：SSE 每公司读取当前 100 组主公告，SZSE 两公司共享最新 50 条窗口，HKEX 每家公司每种语言读取当前 100 条；SEC 使用当前 submissions 窗口，不回溯额外历史文件。公告源初始间隔为 15 分钟，后续沿用框架调频；突发发布超过窗口可能遗漏，不承诺历史全量或全市场覆盖。首轮仅导入有限存量（SZSE 20 条，其余 8 条），按已有历史归档规则处理；后续轮次处理接口返回的窗口。

配置新增通用能力仅在原 `json_list`／`web_list` 内：列式数组、字段值过滤、文本模板、JSON 日期时区、HTML 日/月/年格式与列表摘要、多列表合并；无交易所专用 collector。具体语法见[信源](../docs/sources.md)。现有部署需运行原 seed 才新增这些源；seed 不覆盖管理员的原配置，也不自动启用全局采集安全阀。

## Company IR（2026-10-06，24/24 接入验收通过）

固定 watchlist 的 A/H/US 各 8 家均配置一个官方 Company IR 来源，与原 23 个 SEC／交易所法定公告来源并存。全部来源为 T1，owner_entity_id 与 watchlist 一一对应；site_fulltext 和 syndicate_fulltext 均为 false。本轮新增 24 个 IR source：RSS 3、web_list 15、json_list 6；全行业共 65 个 source。未增加依赖、公司专用 collector 或付费服务。

使用当前实际 collectSource，在独立测试库逐家采集普通列表窗口两轮，共 344 条材料，官方发布日期全部非空；24 个来源两轮均 status=ok，第二轮 created=0，discovery 数量不增加。每源核对最新 3 条材料的标题、公司身份、官方发布日期与链接，少于 3 条的全部核对。此处是当前窗口和短间隔重复验收，不代表历史完整性、长期运行稳定性或所有原文都可访问。Alphabet 以官方 RSS 原始文本核对，HTML 403 单独记录；不将 RSS 或 PDF metadata 称为完整正文。

普通窗口验收预先设置测试 cursor.initializedAt，以排除首次导入上限造成第二轮合法新增；首次导入边界另由项目回归测试覆盖。生产配置首次回溯默认最多 8 条／12 个月，美的为 36 个月；之后读取当前窗口，不提供通用分页。

| 公司 | 市场 | 官方采集入口 | source id | collector | 正文能力 | 两轮入库／重复新增 | 限制 |
|---|---|---|---|---|---|---|---|
| 贵州茅台 | A | [官方入口](https://www.moutaichina.com/mtgf/tzzgx/cwbg/index.html) | finance-ir-kweichow-moutai | web_list | 仅 metadata | 15 / 0 | 官方列表日期，不用 PDF 路径日期；PDF 仅 metadata |
| 宁德时代 | A | [官方入口](https://www.catl.com/ajax/iRSerach?index=1&subtitle=&nodeIds=regularnotice&year=&docType=&text=&pageSize=20) | finance-ir-catl | json_list | 仅 metadata | 20 / 0 | 官方列表 POST 查询参数接口；日期归一化只保留公布日 |
| 招商银行 | A | [官方入口](https://www.cmbchina.com/api/v1/cmbir/pagedBulletinA) | finance-ir-cmb | json_list | 仅 metadata | 6 / 0 | 官方公告 JSON，现有噪声过滤保留财报、分红、回购、资本债券等 |
| 工商银行 | A | [官方入口](https://www.icbc-ltd.com/icbcltd/investor%20relations/financial%20information/financial%20reports/) | finance-ir-icbc | json_list | 仅 metadata | 19 / 0 | HTTPS 静态页 JSON.parse 字符串；列表 Accept:text/html，PDF 默认请求；不降低 TLS |
| 中国平安 | A | [官方入口](https://group.pingan.com/investor_relations/) | finance-ir-ping-an | web_list | 仅 metadata | 4 / 0 | 当前首页 4 份正式材料；PDF/XLSX 仅 metadata |
| 美的集团 | A | [官方入口](https://www.midea.com/global/news) | finance-ir-midea | web_list | HTML 可提取 | 1 / 0 | 当前窗口只有 1 条旧财报发布；首次回溯 36 个月，报告期／正文事件日不作发布日期 |
| 伊利股份 | A | [官方入口](https://www.yili.com/news/company) | finance-ir-yili | web_list | HTML 可提取 | 2 / 0 | 正式业绩新闻窗口 2 条；以详情官方发布日期为准 |
| 长江电力 | A | [官方入口](https://www.cypc.com.cn/cypc/tzzgx43/tjcl/index.html) | finance-ir-yangtze-power | web_list | 仅 metadata | 10 / 0 | 现有 URL rewrite 去除 PDF viewer 外壳；PDF 仅 metadata |
| 腾讯控股 | H | [官方入口](https://www.tencent.com/investors/investor-news/) | finance-ir-tencent | web_list | 仅 metadata | 21 / 0 | 24 条原始列表，过滤股东大会投票／通知后 21 条 |
| 阿里巴巴 | H | [官方入口](https://www.alibabagroup.com/en-US/ir-news-filings) | finance-ir-alibaba | web_list | 仅 metadata | 20 / 0 | 拟议、定价、完成是不同阶段；页面再链接 PDF，当前 metadata |
| 美团 | H | [官方入口](https://www.meituan.com/en-US/investor/results) | finance-ir-meituan | web_list | 仅 metadata | 33 / 0 | 官网链接 TodayIR PDF；不解析 PDF |
| 小米集团 | H | [官方入口](https://asia.tools.euroland.com/tools/Pressreleases/Main/GetNews/?strDateFrom=01%2F01%2F2018&strDateTo=&typeFilter=&orderBy=0&pageIndex=0&pageJummp=50&hasTypeFilter=false&searchPhrase=RESULTS+ANNOUNCEMENT&companyCode=ky-1810&onlyInsiderInfo=false&lang=en-GB&v=&alwaysIncludeInsiders=false&strYears=) | finance-ir-xiaomi | json_list | 仅 metadata | 33 / 0 | 官网授权 Euroland 公告 JSON；取公告日，不用会议活动日期；PDF 包装页仅 metadata |
| 香港交易所 | H | [官方入口](https://www.hkexgroup.com/Media-Centre/News-Release/HKEX-Group?sc_lang=en) | finance-ir-hkex | web_list | 仅 metadata | 4 / 0 | 只采集团自身业绩，不混入交易规则及市场新闻 |
| 友邦保险 | H | [官方入口](https://www.aia.com/en/media-centre/press-releases) | finance-ir-aia | web_list | HTML 可提取 | 30 / 0 | 正式官方业绩发布；当前窗口，无全量历史 |
| 中国海洋石油 | H | [官方入口](https://www.cnoocltd.com/english/investorrelations/resultspresentations/results/) | finance-ir-cnooc | web_list | 仅 metadata | 12 / 0 | 正式 Results／Quarterly Review；PDF 仅 metadata |
| 中芯国际 | H | [官方入口](https://www.smics.com/en/site/news) | finance-ir-smic | web_list | HTML 可提取 | 4 / 0 | 列表／页面日期与个别正文 dateline 年份冲突；保存原文，不改写年份 |
| 苹果 | US | [官方入口](https://www.apple.com/newsroom/topics/company-news/) | finance-ir-apple | web_list | HTML 核心段落 | 2 / 0 | 当前公司新闻窗口仅 2 份财报；Readability 仅核心段落 |
| 微软 | US | [官方入口](https://www.microsoft.com/en-us/investor/default) | finance-ir-microsoft | web_list | HTML 可提取 | 1 / 0 | 当前窗口仅 1 份 FY26 Q4；官方日精度，无历史翻页 |
| 英伟达 | US | [官方入口](https://nvidianews.nvidia.com/cats/press_release.xml) | finance-ir-nvidia | rss | HTML 可提取 | 1 / 0 | 当前 RSS 财报仅 1 条；真实 extractArticleBody 提取 18319 字符 |
| 亚马逊 | US | [官方入口](https://ir.aboutamazon.com/feed/PressRelease.svc/GetPressReleaseList?LanguageId=1&pageSize=100&pageNumber=0&tagList=&includeTags=true&year=-1&excludeSelection=1&pressReleaseDateFilter=3) | finance-ir-amazon | json_list | 仅 metadata | 22 / 0 | 只保留 API 中可达财报 PDF；2026 Q1、2025 Q4 DocumentPath 为空，当前窗口缺这两份 |
| Alphabet | US | [官方入口](https://abc.xyz/rss/pressrelease.aspx) | finance-ir-alphabet | rss | RSS 文本／metadata | 10 / 0 | 官方 RSS 200，详情 HTML 当前 403；部分条目只有摘要／标题，无完整正文 |
| Meta | US | [官方入口](https://investor.atmeta.com/feed/PressRelease.svc/GetPressReleaseList?LanguageId=1&pageSize=100&pageNumber=0&tagList=&includeTags=true&year=-1&excludeSelection=1&pressReleaseDateFilter=3) | finance-ir-meta | json_list | 仅 metadata | 54 / 0 | 正式财报、分红、融资等 PDF；不解析 PDF |
| 摩根大通 | US | [官方入口](https://jpmorganchaseco.gcs-web.com/rss/news-releases.xml) | finance-ir-jpmorgan | rss | RSS 短描述 | 10 / 0 | 官网链接的 GCS 服务；普通 UA 失败，配置标准 UA；未验证完整正文 |
| 伯克希尔哈撒韦 | US | [官方入口](https://www.berkshirehathaway.com/news/2026news.html) | finance-ir-berkshire | web_list | 仅 metadata | 10 / 0 | 年度页面；换年需更新 URL；不解析 PDF |

metadata 是官方标题、日期和身份上下文；summaryIsBody=true 只让已配置的官方摘要进入处理，不代表 PDF 已解析。不得根据标题补写收入、利润等数字。Apple 的正文只提取核心段落；HTML 可提取也不表示全文展示许可。NVIDIA、AIA、SMIC 的实际延后 extractArticleBody 路径验证通过，其余 HTML 由采集详情复用正文提取；所有公开输出仍只展示摘要和原文链接。

### 最小通用能力与 canonical

真实来源复现配置无法表达的三类阻塞后，补充泛用能力：Berkshire 的 UTF-8 HTML 错标 charset=unicode，严格 UTF-8 验证后纠正解码，真实 UTF-16 保持原行为；ICBC 的 var initData=JSON.parse('…') 只解码字面字符串并 JSON.parse，不执行 JS；CATL/CMB 与 Q4 的未注明时区时间使用 date_only/date_only_mdy，只保留官方公布日。AIA/SMIC/GCS 对默认请求 UA 拒绝，现有 source headers 扩展到 RSS、HTML 及延后正文路径；详情只转发 User-Agent/Accept/Accept-Language，凭据不跨主机传播。未放宽 SSRF、TLS 或重定向安全检查。

config.disclosureRole 区分 statutory / issuer_ir。原 23 个法定公告源为 statutory，新 24 个 IR 为 issuer_ir。共享代表排序在调用方已有的同一事实候选范围内优先 T1 statutory，再按正文、评分和时间排序。角色本身不负责归组，未标角色保持原行为，非 T1 不因角色提升。

同 URL 沿用 identity_key/article_discoveries 去重，出版者归属继续验证 URL origin/path。重叠披露 scope 只有唯一已观察 statutory 才解决歧义；普通来源重叠或多个已观察 statutory 保持歧义。角色修改使用原后台 republishSource 队列。不同公司、财期和宣布／批准／完成阶段仍按现有事实契约区分。

真实配对验收采用贵州茅台 2026 年半年度报告摘要：官方 IR 与 SSE 返回同公司、同标题、同公布日（2026-08-15），URL 不同。保留真实日期，在单独测试库回放公布日，运行 upsertMaterial → publishArticle → groupArticle；IR 先到、SSE 后到，结果为一个 fact、一个 story、一张 timeline 卡片和一个公开 seat，代表为 SSE。模型端为本地固定关系 stub，验证的是真实归组和公开层的集成契约，不能据此宣称外部模型准确率已验证。原项目回归覆盖跨财期／不同动作等不误归并的契约。

seed 只新增来源，不覆盖已有管理员配置。已有部署需通过原后台更新法定来源角色和 publisherUrlPrefixes，并保留其余配置；本轮没有写业务数据库。无 schema 迁移，开发安全阀保持关闭。

### 本轮项目检查

当前改动通过 typecheck、后端测试 651/651、web build、网页测试 29/29 和隔离站点 smoke 30/30。采集验收未调用模型／Jina，付费回执为 0；归组验收只有本地模型 stub。检查未启动业务 worker、提交、推送或部署。以上为本轮开发与隔离运行验收，部署状态和持续稳定性不在本轮证据范围内。

FinanceHOT threshold 尚未经过金融 gold dataset 校准。`selection.ts` 保留原 baseline：T1=60、T1_5=65、T2=76、understandFloor=50。正式校准需使用者人工标注 100–200 条真实资料，再运行 `scripts/eval-selection.ts`。两个 `*.example.jsonl` 仅演示格式，内容虚构，不是人工 gold，不可用于宣称校准通过。

公司 Chronicle 识别财报、分红、回购、融资、并购、管理层、监管与重大经营。排除纯股价走势、传闻和观点；同主体同报告期财报的标题别名可归并，不同报告期和不同公司不合并。并购与监管事件主要沿用已有事实归组：同一次动作合为同一事实，宣布、批准、完成保留为不同进展。

首次启动运行已有 migrate/seed；seed 只新增源，不覆盖或删除既存记录。已有默认行业部署必须先盘点其后台信源与历史内容；本行业包转换不会自动清除用户已有数据。安全阀开发时保持关闭。运行环境与验证方式见 [部署](../docs/deploy.md)、[信源](../docs/sources.md)、[精选校准](../docs/selection.md)。

`brand/` 使用 FinanceHOT 独立图标与金融日报报头。`pages/terms.md`、`pages/privacy.md` 仍是模板，上线前需使用者确认运营主体、生效日、用途、联系方式与隐私处理。

v0.2 官方列表 metadata 保留为摘要，由既有队列直接读取正文；通用PDF/SEC解析和证据理解的配置及验收边界见 [docs/disclosure-understanding.md](../docs/disclosure-understanding.md)。来源仍为65个、watchlist仍为24家，公开全文许可未扩大。真实模型端到端验收必须另外通过，不能由下载或离线假模型结果推出。
