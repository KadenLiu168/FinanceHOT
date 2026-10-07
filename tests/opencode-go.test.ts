import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { translateArticle } from "@aihot/backend/editorial/translate";
import { groupArticle } from "@aihot/backend/events/group";
import { publishArticle } from "@aihot/backend/publication/publish";
import { randomUUID } from "node:crypto";
import { chatJson, ModelOutputError } from "@aihot/backend/providers/llm";
import { BudgetExceededError, ProviderRejectedError, ReceiptUnknownError } from "@aihot/backend/providers/receipts";

const dispatcher = getGlobalDispatcher();
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);
const seen: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
let content = '{"ok":true}';
let status = 200;
let pipeline = false;
let translation = false;
let grouping = false;
const usage = { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 };
for (const origin of ["https://opencode.ai", "https://other.invalid"]) {
  agent.get(origin).intercept({ path: "/zen/go/v1/chat/completions", method: "POST" }).reply((opts) => {
    const headers = new Headers(opts.headers as HeadersInit);
    const body = JSON.parse(String(opts.body));
    seen.push({ body, headers: Object.fromEntries(headers) });
    let answer = content;
    if (translation) {
      const user = JSON.parse(body.messages.at(-1).content);
      answer = JSON.stringify({ t: user.segments.map(() => "译文。") });
    }
    if (grouping) {
      const user = body.messages.at(-1).content;
      answer = JSON.stringify(user.includes("【报道 A】")
        ? { a: "回购", b: "回购", relation: "SAME_OCCURRENCE", difference: "", confidence: 1 }
        : { query: "公司回购", decisions: [...user.matchAll(/【候选 (C\d+)】/g)].map((m: RegExpMatchArray) => ({ id: m[1], relation: "SAME_OCCURRENCE", confidence: 1, note: "" })), selection: { addsValue: true, reason: "fixture news" } });
    }
    if (pipeline) {
      const system = body.messages[0]?.role === "system" ? body.messages[0].content : "";
      const data = system.includes("宽召回") ? { label: "PASS", reason: "测试" }
        : system.includes("事件注意力评分器") ? { attentionScore: 80 }
        : system.includes("金融内容编辑") ? { itemType: "capital_event", authorRole: "principal", tags: ["资本运作"], editorialJudgment: "理由", titleZh: "Go 标题", summaryZh: "Go 摘要。第二句。" }
        : system.includes("资料结构化助手") ? { category: "capital", tags: ["资本运作"], subjects: [], fact: null }
        : null;
      assert.ok(data, "unexpected pipeline prompt");
      answer = JSON.stringify(data);
    }
    return { statusCode: status, data: JSON.stringify({ id: "go-stub", choices: [{ message: { content: answer } }], usage }) };
  }).persist();
}

beforeEach(() => {
  Object.assign(process.env, {
    LLM_PROVIDER: "opencode-go", LLM_BASE_URL: "https://opencode.ai/zen/go/v1",
    LLM_API_KEY: "go-test-key", LLM_MODEL: "deepseek-v4.1-flash", LLM_EXTRA_JSON: '{"thinking":{"type":"disabled"}}',
    LLM_JSON_MODE: "false", LLM_VISION: "false",
  });
  content = '{"ok":true}';
  status = 200;
  pipeline = false;
  translation = false;
  grouping = false;
});
after(async () => {
  setGlobalDispatcher(dispatcher);
  await agent.close();
  await stopBoss();
  await closeDb();
});

const ask = (subject: string, extra: Partial<Parameters<typeof chatJson>[0]> = {}) => chatJson({
  model: "default", purpose: "opencode_test", subject, promptVersion: "go-test-v1", system: "Return JSON.",
  user: `input ${subject}`, schema: z.object({ ok: z.boolean() }), ...extra,
});

