import assert from "node:assert/strict";
import {test} from "node:test";
import {checkFinancialGold,checkCoreGold} from "../scripts/lib/disclosure-acceptance.ts";
import type {GroundedClaim} from "@aihot/backend/editorial/disclosure";
const gold=[{label:"revenue",value:"100",periods:["2026"],units:["million"],currencies:["USD"],accountingBasis:["GAAP"],comparison:["10% year-over-year"]}];
const claim={kind:"metric",label:"revenue",value:"100",period:"2026",unit:"million",currency:"USD",accountingBasis:"GAAP",comparison:"10% year-over-year",textZh:"2026年收入100 million USD",quote:"2026 100; 2025 90, USD million",sourceUrl:"https://official.example",start:0,end:34,page:null,document:null} as GroundedClaim;
test("joined summary sentences preserve facts when a sentence terminator becomes a semicolon",()=>{
 const metric={...claim,textZh:claim.textZh+"。"};
 const event={...claim,kind:"event" as const,label:"earnings",textZh:"公司公布2026年财报。"};
 const summary="公司公布2026年财报；2026年收入100 million USD。";
 checkFinancialGold([metric],summary,gold);
 checkCoreGold([event],summary,{eventLabels:["earnings"],terms:[]});
 assert.throws(()=>checkCoreGold([event],"公司公布2025年财报。",{eventLabels:["earnings"],terms:[]}));
});
test("a verified primary event phase does not require a duplicate stage sentence",()=>{
 const event={...claim,kind:"event" as const,label:"financing",stage:"completed" as const,textZh:"公司成功发行债券。"};
 checkCoreGold([event],event.textZh,{eventLabels:["financing"],terms:[],stage:"completed"});
 assert.throws(()=>checkCoreGold([{...event,stage:"approved"}],event.textZh,{eventLabels:["financing"],terms:[],stage:"completed"}));
});
test("an explicitly unknown currency cannot be guessed in units or copy",()=>{
 const unknown={...claim,currency:null,unit:"千元",textZh:"2026年收入100千元"};
 const gold=[{label:"revenue",value:"100",periods:["2026"],units:["千元"],currencies:[""]}];
 checkFinancialGold([unknown],unknown.textZh,gold);
 for(const change of [{unit:"人民币千元"},{textZh:"2026年收入100千元人民币"}]) assert.throws(()=>checkFinancialGold([{...unknown,...change}],"2026年收入100千元人民币",gold));
});
test("the current reporting period requires the same document's verified primary period",()=>{
 const current={...claim,period:"本报告期"};
 assert.throws(()=>checkFinancialGold([current],current.textZh,gold));
 const period={...claim,kind:"reporting_period" as const,label:"reporting_period",value:"2026",textZh:"报告期2026年"};
 checkFinancialGold([period,current],current.textZh,gold);
 for(const change of [{value:"2025"},{sourceUrl:"https://another.example"}]) assert.throws(()=>checkFinancialGold([{...period,...change},current],current.textZh,gold));
});
test("a correct number somewhere in a table cannot make a wrong metric tuple pass acceptance",()=>{
 for(const change of [{value:"90"},{period:"2025"},{unit:"billion"},{currency:"CNY"},{accountingBasis:"non-GAAP"},{comparison:"20% year-over-year"}])assert.throws(()=>checkFinancialGold([{...claim,...change}],claim.textZh,gold));
 checkFinancialGold([claim],claim.textZh,gold);
 assert.throws(()=>checkFinancialGold([claim],"公司公布了财报。",gold));
});
test("a buyback authorization cannot pass gold as a completed repurchase even when amount and currency match",()=>{
 const authorization={...claim,label:"buyback",value:"100",period:null,unit:"billion",currency:"USD",stage:"approved" as const,textZh:"已完成100 billion USD回购",quote:"authorized an additional program to repurchase up to $100 billion"};
 const gold=[{label:"buyback",value:"100",units:["billion"],currencies:["USD"],stage:"approved" as const}];
 assert.throws(()=>checkFinancialGold([authorization],authorization.textZh,gold));
 const correct={...authorization,textZh:"授权新增最多100 billion USD回购计划"};
 checkFinancialGold([correct],correct.textZh,gold);
});
