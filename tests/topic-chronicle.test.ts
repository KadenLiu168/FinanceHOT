// Financial topic milestones exercise the same ranking, ownership, deduplication, curated-boundary,
// eligibility and naming mechanisms as the reading layer, using the current industry's rules.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { findTopic, TOPICS } from "@aihot/backend/publication/topics";
import { selectTopicChronicle, selectTopicHighlights, type ChronicleReport } from "@aihot/backend/publication/topic-chronicle";

const NOW = new Date("2026-09-30T20:00:00+08:00");
const window = { now: NOW };
const ALL = TOPICS.map((t) => t.slug);
const topic = (slug: string) => {
  const t = findTopic(slug);
  assert.ok(t, slug);
  return t;
};
let n = 0;
function report(title: string, o: Partial<ChronicleReport> & { day?: number } = {}): ChronicleReport {
  const at = new Date(`2026-09-${String(o.day ?? 10).padStart(2, "0")}T12:00:00+08:00`);
  return {
    id: `r${++n}`, title, originalTitle: null, category: "company", tags: ["财报/业绩"], score: 85, topicSlugs: ALL,
    timelineAt: at, publishedAt: at, factPublishedAt: null, firstParty: false, owner: null, factId: null, factSubject: "苹果",
    factAction: null, factOccurredAt: null, storyPublicId: null, sourceCount: 1, scope: "single", ...o,
  };
}
const capital = (title: string, o: Partial<ChronicleReport> & { day?: number } = {}) => report(title, { category: "capital", tags: ["资本运作"], ...o });
const events = (slug: string, reports: ChronicleReport[]) => selectTopicChronicle(topic(slug), reports, window).flatMap((m) => m.events);
const titles = (slug: string, reports: ChronicleReport[]) => events(slug, reports).map((e) => e.title);

test("a company's month keeps three earnings, two buybacks and two management events, each by score", () => {
  const reports = [
    ...[1, 2, 3, 4].map((q, i) => report(`苹果公布 2026 Q${q} 财报`, { score: 90 - i * 5, day: 3 + i })),
    ...[1, 2, 3, 4].map((i) => capital(`苹果宣布回购第 ${i} 批股份`, { score: 90 - i * 5, day: 10 + i })),
    ...["甲", "乙", "丙"].map((name, i) => report(`苹果任命${name}为董事`, { score: 98 - i, day: 20 + i, factAction: "management" })),
  ];
  const picked = events("apple", reports);
  const of = (kind: string) => picked.filter((e) => e.kind === kind).map((e) => e.title).sort();
  assert.deepEqual(of("earnings"), ["苹果公布 2026 Q1 财报", "苹果公布 2026 Q2 财报", "苹果公布 2026 Q3 财报"]);
  assert.deepEqual(of("buyback"), ["苹果宣布回购第 1 批股份", "苹果宣布回购第 2 批股份"]);
  assert.deepEqual(of("management"), ["苹果任命甲为董事", "苹果任命乙为董事"].sort());
  assert.deepEqual(picked.map((e) => e.at), [...picked].sort((a, b) => b.at.localeCompare(a.at)).map((e) => e.at), "newest first within the month");
});

test("unconfirmed actions, price moves and commentary stay out however high their score", () => {
  const out = ["苹果拟回购股份", "苹果计划收购资产", "传闻苹果公布财报", "苹果或将发行债券", "苹果财报预告", "苹果股价涨停", "苹果目标价上调", "Apple share price rises after earnings", "苹果可能任命新 CEO"];
  const reports = out.map((title, i) => report(title, { score: 99, day: 1 + i }));
  reports.push(report("苹果财报现金流解读", { category: "analysis", score: 99 }), report("苹果 CEO 谈未来盈利", { factAction: "opinion", score: 99 }),
    report("Apple reports its quarterly earnings and explains revenue growth", { score: 99 }), report("苹果公布财报", { scope: "composite", score: 99 }));
  assert.deepEqual(titles("apple", reports), []);
  assert.deepEqual(titles("earnings", reports), []);
  const confirmed = report("苹果公布 2026 Q3 财报，收入创纪录", { score: 99, day: 25 });
  assert.deepEqual(titles("apple", [...reports, confirmed]), [confirmed.title], "confirmed earnings may include a performance claim");
});

