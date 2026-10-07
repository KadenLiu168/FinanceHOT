import assert from "node:assert/strict";
import type { GroundedClaim } from "@aihot/backend/editorial/disclosure";
export interface MetricGold {label:string;value:string;periods?:string[];units:string[];currencies:string[];accountingBasis?:string[];comparison?:string[];summaryRequired?:boolean;stage?:"proposed"|"approved"|"completed"}
const normalize=(s:string)=>s.replace(/\s|,/g,"").toLowerCase();
const includesSentence=(summary:string,sentence:string)=>summary.includes(sentence.replace(/[。；;]+$/," ").trim());
export function checkFinancialGold(claims:GroundedClaim[],summary:string,gold:MetricGold[]) {
  for(const expected of gold) {
    const matched=claims.find(c=>c.kind==="metric" && c.label===expected.label && normalize(c.value??"")===normalize(expected.value)
      && (!expected.periods || expected.periods.some(period=>normalize(c.period??"")===normalize(period))
        || (/^(本报告期|本報告期|报告期|報告期)$/.test(c.period??"") && expected.periods.some(period=>normalize(claims.find(p=>p.kind==="reporting_period"&&p.sourceUrl===c.sourceUrl)?.value??"")===normalize(period))))
      && expected.units.some(unit=>normalize(c.unit??"")===normalize(unit))
      && expected.currencies.some(currency=>normalize(c.currency??"")===normalize(currency))
      && (!expected.accountingBasis || expected.accountingBasis.some(basis=>normalize(c.accountingBasis??"")===normalize(basis)))
      && (!expected.stage || (c.stage===expected.stage && (expected.stage!=="approved" || (/授权|授權|批准|authorized|approved/i.test(c.textZh) && !/已完成|完成回购|完成回購|已回购|已回購|已实施|已實施|completed|repurchased/i.test(c.textZh)))))
      && (!expected.comparison || expected.comparison.some(comparison=>normalize(c.comparison??"")===normalize(comparison))));
    assert.ok(matched,`missing exact financial tuple ${expected.label}: ${expected.value}; wrong period/unit/currency/basis cannot pass`);
    if(expected.currencies.length===1&&expected.currencies[0]==="") assert.ok(!/人民币|人民幣|CNY|RMB|美元|USD|美金|港元|HKD|欧元|歐元|EUR|英镑|英鎊|GBP/i.test(matched.textZh),"unknown currency was invented in financial copy");
    if(expected.summaryRequired!==false) assert.ok(includesSentence(summary,matched.textZh),`public summary omits verified primary metric ${expected.label}`);
  }
}
export function checkCoreGold(claims:GroundedClaim[],summary:string,gold:{eventLabels:string[];terms:string[];stage?:string}) {
  const event=claims.find(c=>c.kind==="event" && gold.eventLabels.includes(c.label));
  assert.ok(event,"missing expected primary event type");
  assert.ok(includesSentence(summary,event.textZh),"public summary omits core event");
  for(const term of gold.terms) assert.ok(claims.some(c=>c.quote.includes(term)),`missing core source evidence: ${term}`);
  if(gold.stage) assert.ok(claims.some(c=>(c.kind==="stage"||c.kind==="event") && c.stage===gold.stage && gold.eventLabels.includes(c.label) && includesSentence(summary,c.textZh)),"missing correct current stage in public summary");
}
