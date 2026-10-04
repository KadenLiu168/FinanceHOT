// 金融行业词表。分类 guide 进入结构化 prompt；主体只从原文中识别。
export const CATEGORIES = [
  {"key": "macro", "label": "宏观/央行", "section": "宏观与央行", "guide": "经济总量、通胀就业数据和央行货币政策。正例：中国CPI发布；美联储降息；财政刺激规模变化。边界反例：单家公司利润变化归公司；证券披露新规归政策。"},
  {"key": "policy", "label": "政策/监管", "section": "政策与监管", "guide": "金融监管、交易制度与适用全市场的规则。正例：证监会修改减持规则；交易所调整上市制度；SEC通过披露新规。边界反例：央行利率决定归宏观；对单家公司处罚归公司。"},
  {"key": "company", "label": "公司/财报", "section": "公司与财报", "guide": "具体企业经营、财报和治理变化。正例：正式季度财报；重大盈利预警；CEO更换。边界反例：IPO发行融资归资本；全市场监管规则归政策。"},
  {"key": "capital", "label": "资本市场", "section": "资本市场", "guide": "证券发行、资金配置及企业资本配置。正例：大规模回购；增发融资；并购资本重组。边界反例：季度经营收入归公司；无事实增量的指数涨跌归资产且低分。"},
  {"key": "asset", "label": "资产/商品", "section": "资产与商品", "guide": "汇率、黄金、原油等资产的供需、风险和交易事实。正例：OPEC实质减产；重大外汇干预；黄金供给冲击。边界反例：央行降息决定归宏观；仅预测油价的观点归解读。"},
  {"key": "analysis", "label": "观点/解读", "section": "观点与解读", "guide": "以作者解释、判断或评论为重点。正例：基于数据的财政政策解读；财报现金流分析；有出处的行业供需研究。边界反例：官方GDP数据发布归宏观；公司已宣布收购归资本。", "commentary": true},
 ] as const satisfies ReadonlyArray<{ key: string; label: string; section: string; guide: string; commentary?: true }>;