test("an issuer's filing on an exchange site is not the exchange's own action", () => {
  const filing = report("腾讯公布 2026 Q2 财报，披露于香港交易所", { factSubject: "腾讯控股", owner: "hkex", tags: ["财报/业绩", "entity:hkex"] });
  assert.deepEqual(titles("hkex", [filing]), []);
  assert.deepEqual(titles("tencent", [filing]), [filing.title]);
  assert.deepEqual(titles("earnings", [filing]), [filing.title]);
});

test("a company's action belongs to its fact subject, or its only subject tag", () => {
  const deal = capital("苹果宣布收购微软资产", { factSubject: "苹果" });
  assert.deepEqual(titles("apple", [deal]), [deal.title]);
  assert.deepEqual(titles("microsoft", [deal]), [], "a company merely mentioned is excluded");
  const community = report("第三方披露季度财报", { factSubject: null, owner: "apple", tags: ["财报/业绩"] });
  assert.deepEqual(titles("apple", [community]), [], "publisher ownership is not subject evidence");
  const tagged = report("季度财报正式公布", { factSubject: null, tags: ["财报/业绩", "entity:apple"] });
  assert.deepEqual(titles("apple", [tagged]), [tagged.title]);
  const joint = capital("苹果与微软完成资产合并", { factSubject: "Apple、Microsoft" });
  for (const slug of ["apple", "microsoft"]) assert.deepEqual(titles(slug, [joint]), [joint.title], "both explicit subjects");
});

test("company regulatory news needs its subject or one unambiguous company tag", () => {
  const probe = report("监管机构调查苹果披露违规", { factSubject: "监管机构", tags: ["政策/监管", "entity:apple"] });
  const multi = report("机构调查苹果与微软披露违规", { factSubject: null, tags: ["政策/监管", "entity:apple", "entity:microsoft"] });
  const deal = capital("英伟达宣布收购苹果资产", { factSubject: "NVIDIA、Apple" });
  assert.deepEqual(titles("apple", [probe, multi]), [probe.title]);
  assert.deepEqual(titles("microsoft", [multi]), []);
  assert.deepEqual(titles("apple", [deal]), [deal.title]);
  assert.deepEqual(events("nvidia", [deal]).map((e) => e.kind), ["merger"]);
});

test("reports of one earnings period within a week use the earliest date and strongest Chinese headline", () => {
  const reports = [report("苹果公布 2026 Q3 财报", { day: 11, score: 77, sourceCount: 3 }),
    report("苹果正式公布 2026 第三季度财报", { day: 12, score: 90, factId: 1 }),
    report("Apple 2026 Q3 earnings", { day: 13, score: 99, factId: 2 }),
    report("苹果披露 2026 Q3 业绩", { day: 14, score: 80, storyPublicId: "s-1" })];
  const picked = events("apple", reports);
  assert.equal(picked.length, 1);
  assert.equal(picked[0]!.title, reports[1]!.title, "a Chinese headline before a higher score");
  assert.equal(picked[0]!.at.slice(0, 10), "2026-09-11");
  assert.equal(picked[0]!.kind, "earnings");
});

test("curated months cannot suppress an automatic milestone after the boundary", () => {
  const august = new Date("2026-08-20T12:00:00+08:00");
  const older = report("苹果公布季度财报", { storyPublicId: "s-curated", score: 95, timelineAt: august, publishedAt: august });
  const newer = report("苹果披露季度业绩", { storyPublicId: "s-curated", score: 80 });
  const picked = selectTopicChronicle(topic("apple"), [older, newer], { now: NOW, through: "2026-08" }).flatMap((m) => m.events);
  assert.deepEqual(picked.map((e) => [e.title, e.at.slice(0, 10)]), [[newer.title, "2026-09-10"]], "filter curated months before deduplication");
});

