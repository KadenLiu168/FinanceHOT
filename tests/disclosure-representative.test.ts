import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { pickRepresentative } from "@aihot/backend/publication/representative";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import { materialPublisher } from "@aihot/backend/content/provenance";

after(closeDb);

const ir = { id: "ir", source_tier: "T1", disclosure_role: "issuer_ir", body_mode: "full" as const,
  score: 90, timeline_at: new Date("2026-07-30T20:00:00Z") };
const statutory = { ...ir, id: "statutory", disclosure_role: "statutory", body_mode: "summary" as const, score: 60 };

test("the statutory disclosure represents the same fact even when IR has richer text and a higher score", () => {
  assert.equal(pickRepresentative([ir, statutory]).id, "statutory");
  assert.equal(pickRepresentative([statutory, ir]).id, "statutory");
});

test("a statutory label cannot promote a non-T1 source, and IR-only facts keep their representative", () => {
  assert.equal(pickRepresentative([ir, { ...statutory, source_tier: "T2" }]).id, "ir");
  assert.equal(pickRepresentative([ir]).id, "ir");
  const old = { ...statutory, disclosure_role: null };
  assert.equal(pickRepresentative([old, ir]).id, "ir", "unlabelled T1 sources retain the existing body/score ordering");
});

test("source config accepts disclosure roles but rejects unknown and non-string roles", () => {
  for (const kind of ["rss", "web_list", "json_list", "external"] as const) {
    for (const disclosureRole of ["statutory", "issuer_ir"]) assert.doesNotThrow(() => assertSupportedConfig(kind, { disclosureRole }));
    for (const disclosureRole of ["official", ["statutory"], null, 1]) assert.throws(() => assertSupportedConfig(kind, { disclosureRole }), /不支持的配置项/);
  }
});

test("shared disclosure URL ownership requires a unique observed statutory channel", () => {
  const url = "https://disclosures.example/issuer/report.pdf";
  const issuer = { id: "ir", kind: "rss", config: { disclosureRole: "issuer_ir", publisherUrlPrefixes: ["https://disclosures.example/issuer"] }, discovered: true };
  const filing = { ...issuer, id: "filing", config: { ...issuer.config, disclosureRole: "statutory" }, discovered: false };
  assert.equal(materialPublisher([issuer, filing], url), null, "registration alone does not resolve overlapping ownership");
  assert.equal(materialPublisher([issuer, { ...filing, discovered: true }], url)?.id, "filing");
  assert.equal(materialPublisher([{ ...filing, discovered: true }, issuer], url)?.id, "filing", "arrival order cannot change attribution");
  assert.equal(materialPublisher([issuer, { ...filing, discovered: true }, { ...filing, id: "other", discovered: true }], url), null, "two observed statutory owners remain ambiguous");
  assert.equal(materialPublisher([issuer, { ...filing, discovered: true }, { ...issuer, id: "unknown", config: { publisherUrlPrefixes: ["https://disclosures.example/issuer"] } }], url), null, "an unrelated registered publisher is not silently discarded");
  assert.equal(materialPublisher([issuer, { ...filing, discovered: true, config: { disclosureRole: "statutory", publisherUrlPrefixes: ["https://disclosures.example/other"] } }], url)?.id, "ir", "discovery does not bypass URL ownership");
  assert.equal(materialPublisher([{ ...filing, discovered: true, config: { disclosureRole: "statutory", feedUrl: "https://disclosures.example/rss" } }], url), null, "a feed host alone proves no ownership");
});

test("a shared exchange host does not attribute an issuer document to another registered issuer", () => {
  const pack = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")) as {
    sources: { id: string; kind: string; config: Record<string, unknown> }[];
  };
  const issuers = pack.sources.filter((s) => s.kind === "web_list" && s.config.disclosureRole === "statutory")
    .map((s) => ({ ...s, discovered: false }));
  assert.equal(issuers.length, 8);
  const url = "https://www1.hkexnews.hk/listedco/listconews/sehk/example.pdf";
  assert.equal(materialPublisher(issuers, url), null);
  const discovered = issuers.map((s) => ({ ...s, discovered: s.id === "finance-disclosure-tencent" }));
  assert.equal(materialPublisher(discovered, url)?.id, "finance-disclosure-tencent");
  assert.equal(materialPublisher(discovered.map((s) => ({ ...s, discovered: s.discovered || s.id === "finance-disclosure-aia" })), url), null);
});
