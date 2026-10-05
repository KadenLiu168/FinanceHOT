// Columnar APIs and dated HTML tables need explicit mapping without changing ordinary sources.
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import { fetchJsonList } from "@aihot/backend/sources/json-list";
import { fetchWebList, fromHtml } from "@aihot/backend/sources/web-list";
import type { SourceRow } from "@aihot/backend/sources/types";

const rows = {
  form: ["4", "424B2", "10-Q", "8-K"],
  accession: ["0001-26-000001", "0001-26-000002", "0001-26-000003", "0001-26-000004"],
  accepted: ["2026-10-01T20:16:19Z", "2026-10-01T20:17:19Z", "2026-09-30T13:05:00Z", "2026-09-30T13:06:00Z"],
};
const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/list")) {
    res.setHeader("content-type", "text/html");
    res.end(`<a href="/shared.pdf">Shared announcement</a><a href="/${req.url.endsWith("two") ? "english" : "chinese"}.pdf">Language-specific announcement</a>`);
    return;
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(req.url === "/ownership" ? { filings: { recent: { form: ["4"], accessionNumber: ["0001193125-26-409451"], acceptanceDateTime: ["2026-09-30T23:52:20Z"], primaryDocument: ["ownership.xml"] } } }
    : req.url === "/unequal" ? { rows: { ...rows, accepted: [rows.accepted[0]] } }
    : req.url === "/invalid" ? { rows: { ...rows, form: "4" } }
    : req.url === "/ordinary" ? [{ title: "An ordinary headline", url: "https://example.org/article", date: "2026-10-01 09:30:00", summary: "Official summary" }]
    : { rows }));
});

await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previous = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => { config.allowPrivateNetworkFetch = previous; await new Promise<void>(resolve => server.close(() => resolve())); });
const source = (settings: Record<string, unknown>) => ({ id: "mapping", kind: "json_list", participation_mode: "editorial", config: settings }) as SourceRow;
const mapping = {
  url: base, itemsPath: "rows", itemsColumnar: true,
  allowValues: { path: "form", values: ["10-Q", "8-K", "4"] },
  titleTemplate: "Issuer: {raw:form}",
  summaryTemplate: "Official listing metadata; issuer=Issuer; form={raw:form}; submitted={raw:accepted}; document body not fetched.",
  summaryIsBody: true, urlTemplate: "https://example.org/{accession}.txt", publishedAtPath: "accepted", externalIdPath: "accession",
};

test("ownership metadata identifies the associated watchlist company without inventing its issuer role", async () => {
  const pack = JSON.parse(readFileSync(`${REPO_ROOT}/industry/sources.json`, "utf8")).sources;
  const settings = { ...pack.find((s: any) => s.id === "finance-disclosure-berkshire").config, url: base + "/ownership" };
  const [item] = await fetchJsonList(source(settings));
  assert.match(item!.bodyText!, /官方关联查询公司：伯克希尔哈撒韦/);
  assert.match(item!.bodyText!, /角色未核验/);
  assert.ok(!item!.bodyText!.includes("发行人：伯克希尔哈撒韦"));
  assert.equal(item!.url, "https://www.sec.gov/Archives/edgar/data/1067983/0001193125-26-409451.txt");
});

test("one source merges complementary lists and keeps one copy of a shared document URL", async () => {
  const settings = { url: base + "/list-one", additionalUrls: [base + "/list-two"], parseMode: "html" };
  assertSupportedConfig("web_list", settings);
  const items = await fetchWebList({ ...source(settings), kind: "web_list" });
  assert.deepEqual(items.map(x => new URL(x.url).pathname), ["/shared.pdf", "/chinese.pdf", "/english.pdf"]);
});