test("financial report periods and issuer aliases merge independent coverage of the same earnings", () => {
  const launch = report("宁德时代公布 2026 第三季度财报", { factSubject: "CATL", day: 3, score: 88 });
  const follow = report("CATL 披露 2026 Q3 earnings", { factSubject: "CATL", day: 4, score: 81 });
  assert.deepEqual(titles("earnings", [follow, launch]), [launch.title], "order does not decide the representative");
  const firstHalf = report("苹果公布 2026 半年财报", { day: 4 });
  const annual = report("苹果公布 2026 年度财报", { day: 5 });
  assert.equal(events("apple", [firstHalf, annual]).length, 2, "half-year and annual periods differ");
});

test("different periods, issuers, guidance, action kinds and weeks remain separate", () => {
  const pairs: Array<[string, string, ChronicleReport[]]> = [
    ["apple", "different quarter", [report("苹果公布 2026 Q2 财报", { day: 3 }), report("苹果公布 2026 Q3 财报", { day: 4 })]],
    ["earnings", "different issuer", [report("苹果公布 2026 Q3 财报", { day: 3 }), report("微软公布 2026 Q3 财报", { factSubject: "微软", day: 4 })]],
    ["apple", "guidance is a different occurrence", [report("苹果公布 2026 Q3 财报", { day: 3 }), report("苹果公布 2026 Q3 盈利指引", { day: 4 })]],
    ["apple", "another kind", [report("苹果公布 2026 Q3 财报", { day: 3 }), capital("苹果宣布 2026 Q3 回购", { day: 4 })]],
    ["apple", "weeks apart", [report("苹果公布 2026 Q3 财报", { day: 2 }), report("苹果披露 2026 Q3 业绩", { day: 20 })]],
  ];
  for (const [slug, why, reports] of pairs) assert.equal(events(slug, reports).length, 2, why);
});

test("field terms and genre kinds reject unrelated reports carrying the same tag", () => {
  const general = report("苹果公布 2026 Q3 财报", { tags: ["财报/业绩", "利率"] });
  const rates = report("美国公布利率决定", { category: "macro", tags: ["央行政策", "利率"] });
  const policy = report("中国调整债券发行制度", { category: "policy", tags: ["政策/监管", "利率"] });
  assert.deepEqual(titles("rates", [general, rates, policy]), [rates.title]);
  assert.deepEqual(events("rates", [rates]).map((e) => e.kind), ["macro"]);
  assert.deepEqual(titles("earnings", [general, rates]), [general.title]);
  assert.deepEqual(titles("capital-actions", [general, capital("苹果完成收购")]), ["苹果完成收购"]);
  assert.deepEqual(titles("regulation", [rates, policy]), [policy.title]);
  assert.deepEqual(titles("research", [report("财报研究解读", { category: "analysis" })]), []);
  assert.deepEqual(titles("china-macro", [rates, policy]), [policy.title], "US macro is not China macro");
  assert.deepEqual(titles("us-macro", [rates, policy]), [rates.title], "China macro is not US macro");
});

test("financial genre and market timelines keep five most important events each month", () => {
  const reports = Array.from({ length: 9 }, (_, i) => report(`机构 ${i} 公布利率相关财报`, { day: 1 + i * 3, score: 90 - i, factSubject: null }));
  for (const slug of ["earnings", "rates"]) {
    assert.equal(events(slug, reports).length, 5);
    assert.ok(!titles(slug, reports).includes(reports[8]!.title), "the least important event drops out");
  }
});

test("a company's highlights lead with earnings then dividend and buyback in configured order", () => {
  const reports = [capital("苹果宣布回购", { score: 99, day: 25 }), capital("苹果宣布分红", { score: 90, day: 26 }), report("苹果公布季度财报", { score: 80, day: 27 })];
  assert.deepEqual(selectTopicHighlights(topic("apple"), reports, window).map((e) => e.kind), ["earnings", "dividend", "buyback"]);
});

