// Topic pages: which articles a topic takes, its chronicle and counts.
// Written before the code, from the ways it can go wrong:
// - a company topic takes an article about another company that only mentions it (several subjects,
//   its name nowhere in the title), or drops one about it whose title names it in English, in another
//   case, next to Chinese text, or without its name (it is the article's only subject);
// - a Latin name matches inside another word ("Metadata" is not Meta); a headline naming a company
//   that is not a subject of the article gets in;
// - a financial-market topic stops taking its tags;
// - the chronicle keeps a month's latest events instead of its most important ones, lists one event
//   twice across months, files 00:30 Beijing time on the 1st under the previous month, links an event
//   with a public story page to the article, or counts a withdrawn report's source;
// - a company's chronicle (its milestones) shows a tutorial, somebody else's commentary or another
//   organisation's analysis (even from an official source), or drops confirmed earnings and buybacks;
// - withdrawn or not yet released articles appear in a list, a count or the chronicle;
// - an article or story page names a topic its reports do not belong to;
// - a topic without content has no page, or an unknown slug or a page past the end has one.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { beijingDate } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadTopicPage, listTopicSummaries, topicsOfStory } from "@aihot/backend/publication/topics";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const OFFICIAL = `test-topics-official-${T}`;
const MEDIA = `test-topics-media-${T}`;
const OTHER = `test-topics-other-${T}`;
const TENCENT_BLOG = `test-topics-tencent-blog-${T}`;
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, first_party, next_fetch_at) VALUES
    (${OFFICIAL}, 'Official', 'rss', 'T1', 'editorial', true, '2100-01-01'),
    (${MEDIA}, 'Media', 'rss', 'T2', 'editorial', false, '2100-01-01'),
    (${OTHER}, 'Other media', 'rss', 'T2', 'editorial', false, '2100-01-01')`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, first_party, owner_entity_id, next_fetch_at) VALUES
    (${TENCENT_BLOG}, 'Tencent blog', 'rss', 'T1', 'editorial', true, 'tencent', '2100-01-01')`;
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

let n = 0;
interface Report {
  source?: string;
  at: Date;
  title: string;
  originalTitle?: string;
  subjects?: string[];
  tags?: string[];
  score?: number;
  selected?: boolean;
  fact?: number;
  category?: string;
}

/** A published report; `fact` links it to a fact before publishing, as grouping would. */
async function report(r: Report): Promise<string> {
  n += 1;
  const { articleId } = await upsertMaterial({
    sourceId: r.source ?? MEDIA, url: `https://example.com/topics-${T}-${n}`, title: r.originalTitle ?? r.title, bodyText: "body", bodyHtml: "<p>body</p>", bodyStatus: "ok", via: "fetch", publishedAt: r.at,
  });
  await sql`UPDATE articles SET discovered_at = ${r.at}, timeline_at = ${r.at}, grouped_at = now() WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, subjects, tags)
            VALUES (${articleId}, 1, 'rule', 'pass', ${r.category ?? "company"}, ${r.title}, ${`摘要 ${n}`}, ${r.score ?? 80}, ${r.selected ?? true}, ${r.subjects ?? []}, ${[r.category === "capital" ? "资本运作" : r.category === "analysis" ? "观点/解读" : "财报/业绩", ...(r.tags ?? [])]})`;
  if (r.fact) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${r.fact}, ${articleId}, 'report')`;
  await publishArticle(articleId, { releasedAt: new Date(r.at.getTime() + 60_000) });
  return articleId;
}

async function story(title: string): Promise<{ id: number; publicId: string }> {
  const publicId = randomUUID();
  const [s] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES (${publicId}, ${title}, now(), now()) RETURNING id`;
  return { id: s!.id, publicId };
}

