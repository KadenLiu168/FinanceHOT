// Explicit paid verification on a scratch database; never starts the worker or publishes content.
// Configure the LLM_* variables and MODEL_CALLS_ENABLED=true before running this script.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const database = new URL(process.env.DATABASE_URL ?? "postgres://unset/unset").pathname.slice(1);
if (!/_(test|ci)$/.test(database)) throw new Error("Use an isolated DATABASE_URL ending in _test or _ci");
if (process.env.LLM_PROVIDER !== "opencode-go" || process.env.LLM_MODEL !== "deepseek-v4.1-flash") throw new Error("Set LLM_PROVIDER=opencode-go and LLM_MODEL=deepseek-v4.1-flash");
if (process.env.LLM_BASE_URL?.replace(/\/+$/, "") !== "https://opencode.ai/zen/go/v1") throw new Error("Verification requires the official OpenCode Go endpoint");
if (process.env.MODEL_CALLS_ENABLED !== "true") throw new Error("Explicitly set MODEL_CALLS_ENABLED=true for this paid verification");
if (process.env.LLM_VISION === "true") throw new Error("Set LLM_VISION=false");

const { chatJson } = await import("@aihot/backend/providers/llm");
const { config } = await import("@aihot/backend/config");
const { closeDb, sql } = await import("@aihot/backend/db");
const { sha256, stableJson } = await import("@aihot/backend/lib/ids");
const { completeReceipt } = await import("@aihot/backend/providers/receipts");
const sessionKey = `verify-opencode-go:${randomUUID()}`;
try {
  const structured = await chatJson({ model: "default", purpose: "opencode_verify", subject: `${sessionKey}:json`, sessionKey,
    promptVersion: "opencode-verify-v1", system: 'Return only a JSON object with an "ok" boolean.', user: 'Return {"ok":true}.',
    schema: z.object({ ok: z.literal(true) }), maxTokens: 512, temperature: 0 });
  const text = await chatJson({ model: "default", purpose: "opencode_verify", subject: `${sessionKey}:text`, sessionKey,
    promptVersion: "opencode-verify-v1", system: "Return exactly the two requested lines, without Markdown.",
    user: "Return these lines:\ntitle_zh: 接入验证\nsummary_zh: 接入成功。", schema: z.object({ title: z.string().min(1), summary: z.string().min(1) }),
    json: false, maxTokens: 512, temperature: 0,
    parse: (value) => ({ title: /^title_zh:\s*(.+)$/m.exec(value)?.[1], summary: /^summary_zh:\s*(.+)$/m.exec(value)?.[1] }) });
  const sessionId = sha256(stableJson([config.siteUrl, sessionKey]));
  for (const result of [structured, text]) {
    assert.equal(result.reused, false);
    assert.equal(typeof result.usage?.prompt_tokens, "number", "missing prompt_tokens");
    assert.equal(typeof result.usage?.completion_tokens, "number", "missing completion_tokens");
    const [receipt] = await sql`SELECT service, request, response FROM receipts WHERE id=${result.receiptId}`;
    assert.equal(receipt!.service, "llm");
    assert.ok(receipt!.response.choices?.[0]?.message?.content);
    assert.equal(receipt!.request.sessionId, sessionId);
    await completeReceipt(sql, result.receiptId);
  }
  console.log(JSON.stringify({ status: "PASS", model: "deepseek-v4.1-flash", sessionId, receipts: [structured, text].map((r) => ({ id: r.receiptId, usage: r.usage })) }, null, 2));
} finally {
  await closeDb();
}
