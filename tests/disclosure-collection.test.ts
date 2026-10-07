// Official issuer metadata keeps identity and deduplication, then queues direct document extraction.
import "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";

const pack = JSON.parse(readFileSync(`${REPO_ROOT}/industry/sources.json`, "utf8")).sources;
const template = pack.find((s: any) => s.id === "finance-disclosure-szse");
let revision = 0;
const server = http.createServer((_req, res) => {
  res.setHeader("content-type", "application/json");
  const item = (code: string, title: string, id: string) => ({ secCode: [code], secName: [code === "300750" ? "宁德时代" : code === "000333" ? "美的集团" : "其他公司"], title, id, publishTime: "2026-10-01 00:00:00", attachPath: `/disc/${id}.PDF` });
  res.end(JSON.stringify({ data: [
    item("300750", "宁德时代：关于回购股份的公告", "catl-buyback"),
    item("000333", "美的集团：关于与宁德时代合作的重大合同公告", "midea-contract"),
    item("000001", "其他公司：关于与宁德时代合作的公告", "unrelated"),
    item("300750", "宁德时代：法律意见书", "legal"),
    ...(revision ? [item("300750", "宁德时代：业绩预告", "new-earnings")] : []),
  ] }));
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
config.allowPrivateNetworkFetch = true;
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await stopBoss(); await closeDb(); });

test("watchlist filtering, new notices and duplicate suppression run through collection", async () => {
  const id = "disclosure-live-shape";
  const settings = { ...template.config, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
  await sql`INSERT INTO sources(id,name,kind,config,tier,first_party,participation_mode,cursor)
    VALUES(${id},${template.name},'json_list',${sql.json(settings)},'T1',true,'editorial',${sql.json({ initializedAt: new Date().toISOString() })})`;
  const first = await collectSource(id);
  assert.equal(first.status, "ok");
  assert.equal(first.created, 2);
  const second = await collectSource(id);
  assert.equal(second.created, 0);
  assert.equal(second.revised, 0);
  revision = 1;
  assert.equal((await collectSource(id)).created, 1);
  const rows = await sql`SELECT id,title,excerpt,body_text,body_status,published_at FROM articles WHERE source_id=${id} ORDER BY title`;
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.body_status === "pending" && !r.body_text && r.excerpt.includes("未读取公告正文")));
  assert.ok(rows.every(r => r.published_at.toISOString() === "2026-09-30T16:00:00.000Z"));
  const contract = rows.find(r => r.title.startsWith("美的集团"))!;
  assert.match(contract.excerpt, /发行人：美的集团；证券：SZSE:000333/);
  const jobs = await sql`SELECT name,data FROM pgboss.job WHERE data->>'articleId' = ANY(${rows.map(r => r.id)}::text[])`;
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every(j => j.name === "content.extract-body"), "metadata queues the free official document extraction");
});

test("seed includes all official sources and preserves an existing administrator configuration", async () => {
  const seed = () => execFileSync(process.execPath, [`${REPO_ROOT}/scripts/seed.ts`], { env: process.env, stdio: "pipe" });
  seed();
  const sources = await sql`SELECT id,owner_entity_id,site_fulltext,syndicate_fulltext FROM sources WHERE id=ANY(${pack.map((s: any) => s.id)}::text[])`;
  assert.equal(sources.length, pack.length);
  assert.ok(sources.every(s => !s.site_fulltext && !s.syndicate_fulltext));
  const watch = JSON.parse(readFileSync(`${REPO_ROOT}/industry/watchlist.json`, "utf8")).companies;
  const szse = watch.filter((w: any) => w.ticker.startsWith("SZSE:") && template.config.bodyJson.stock.includes(w.ticker.split(":")[1])).map((w: any) => w.id);
  assert.deepEqual([...new Set(sources.map(s => s.owner_entity_id).filter(Boolean).concat(szse))].sort(), watch.map((w: any) => w.id).sort());
  await sql`UPDATE sources SET enabled=false, config='{"feedUrl":"https://example.org/admin-edited"}'::jsonb WHERE id='finance-fed'`;
  seed();
  const [fed] = await sql`SELECT enabled,config FROM sources WHERE id='finance-fed'`;
  assert.equal(fed!.enabled, false);
  assert.equal(fed!.config.feedUrl, "https://example.org/admin-edited");
});
