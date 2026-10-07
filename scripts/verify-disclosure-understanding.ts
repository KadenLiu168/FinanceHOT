// Explicit isolated real-model acceptance, never invoked by npm test or a production worker.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { extractArticleBody } from "@aihot/backend/content/extract";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { checkFinancialGold, checkCoreGold } from "./lib/disclosure-acceptance.ts";
import { documentHash, parseDocument } from "@aihot/backend/content/documents";

const dbName=new URL(config.databaseUrl).pathname;
if(!/_(test|ci)$/.test(dbName)) throw new Error("real disclosure acceptance requires an isolated *_test or *_ci database");
if(config.feishuContentPushEnabled||config.indexNowSubmitEnabled||process.env.COLLECT_ENABLED==="true") throw new Error("collection and push valves must remain disabled for acceptance");
if(!config.modelCallsEnabled) throw new Error("explicit MODEL_CALLS_ENABLED=true is required for this isolated acceptance");
const root=new URL("../tests/fixtures/disclosures/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("manifest.json",root),"utf8"));
const pack=JSON.parse(await readFile(new URL("../industry/sources.json",import.meta.url),"utf8")).sources;
const directory=process.env.DISCLOSURE_REPORT_DIR??"/tmp/financehot-disclosure-acceptance";
await mkdir(directory,{recursive:true});
const report:{cases:Record<string,unknown>[];status:string;failures:string[];at:string;model:string}={cases:[],status:"running",failures:[],at:new Date().toISOString(),model:process.env.LLM_MODEL??""};
const save=()=>writeFile(path.join(directory,"report.json"),JSON.stringify(report,null,2));
await save();
for(const market of ["A","H","US"]){assert.ok(manifest.filter(x=>x.market===market).length>=6);assert.ok(manifest.filter(x=>x.market===market&&x.earnings).length>=2);}
assert.equal(new Set(manifest.map(x=>x.url)).size,manifest.length);
const prefix="disclosure-acceptance-";
for(const source of pack.filter(s=>manifest.some(x=>x.sourceId===s.id))) {
  const id=prefix+source.id;
  await sql`INSERT INTO sources(id,name,kind,config,tier,first_party,owner_entity_id,participation_mode,site_fulltext,syndicate_fulltext)
    VALUES (${id},${source.name},${source.kind},${sql.json(source.config)},${source.tier},true,${source.owner_entity_id??null},'editorial',false,false)
    ON CONFLICT(id) DO UPDATE SET config=excluded.config`;
}
async function verify(sample:any) {
  const record:Record<string,any>={id:sample.id,sourceId:sample.sourceId,company:sample.company,market:sample.market,title:sample.title,url:sample.url,publishedAt:sample.publishedAt,earnings:sample.earnings};
  report.cases.push(record);await save();
  try {
    const raw=gunzipSync(await readFile(new URL(sample.rawFile,root)));
    assert.equal(documentHash(raw),sample.rawHash,"fixture bytes changed");
    const parsed=await parseDocument({body:raw,url:sample.url,headers:new Headers({"content-type":sample.mime??""})});
    assert.equal(documentHash(parsed.text),sample.textHash,"fixture extraction changed: review gold before accepting");
    const material=await upsertMaterial({sourceId:prefix+sample.sourceId,url:sample.url,title:sample.title,excerpt:sample.excerpt,publishedAt:sample.publishedAt?new Date(sample.publishedAt):null,via:"import",backfill:"acceptance"});
    record.articleId=material.articleId;
    const extracted=await extractArticleBody(material.articleId);
    assert.ok(extracted==="ok"||extracted==="skipped",`live official extraction failed: ${extracted}`);
    const [body]=await sql`SELECT body_text,body_evidence,revision FROM articles WHERE id=${material.articleId}`;
    assert.equal(body.body_evidence?.status,"fulltext available");
    assert.equal(body.body_evidence?.textHash,documentHash(body.body_text),"live evidence hash mismatches stored body");
    const primary=body.body_evidence.parts.find(p=>p.name===parsed.evidence.parts[0]?.name&&p.start===0);
    assert.ok(primary,"live document has no expected primary document");
    const primarySource=primary.sourceUrl??body.body_evidence.resolvedUrl??sample.url;
    const primaryEnd=body.body_evidence.parts.find(p=>p.start>0&&p.sourceUrl&&p.sourceUrl!==primarySource)?.start;
    const primaryText=primaryEnd===undefined?body.body_text:body.body_text.slice(0,primaryEnd-2);
    assert.equal(documentHash(primaryText),sample.textHash,"live primary document differs from archived official fixture");
    record.archivedRawHash=sample.rawHash;record.liveRawHash=body.body_evidence.contentHash;
    record.extraction=body.body_evidence;record.revision=body.revision;
    const result=await analyzeArticle(material.articleId);
    assert.ok(result?.analysisId&&!result.stale&&result.output,"analysis incomplete");
    const [analysis]=await sql`SELECT output,receipt_ids FROM analyses WHERE id=${result.analysisId}`;
    record.analysis=analysis.output;record.receiptIds=analysis.receipt_ids;record.summary=result.output.summaryZh;record.titleZh=result.output.titleZh;
    const facts=analysis.output.disclosure;
    assert.ok(facts,"missing disclosure facts");
    assert.equal(facts.coverage,"complete");assert.ok(facts.claims.some(c=>c.kind==="event"),"no grounded core event");
    assert.equal(facts.company.entityId,sample.company,"issuer mismatch");
    assert.equal(facts.sourceUrl,sample.url);
    record.gold = sample.gold;record.coreGold=sample.coreGold;
    if(sample.earnings) {assert.equal(facts.itemType,"earnings");assert.ok(facts.claims.some(c=>c.kind==="metric"),"financial sample has no grounded metrics");assert.ok(facts.claims.some(c=>c.kind==="reporting_period"),"missing report period");}
    for(const claim of facts.claims) {
      assert.equal(body.body_text.slice(claim.start,claim.end),claim.quote,"claim location mismatches stored body");
      if(claim.accountingBasisEvidence) {const e=claim.accountingBasisEvidence;assert.equal(body.body_text.slice(e.start,e.end),e.quote,"accounting basis location mismatches stored body");assert.equal(e.sourceUrl,claim.sourceUrl,"accounting basis source mismatches metric");}
      if(claim.currencyEvidence) {const e=claim.currencyEvidence;assert.equal(body.body_text.slice(e.start,e.end),e.quote,"currency location mismatches stored body");assert.equal(e.sourceUrl,claim.sourceUrl,"currency source mismatches metric");}
      if(claim.tableHeaderEvidence) {const e=claim.tableHeaderEvidence;assert.equal(body.body_text.slice(e.start,e.end),e.quote,"table header location mismatches stored body");assert.equal(e.sourceUrl,claim.sourceUrl,"table header source mismatches metric");}
    }
    checkFinancialGold(facts.claims,result.output.summaryZh,sample.gold??[]);
    checkCoreGold(facts.claims,result.output.summaryZh,sample.coreGold);
    await publishArticle(material.articleId);
    const page=await loadItemDetail(material.articleId);
    assert.equal(page.kind,"found","public reading layer does not expose this sample");
    if(page.kind==="found") assert.equal(page.item.summary,result.output.summaryZh,"publication changed the verified summary");
    record.publication=page;
    record.status="passed";console.log(sample.id,"passed",facts.claims.length,"claims",facts.chunks.length,"chunks");
  } catch(error){record.status="failed";record.error=error instanceof Error?error.message:String(error);report.failures.push(sample.id);console.log(sample.id,"failed",record.error);}
  await save();
}
try {
  // Match normal worker concurrency; each individual disclosure still reads its chunks in order.
  for(let start=0;start<manifest.length;start+=3) {
    await Promise.all(manifest.slice(start,start+3).map(verify));
    if(report.cases.some(c => typeof c.error === "string" && /HTTP 402/.test(c.error))) {
      for(const sample of manifest.slice(start+3)) { report.cases.push({id:sample.id,status:"not-run",error:"provider balance unavailable"}); report.failures.push(sample.id); }
      break;
    }
  }
  report.status=report.failures.length?"incomplete":"passed";await save();
  if(report.failures.length) process.exitCode=1;
}finally{await closeDb();}
