import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { parseDocument, documentHash } from "@aihot/backend/content/documents";
import { groundClaim, metadataCopy, splitDisclosure } from "@aihot/backend/editorial/disclosure";
import type { AnalyzeInputArticle } from "@aihot/backend/editorial/input";
after(closeDb);
const root=new URL("fixtures/disclosures/",import.meta.url);
const manifest:any[]=JSON.parse(readFileSync(new URL("manifest.json",root),"utf8"));
for(const market of ["A","H","US"]) test(`${market}: six distinct official samples and at least two financial reports`,()=>{
 assert.ok(manifest.filter(s=>s.market===market).length>=6);
 assert.ok(manifest.filter(s=>s.market===market&&s.earnings).length>=2);
});
for(const s of manifest) test(`${s.id}: authentic ${s.format} extracts text and covers the whole document`,async()=>{
 const raw=gunzipSync(readFileSync(new URL(s.rawFile,root)));
 assert.equal(documentHash(raw),s.rawHash);
 const parsed=await parseDocument({body:raw,url:s.url,headers:new Headers({"content-type":s.mime})});
 assert.equal(parsed.evidence.status,"fulltext available");
 assert.equal(parsed.evidence.format,s.format);
 assert.equal(documentHash(parsed.text),s.textHash);
 assert.equal(parsed.text.length,s.chars);
 const chunks=splitDisclosure(parsed.text);
 assert.equal(chunks[0]!.start,0);assert.equal(chunks.at(-1)!.end,parsed.text.length);
 for(let i=1;i<chunks.length;i++)assert.ok(chunks[i]!.start<=chunks[i-1]!.end);
 for(const gold of s.gold)assert.ok(parsed.text.includes(gold.value),`official fixture missing gold ${gold.label}`);
});
for(const [index,s] of manifest.slice(0,6).entries()) test(`failure ${index+1}: real ${s.id} metadata never manufactures financial facts`,async()=>{
 const a={id:s.id,revision:1,title:s.title,url:s.url,author:null,publishedAt:new Date(s.publishedAt),bodyText:null,excerpt:s.excerpt,bodyStatus:index===0?"none":"unconfirmed",xPost:null,media:[],source:{name:s.sourceId,kind:"json_list",tier:"T1",firstParty:true,ownerEntityId:s.company,disclosureRole:"statutory"}} as AnalyzeInputArticle;
 const copy=metadataCopy(a);assert.equal(copy.model,null);assert.equal(copy.receiptIds.length,0);
 assert.ok(copy.summaryZh.includes(index===0?"正文未读取":"正文获取失败"));
 assert.equal(groundClaim({kind:"metric",label:"profit",value:"999999999",textZh:"利润999999999",quote:"profit is 999999999"},{start:0,end:0,text:""},a),null);
 if(index===1||index===2) await assert.rejects(parseDocument({body:Buffer.from(index===1?"%PDF-corrupted":"<html><body>Enable JavaScript and cookies</body></html>"),url:s.url,headers:new Headers({"content-type":index===1?"application/pdf":"text/html"})}));
});
test("real Form 4 retains issuer and reporting-owner roles instead of assigning the queried owner as issuer",async()=>{
 const {disclosureCompany}=await import("@aihot/backend/editorial/disclosure");
 const s=JSON.parse(readFileSync(new URL("form4.json",root),"utf8"));
 const raw=gunzipSync(readFileSync(new URL("form4.raw.gz",root)));
 assert.equal(documentHash(raw),s.rawHash);
 const parsed=await parseDocument({body:raw,url:s.url,headers:new Headers({"content-type":s.mime})});
 const a={id:"form4",revision:1,title:s.title,url:s.url,bodyText:parsed.text,excerpt:s.excerpt,bodyStatus:"ok",source:{ownerEntityId:s.company}} as AnalyzeInputArticle;
 const identity=disclosureCompany(a);
 assert.equal(identity.entityId,null);assert.equal(identity.role,"associated");
 assert.ok("issuerCik" in identity&&identity.issuerCik);assert.ok("reportingOwnerCik" in identity&&identity.reportingOwnerCik);
 assert.notEqual(identity.issuerCik,identity.reportingOwnerCik);
});