async function fact(storyId: number | null, title: string): Promise<number> {
  const [f] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${`f-${T}-${randomUUID()}`}, ${storyId}, ${title}) RETURNING id`;
  return f!.id;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);
const page = async (slug: string, p = 1) => {
  const data = await loadTopicPage(slug, p, new Date());
  assert.ok(data, `${slug} page ${p}`);
  return data;
};
/** Every article of a topic, over all its pages. */
async function members(slug: string): Promise<string[]> {
  const first = await page(slug);
  const out = ids(first.items);
  for (let p = 2; p <= first.pageCount; p++) out.push(...ids((await page(slug, p)).items));
  return out;
}

test("a company topic takes the articles about it, not the ones that only mention it", async () => {
  const about = await report({ at: hoursAgo(30), title: `新季度收入增长 ${T}`, subjects: ["apple"] });
  const product = await report({ at: hoursAgo(31), title: `经营现金流改善 ${T}`, subjects: ["apple"] });
  const english = await report({ at: hoursAgo(32), title: `季度财报公布 ${T}`, originalTitle: `Apple reports quarterly earnings ${T}`, subjects: ["apple", "microsoft"] });
  const subpoena = await report({ at: hoursAgo(33), title: `加州检察长向 Microsoft 发出传票 ${T}`, subjects: ["microsoft", "apple", "tencent"] });
  const lowerCase = await report({ at: hoursAgo(34), title: `microsoft 公布季度财报 ${T}`, subjects: ["microsoft", "apple"] });
  const pact = await report({ at: hoursAgo(35), title: `二十余家上市公司签署协议 ${T}`, subjects: ["microsoft", "apple", "alphabet"] });
  const metadata = await report({ at: hoursAgo(36), title: `Metadata 标准发布，Microsoft 参与 ${T}`, subjects: ["meta", "microsoft"] });
  const adjacent = await report({ at: hoursAgo(37), title: `披露Meta的季度财报 ${T}`, subjects: ["meta", "microsoft"] });
  const headline = await report({ at: hoursAgo(38), title: `Apple 被一篇盘点提到 ${T}`, subjects: ["alphabet"] });
  const agent = await report({ at: hoursAgo(39), title: `美国公布利率决定 ${T}`, tags: ["利率"] });

  const apple = await members("apple");
  for (const id of [about, product, english]) assert.ok(apple.includes(id), "about Apple");
  for (const id of [subpoena, lowerCase, pact, headline]) assert.ok(!apple.includes(id), "only mentions Apple");
  const microsoft = await members("microsoft");
  for (const id of [subpoena, lowerCase, metadata]) assert.ok(microsoft.includes(id), "about Microsoft");
  for (const id of [english, pact]) assert.ok(!microsoft.includes(id), "only mentions Microsoft");
  const meta = await members("meta");
  assert.ok(meta.includes(adjacent), "Meta next to Chinese text");
  assert.ok(!meta.includes(metadata), "Metadata is not Meta");
  assert.ok((await members("rates")).includes(agent), "a market direction takes its tag");

  // The article page names the topics it belongs to.
  const topicsOf = async (id: string) => {
    const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
    return (JSON.parse(res.body) as { topics: Array<{ slug: string }> }).topics.map((t) => t.slug);
  };
  assert.deepEqual(await topicsOf(about), ["apple", "earnings"]);
  assert.deepEqual(await topicsOf(subpoena), ["microsoft", "earnings"]);
  assert.deepEqual(await topicsOf(pact), ["earnings"]);
  assert.deepEqual(await topicsOf(agent), ["rates", "earnings"]);
});

test("the chronicle keeps each month's most important events, once each, in Beijing months", async () => {
  // The 1st of last month, 00:30 in Beijing (16:30 UTC the day before).
  const today = beijingDate(Date.now());
  const [y, m] = today.split("-").map(Number) as [number, number];
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const firstOfLastMonth = new Date(`${lastMonth}-01T00:30:00+08:00`);
  const at = (minutes: number) => new Date(firstOfLastMonth.getTime() + minutes * 60_000);

  const launch = await story(`利率相关财报公布 ${T}`);
  const launchFact = await fact(launch.id, "公布季度财报");
  const official = await report({ source: OFFICIAL, at: at(0), title: `利率相关财报公布 ${T}`, tags: ["利率"], score: 95, fact: launchFact });
  await report({ source: OTHER, at: at(5), title: `媒体：利率相关财报披露 ${T}`, tags: ["利率"], score: 70, fact: launchFact });
  const gone = await report({ source: MEDIA, at: at(6), title: `撤回的报道：利率相关财报 ${T}`, tags: ["利率"], score: 70, fact: launchFact });
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${gone}`;
  // A second development of the same story the same month.
  const followFact = await fact(launch.id, "后续财报披露");
  await report({ at: at(600), title: `利率相关财报后续披露 ${T}`, tags: ["利率"], score: 60, fact: followFact });
  const minor: string[] = [];
  // Five more eligible monetary-policy events of lower importance; the
  // latest one is the least important.
  for (let i = 0; i < 5; i++) minor.push(await report({ at: at(1000 + i * 60), title: `利率政策决定 ${i} ${T}`, tags: ["利率"], score: 85 - i, category: "macro" }));

  const data = await page("rates");
  const month = data.chronicle.find((c) => c.month === lastMonth);
  assert.ok(month, "the 1st at 00:30 Beijing time belongs to its own month");
  const listed = month.events.map((e) => e.id);
  assert.equal(month.events.length, 5, "five events a month");
  assert.equal(listed.filter((id) => id === official).length, 1, "the story once, by its most important report");
  assert.ok(!listed.includes(minor[4]!), "the least important event drops out, though it is the latest");
  const lead = month.events.find((e) => e.id === official)!;
  assert.equal(lead.href, `/story/${launch.publicId}`, "an event with a public story links to it");
  assert.ok(month.events.find((e) => e.id === minor[0])!.href.startsWith("/items/"), "an event without a story links to the article");
  assert.deepEqual(listed, [...month.events].sort((a, b) => b.at.localeCompare(a.at)).map((e) => e.id), "newest first within a month");
  assert.equal(month.events.find((e) => e.id === minor[0])?.kind, "macro", "a market direction keeps substantial macro events");
  assert.deepEqual(await topicsOfStory(launch.id), [{ slug: "rates", name: "利率" }, { slug: "earnings", name: "财报与业绩" }], "the story page names the topic of its reports");
});

