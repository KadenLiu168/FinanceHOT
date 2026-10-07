import { stub } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { runAnalysis, normalizeAnalysis } from "@aihot/backend/editorial/analyze";
import type { AnalyzeInputArticle } from "@aihot/backend/editorial/input";
config.allowPrivateNetworkFetch=true;
for(const name of ["STRUCTURE_MODEL","SCORE_MODEL","PREFILTER_MODEL"]) process.env[name]="default";
process.env.LLM_API_KEY="test-key";process.env.LLM_MODEL="local-test";
const requests:any[]=[];
const provider=await stub((_hit,req)=>{
 const request=JSON.parse(req.body);requests.push(request);
 const system=request.messages[0]?.content??"";
 const user=request.messages.at(-1)?.content??"";
 let output:any;
 if(system.includes("你从当前官方公告")) {
  const data=JSON.parse(user);
  const text=data.chunk?.text??"";
  const quote="Apple reports revenue 100 million for fiscal 2025.";
  output={announcementType:"annual results",itemType:"earnings",claims:text.includes(quote)?[
   {kind:"event",label:"earnings",textZh:"苹果披露年度财报",quote},
   {kind:"metric",label:"revenue",value:"100",unit:"million",period:"2025",textZh:"2025财年收入100 million",quote},
   {kind:"metric",label:"net_income",value:"999",textZh:"净利润999",quote},
  ]:[]};
  if(text.includes("The bond issuance completed.")) output={announcementType:"bond",itemType:"capital_event",claims:[{kind:"event",label:"financing",stage:"completed",textZh:"债券发行已完成",quote:"The bond issuance completed."}]};
  if(text.includes("Linked stage disclosure")) output={announcementType:"guarantee",itemType:"capital_event",claims:[
   {kind:"event",label:"major_business",textZh:"本文件为当前担保事项公告",quote:"Linked stage disclosure: current guarantee agenda."},
   {kind:"stage",label:"financing",stage:"approved",textZh:"董事会批准当前担保议案",quote:"Board approved the current guarantee agenda."},
  ]};
  if(text.includes("Repairable financial disclosure")||text.includes("Unrepairable financial disclosure")) {
   const quote=text.includes("Unrepairable")?"Unrepairable financial disclosure":"Repairable financial disclosure";
   output={announcementType:"annual report",itemType:"earnings",claims:[{kind:"event",label:"earnings",textZh:data.repair&&!text.includes("Unrepairable")?"本文件为财务披露":"公司收入999",quote}]};
  }
  if(text.includes("Financial event from verified metrics")) {
   const quote="Financial event from verified metrics: 2025 revenue 100 million; net income 20 million; EPS 2 per share.";
   output={announcementType:"annual report",itemType:"earnings",claims:[
    {kind:"metric",label:"revenue",value:"100",unit:"million",period:"2025",textZh:"2025年收入100 million",quote},
    {kind:"metric",label:"net_income",value:"20",unit:"million",period:"2025",textZh:"2025年净利润20 million",quote},
    {kind:"metric",label:"eps",value:"2",unit:"per share",period:"2025",textZh:"2025年EPS2 per share",quote},
    {kind:"reporting_period",label:"reporting_period",value:"2025",textZh:"本报告期2025年",quote},
   ]};
   if(text.includes("period mismatch")) {
    for(const c of output.claims) if(c.kind==="metric") c.period="2025年第一季度";
    const period=output.claims.find((c:{kind:string})=>c.kind==="reporting_period");
    period.value=text.includes("half-year")?"2025年半年度":text.includes("annual")?"2025年全年":"2025年第二季度";
    for(const c of output.claims) c.quote=text.replace(/^\[\d+\] /gm,"");
   }
  }
 } else if(system.includes("独立原文证据核验者")) output={accepted:user.includes("Financial event from verified metrics")?[0,1,2,3]:[0,1],stageLinks:user.includes("Linked stage disclosure")?[{event:0,stage:1}]:user.includes("The bond issuance completed.")?[{event:0,stage:"completed"}]:[]};
 else if(system.includes("attentionScore"))output={attentionScore:90};
 else if(system.includes("PASS")&&system.includes("BLOCK"))output={label:"PASS",reason:"official"};
 else output={scope:"single",category:"company",tags:["财报/业绩"],subjects:["meta","apple"],fact:{title:"invented",evidence:null,conditions:[]}};
 return {choices:[{message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:1,completion_tokens:1}};
});
process.env.LLM_BASE_URL=provider.url;
after(async()=>{await provider.close();await closeDb();});
const base={id:"disclosure-pipeline",revision:1,title:"Apple 2025 annual results",url:"https://official.example/results",author:null,publishedAt:new Date("2025-10-31Z"),excerpt:"official metadata",xPost:null,media:[],source:{name:"Apple IR",kind:"json_list",tier:"T1",firstParty:true,ownerEntityId:"apple",disclosureRole:"issuer_ir"}};
test("real pipeline reads all chunks, verifies claims, excludes incidental companies and renders only grounded copy",async()=>{
 await sql`UPDATE budgets SET per_minute=1000,per_hour=1000,per_day=1000 WHERE service='llm'`;
 const a={...base,bodyText:"Background\n"+"neutral background paragraph. ".repeat(3000)+"\nApple reports revenue 100 million for fiscal 2025.",bodyStatus:"ok"} as AnalyzeInputArticle;
 const run=await runAnalysis(a);const output=normalizeAnalysis(run);
 assert.ok(run.disclosure!.chunks.length>=2);
 assert.equal(run.disclosure!.coverage,"complete");
 assert.ok(output.summaryZh.includes("100"));assert.ok(!output.summaryZh.includes("999"));
 assert.deepEqual(output.subjects,["apple"]);assert.equal(output.fact?.action,"earnings");
 assert.equal(run.disclosure!.claims.length,2);
 assert.ok(run.disclosure!.receiptIds.length>=3);
});
test("metadata-only analysis never calls the fact or writing model and cannot attach another company's invented fact",async()=>{
 const before=requests.length;
 const run=await runAnalysis({...base,id:"missing-disclosure",bodyText:null,bodyStatus:"unconfirmed"} as AnalyzeInputArticle);
 const output=normalizeAnalysis(run);
 assert.equal(output.fact,null);assert.deepEqual(output.subjects,["apple"]);
 assert.ok(output.summaryZh.includes("正文获取失败"));assert.ok(!output.summaryZh.includes("999"));
 assert.equal(run.disclosure?.coverage,"unavailable");
 assert.ok(requests.slice(before).every(r=>!r.messages[0]?.content.includes("claims")));
});
test("the current phase can come from the verified primary event without a duplicate claim",async()=>{
 const run=await runAnalysis({...base,id:"disclosure-event-phase",bodyText:"The bond issuance completed.",bodyStatus:"ok"} as AnalyzeInputArticle);
 assert.equal(run.disclosure?.stage,"completed");
 assert.equal(run.disclosure?.claims.length,1);
 assert.ok(normalizeAnalysis(run).summaryZh.includes("已完成"));
});
test("independent verification binds a differently labelled stage to its located current event",async()=>{
 const bodyText="Linked stage disclosure: current guarantee agenda.\nBoard approved the current guarantee agenda.";
 const run=await runAnalysis({...base,id:"independent-stage-link",bodyText,bodyStatus:"ok"} as AnalyzeInputArticle);
 assert.equal(run.disclosure?.stage,"approved");
 const stage=run.disclosure!.claims.find(c=>c.kind==="stage")!;
 const event=run.disclosure!.claims.find(c=>c.kind==="event")!;
 assert.deepEqual(stage.relatedEvent,{sourceUrl:event.sourceUrl,start:event.start,end:event.end,label:event.label});
 assert.ok(normalizeAnalysis(run).summaryZh.includes(stage.textZh));
});
test("rejected core facts receive one bounded evidence repair and are independently checked again",async()=>{
 const before=requests.length;
 const run=await runAnalysis({...base,id:"disclosure-bounded-repair",bodyText:"Repairable financial disclosure",bodyStatus:"ok"} as AnalyzeInputArticle);
 assert.ok(run.disclosure?.claims.some(c=>c.kind==="event"));
 assert.ok(!normalizeAnalysis(run).summaryZh.includes("999"));
 const facts=requests.slice(before).filter(r=>r.messages[0]?.content.includes("你从当前官方公告"));
 assert.equal(facts.length,2);assert.ok(JSON.parse(facts[1]!.messages.at(-1).content).repair);
});
test("an evidence repair that remains invalid stops after one pass and cannot publish invented facts",async()=>{
 const before=requests.length;
 const run=await runAnalysis({...base,id:"disclosure-unrepairable",bodyText:"Unrepairable financial disclosure",bodyStatus:"ok"} as AnalyzeInputArticle);
 assert.equal(run.disclosure?.claims.length,0);
 assert.ok(!normalizeAnalysis(run).summaryZh.includes("999"));
 assert.equal(requests.slice(before).filter(r=>r.messages[0]?.content.includes("你从当前官方公告")).length,2);
});
test("a financial report core event can reuse its fully verified same-period financial sentence",async()=>{
 const bodyText="Financial event from verified metrics: 2025 revenue 100 million; net income 20 million; EPS 2 per share.";
 const run=await runAnalysis({...base,id:"verified-financial-event",bodyText,bodyStatus:"ok"} as AnalyzeInputArticle);
 const event=run.disclosure?.claims.find(c=>c.kind==="event"&&c.label==="earnings");
 assert.equal(event?.textZh,"2025年收入100 million");assert.equal(event?.quote,bodyText);
 const unrelated=await runAnalysis({...base,id:"no-derived-merger-event",title:"Apple merger plan",bodyText,bodyStatus:"ok"} as AnalyzeInputArticle);
 assert.ok(!unrelated.disclosure?.claims.some(c=>c.kind==="event"));
 for(const mismatch of ["quarter","half-year","annual"]) {
  const bodyText=`Financial event from verified metrics: 2025 revenue 100 million; net income 20 million; EPS 2 per share. period mismatch ${mismatch} 2025年第一季度 2025年第二季度 2025年半年度 2025年全年`;
  const run=await runAnalysis({...base,id:`mismatched-financial-${mismatch}`,bodyText,bodyStatus:"ok"} as AnalyzeInputArticle);
  assert.equal(run.disclosure?.claims.filter(c=>c.kind==="metric").length,3);
  assert.ok(run.disclosure?.claims.some(c=>c.kind==="reporting_period"));
  assert.ok(!run.disclosure?.claims.some(c=>c.kind==="event"),mismatch);
 }
});

test("a financial report keeps its primary classification when later chunks discuss a bond issuance",async()=>{
 const bodyText="Apple reports revenue 100 million for fiscal 2025.\n"+"neutral background paragraph. ".repeat(3000)+"\nThe bond issuance completed.";
 const run=await runAnalysis({...base,id:"financial-background-bond",bodyText,bodyStatus:"ok"} as AnalyzeInputArticle);
 assert.ok(run.disclosure!.chunks.length>=2);
 assert.ok(run.disclosure!.claims.some(c=>c.label==="financing"));
 assert.equal(run.disclosure!.itemType,"earnings");
 assert.equal(run.disclosure!.claims.find(c=>c.kind==="event")?.label,"earnings");
 assert.ok(normalizeAnalysis(run).summaryZh.includes("年度财报"));
});

test("Form 4 pipeline cannot publish a model-suggested issuer role for the reporting owner",async()=>{
 const {readFileSync}=await import("node:fs"); const {gunzipSync}=await import("node:zlib");
 const {parseDocument}=await import("@aihot/backend/content/documents");
 const root=new URL("fixtures/disclosures/",import.meta.url);
 const fixture=JSON.parse(readFileSync(new URL("form4.json",root),"utf8"));
 const parsed=await parseDocument({body:gunzipSync(readFileSync(new URL("form4.raw.gz",root))),url:fixture.url,headers:new Headers({"content-type":fixture.mime})});
 const run=await runAnalysis({...base,id:"form4-adversarial",title:fixture.title,url:fixture.url,bodyText:parsed.text,bodyEvidence:parsed.evidence,bodyStatus:"ok",source:{...base.source,ownerEntityId:"berkshire",disclosureRole:"statutory"}} as AnalyzeInputArticle);
 const out=normalizeAnalysis(run);assert.deepEqual(out.subjects,[]);assert.equal(out.fact,null);
 assert.ok(out.summaryZh.includes("LENNAR"));assert.ok(out.summaryZh.includes("申报持有人"));assert.ok(!out.summaryZh.includes("伯克希尔是发行人"));
});
