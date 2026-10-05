# FinanceHOT v0.1 行业包

面向中文投资者，覆盖 A股、港股、美股、中国与美国宏观，以及有明确金融传导的全球事件。内容是事实摘要、热点和金融日报，不提供荐股、目标价或买卖建议。

分类固定为 `macro`、`policy`、`company`、`capital`、`asset`、`analysis`。每类的正例与边界反例在 `taxonomy.ts` 的 `guide` 中，由结构化步骤实际读取。7 种 `ITEM_TYPES` 与评分、结构化、内容理解提示词一致。评分继续使用五维整数加权和两次独立结果，沿用现有安全、去重与归组流程。

`watchlist.json` 是固定 24 家上市公司的观察名单，A/H/US 各 8 家；`taxonomy.ts` 中的同 id 主体包含相同市场、交易所代码与别名。公司主题 24 个，市场主题 6 个（沿用框架 `field` 分组），内容形态 4 个，共 34 个。不因为来源、裸股票代码或顺带提及而猜主体。

`sources.json` 包含 41 个公开来源：原有 18 个机构／媒体源原样保留，另加 23 个官方公司公告查询源，共 39 个 T1、2 个 T2。原有机构源包括中国官方 5 个、美国官方 6 个、香港官方 2 个，另有 ECB、BOJ、BIS。仅使用已有 `rss`、`web_list`、`json_list`，不需要登录、付费采集服务或新依赖。FT 只读取公开订阅摘要和原文链接，不破解付费墙；所有来源的站内全文与全文再分发都关闭。

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

FinanceHOT threshold 尚未经过金融 gold dataset 校准。`selection.ts` 保留原 baseline：T1=60、T1_5=65、T2=76、understandFloor=50。正式校准需使用者人工标注 100–200 条真实资料，再运行 `scripts/eval-selection.ts`。两个 `*.example.jsonl` 仅演示格式，内容虚构，不是人工 gold，不可用于宣称校准通过。

公司 Chronicle 识别财报、分红、回购、融资、并购、管理层、监管与重大经营。排除纯股价走势、传闻和观点；同主体同报告期财报的标题别名可归并，不同报告期和不同公司不合并。并购与监管事件主要沿用已有事实归组：同一次动作合为同一事实，宣布、批准、完成保留为不同进展。

首次启动运行已有 migrate/seed；seed 只新增源，不覆盖或删除既存记录。已有默认行业部署必须先盘点其后台信源与历史内容；本行业包转换不会自动清除用户已有数据。安全阀开发时保持关闭。运行环境与验证方式见 [部署](../docs/deploy.md)、[信源](../docs/sources.md)、[精选校准](../docs/selection.md)。

`brand/` 使用 FinanceHOT 独立图标与金融日报报头。`pages/terms.md`、`pages/privacy.md` 仍是模板，上线前需使用者确认运营主体、生效日、用途、联系方式与隐私处理。
