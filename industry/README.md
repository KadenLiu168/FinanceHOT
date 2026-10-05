# FinanceHOT v0.1 行业包

面向中文投资者，覆盖 A股、港股、美股、中国与美国宏观，以及有明确金融传导的全球事件。内容是事实摘要、热点和金融日报，不提供荐股、目标价或买卖建议。

分类固定为 `macro`、`policy`、`company`、`capital`、`asset`、`analysis`。每类的正例与边界反例在 `taxonomy.ts` 的 `guide` 中，由结构化步骤实际读取。7 种 `ITEM_TYPES` 与评分、结构化、内容理解提示词一致。评分继续使用五维整数加权和两次独立结果，沿用现有安全、去重与归组流程。

`watchlist.json` 是固定 24 家上市公司的观察名单，A/H/US 各 8 家；`taxonomy.ts` 中的同 id 主体包含相同市场、交易所代码与别名。公司主题 24 个，市场主题 6 个（沿用框架 `field` 分组），内容形态 4 个，共 34 个。不因为来源、裸股票代码或顺带提及而猜主体。

`sources.json` 包含 18 个公开来源：16 个 T1、2 个 T2。中国官方 5 个、美国官方 6 个、香港官方 2 个，另有 ECB、BOJ、BIS。仅使用已有 `rss`、`web_list`、`json_list`，不需要登录、付费采集服务或新依赖。FT 只读取公开订阅摘要和原文链接，不破解付费墙；所有来源的站内全文与全文再分发都关闭。

CSRC 使用官网当前列表请求的 JSON 接口，SZSE 使用官方栏目 `index.json`；HTML 不执行网页脚本。EIA RSS 的相对链接和 BEA RSS 中缺少协议的 `www.bea.gov/` 链接，通过已有 `itemUrlPrefixRewrite` 补成官方绝对链接。列表采集不提供通用分页，也没有专用 PDF 正文解析，不承诺全市场公司公告完整覆盖。Watchlist 定义跟踪主体，不意味着 24 家公司都已有独立公告订阅；公告覆盖不足时不能把新闻媒体补充当作完整披露覆盖。

BLS 使用官方 `bls_latest.rss` 的主要经济指标汇总，将 RSS 提供的指标摘要作为内部处理正文；它不是逐篇新闻稿订阅，同一汇总链接的内容更新沿用已有修订机制。BLS 与 HKMA 在某些网络可能出现 HTTP 403 或 TLS 连接失败，需在部署网络用实际 collector 验证，不能把配置存在计作抓取通过。HKEX 来源为交易所新闻稿，不是所有上市公司的公告流。

采集代理使用 `.env` 中的 `EGRESS_PROXY_URL`；仅设置系统 `HTTP_PROXY` / `HTTPS_PROXY` 不会让现有采集器自动使用代理。代理地址必须能从实际运行 API / worker 的环境访问；Docker 容器中的 `127.0.0.1` 指向容器自身，不能直接套用宿主机的本地代理地址。

FinanceHOT threshold 尚未经过金融 gold dataset 校准。`selection.ts` 保留原 baseline：T1=60、T1_5=65、T2=76、understandFloor=50。正式校准需使用者人工标注 100–200 条真实资料，再运行 `scripts/eval-selection.ts`。两个 `*.example.jsonl` 仅演示格式，内容虚构，不是人工 gold，不可用于宣称校准通过。

公司 Chronicle 识别财报、分红、回购、融资、并购、管理层、监管与重大经营。排除纯股价走势、传闻和观点；同主体同报告期财报的标题别名可归并，不同报告期和不同公司不合并。并购与监管事件主要沿用已有事实归组：同一次动作合为同一事实，宣布、批准、完成保留为不同进展。

首次启动运行已有 migrate/seed；seed 只新增源，不覆盖或删除既存记录。已有默认行业部署必须先盘点其后台信源与历史内容；本行业包转换不会自动清除用户已有数据。安全阀开发时保持关闭。运行环境与验证方式见 [部署](../docs/deploy.md)、[信源](../docs/sources.md)、[精选校准](../docs/selection.md)。

`brand/` 使用 FinanceHOT 独立图标与金融日报报头。`pages/terms.md`、`pages/privacy.md` 仍是模板，上线前需使用者确认运营主体、生效日、用途、联系方式与隐私处理。