test("a company's band keeps confirmed earnings and capital actions over commentary and routine news", async () => {
  const today = beijingDate(Date.now());
  const [y, m] = today.split("-").map(Number) as [number, number];
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const at = (day: number) => new Date(`${lastMonth}-${String(day).padStart(2, "0")}T12:00:00+08:00`);
  const tencent = { subjects: ["tencent"] };
  const model = await report({ ...tencent, at: at(3), title: `腾讯公布 2026 Q3 财报 ${T}`, category: "company", score: 90 });
  const product = await report({ ...tencent, at: at(5), title: `腾讯宣布回购股份 ${T}`, category: "capital", score: 85 });
  const news = await report({ ...tencent, at: at(7), title: `腾讯经营简讯 ${T}`, category: "company", score: 80 });
  const research = await report({ ...tencent, source: TENCENT_BLOG, at: at(9), title: `腾讯财报现金流分析 ${T}`, category: "analysis", score: 95 });
  const tutorial = await report({ ...tencent, source: TENCENT_BLOG, at: at(11), title: `腾讯会计指标解读指南 ${T}`, category: "analysis", score: 99 });
  const commentary = await report({ ...tencent, at: at(13), title: `评论：腾讯的路线之争 ${T}`, category: "analysis", score: 98 });
  const othersResearch = await report({ ...tencent, source: OFFICIAL, at: at(15), title: `另一家机构对腾讯财报的分析 ${T}`, category: "analysis", score: 97 });

  const data = await page("tencent");
  assert.deepEqual(data.chronicle, [], "a company has its band instead of the monthly rail");
  const month = data.milestones.filter((ms) => ms.date.startsWith(lastMonth));
  const listed = month.map((ms) => ms.href);
  for (const id of [tutorial, commentary, othersResearch, research]) assert.ok(!listed.includes(`/items/${id}`), "no tutorials, nor others' commentary or research");
  assert.deepEqual([...listed].sort(), [model, product].map((id) => `/items/${id}`).sort(), "earnings and buybacks; routine company news does not fill an empty slot");
  assert.ok(!listed.includes(`/items/${news}`));
  assert.deepEqual(month.map((ms) => ms.kind), ["earnings", "buyback"], "oldest first, each with its kind");
  assert.deepEqual(month.map((ms) => ms.major), [false, false], "nothing picked up automatically is set in bold");
  assert.equal((await page("rates")).milestones.length, 0, "a direction has its rail, not a band");
});