test("Go sends its model, auth, client and stable task session; responses and usage survive receipt reuse", async () => {
  const subject = `go-${tag()}`;
  const sessionKey = `article:${tag()}@1`;
  const start = seen.length;
  const first = await ask(subject, { sessionKey });
  const second = await ask(subject, { sessionKey });
  assert.equal(seen.length, start + 1);
  assert.equal(second.receiptId, first.receiptId);
  assert.equal(second.reused, true);
  assert.deepEqual(first.data, { ok: true });
  assert.deepEqual(first.usage, usage);
  assert.equal(seen.at(-1)!.body.model, "deepseek-v4.1-flash");
  assert.equal(seen.at(-1)!.headers.authorization, "Bearer go-test-key");
  assert.equal(seen.at(-1)!.headers["user-agent"], "FinanceHOT/1.0");
  const session = seen.at(-1)!.headers["x-opencode-session"];
  assert.match(session!, /^[a-f0-9]{64}$/);
  assert.equal(seen.at(-1)!.body.response_format, undefined);
  assert.deepEqual(seen.at(-1)!.body.thinking, { type: "disabled" });
  await ask(`${subject}:verify`, { sessionKey });
  assert.equal(seen.at(-1)!.headers["x-opencode-session"], session);
  await ask(`${subject}:next`, { sessionKey: `${sessionKey}-next` });
  assert.notEqual(seen.at(-1)!.headers["x-opencode-session"], session);
  const [row] = await sql`SELECT service, response, request FROM receipts WHERE id=${first.receiptId}`;
  assert.equal(row!.service, "llm");
  assert.equal(row!.response.id, "go-stub");
  assert.ok(!JSON.stringify(row!.request).includes("go-test-key"));
});

test("Go receipt identity separates provider, endpoint, JSON mode and actual request options", async () => {
  const subject = `identity-${tag()}`;
  const first = await ask(subject);
  process.env.LLM_BASE_URL += "/";
  assert.equal((await ask(subject)).receiptId, first.receiptId, "trailing slash has no effect");
  process.env.LLM_BASE_URL = "https://other.invalid/zen/go/v1";
  assert.notEqual((await ask(subject)).receiptId, first.receiptId);
  process.env.LLM_BASE_URL = "https://opencode.ai/zen/go/v1";
  process.env.LLM_JSON_MODE = "true";
  const json = await ask(subject);
  assert.notEqual(json.receiptId, first.receiptId);
  assert.deepEqual(seen.at(-1)!.body.response_format, { type: "json_object" });
  const text = await ask(subject, { json: false });
  assert.equal(text.receiptId, first.receiptId, "identical actual body can reuse");
  process.env.LLM_PROVIDER = "openai-compatible";
  assert.notEqual((await ask(subject)).receiptId, json.receiptId);
  assert.equal(seen.at(-1)!.headers["x-opencode-session"], undefined);
});

test("plain title/summary output keeps the custom parser", async () => {
  content = "title_zh: 标题\nsummary_zh: 摘要";
  const res = await ask(`text-${tag()}`, { json: false, parse: (text) => ({ ok: text.includes("title_zh:") }) });
  assert.deepEqual(res.data, { ok: true });
});

