import { ENTITIES, IDENTITY_LEXICON } from "./taxonomy.ts";

// 主题页“大事记”的行业规则。通用的几步在框架里（packages/backend/src/publication/topic-chronicle.ts）：
// 从近 12 个月已公开的精选里，按这里的规则定类型，比精选分门槛，把同一件事并成一个节点，按每月名额取舍，
// 再写成事件名；公司主题只收这家公司自己的（看事实主体，没有主体时看标题在发布动作之前先点名谁）。
// 换行业时改这个文件：节点类型（名称、门槛、名额、画在哪一行）、内容形态主题收哪些类型、发布动作、
// 一篇报道算哪类节点。合并同一金融事件、写事件名两项可选，删掉就用框架的做法：只合并标题或事件名相同的，
// 事件名取标题的第一句。
// 公司编年史还可以接上人工整理的历史：industry/chronicles/{主题 slug}.json，格式见 docs/customize.md。

/** 主题的分组（topics.json 的 group）：公司、方向、内容形态。 */
type Group = "company" | "field" | "genre";

/** 一类节点。 */
export interface ChronicleKind {
  /** 卡片和时间轴上的类型名。 */
  label: string;
  /** 公司编年史里排在时间轴上方一行（财报），标记最醒目；其余类型在下方一行。 */
  above?: true;
  /** 主题自己推出的东西（财报、资本动作），用强调色标记；公司主题只收这家公司自己发布的。其余类型算新闻，公司主题只收以这家公司为主体的。 */
  launch?: true;
  /** 公司主题收这类节点的精选分门槛和每月名额（各类型分开取，互不挤占）；不写就不收。 */
  company?: { min: number; perMonth: number };
  /** 方向和形态主题收这类节点的精选分门槛（这些主题每月按重要程度取前 5 件）；不写就不收。 */
  other?: { min: number };
}

/** 规则读到的一篇入选报道。 */
export interface ChronicleItem {
  title: string;
  /** 外文报道的原标题。 */
  originalTitle: string | null;
  category: string | null;
  tags: string[];
  /** 属于这个行业最受关注的那类发布（taxonomy.ts 的 RELEASE）。 */
  release: boolean;
  /** 结构化抽取出的事实动作，比如 earnings、opinion。 */
  factAction: string | null;
}

/** 一个候选节点：代表报道、事件名和它的全部报道。 */
export interface ChronicleEvent {
  kind: string;
  label: string;
  head: { title: string };
  reports: ReadonlyArray<{ title: string }>;
}

export interface ChronicleRules {
  /** 节点类型。公司主题的搜索摘要按这里的先后列出。 */
  kinds: Record<string, ChronicleKind>;
  /** 内容形态主题的大事记收哪些类型，每月最多几件（默认 5）；没列出的形态主题不设大事记，直接读精选。 */
  forms: Record<string, { kinds: string[]; perMonth?: number }>;
  /** 发布动作。公司主题遇到没有事实主体的报道，看标题在它之前先点名的是哪家公司。 */
  launchVerb: RegExp;
  /** 一篇报道在这一组主题里算哪类节点；不论分数高低都不算节点时返回 null（预告、教程、平台上架……）。 */
  kindOf(item: ChronicleItem, group: Group): string | null;
  /** 可选：同一周、同一类型的两个节点是不是同一件事（归组漏掉的同一金融事件）。 */
  sameEvent?(a: ChronicleEvent, b: ChronicleEvent): boolean;
  /** 可选：节点在时间轴上的名字（“公司季度财报”），由代表报道的标题得出。 */
  eventName?(title: string, kind: string, topic: { slug: string; orgNames: readonly string[] }): string;
}

// 只有已确认的实质动作进入公司大事记；价格走势和观点不构成动作。
const COMMENTARY = /^(?:opinion|analysis|commentary|prediction|观点|解读)/i;
const UNCERTAIN = /传闻|传言|网传|猜测|或将|可能|(?<!虚)拟|预告|rumou?r|speculat/i;
const CONFIRMED_PLAN = /(?:批准|获批|完成).*计划|计划(?:已)?(?:获批|批准|完成)/;
const PRICE_ONLY = /股价|股指|涨停|跌停|目标价|技术指标|K线|share price|stock (?:rises|falls)/i;
const RULES: Array<[string, RegExp]> = [
  ["regulatory", /处罚|诉讼|立案|调查|财务造假|违规|sanction|lawsuit|investigation/i],
  ["earnings", /财报|业绩|盈利预警|利润预警|指引|earnings|financial results|profit warning|guidance/i],
  ["dividend", /分红|派息|股息|dividend/i],
  ["buyback", /回购|buyback|repurchase/i],
  ["financing", /增发|发行.*(?:债|股)|融资|配股|financing|capital raising|bond issuance/i],
  ["merger", /并购|收购|合并|重组|资产出售|出售.*资产|控股权|merger|acquisition|acquire|divest/i],
  ["management", /任命|辞任|离任|董事长|首席执行官|首席财务官|CEO|CFO|appoint|resign/i],
  ["major_business", /重大合同|签订.*合同|中标|供需|产能|停产|重大业务|major contract|capacity|shutdown/i],
];