test("milestone labels keep the financial first clause, issuer, decimal and number punctuation", () => {
  const cases = [
    ["苹果公布季度财报，收入增长 40%", "苹果公布季度财报"],
    ["苹果披露财报：收入增长 12 倍，现金流下降", "苹果披露财报：收入增长 12 倍"],
    ["苹果宣布回购 1,000 万股，金额为 9.5 亿美元", "苹果宣布回购 1,000 万股"],
    ["苹果宣布每股分红 9.5 元；创历史新高", "苹果宣布每股分红 9.5 元"],
    ["苹果宣布回购 1,000,000 股, execution starts today", "苹果宣布回购 1,000,000 股"],
    ["苹果公布财报。新增审计披露", "苹果公布财报"],
    ["苹果任命首席财务官！董事会批准", "苹果任命首席财务官"],
    ["苹果签署重大合同? 更多细节", "苹果签署重大合同"],
  ];
  for (const [title, label] of cases) assert.equal(events("apple", [report(title!)])[0]?.label, label, title);
  const full = report("苹果公布季度财报，收入增长 40%");
  assert.equal(events("apple", [full])[0]!.title, full.title, "the complete news headline remains intact");
});

test("same financial action labels deduplicate within a week while different labels remain distinct", () => {
  assert.deepEqual(events("apple", [capital("苹果宣布回购，首次执行", { day: 10 }), capital("苹果宣布回购，补充资金来源", { day: 11 })]).map((e) => e.label), ["苹果宣布回购"]);
  assert.equal(events("apple", [capital("苹果宣布回购普通股", { day: 23 }), capital("苹果宣布回购优先股", { day: 24 })]).length, 2);
  assert.equal(events("apple", [capital("苹果宣布回购", { day: 2 }), capital("苹果宣布回购", { day: 20 })]).length, 2, "another week's occurrence stays distinct");
});

test("qualified ticker subjects map to A/H/US issuers without accepting bare codes or another issuer", () => {
  const cases = [["kweichow-moutai", "SSE:600519", "贵州茅台"], ["tencent", "HKEX:00700", "腾讯"], ["apple", "NASDAQ:AAPL", "苹果"]];
  for (const [slug, ticker, name] of cases) {
    const filing = report(`${name}公布季度财报`, { factSubject: ticker });
    assert.deepEqual(titles(slug!, [filing]), [filing.title], ticker);
  }
  const wrong = report("苹果披露季度财报", { factSubject: "NASDAQ:MSFT" });
  assert.deepEqual(titles("apple", [wrong]), []);
  const bare = report("季度财报公布", { factSubject: "00700", tags: ["财报/业绩"] });
  assert.deepEqual(titles("tencent", [bare]), [], "bare ticker is not company evidence");
});

test("all configured market terms admit financial events and exclude tag-only or foreign-country matches", () => {
  const cases: Array<[string, string, ChronicleReport["category"], string]> = [
    ["china-macro", "中国公布 GDP 数据", "macro", "中国宏观"],
    ["us-macro", "United States CPI 数据公布", "macro", "美国宏观"],
    ["rates", "央行宣布降息", "macro", "利率"],
    ["fx", "人民币汇率干预公布", "asset", "汇率"],
    ["gold", "黄金供给实质减少", "asset", "黄金"],
    ["oil", "OPEC 原油减产生效", "asset", "原油"],
  ];
  for (const [slug, title, category, tag] of cases) {
    const accepted = report(title, { category, tags: [tag] });
    const unrelated = report("苹果公布季度财报", { tags: [tag] });
    assert.deepEqual(titles(slug, [accepted, unrelated]), [accepted.title], slug);
  }
  const us = report("美国国内 CPI 数据公布", { category: "macro", tags: ["中国宏观", "美国宏观"] });
  const china = report("中国 CPI 数据公布", { category: "macro", tags: ["中国宏观", "美国宏观"] });
  const unknown = report("英国 CPI 数据公布", { category: "macro", tags: ["中国宏观", "美国宏观"] });
  assert.deepEqual(titles("china-macro", [us, china, unknown]), [china.title]);
  assert.deepEqual(titles("us-macro", [us, china, unknown]), [us.title]);
});

