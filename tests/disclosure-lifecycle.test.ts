import { stub, Reply } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { sql,closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { upsertMaterial, contentHash } from "@aihot/backend/content/materials";
import { extractArticleBody } from "@aihot/backend/content/extract";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { understandDisclosure } from "@aihot/backend/editorial/disclosure";
import { loadAnalyzeInput } from "@aihot/backend/editorial/input";
import { documentHash } from "@aihot/backend/content/documents";
config.allowPrivateNetworkFetch=true;
let version=0;
const body="Official report: Apple revenue 100 million. ".repeat(10);
const server=http.createServer((req,res)=>{
 if(req.url==="/403") {res.writeHead(403);res.end("denied");}
 else if(req.url==="/damaged") {res.writeHead(200,{"content-type":"application/pdf"});res.end("%PDF-damaged");}
 else if(req.url==="/oversized") {res.writeHead(200,{"content-type":"application/pdf","content-length":String(33*1024*1024)});res.end("%PDF-");}
 else if(req.url==="/challenge") {res.writeHead(200,{"content-type":"text/html"});res.end("<html><body>Verify you are human</body></html>");}
 else if(req.url==="/empty") {res.writeHead(200,{"content-type":"text/html"});res.end("<html><body></body></html>");}
 else {res.writeHead(200,{"content-type":"text/html"});res.end(`<html><body><main><p>${body}</p><!-- version ${version} --></main></body></html>`);}
});
await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
for(const key of ["STRUCTURE_MODEL","PREFILTER_MODEL","SCORE_MODEL"])process.env[key]="default";
process.env.LLM_API_KEY="test-key";process.env.LLM_MODEL="stub";
let failChunk=false;
const provider=await stub((_hit,req)=>{
 const r=JSON.parse(req.body);const system=r.messages[0]?.content??"";
 if(system.includes("你从当前官方公告")) {
  const data=JSON.parse(r.messages.at(-1).content);
  if(failChunk&&data.chunk.start>0)return new Reply(503,{error:"injected provider outage"});
  return {choices:[{message:{content:JSON.stringify({announcementType:"report",itemType:"earnings",claims:[]})}}]};
 }
 const data=system.includes("attentionScore")?{attentionScore:80}:system.includes("PASS")&&system.includes("BLOCK")?{label:"PASS",reason:"metadata"}:{scope:"single",category:"company",tags:["财报/业绩"],subjects:["apple","meta"],fact:{title:"fake 999 profit",evidence:null,conditions:[]}};
 return {choices:[{message:{content:JSON.stringify(data)}}]};
});
process.env.LLM_BASE_URL=provider.url;
after(async()=>{server.close();await provider.close();await closeDb();});
async function source(id:string,owner="apple"){await sql`INSERT INTO sources(id,name,kind,tier,first_party,owner_entity_id,config) VALUES(${id},'Apple official','json_list','T1',true,${owner},${sql.json({disclosureRole:"issuer_ir"})}) ON CONFLICT DO NOTHING`;}
test("changed document evidence revises identical text, snapshots provenance, and rediscovery does not revise again",async()=>{
 await source("evidence-lifecycle");
 const material={sourceId:"evidence-lifecycle",url:base+"/body",title:"Annual results",excerpt:"official metadata",via:"fetch" as const};
 const {articleId}=await upsertMaterial(material);
 assert.equal(await extractArticleBody(articleId),"ok");
 const [first]=await sql`SELECT revision,body_text,body_evidence FROM articles WHERE id=${articleId}`;
 assert.equal(first.revision,2);
 version++;
 await sql`UPDATE articles SET body_status='pending' WHERE id=${articleId}`;
 assert.equal(await extractArticleBody(articleId),"ok");
 const [second]=await sql`SELECT revision,body_text,body_evidence FROM articles WHERE id=${articleId}`;
 assert.equal(second.body_text,first.body_text);assert.notEqual(second.body_evidence.contentHash,first.body_evidence.contentHash);
 assert.equal(second.revision,3);
 const [snapshot]=await sql`SELECT body_evidence FROM article_revisions WHERE article_id=${articleId} AND revision=3`;
 assert.equal(snapshot.body_evidence.contentHash,second.body_evidence.contentHash);
 assert.equal((await upsertMaterial(material)).revised,false);
 const changed={...material,title:"Annual results corrected",excerpt:"official metadata corrected"};
 assert.equal((await upsertMaterial(changed)).revised,true);
 const [edited]=await sql`SELECT revision,content_hash,body_text,body_evidence FROM articles WHERE id=${articleId}`;
 assert.equal(edited.content_hash,contentHash({title:changed.title,excerpt:changed.excerpt,bodyText:edited.body_text,bodyEvidence:edited.body_evidence}));
 await sql`UPDATE articles SET body_status='pending' WHERE id=${articleId}`;
 await extractArticleBody(articleId);
 const [retried]=await sql`SELECT revision FROM articles WHERE id=${articleId}`;
 assert.equal(retried.revision,edited.revision,"jsonb property order does not create a new evidence revision");
});
const samples=JSON.parse(readFileSync(new URL("fixtures/disclosures/manifest.json",import.meta.url),"utf8"));
for(const [index,route] of ["metadata","403","damaged","challenge","empty","oversized"].entries())test(`injected failure ${route}: real metadata -> extraction -> analysis -> anonymous summary`,async()=>{
 const sourceId=`failure-${index}`;const s=samples[index];await source(sourceId,s.company);
 const {articleId}=await upsertMaterial({sourceId,url:base+"/"+route,title:s.title,excerpt:s.excerpt,publishedAt:new Date(s.publishedAt),via:"import",backfill:"regression",...(route==="metadata"?{bodyStatus:"none" as const}:{})});
 if(route!=="metadata") assert.equal(await extractArticleBody(articleId),"unconfirmed");
 const result=await analyzeArticle(articleId);assert.ok(result?.output);
 assert.equal(result.output.fact,null);assert.deepEqual(result.output.subjects,[s.company]);
 assert.ok(!result.output.summaryZh.includes("999"));assert.match(result.output.summaryZh,/正文未读取|正文获取失败/);
 await publishArticle(articleId);const detail=await loadItemDetail(articleId);assert.equal(detail.kind,"found");
 if(detail.kind==="found") assert.equal(detail.item.summary,result.output.summaryZh);
});
test("a failed later chunk persists partial coverage and leaves remaining intervals unprocessed",async()=>{
 await source("partial-disclosure");
 const text="background paragraphs. ".repeat(7000);
 const {articleId}=await upsertMaterial({sourceId:"partial-disclosure",url:base+"/long",title:"Annual results",bodyText:text,bodyStatus:"ok",via:"import"});
 const input=await loadAnalyzeInput(articleId);assert.ok(input);failChunk=true;
 await assert.rejects(understandDisclosure(input),/503/);failChunk=false;
 const [row]=await sql`SELECT disclosure_progress FROM articles WHERE id=${articleId}`;
 assert.equal(row.disclosure_progress.coverage,"partial");
 assert.deepEqual(row.disclosure_progress.chunks.map((c:any)=>c.status),["ok","failed","unprocessed","unprocessed"]);
});