function kindOf(item: ChronicleItem, group: Group): string | null {
  if (item.category === "analysis" || COMMENTARY.test(item.factAction ?? "") || UNCERTAIN.test(item.title)) return null;
  if (item.title.split(/[，。；]/).some((clause) => /计划/.test(clause) && !CONFIRMED_PLAN.test(clause))) return null;
  if (group === "company" && !["company", "capital"].includes(item.category ?? "")) return null;
  const action = item.factAction ?? "";
  const explicit = RULES.find(([kind]) => action === kind);
  if (PRICE_ONLY.test(item.title) && (!explicit || !explicit[1].test(item.title))) return null;
  if (explicit) return explicit[0];
  for (const [kind, pattern] of RULES) {
    if (pattern.test(`${item.title} ${item.originalTitle ?? ""}`)) return kind;
  }
  return group !== "company" && item.category === "macro" ? "macro"
    : group !== "company" && item.category === "policy" ? "policy"
    : group !== "company" && item.category === "asset" ? "market" : null;
}

const plain = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const TICKER_ISSUERS = new Map(Object.entries(ENTITIES).map(([id, e]) => [e.ticker.toUpperCase(), id]));
function issuer(title: string): string | null {
  const matches = new Set<string>();
  const names = title.normalize("NFKC").replace(/(?<![A-Za-z0-9])(?:SSE|SZSE|HKEX|NASDAQ|NYSE):[A-Z0-9]+(?:\.[A-Z0-9]+)?(?![A-Za-z0-9])/gi, (ticker) => {
    const id = TICKER_ISSUERS.get(ticker.toUpperCase());
    if (id) matches.add(id);
    return ""; // HKEX:00700 的交易所前缀不是香港交易所公司。
  });
  for (const e of IDENTITY_LEXICON) if (e.patterns.some((pattern) => pattern.test(names))) matches.add(e.id);
  return matches.size === 1 ? [...matches][0]! : null;
}
function period(title: string): string | null {
  const year = /20\d{2}/.exec(title)?.[0];
  if (!year) return null;
  const q = /(?:Q([1-4])|第?([一二三四1-4])季度)/i.exec(title);
  const quarter = q?.[1] ?? (q?.[2] ? String("一二三四".indexOf(q[2]) + 1 || q[2]) : null);
  const half = /下半年|H2/i.test(title) ? "H2" : /上半年|半年|中期|H1/i.test(title) ? "H1" : /年报|年度|annual/i.test(title) ? "FY" : null;
  return quarter ? `${year}-Q${quarter}` : half ? `${year}-${half}` : null;
}

function sameEvent(a: ChronicleEvent, b: ChronicleEvent): boolean {
  if (a.kind !== b.kind) return false;
  const x = issuer(a.head.title), y = issuer(b.head.title);
  if (x && y && x !== y) return false;
  if (plain(a.label) === plain(b.label)) return true;
  // 同主体、同报告期的正式财报多来源报道；指引/预警是不同发生。
  if (a.kind !== "earnings" || !x || x !== y || /预警|指引|guidance|warning/i.test(a.head.title + b.head.title)) return false;
  const p = period(a.head.title);
  return !!p && p === period(b.head.title);
}

export const CHRONICLE: ChronicleRules = {
  kinds: {
    earnings: { label: "财报/业绩", above: true, company: { min: 60, perMonth: 3 }, other: { min: 65 } },
    dividend: { label: "分红", company: { min: 65, perMonth: 2 }, other: { min: 70 } },
    buyback: { label: "回购", company: { min: 65, perMonth: 2 }, other: { min: 70 } },
    financing: { label: "融资", company: { min: 65, perMonth: 2 }, other: { min: 70 } },
    merger: { label: "并购/重组", company: { min: 60, perMonth: 3 }, other: { min: 65 } },
    management: { label: "管理层", company: { min: 70, perMonth: 2 }, other: { min: 75 } },
    regulatory: { label: "监管/法律", company: { min: 60, perMonth: 3 }, other: { min: 65 } },
    major_business: { label: "重大经营", company: { min: 65, perMonth: 3 }, other: { min: 70 } },
    macro: { label: "宏观/央行", other: { min: 60 } },
    policy: { label: "政策/监管", other: { min: 60 } },
    market: { label: "资产/供需", other: { min: 65 } },
  },
  forms: {
    earnings: { kinds: ["earnings"] },
    "capital-actions": { kinds: ["dividend", "buyback", "financing", "merger"] },
    regulation: { kinds: ["regulatory", "policy"] },
  },
  launchVerb: /公布|披露|宣布|批准|签署|完成|任命|发行|announce|report|complete/i,
  kindOf,
  sameEvent,
};