for (const [slug, kind, title, action] of [
  ["apple", "buyback", "苹果董事会批准 100 亿美元回购计划", "buyback"],
  ["apple", "buyback", "苹果董事会批准回购计划", null],
  ["tencent", "merger", "腾讯完成虚拟资产业务收购", "merger"],
  ["apple", "earnings", "苹果公布 2026 Q3 财报，股价上涨 5%", "earnings"],
  ["apple", "earnings", "苹果 2026 Q3 财报超预期，股价上涨 5%", "earnings"],
] as const) test(`confirmed financial action remains a milestone: ${title}`, () => {
  const r = report(title, { category: kind === "earnings" ? "company" : "capital", factSubject: slug, factAction: action });
  assert.deepEqual(events(slug, [r]).map((e) => e.kind), [kind]);
});

test("proposals, rumours and pure price moves stay excluded despite a structured action", () => {
  const excluded = [
    capital("苹果拟回购股份", { factAction: "buyback" }),
    capital("苹果计划收购虚拟资产业务", { factAction: "merger" }),
    capital("传闻苹果批准回购计划", { factAction: "buyback" }),
    report("苹果财报预告", { factAction: "earnings" }),
    report("苹果股价上涨 5%", { factAction: "earnings" }),
    report("苹果财报后股价下跌"),
  ];
  for (const r of excluded) assert.deepEqual(titles("apple", [r]), [], r.title);
});

test("qualified ticker headlines deduplicate with issuer names without matching the exchange or bare code", () => {
  const ticker = report("HKEX:00700 公布 2026 Q3 财报", { factSubject: "腾讯", day: 3 });
  const named = report("腾讯披露 2026 第三季度业绩", { factSubject: "腾讯", day: 4 });
  assert.equal(events("tencent", [ticker, named]).length, 1, "qualified Hong Kong issuer ticker joins its name");
  const exchange = report("HKEX:00388 公布 2026 Q3 财报", { factSubject: "香港交易所", day: 4 });
  assert.equal(events("earnings", [ticker, exchange]).length, 2, "issuer and exchange company stay distinct");
  const bare = report("00700 公布 2026 Q3 财报", { factSubject: "腾讯", day: 3 });
  assert.equal(events("tencent", [bare, named]).length, 2, "bare numbers cannot infer an issuer for merging");
  const unknown = report("HKEX:00700A 公布 2026 Q3 财报", { factSubject: "腾讯", day: 3 });
  assert.equal(events("tencent", [unknown, named]).length, 2, "unknown qualified code cannot match a known prefix");
});

test("financial half years stay separate and Chinese or numeric quarters match the corresponding Q period", () => {
  const halves = [report("苹果公布 2026 上半年财报", { day: 3 }), report("苹果披露 2026 下半年业绩", { day: 4 })];
  assert.equal(events("apple", halves).length, 2, "the second half is not H1");
  for (const [half, name] of [["H1", "上半年"], ["H2", "下半年"]]) {
    assert.equal(events("apple", [report(`苹果公布 2026 ${half} 财报`, { day: 3 }), report(`苹果披露 2026 ${name}业绩`, { day: 4 })]).length, 1, `${half} aliases`);
  }
  for (const [q, chinese] of [[1, "一"], [2, "二"], [3, "三"], [4, "四"]]) {
    for (const token of [chinese, q]) {
      assert.equal(events("apple", [report(`苹果公布 2026 Q${q} 财报`, { day: 3 }), report(`苹果披露 2026 第${token}季度业绩`, { day: 4 })]).length, 1, `Q${q} and 第${token}季度`);
    }
  }
  assert.equal(events("apple", [report("苹果公布 2026 第3季度财报", { day: 3 }), report("苹果披露 2026 第4季度业绩", { day: 4 })]).length, 2, "numeric quarters stay separate");
});