test("a cross-month event keeps its first date while all selected progress stays readable", async () => {
  const current = beijingDate(Date.now()).slice(0, 7);
  const after = new Date(new Date(`${current}-01T00:00:00+08:00`).getTime() - 3600_000);
  const representativeMonth = beijingDate(after).slice(0, 7);
  const before = new Date(new Date(`${representativeMonth}-01T00:00:00+08:00`).getTime() - 3600_000);
  const launch = await story(`亚马逊回购股份 ${T}`);
  const originalFact = await fact(launch.id, "正式发布");
  const followFact = await fact(launch.id, "后续报道");
  const independent = await story(`亚马逊独立资本动作 ${T}`);
  const independentFact = await fact(independent.id, "另一件事");
  const common = { subjects: ["amazon"], category: "capital", tags: ["资本运作"] };
  const earlier = await report({ ...common, at: before, title: `亚马逊宣布回购股份 ${T}`, score: 80, fact: originalFact });
  const representative = await report({ ...common, at: after, title: `亚马逊回购股份详细报道 ${T}`, score: 95, fact: followFact });
  const other = await report({ ...common, at: after, title: `亚马逊宣布收购资产 ${T}`, score: 80, fact: independentFact });

  for (const slug of ["amazon", "capital-actions"]) {
    const data = await page(slug);
    const entries = data.topic.group === "company"
      ? data.milestones.map((m) => ({ href: m.href, title: m.headline, month: m.date.slice(0, 7) }))
      : data.chronicle.flatMap((m) => m.events.map((e) => ({ href: e.href, title: e.title, month: m.month })));
    const kept = entries.filter((e) => e.href === `/story/${launch.publicId}`);
    assert.deepEqual(kept, [{ href: `/story/${launch.publicId}`, title: `亚马逊回购股份详细报道 ${T}`, month: beijingDate(before).slice(0, 7) }], `${slug}: one event, the earliest qualifying publication`);
    assert.ok(entries.some((e) => e.href === `/story/${independent.publicId}`), "a different event remains independent");
    const selected = await members(slug);
    for (const id of [earlier, representative, other]) assert.ok(selected.includes(id), "selected progress is not removed by chronicle deduplication");
  }
});

test("withdrawn articles stay out of lists, counts and the chronicle band", async () => {
  const kept = await report({ at: hoursAgo(5), title: `招商银行公布季度财报 ${T}`, subjects: ["cmb"] });
  const withdrawn = await report({ at: hoursAgo(4), title: `招商银行另一季度财报（撤回） ${T}`, subjects: ["cmb"] });
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${withdrawn}`;

  const data = await page("cmb");
  assert.deepEqual(ids(data.items), [kept]);
  assert.equal(data.topic.total, 1);
  assert.deepEqual(data.milestones.map((m) => m.href), [`/items/${kept}`], "the chronicle band");
  const summary = (await listTopicSummaries()).topics.find((t) => t.slug === "cmb")!;
  assert.equal(summary.latest?.title, `招商银行公布季度财报 ${T}`, "the index shows the newest public article");
});

test("every topic has a page; unknown topics and pages past the end have none", async () => {
  const empty = await page("yili");
  assert.equal(empty.topic.indexable, false, "a topic without content is not indexed");
  assert.deepEqual(empty.items, []);
  assert.equal(await loadTopicPage("not-a-topic", 1, new Date()), null);
  assert.equal(await loadTopicPage("yili", 2, new Date()), null);
  const index = await app.inject({ method: "GET", url: "/api/site/topics" });
  const body = JSON.parse(index.body) as { groups: Array<{ key: string }>; topics: Array<{ slug: string }> };
  assert.deepEqual(body.groups.map((g) => g.key), ["company", "field", "genre"]);
  assert.equal(body.topics.length, 34);
});