test("task sessions survive a new process", async () => {
  const sessionKey = `restart-${tag()}`;
  await ask(`parent-${tag()}`, { sessionKey });
  const expected = seen.at(-1)!.headers["x-opencode-session"];
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
    import { MockAgent, setGlobalDispatcher } from 'undici';
    import { z } from 'zod';
    import { chatJson } from '@aihot/backend/providers/llm';
    import { closeDb } from '@aihot/backend/db';
    const agent = new MockAgent(); agent.disableNetConnect(); setGlobalDispatcher(agent);
    agent.get('https://opencode.ai').intercept({path:'/zen/go/v1/chat/completions',method:'POST'}).reply(opts => {
      console.log(new Headers(opts.headers).get('x-opencode-session'));
      return {statusCode:200,data:JSON.stringify({choices:[{message:{content:'{"ok":true}'}}]})};
    });
    try {
      await chatJson({model:'default',purpose:'opencode_test',subject:'child-'+process.argv[1],sessionKey:process.argv[1],
        promptVersion:'restart-v1',system:'Return JSON.',user:'test',schema:z.object({ok:z.boolean()})});
    } finally { await closeDb(); await agent.close(); }
  `, sessionKey]);
  assert.equal(stdout.trim(), expected);
});

test("invalid Go config and multimodal input are rejected before reserving a receipt", async () => {
  const subject = `invalid-${tag()}`;
  const start = seen.length;
  for (const model of ["deepseek-flash", "opencode-go/deepseek-v4.1-flash"]) {
    process.env.LLM_MODEL = model;
    await assert.rejects(ask(subject), /deepseek-v4\.1-flash/);
  }
  process.env.LLM_MODEL = "deepseek-v4.1-flash";
  for (const value of ["[]", "null", "3", '{"model":"other"}', '{"messages":[]}', '{"max_tokens":1}', '{"response_format":{}}']) {
    process.env.LLM_EXTRA_JSON = value;
    await assert.rejects(ask(subject), /LLM_EXTRA_JSON/);
  }
  process.env.LLM_EXTRA_JSON = "{}";
  process.env.LLM_PROVIDER = "unknown";
  await assert.rejects(ask(subject), /LLM_PROVIDER/);
  process.env.LLM_PROVIDER = "opencode-go";
  process.env.LLM_VISION = "true";
  await assert.rejects(ask(subject), /LLM_VISION/);
  process.env.LLM_VISION = "false";
  await assert.rejects(ask(subject, { user: [{ type: "image_url", image_url: { url: "https://image.invalid/a.png" } }] }), /text|vision|image/i);
  for (const base of ["not-a-url", "ftp://opencode.ai/zen/go/v1", "https://user:pass@opencode.ai/v1", "https://opencode.ai/v1?key=secret", "https://opencode.ai/v1#fragment", "https://opencode.ai/v1?", "https://opencode.ai/v1#"]) {
    process.env.LLM_BASE_URL = base;
    await assert.rejects(ask(subject), /LLM_BASE_URL/);
  }
  process.env.LLM_BASE_URL = "";
  await assert.rejects(ask(subject), /not configured/);
  assert.equal(seen.length, start);
  const [row] = await sql`SELECT count(*)::int AS n FROM receipts WHERE subject=${subject}`;
  assert.equal(row!.n, 0);
});

test("Go output failures and HTTP refusals retain existing receipt states", async () => {
  content = "not JSON";
  const subject = `bad-output-${tag()}`;
  await assert.rejects(ask(subject), ModelOutputError);
  const [row] = await sql`SELECT status FROM receipts WHERE subject=${subject}`;
  assert.equal(row!.status, "failed");
  for (const code of [401, 429, 503]) {
    status = code;
    await assert.rejects(ask(`http-${code}-${tag()}`), (e: unknown) => e instanceof ProviderRejectedError && e.status === code && e.retryable === (code !== 401));
  }
});

test("budget refusal and disabled model calls send no request", async () => {
  const start = seen.length;
  const original = config.modelCallsEnabled;
  config.modelCallsEnabled = false;
  try { await assert.rejects(ask(`disabled-${tag()}`), /disabled/); }
  finally { config.modelCallsEnabled = original; }
  const [budget] = await sql`SELECT per_minute FROM budgets WHERE service='llm'`;
  await sql`UPDATE budgets SET per_minute=0 WHERE service='llm'`;
  try { await assert.rejects(ask(`budget-${tag()}`), BudgetExceededError); }
  finally { await sql`UPDATE budgets SET per_minute=${budget!.per_minute} WHERE service='llm'`; }
  assert.equal(seen.length, start);
});

test("an in-flight timeout remains unknown and is not automatically resent", async () => {
  agent.get("https://opencode.ai").intercept({ path: "/slow/chat/completions", method: "POST" })
    .reply(200, { choices: [{ message: { content: '{"ok":true}' } }] }).delay(100);
  process.env.LLM_BASE_URL = "https://opencode.ai/slow";
  const subject = `timeout-${tag()}`;
  await assert.rejects(ask(subject, { timeoutMs: 10 }), ReceiptUnknownError);
  await assert.rejects(ask(subject, { timeoutMs: 10 }), ReceiptUnknownError);
  const [row] = await sql`SELECT status, attempts FROM receipts WHERE subject=${subject}`;
  assert.equal(row!.status, "unknown");
  assert.equal(row!.attempts, 1);
});

test("the complete default article pipeline runs on Go with one stable session", async () => {
  for (const name of Object.keys(process.env)) if (/_MODEL$/.test(name) && name !== "LLM_MODEL" && name !== "EMBEDDING_MODEL") delete process.env[name];
  const source = `go-pipeline-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${source},'Go pipeline','rss','T1','editorial','2100-01-01')`;
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/${source}`, title: "A buyback announcement",
    bodyText: "A company announced a buyback with funding and timing details. ".repeat(8), bodyStatus: "ok", via: "fetch", publishedAt: new Date() } as never);
  const start = seen.length;
  pipeline = true;
  const res = await analyzeArticle(articleId);
  assert.equal(res!.output!.selected, true);
  assert.equal(res!.output!.titleZh, "Go 标题");
  const calls = seen.slice(start);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((call) => call.body.model === "deepseek-v4.1-flash"));
  assert.equal(new Set(calls.map((call) => call.headers["x-opencode-session"])).size, 1);
  assert.ok(calls.every((call) => call.headers["x-opencode-session"]));
});

