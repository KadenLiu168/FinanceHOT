import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { splitDisclosure, groundClaim, metadataCopy, DisclosureClaimSchema, disclosureCopy } from "@aihot/backend/editorial/disclosure";
import type { AnalyzeInputArticle } from "@aihot/backend/editorial/input";
after(closeDb);
const a = {id:"a",revision:1,title:"Apple SEC 10-K filing",url:"https://www.sec.gov/example",author:null,publishedAt:new Date("2025-10-31Z"),bodyText:null,excerpt:"Official filing metadata only",bodyStatus:"unconfirmed",xPost:null,media:[],source:{name:"SEC Apple",kind:"json_list",tier:"T1",firstParty:true,ownerEntityId:"apple",disclosureRole:"statutory"}} as AnalyzeInputArticle;
test("an absent metric stage may be null as the extraction prompt specifies",()=>{
 assert.equal(DisclosureClaimSchema.parse({kind:"metric",label:"revenue",stage:null,textZh:"收入100",quote:"Revenue 100"}).stage,null);
 assert.equal(DisclosureClaimSchema.safeParse({kind:"stage",label:"dividend",stage:"paid",textZh:"已支付",quote:"paid"}).success,false);
});
test("exact line evidence can supply quote and nonsemantic period labels without accepting missing proof",()=>{
 const parsed=DisclosureClaimSchema.parse({kind:"reporting_period",value:"2026",textZh:"报告期2026年",evidenceLines:{start:1,end:1}});
 assert.equal(parsed.label,"reporting_period");
 assert.equal(groundClaim(parsed,{start:0,end:11,text:"报告期2026年"},a)?.quote,"报告期2026年");
 assert.equal(DisclosureClaimSchema.safeParse({kind:"metric",label:"revenue",value:"100",textZh:"收入100"}).success,false);
 assert.equal(DisclosureClaimSchema.safeParse({kind:"metric",value:"100",textZh:"收入100",evidenceLines:{start:1,end:1}}).success,false);
});
test("an explicit Chinese report year can be rendered as the same Arabic year without guessing",()=>{
 const text="二〇二六年半年度报告摘要";
 const c={kind:"event" as const,label:"earnings",textZh:"公司披露2026年半年度报告摘要",quote:text};
 assert.ok(groundClaim(c,{start:0,end:text.length,text},a));
 assert.equal(groundClaim({...c,textZh:"公司披露2027年半年度报告摘要"},{start:0,end:text.length,text},a),null);
 assert.equal(groundClaim({...c,kind:"metric",label:"revenue",value:"2026",textZh:"收入2026"},{start:0,end:text.length,text},a),null);
});
test("an explicitly written English date supports only the same Chinese calendar date",()=>{
 const text="The dividend is payable on August 13, 2026, at $0.27 per share.";
 const c={kind:"metric" as const,label:"dividend",value:"0.27",currency:"$",period:"2026年8月13日",textZh:"股息每股$0.27，支付日2026年8月13日",quote:text};
 assert.ok(groundClaim(c,{start:0,end:text.length,text},a));
 assert.equal(groundClaim({...c,period:"2026年9月13日",textZh:"股息每股$0.27，支付日2026年9月13日"},{start:0,end:text.length,text},a),null);
 const financing="The company announced financing on June 27, 2026.";
 assert.equal(groundClaim({kind:"event",label:"financing",textZh:"公司于2026年6月27日融资6亿元",quote:financing},{start:0,end:financing.length,text:financing},a),null);
});
test("a reporting period may span table header lines while the evidence stays contiguous",()=>{
 const text="截至2026年 截至2025年\n6月30日止 6月30日止\n六個月 六個月";
 const claim={kind:"reporting_period" as const,label:"reporting_period",value:"截至2026年6月30日止六個月",textZh:"主要报告期截至2026年6月30日止六個月",quote:text};
 assert.ok(groundClaim(claim,{start:0,end:text.length,text},a));
 assert.equal(groundClaim({...claim,value:"截至2027年6月30日止六個月",textZh:"主要报告期截至2027年6月30日止六個月"},{start:0,end:text.length,text},a),null);
});
test("currencies require explicit evidence and cannot be inferred from the issuer or a generic yuan unit",()=>{
 const text="Revenue 100 million. Price 100元.";
 const base={kind:"metric" as const,label:"revenue",value:"100",textZh:"收入100 million",quote:text};
 for(const currency of ["人民币","港元","USD"]) assert.equal(groundClaim({...base,currency},{start:0,end:text.length,text},a),null);
 assert.equal(groundClaim({...base,currency:null,textZh:"收入100百万港元"},{start:0,end:text.length,text},a),null);
 const supported="Revenue 100 million. Currency: HKD.";
 assert.ok(groundClaim({...base,currency:"港元",textZh:"收入100百万港元",quote:supported},{start:0,end:supported.length,text:supported},a));
});
test("nonfinancial copy includes the current financing amount rather than background financial metrics",()=>{
 const event={kind:"event",label:"financing",textZh:"公司发行债券",quote:"发行总额人民币50亿元",sourceUrl:a.url,start:0,end:13,page:null,document:null};
 const amount={...event,kind:"metric",label:"issue_amount",value:"50",currency:"人民币",textZh:"本次发行金额50亿元人民币"};
 const background={...event,kind:"metric",label:"net_income",value:"20",textZh:"子公司2025年净利润20亿元"};
 const copy=disclosureCopy(a,{company:{entityId:"apple",role:"issuer"},itemType:"capital_event",claims:[event,amount,background]} as any);
 assert.ok(copy.summaryZh.includes(amount.textZh));
 assert.ok(!copy.summaryZh.includes(background.textZh));
});
test("a stage label alias requires an independently verified link to the current event",()=>{
 const event={kind:"event",label:"major_business",textZh:"本文件为关于接受关联方担保的公告",quote:"关于接受关联方担保的公告",sourceUrl:a.url,start:0,end:13,page:null,document:null};
 const stage={...event,kind:"stage",label:"financing",stage:"approved",textZh:"董事会审议通过关于接受关联方担保的议案",quote:"董事会审议通过关于接受关联方担保的议案",relatedEvent:{sourceUrl:event.sourceUrl,start:event.start,end:event.end,label:event.label}};
 const article={...a,title:"关于接受关联方担保的公告"};
 const facts={company:{entityId:"apple",role:"issuer"},itemType:"corporate_event",claims:[event,stage]} as any;
 assert.ok(disclosureCopy(article,facts).summaryZh.includes(stage.textZh));
 for(const background of [
  {...stage,relatedEvent:undefined,textZh:"上一年度接受关联方担保事项已完成",quote:"上一年度接受关联方担保事项已完成"},
  {...stage,relatedEvent:undefined,textZh:"旧批次接受关联方担保事项已完成",quote:"旧批次接受关联方担保事项已完成"},
  {...stage,label:event.label,sourceUrl:"https://other.example/old",textZh:"其他文档的同名事项已完成"},
 ]) assert.ok(!disclosureCopy(article,{...facts,claims:[event,background]}).summaryZh.includes(background.textZh));
 assert.ok(!disclosureCopy(article,{...facts,claims:[{...event,stage:"proposed"},stage]}).summaryZh.includes(stage.textZh));
});
test("cumulative related-party transactions are not an issuance amount",()=>{
 const text="累计关联交易金额17.94亿元，不含本次交易。";
 assert.equal(groundClaim({kind:"metric",label:"issue_amount",value:"17.94",unit:"亿元",textZh:"累计关联交易17.94亿元",quote:text},{start:0,end:text.length,text},a),null);
});
test("an explicitly declared issuance amount survives a PDF line break inside its label",()=>{
 const text="公司成功发行债券，发行\n总额为人民币45亿元。";
 assert.ok(groundClaim({kind:"metric",label:"issue_amount",value:"45",unit:"亿元",currency:"人民币",textZh:"发行总额45亿元人民币",quote:text},{start:0,end:text.length,text},a));
});
test("an omitted event phase preserves explicit successful issuance and rejects pending issuance",()=>{
 for(const text of ["公司成功发行本期债券。","公司未成功发行本期债券。","公司计划成功发行本期债券。"]) {
  const got=groundClaim({kind:"event",label:"financing",textZh:text,quote:text},{start:0,end:text.length,text},a);
  assert.equal(got?.stage,text==="公司成功发行本期债券。"?"completed":undefined);
 }
 for(const text of ["The company successfully issued the bonds.","The company has not successfully issued the bonds.","The company will successfully issue the bonds."]) {
  const got=groundClaim({kind:"event",label:"financing",textZh:text,quote:text},{start:0,end:text.length,text},a);
  assert.equal(got?.stage,text==="The company successfully issued the bonds."?"completed":undefined);
 }
 const text="The amendment discloses a new compensation arrangement.";
 const got=groundClaim({kind:"event",label:"management",stage:"completed",textZh:"修订文件披露新的薪酬安排",quote:text},{start:0,end:text.length,text},a);
 assert.equal(got?.stage,null);
 assert.equal(groundClaim({kind:"event",label:"management",stage:"completed",textZh:"新薪酬安排已完成",quote:text},{start:0,end:text.length,text},a),null);
});
test("a separately located table header can support the metric period but cannot supply its value",()=>{
 const text="2026年1-6月 2025年1-6月 增减(%)\n每股收益 2.98 2.89 3.11";
 const chunk={start:0,end:text.length,text};
 const claim={kind:"metric" as const,label:"eps",value:"2.98",period:"2026年1-6月",comparison:"同比增长3.11%",textZh:"2026年1-6月每股收益2.98，同比增长3.11%",quote:"每股收益 2.98 2.89 3.11",evidenceLines:{start:2,end:2},tableHeaderLines:{start:1,end:1}};
 const got=groundClaim(claim,chunk,a);
 assert.equal(got?.tableHeaderEvidence?.quote,text.split("\n")[0]);
 assert.equal(groundClaim({...claim,value:"2026"},chunk,a),null);
 assert.equal(groundClaim({...claim,textZh:"2026年1-6月每股收益为2026元"},chunk,a),null);
 assert.equal(groundClaim({...claim,comparison:"同比增加2026元",textZh:"2026年1-6月每股收益2.98，同比增加2026元"},chunk,a),null);
 const cross={...a,bodyEvidence:{parts:[{start:0,end:28,sourceUrl:"https://other.example/table"},{start:28,end:text.length,sourceUrl:a.url}]}} as any;
 assert.equal(groundClaim(claim,chunk,cross),null);
});
test("all characters of a long disclosure are read including the financial statements at its end",()=>{
 const body="Introduction\n"+"a".repeat(130000)+"\nNet income 200 million. EPS 3.50.";
 const chunks=splitDisclosure(body);
 assert.ok(chunks.length>=3);
 assert.ok(chunks.every(c=>c.text.length<=48000));
 for(let i=0;i<body.length;i++) assert.ok(chunks.some(c=>c.start<=i&&c.end>i));
 assert.ok(chunks.at(-1)!.text.includes("EPS 3.50"));
});
test("a number present somewhere else cannot ground a financial claim",()=>{
 const text="Revenue is 100 million. Profit is 20 million.";
 const chunk={start:0,end:text.length,text};
 assert.equal(groundClaim({kind:"metric",label:"profit",value:"100",textZh:"利润100",quote:"Profit is 20 million."},chunk,a),null);
 assert.ok(groundClaim({kind:"metric",label:"profit",value:"20",textZh:"利润20",quote:"Profit is 20 million."},chunk,a));
});
test("PDF layout spaces may disappear without changing continuous evidence",()=>{
 const text="2026 年 9 月 24 日，公司成功发行了 2026 年度第八期债券。";
 const claim={kind:"event" as const,label:"financing",value:null,stage:"completed" as const,textZh:"公司成功发行了2026年度第八期债券",quote:"2026年9月24日，公司成功发行了2026年度第八期债券。"};
 const found=groundClaim(claim,{start:0,end:text.length,text},a);
 assert.equal(found?.quote,text);
 assert.equal(found?.end,text.length);
 assert.equal(groundClaim({...claim,quote:"2026年9月24日，公司成功发行了第八期债券。"},{start:0,end:text.length,text},a),null);
});
test("a percent table header supports a percentage without an inline percent sign",()=>{
 const text="2026年 收入 增减(%)\n营业收入 100 4.83";
 const c={kind:"metric" as const,label:"revenue",value:"100",comparison:"4.83%",textZh:"2026年收入100，同比增长4.83%",quote:text};
 assert.ok(groundClaim(c,{start:0,end:text.length,text},a));
 const withoutHeader="2026年 收入 增减\n营业收入 100 4.83";
 assert.equal(groundClaim({...c,quote:withoutHeader},{start:0,end:withoutHeader.length,text:withoutHeader},a),null);
 const unrelated="2026年营业收入100百万元。股息率为4%。";
 assert.equal(groundClaim({...c,comparison:"同比增长100%",textZh:"2026年收入100，同比增长100%",quote:unrelated},{start:0,end:unrelated.length,text:unrelated},a),null);
});
test("line ranges recover complete original table evidence and reject invalid or oversized ranges",()=>{
 const text="2026年 期间 收入 增减(%)\n现金流 10\n营业收入 100 4.83";
 const claim={kind:"metric" as const,label:"revenue",value:"100",comparison:"同比增长4.83%",textZh:"2026年收入100，同比增长4.83%",quote:"营业收入 100 4.83",evidenceLines:{start:1,end:3}};
 const found=groundClaim(claim,{start:0,end:text.length,text},a);
 assert.equal(found?.quote,text);assert.equal(found?.start,0);assert.equal(found?.end,text.length);
 for(const evidenceLines of [{start:3,end:1},{start:1,end:4}]) assert.equal(groundClaim({...claim,evidenceLines},{start:0,end:text.length,text},a),null);
 const large="x".repeat(6001)+"\n营业收入 100 4.83";
 assert.equal(groundClaim({...claim,evidenceLines:{start:1,end:2}},{start:0,end:large.length,text:large},a),null);
 const repeated="Revenue 100\nRevenue 100";
 assert.equal(groundClaim({...claim,comparison:null,textZh:"收入100",evidenceLines:{start:2,end:2}},{start:0,end:repeated.length,text:repeated},a)?.start,12);
});
test("accounting basis evidence retains a separate exact location and cannot cross document sources",()=>{
 const text="Revenue 100 million\nGroup results are prepared under IFRS.\nAttachment: non-IFRS supplementary results";
 const claim={kind:"metric" as const,label:"revenue",value:"100",unit:"million",accountingBasis:"IFRS",textZh:"收入100 million",quote:"Revenue 100 million",evidenceLines:{start:1,end:1},accountingBasisLines:{start:2,end:2}};
 const found=groundClaim(claim,{start:0,end:text.length,text},a);
 assert.equal(found?.accountingBasisEvidence?.quote,"Group results are prepared under IFRS.");
 assert.equal(text.slice(found!.accountingBasisEvidence!.start,found!.accountingBasisEvidence!.end),found?.accountingBasisEvidence?.quote);
 const splitAt=text.indexOf("Attachment:");
 const differentDocument={...a,bodyEvidence:{resolvedUrl:a.url,parts:[{name:"main",type:"html",start:0,end:splitAt,sourceUrl:a.url},{name:"attachment",type:"html",start:splitAt,end:text.length,sourceUrl:"https://official.example/another-report"}]}} as AnalyzeInputArticle;
 assert.equal(groundClaim({...claim,accountingBasisLines:{start:2,end:3}},{start:0,end:text.length,text},differentDocument),null);
});
test("metadata failures produce a deterministic short copy without model-generated numbers",()=>{
 const copy=metadataCopy(a);
 assert.ok(copy.summaryZh.includes("正文获取失败"));
 assert.ok(!copy.summaryZh.includes("利润"));
 assert.equal(copy.reasonZh,null);
});
test("proposed and pending approval quotations cannot be promoted to completion",()=>{
 const text="The board proposes a dividend, subject to shareholder approval. The acquisition has not completed.";
 const chunk={start:0,end:text.length,text};
 assert.equal(groundClaim({kind:"stage",label:"dividend",stage:"completed",textZh:"分红已完成",quote:"The board proposes a dividend, subject to shareholder approval."},chunk,a),null);
 assert.equal(groundClaim({kind:"stage",label:"acquisition",stage:"completed",textZh:"收购完成",quote:"The acquisition has not completed."},chunk,a),null);
 assert.ok(groundClaim({kind:"stage",label:"dividend",stage:"proposed",textZh:"拟分红，须股东批准",quote:"The board proposes a dividend, subject to shareholder approval."},chunk,a));
});
test("a parenthesized loss cannot be rewritten as a positive financial value",()=>{
 const text="Net income (20) million.";
 assert.equal(groundClaim({kind:"metric",label:"net_income",value:"20",textZh:"净利润20 million",quote:text},{start:0,end:text.length,text},a),null);
});
test("deduplication preserves different periods and accounting bases from the same table quote",async()=>{
 const {deduplicateClaims}=await import("@aihot/backend/editorial/disclosure");
 const base={kind:"metric" as const,label:"revenue",value:"100",period:"2026",accountingBasis:"GAAP",textZh:"收入100",quote:"2026 GAAP 100; 2025 GAAP 90; 2026 non-GAAP 110",sourceUrl:a.url,start:0,end:48,page:null,document:null};
 assert.equal(deduplicateClaims([base,{...base,value:"90",period:"2025"},{...base,value:"110",accountingBasis:"non-GAAP"},base]).length,3);
});