test("the issuer configuration never turns a language placeholder into a buyback announcement", () => {
  const pack = JSON.parse(readFileSync(`${REPO_ROOT}/industry/sources.json`, "utf8")).sources;
  const settings = pack.find((s: any) => s.id === "finance-disclosure-aia").config;
  const html = '<table class="table"><tbody><tr><td class="headline">Share Buyback</td><td class="doc-link"><a href="/listedco/listconews/sehk/placeholder.htm">發行人剛在本網站英文版面發布一項公告，相應中文版本或會／或不會在本版面發布。</a></td></tr><tr><td class="headline">Dividend</td><td class="release-time">30/09/2026 17:30</td><td class="doc-link"><a href="/listedco/listconews/sehk/dividend.pdf">Forfeiture of Unclaimed Interim Dividend for 2020</a></td></tr></tbody></table>';
  const items = fromHtml(html, settings.url, { ...source(settings), kind: "web_list" });
  assert.equal(items.length, 1);
  assert.ok(items[0]!.url.endsWith("/dividend.pdf"));
});
test("columnar rows retain field alignment and filter forms before ingestion", async () => {
  assertSupportedConfig("json_list", mapping);
  const items = await fetchJsonList(source(mapping));
  assert.deepEqual(items.map(x => [x.title, x.url, x.publishedAt?.toISOString()]), [
    ["Issuer: 4", "https://example.org/0001-26-000001.txt", "2026-10-01T20:16:19.000Z"],
    ["Issuer: 10-Q", "https://example.org/0001-26-000003.txt", "2026-09-30T13:05:00.000Z"],
    ["Issuer: 8-K", "https://example.org/0001-26-000004.txt", "2026-09-30T13:06:00.000Z"],
  ]);
  assert.ok(items.every(x => x.bodyStatus === "ok" && x.bodyText?.includes("document body not fetched")));
  assert.deepEqual(items.map(x => (x.raw as Record<string, unknown>)?.externalId), [rows.accession[0], rows.accession[2], rows.accession[3]]);
  assert.deepEqual(await fetchJsonList(source({ ...mapping, allowValues: { path: "form", values: ["DEF 14A"] } })), []);
  await assert.rejects(fetchJsonList(source({ ...mapping, titleTemplate: "{raw:missing}" })), /no items mapped/);
});

test("malformed columnar data fails instead of pairing an accession with the wrong date", async () => {
  await assert.rejects(fetchJsonList(source({ ...mapping, url: base + "/unequal" })), /columnar.*length/);
  await assert.rejects(fetchJsonList(source({ ...mapping, url: base + "/invalid" })), /columnar.*arrays/);
});

test("an explicit JSON timestamp offset works independently of the host timezone", async () => {
  const settings = { url: base + "/ordinary", titlePaths: ["title"], urlTemplate: "{raw:url}", publishedAtPath: "date", publishedAtUtcOffset: "+08:00", summaryPaths: ["summary"] };
  assertSupportedConfig("json_list", settings);
  const [item] = await fetchJsonList(source(settings));
  assert.equal(item!.publishedAt?.toISOString(), "2026-10-01T01:30:00.000Z");
  assert.equal(item!.excerpt, "Official summary");
  assert.equal(item!.bodyStatus, "pending", "existing sources still fetch detail unless summaryIsBody is explicit");
});

test("HTML listing summaries include the issuer and category, and day-first dates are explicit", () => {
  const settings = { url: "https://example.org/list", itemSelector: "tr", linkSelector: "a", titleSelector: "a", publishedAtSelector: "time", publishedAtFormat: "dmy", summarySelector: "tr", summaryIsBody: true };
  assertSupportedConfig("web_list", settings);
  const html = '<table><tr><td>Issuer 00700</td><td>Share Buyback</td><td><time>05/10/2026 17:43</time></td><td><a href="/notice.pdf">Next Day Disclosure Return</a></td></tr></table>';
  const [item] = fromHtml(html, settings.url, { ...source(settings), kind: "web_list" });
  assert.equal(item!.publishedAt?.toISOString(), "2026-10-05T09:43:00.000Z");
  assert.match(item!.bodyText!, /Issuer 00700.*Share Buyback/);
  assert.equal(item!.bodyStatus, "ok");
  const [dated] = fromHtml(html.replace('<time>', '<time datetime="2026-10-05T17:43:00+08:00">'), settings.url, { ...source(settings), kind: "web_list" });
  assert.equal(dated!.publishedAt?.toISOString(), "2026-10-05T09:43:00.000Z", "explicit ISO attributes retain their timezone");
  const [ordinary] = fromHtml(html, settings.url, { ...source({ ...settings, summarySelector: undefined, summaryIsBody: undefined }), kind: "web_list" });
  assert.equal(ordinary!.bodyText, undefined);
  assert.equal(fromHtml(html.replace("05/10/2026", "31/02/2026"), settings.url, { ...source(settings), kind: "web_list" })[0]!.publishedAt, null);
});