test("translation batches share the same session as their article analysis", async () => {
  process.env.TRANSLATE_MODEL = "default";
  const source = `go-translate-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,site_fulltext,next_fetch_at) VALUES (${source},'Go translate','rss','T1','editorial',true,'2100-01-01')`;
  const paragraph = "The company announced a buyback today. ".repeat(45);
  const paragraphs = Array.from({ length: 5 }, (_, i) => `<p>Section ${i}. ${paragraph}</p>`).join("");
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/${source}`, title: "Buyback news", language: "en",
    bodyText: paragraph.repeat(5), bodyHtml: paragraphs, bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','capital','公司回购','回购新闻',90,true)`;
  await publishArticle(articleId, { releasedAt: new Date() });
  await ask(`analysis-${articleId}`, { sessionKey: `article:${articleId}@1` });
  const expected = seen.at(-1)!.headers["x-opencode-session"];
  const start = seen.length;
  translation = true;
  const result = await translateArticle(articleId);
  assert.equal(result.status, "translated", JSON.stringify(result));
  const calls = seen.slice(start);
  assert.ok(calls.length >= 2);
  assert.ok(calls.every((call) => call.headers["x-opencode-session"] === expected));
});

test("grouping judgement and independent review share their task session", async () => {
  process.env.GROUP_MODEL = process.env.GROUP_REVIEW_MODEL = "default";
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.EMBEDDING_API_KEY;
  const source = `go-group-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${source},'Go group','rss','T1','editorial','2100-01-01')`;
  const report = async (suffix: string, title: string) => {
    const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/${source}/${suffix}`, title,
      bodyText: "公司宣布回购股票。", bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected,output)
      VALUES (${articleId},1,'rule','pass','capital',${title},${title},90,true,${sql.json({ scope: "single", fact: { title, subject: "公司", action: "回购", object: "股票" } })})`;
    await sql`UPDATE articles SET processing_state='analyzed' WHERE id=${articleId}`;
    await publishArticle(articleId);
    return articleId;
  };
  const root = await report("root", "公司宣布回购股票提升股东价值");
  const [story] = await sql`INSERT INTO stories (public_id,title) VALUES (${randomUUID()},'公司回购') RETURNING id`;
  const [fact] = await sql`INSERT INTO facts (public_id,story_id,title) VALUES (${`fact-${source}`},${story!.id},'公司回购') RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${root},'primary')`;
  const next = await report("next", "公司宣布回购股票公布资金安排");
  const start = seen.length;
  grouping = true;
  assert.equal((await groupArticle(next)).verdict, "same-fact");
  const calls = seen.slice(start);
  assert.equal(calls.length, 2, "batch judgement and low-similarity review both ran");
  assert.ok(calls[0]!.headers["x-opencode-session"]);
  assert.equal(calls[0]!.headers["x-opencode-session"], calls[1]!.headers["x-opencode-session"]);
});

test("the paid verification script rejects unsafe config and runs its complete path against a mock", async () => {
  const execute = promisify(execFile);
  for (const override of [
    { DATABASE_URL: "postgres://unused/production" }, { MODEL_CALLS_ENABLED: "false" },
    { LLM_MODEL: "other" }, { LLM_BASE_URL: "https://other.invalid/zen/go/v1" },
  ]) {
    await assert.rejects(execute(process.execPath, ["scripts/verify-opencode-go.ts"], { env: { ...process.env, ...override } }),
      (error: unknown) => (error as { code?: number }).code === 1);
  }
  const { stdout } = await execute(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { MockAgent, setGlobalDispatcher } from 'undici';
    const agent = new MockAgent(); agent.disableNetConnect(); setGlobalDispatcher(agent);
    let session; let calls=0;
    agent.get('https://opencode.ai').intercept({path:'/zen/go/v1/chat/completions',method:'POST'}).reply(opts => {
      const headers=new Headers(opts.headers); const body=JSON.parse(opts.body);
      assert.equal(headers.get('user-agent'),'FinanceHOT/1.0');
      assert.ok(headers.get('x-opencode-session'));
      if(session) assert.equal(headers.get('x-opencode-session'),session);
      session=headers.get('x-opencode-session'); calls++;
      const content=body.messages[0].content.includes('JSON') ? '{"ok":true}' : 'title_zh: 接入验证\\nsummary_zh: 接入成功。';
      return {statusCode:200,data:JSON.stringify({id:'verify-stub',choices:[{message:{content}}],usage:{prompt_tokens:12,completion_tokens:3}})};
    }).persist();
    try { await import('./scripts/verify-opencode-go.ts'); assert.equal(calls,2); } finally { await agent.close(); }
  `]);
  const report = JSON.parse(stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.receipts.length, 2);
});