export const RELEASE: { category: string; tag: string; unit: string } | null = null;
export const PLAIN_TERMS: readonly string[] = ["cpi", "gdp", "pmi", "ipo", "etf", "qe", "qt", "sec", "pboc", "hkex", "fomc", "ceo", "cfo"];
export const ITEM_TYPES = ["macro_release", "policy_event", "earnings", "corporate_event", "capital_event", "market_event", "opinion_analysis"] as const;
export const CATEGORY_TAGS = ["宏观数据", "央行政策", "政策/监管", "财报/业绩", "公司事件", "资本运作", "资产/商品", "观点/解读", "其他"] as const;
export const TOPIC_TAGS = ["中国宏观", "美国宏观", "利率", "汇率", "黄金", "原油", "A股", "港股", "美股", "通胀", "就业", "财政", "流动性", "并购", "回购", "分红", "融资", "重大合同", "风险事件", "行业供需", "财报", "监管", "研究解读", "数据发布"] as const;
export const ENTITY_TAGS = ["贵州茅台", "宁德时代", "招商银行", "工商银行", "中国平安", "美的集团", "伊利股份", "长江电力", "腾讯控股", "阿里巴巴", "美团", "小米集团", "香港交易所", "友邦保险", "中国海洋石油", "中芯国际", "苹果", "微软", "英伟达", "亚马逊", "Alphabet", "Meta", "摩根大通", "伯克希尔哈撒韦"] as const;
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {"财报": "财报/业绩", "业绩": "财报/业绩", "降息": "央行政策", "加息": "央行政策", "降准": "央行政策", "并购重组": "资本运作", "增发": "资本运作", "监管政策": "政策/监管", "解读": "观点/解读", "观点": "观点/解读", "商品": "资产/商品"};
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; market: string; ticker: string; otherNames?: string[] }> = {
  "kweichow-moutai": {"name":"贵州茅台","displayTag":"贵州茅台","aliases":["贵州茅台","SSE:600519","茅台","Kweichow Moutai"],"market":"A","ticker":"SSE:600519"},
  "catl": {"name":"宁德时代","displayTag":"宁德时代","aliases":["宁德时代","SZSE:300750","CATL","Contemporary Amperex Technology"],"market":"A","ticker":"SZSE:300750"},
  "cmb": {"name":"招商银行","displayTag":"招商银行","aliases":["招商银行","SSE:600036","招行","China Merchants Bank"],"market":"A","ticker":"SSE:600036"},
  "icbc": {"name":"工商银行","displayTag":"工商银行","aliases":["工商银行","SSE:601398","工行","ICBC","Industrial and Commercial Bank of China"],"market":"A","ticker":"SSE:601398"},
  "ping-an": {"name":"中国平安","displayTag":"中国平安","aliases":["中国平安","SSE:601318","平安保险","Ping An"],"market":"A","ticker":"SSE:601318"},
  "midea": {"name":"美的集团","displayTag":"美的集团","aliases":["美的集团","SZSE:000333","Midea Group"],"market":"A","ticker":"SZSE:000333"},
  "yili": {"name":"伊利股份","displayTag":"伊利股份","aliases":["伊利股份","SSE:600887","伊利集团","Inner Mongolia Yili"],"market":"A","ticker":"SSE:600887"},
  "yangtze-power": {"name":"长江电力","displayTag":"长江电力","aliases":["长江电力","SSE:600900","China Yangtze Power"],"market":"A","ticker":"SSE:600900"},
  "tencent": {"name":"腾讯控股","displayTag":"腾讯控股","aliases":["腾讯控股","HKEX:00700","腾讯","Tencent Holdings","Tencent"],"market":"H","ticker":"HKEX:00700"},
  "alibaba": {"name":"阿里巴巴","displayTag":"阿里巴巴","aliases":["阿里巴巴","HKEX:09988","Alibaba Group","Alibaba"],"market":"H","ticker":"HKEX:09988"},
  "meituan": {"name":"美团","displayTag":"美团","aliases":["美团","HKEX:03690","Meituan"],"market":"H","ticker":"HKEX:03690"},
  "xiaomi": {"name":"小米集团","displayTag":"小米集团","aliases":["小米集团","HKEX:01810","小米","Xiaomi"],"market":"H","ticker":"HKEX:01810"},
  "hkex": {"name":"香港交易所","displayTag":"香港交易所","aliases":["香港交易所","HKEX:00388","港交所","HKEX","Hong Kong Exchanges and Clearing"],"market":"H","ticker":"HKEX:00388"},
  "aia": {"name":"友邦保险","displayTag":"友邦保险","aliases":["友邦保险","HKEX:01299","友邦","AIA Group"],"market":"H","ticker":"HKEX:01299"},
  "cnooc": {"name":"中国海洋石油","displayTag":"中国海洋石油","aliases":["中国海洋石油","HKEX:00883","中海油","CNOOC Limited"],"market":"H","ticker":"HKEX:00883"},
  "smic": {"name":"中芯国际","displayTag":"中芯国际","aliases":["中芯国际","HKEX:00981","SMIC","Semiconductor Manufacturing International"],"market":"H","ticker":"HKEX:00981"},
  "apple": {"name":"苹果","displayTag":"苹果","aliases":["苹果","NASDAQ:AAPL","Apple","Apple Inc."],"market":"US","ticker":"NASDAQ:AAPL"},
  "microsoft": {"name":"微软","displayTag":"微软","aliases":["微软","NASDAQ:MSFT","Microsoft"],"market":"US","ticker":"NASDAQ:MSFT"},
  "nvidia": {"name":"英伟达","displayTag":"英伟达","aliases":["英伟达","NASDAQ:NVDA","NVIDIA"],"market":"US","ticker":"NASDAQ:NVDA"},
  "amazon": {"name":"亚马逊","displayTag":"亚马逊","aliases":["亚马逊","NASDAQ:AMZN","Amazon","Amazon.com"],"market":"US","ticker":"NASDAQ:AMZN"},
  "alphabet": {"name":"Alphabet","displayTag":"Alphabet","aliases":["Alphabet","NASDAQ:GOOGL","谷歌","Google"],"market":"US","ticker":"NASDAQ:GOOGL"},
  "meta": {"name":"Meta","displayTag":"Meta","aliases":["Meta","NASDAQ:META","Meta Platforms","Facebook"],"market":"US","ticker":"NASDAQ:META"},
  "jpmorgan": {"name":"摩根大通","displayTag":"摩根大通","aliases":["摩根大通","NYSE:JPM","JPMorgan Chase","JPMorgan"],"market":"US","ticker":"NYSE:JPM"},
  "berkshire": {"name":"伯克希尔哈撒韦","displayTag":"伯克希尔哈撒韦","aliases":["伯克希尔哈撒韦","NYSE:BRK.B","伯克希尔","Berkshire Hathaway"],"market":"US","ticker":"NYSE:BRK.B"},
};
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = Object.entries(ENTITIES).map(([id, e]) => ({
  id, name: e.name,
  patterns: [...e.aliases, e.ticker].map((name) => new RegExp(/[A-Za-z]/.test(name) ? `(?<![A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])` : name, "i")),
}));
// 监管机构代管的披露域名不映射为某一家上市公司。
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  {"entityId":"apple","domains":["apple.com"]},
  {"entityId":"microsoft","domains":["microsoft.com"]},
  {"entityId":"nvidia","domains":["nvidia.com"]},
  {"entityId":"amazon","domains":["amazon.com"]},
  {"entityId":"alphabet","domains":["abc.xyz","google.com"]},
  {"entityId":"meta","domains":["about.fb.com"]},
  {"entityId":"tencent","domains":["tencent.com"]},
  {"entityId":"alibaba","domains":["alibabagroup.com"]},
  {"entityId":"meituan","domains":["meituan.com"]},
  {"entityId":"xiaomi","domains":["mi.com"]},
  {"entityId":"hkex","domains":["hkex.com.hk"]},
  {"entityId":"aia","domains":["aia.com"]},
  {"entityId":"cnooc","domains":["cnoocltd.com"]},
  {"entityId":"smic","domains":["smics.com"]},
  {"entityId":"jpmorgan","domains":["jpmorganchase.com"]},
  {"entityId":"berkshire","domains":["berkshirehathaway.com"]},
  {"entityId":"kweichow-moutai","domains":["moutaichina.com"]},
  {"entityId":"catl","domains":["catl.com"]},
  {"entityId":"cmb","domains":["cmbchina.com"]},
  {"entityId":"icbc","domains":["icbc.com.cn"]},
  {"entityId":"ping-an","domains":["pingan.com"]},
  {"entityId":"midea","domains":["midea.com"]},
  {"entityId":"yili","domains":["yili.com"]},
  {"entityId":"yangtze-power","domains":["cypc.com.cn"]},
];
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
