// A disclosure is understood from every document section; only located, verified claims reach copy.
import { sql } from "../db.ts";
import { z } from "zod";
import { chatJson, type ChatJsonResult } from "../providers/llm.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { documentHash } from "../content/documents.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { ENTITIES } from "./vocabulary.ts";
import type { AnalyzeInputArticle } from "./input.ts";

export interface DisclosureChunk { start:number; end:number; text:string }
export function splitDisclosure(text:string): DisclosureChunk[] {
  const chunks:DisclosureChunk[]=[];
  for(let start=0;start<text.length;) {
    let end=Math.min(start+48000,text.length);
    if(end<text.length) {const boundary=text.lastIndexOf("\n",end);if(boundary>start+24000) end=boundary+1;}
    chunks.push({start,end,text:text.slice(start,end)});
    if(end===text.length) break;
    start=Math.max(start+1,end-1000);
  }
  return chunks;
}
export const DisclosureClaimSchema=z.preprocess(value=>{
  if(value&&typeof value==="object"&&"kind" in value&&["reporting_period","term"].includes(String(value.kind))&&(!("label" in value)||value.label==null)) return {...value,label:value.kind};
  return value;
},z.object({
  kind:z.enum(["event","metric","stage","reporting_period","term"]),
  label:z.string().max(100), value:z.string().max(200).nullable().optional(),
  unit:z.string().max(80).nullable().optional(),currency:z.string().max(40).nullable().optional(),
  period:z.string().max(120).nullable().optional(),accountingBasis:z.string().max(80).nullable().optional(),
  comparison:z.string().max(200).nullable().optional(),
  stage:z.enum(["proposed","approved","completed","unknown"]).nullable().optional(),
  evidenceLines:z.object({start:z.number().int().positive(),end:z.number().int().positive()}).nullish(),
  accountingBasisLines:z.object({start:z.number().int().positive(),end:z.number().int().positive()}).nullish(),
  currencyLines:z.object({start:z.number().int().positive(),end:z.number().int().positive()}).nullish(),
  tableHeaderLines:z.object({start:z.number().int().positive(),end:z.number().int().positive()}).nullish(),
  textZh:z.string().min(1).max(300),quote:z.string().max(6000).default(""),
})).refine(claim=>Boolean(claim.quote.trim()||claim.evidenceLines),"quote or evidenceLines is required");
export type Claim=z.infer<typeof DisclosureClaimSchema>;
export type GroundedClaim=Claim & {sourceUrl:string;start:number;end:number;page:number|null;document:string|null;accountingBasisEvidence?:LocatedEvidence;currencyEvidence?:LocatedEvidence;tableHeaderEvidence?:LocatedEvidence;relatedEvent?:{sourceUrl:string;start:number;end:number;label:string}};
interface LocatedEvidence {quote:string;sourceUrl:string;start:number;end:number}
function locatedLines(range:{start:number;end:number},chunk:DisclosureChunk,a:AnalyzeInputArticle):LocatedEvidence|null {
  const lines=chunk.text.split("\n");
  if(range.start>range.end||range.end>lines.length) return null;
  const quote=lines.slice(range.start-1,range.end).join("\n");
  if(!quote.trim()||quote.length>6000) return null;
  const start=chunk.start+lines.slice(0,range.start-1).reduce((length,line)=>length+line.length+1,0),end=start+quote.length;
  const parts=a.bodyEvidence?.parts.filter(p=>p.start<end&&p.end>start)??[];
  const sourceUrl=parts[0]?.sourceUrl??a.bodyEvidence?.resolvedUrl??a.url;
  if(parts.some(p=>(p.sourceUrl??a.bodyEvidence?.resolvedUrl??a.url)!==sourceUrl)) return null;
  return {quote,sourceUrl,start,end};
}
const currencies=[
  {label:/^(?:CNY|RMB|人民币|人民幣)$/i,evidence:/\bCNY\b|\bRMB\b|人民币|人民幣/i},
  {label:/^(?:HKD|HK\$|港元|港币|港幣)$/i,evidence:/\bHKD\b|HK\$|港元|港币|港幣|Hong Kong dollars/i},
  {label:/^(?:USD|US\$|美元|美金)$/i,evidence:/\bUSD\b|US\$|美元|美金|U\.?S\.? dollars|United States dollars/i},
  {label:/^(?:EUR|欧元|歐元)$/i,evidence:/\bEUR\b|euros?|欧元|歐元/i},
  {label:/^(?:GBP|英镑|英鎊)$/i,evidence:/\bGBP\b|英镑|英鎊|pounds sterling/i},
];
const currencySupported=(currency:string,text:string)=>currency==="$"?/(?<![A-Za-z])\$/.test(text):currencies.find(c=>c.label.test(currency))?.evidence.test(text)??text.toLowerCase().includes(currency.toLowerCase());
export const DisclosureOutputSchema=z.object({announcementType:z.string().max(100).nullable(),itemType:z.enum(["earnings","capital_event","corporate_event"]),claims:z.array(DisclosureClaimSchema).max(24)});
const StageLinkSchema=z.object({event:z.number().int().min(0),stage:z.number().int().min(0)});
const VerifySchema=z.object({accepted:z.array(z.number().int().min(0)).max(24),rejected:z.array(z.object({index:z.number().int().min(0),reason:z.string().max(500)})).max(24).nullish(),stageLinks:z.array(z.unknown()).max(24).nullish().transform(links=>links?.flatMap(link=>{const parsed=StageLinkSchema.safeParse(link);return parsed.success?[parsed.data]:[];}))});
const numbers=(text:string)=>text.match(/[（(][−-]?\d+(?:[,.]\d+)*(?:%|％)?[）)]|[−-]?\d+(?:[,.]\d+)*(?:%|％)?/g)??[];
const numericKey=(text:string)=>text.replace(/,/g,"").replace(/％/g,"%").replace(/（/g,"(").replace(/）/g,")").replace(/−/g,"-");
const yearDigits:Record<string,string>={"〇":"0","零":"0","一":"1","二":"2","三":"3","四":"4","五":"5","六":"6","七":"7","八":"8","九":"9"};
const chineseYears=(text:string)=>[...text.matchAll(/([〇零一二三四五六七八九]{4})年/g)].map(match=>[...match[1]!].map(c=>yearDigits[c]).join(""));
const periodKey=(text:string)=>text.replace(/\s/g,"").replace(/^截至/,"").replace(/個/g,"个").replace(/([〇零一二三四五六七八九]{4})年/g,(_match,year:string)=>[...year].map(c=>yearDigits[c]).join("")+"年").toLowerCase();

/** A verifier still checks meaning; these deterministic checks establish evidence and prevent invented numbers. */
export function groundClaim(claim:Claim,chunk:DisclosureChunk,a:AnalyzeInputArticle):GroundedClaim|null {
  let quote=claim.quote;
  let local=chunk.text.indexOf(quote);
  if(claim.evidenceLines) {
    const lines=chunk.text.split("\n"),{start,end}=claim.evidenceLines;
    if(start>end||end>lines.length) return null;
    quote=lines.slice(start-1,end).join("\n");
    if(!quote.trim()||quote.length>6000) return null;
    local=lines.slice(0,start-1).reduce((length,line)=>length+line.length+1,0);
  }
  if(!quote.trim()) return null;
  const tableHeaderEvidence=claim.tableHeaderLines?locatedLines(claim.tableHeaderLines,chunk,a):null;
  if(claim.tableHeaderLines&&(!tableHeaderEvidence||claim.kind!=="metric")) return null;
  if(claim.kind==="metric"&&claim.label==="issue_amount"&&!/发行\s*总额|發行\s*總額|发行\s*金额|發行\s*金額|aggregate\s+(?:principal|offering)|issuance\s+(?:amount|proceeds)/i.test(quote)) return null;
  if(local<0) {
    // PDF whitespace is layout, not a licence to assemble non-contiguous quotations.
    const positions:number[]=[];
    let compact="";
    for(let i=0;i<chunk.text.length;i++) if(!/\s/.test(chunk.text[i]!)) {compact+=chunk.text[i];positions.push(i);}
    const wanted=quote.replace(/\s/g,"");
    const hit=wanted?compact.indexOf(wanted):-1;
    if(hit<0) return null;
    local=positions[hit]!;quote=chunk.text.slice(local,positions[hit+wanted.length-1]!+1);
  }
  // A verified issuance sentence must not lose its explicit phase when the optional field is omitted.
  if(claim.kind==="event"&&!claim.stage) {
    const issued=/成功发行|成功發行|发行已完成|發行已完成|successfully issued/i;
    const pending=/未成功发行|未成功發行|尚未发行|尚未發行|未发行|未發行|拟|擬|计划|計劃|\b(?:not|plan|propos\w*|will)\b/i;
    if(issued.test(quote)&&issued.test(claim.textZh)&&!pending.test(quote)&&!pending.test(claim.textZh)) claim={...claim,stage:"completed"};
  }
  const completion=/completed|consummated|完成|已实施|已實施|已发行|已發行|成功发行|成功發行|successfully issued/i;
  if(claim.kind==="event"&&claim.stage==="completed"&&!completion.test(quote)&&!completion.test(claim.textZh)) claim={...claim,stage:null};
  if(claim.stage && claim.stage !== "unknown") {
    if(claim.stage === "completed" && (!completion.test(quote) || /not (?:yet )?completed|not successfully issued|尚未完成|未完成|尚未实施|尚未實施|未成功发行|未成功發行/i.test(quote))) return null;
    if(claim.stage === "approved" && (!/approved|authorized|declared|批准|議決|议决|审议通过|審議通過/i.test(quote) || /pending approval|subject to .*approval|尚待批准|未获批准|未獲批准/i.test(quote))) return null;
    if(claim.stage === "proposed" && !/propos|plan|拟|擬|建议|建議|計劃|计划/i.test(quote)) return null;
  }
  if(/authorized|authorization|授權|授权/i.test(quote) && /已完成|完成回购|完成回購|已回购|已回購|已实施|已實施|completed repurchase/i.test(claim.textZh)) return null;
  const supported=numbers(quote).map(numericKey);
  const headerSupported=numbers(tableHeaderEvidence?.quote??"").map(numericKey);
  for(const match of quote.matchAll(/(\d+(?:\.\d+)?)\s+percent\b/gi)) supported.push(`${match[1]}%`);
  // Normalize only explicitly written four-digit report years, never amounts or inferred periods.
  const reportYears=chineseYears(quote+"\n"+(tableHeaderEvidence?.quote??""));
  const percentColumn=/[（(][％%][）)]/.test(quote+"\n"+(tableHeaderEvidence?.quote??""));
  const supportsNumber=(n:string,headerAllowed:boolean)=>supported.includes(numericKey(n)) || (headerAllowed&&headerSupported.includes(numericKey(n))) || (percentColumn && /[％%]$/.test(n) && supported.includes(numericKey(n).replace(/%$/,"")));
  const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dates=[...(quote+"\n"+(tableHeaderEvidence?.quote??"")).matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi)].map(m=>({month:months.findIndex(month=>month.toLowerCase()===m[1]!.toLowerCase())+1,day:Number(m[2]),year:m[3]!}));
  for(const [field,dateField,headerAllowed] of [[claim.value,claim.kind==="reporting_period",false],[claim.unit,false,true],[claim.currency,false,false],[claim.period,true,true],[claim.comparison,false,false],[claim.textZh,true,false]] as const) {
    let numericField=field??"";
    if(field===claim.textZh&&tableHeaderEvidence) {
      // A header supports identified context spans, never a free supply of amounts for prose.
      if(claim.period&&/年|月|季度|半年|months?|years?|fiscal|FY|ended/i.test(claim.period)) numericField=numericField.replaceAll(claim.period,"");
      if(claim.comparison&&/同比|上年|增|降|減|减|year|change|growth|increase|decrease/i.test(claim.comparison)) numericField=numericField.replaceAll(claim.comparison,"");
    }
    if(dateField) {
      for(const d of dates) numericField=numericField.replace(new RegExp(`${d.year}\\s*年\\s*${d.month}\\s*月\\s*${d.day}\\s*日`,"g"),"");
      for(const year of reportYears) numericField=numericField.replace(new RegExp(`${year}\\s*年`,"g"),"");
    }
    if(numbers(numericField).some(n=>!supportsNumber(n,headerAllowed))) return null;
  }
  if(claim.value && claim.kind!=="reporting_period" && !collapseWhitespace(quote).includes(collapseWhitespace(claim.value))) return null;
  const start=chunk.start+local,end=start+quote.length;
  const part=a.bodyEvidence?.parts.find(p=>p.start<=start&&p.end>=end);
  const sourceUrl=part?.sourceUrl??a.bodyEvidence?.resolvedUrl??a.url;
  if(tableHeaderEvidence&&tableHeaderEvidence.sourceUrl!==sourceUrl) return null;
  if(a.bodyEvidence?.parts.some(p=>p.start<end&&p.end>start&&(p.sourceUrl??a.bodyEvidence?.resolvedUrl??a.url)!==sourceUrl)) return null;
  let accountingBasisEvidence:GroundedClaim["accountingBasisEvidence"];
  if(claim.accountingBasisLines) {
    const basis=locatedLines(claim.accountingBasisLines,chunk,a);
    if(!basis||!claim.accountingBasis||basis.sourceUrl!==sourceUrl) return null;
    accountingBasisEvidence=basis;
  }
  let currencyEvidence:GroundedClaim["currencyEvidence"];
  if(claim.currencyLines) {
    const currency=locatedLines(claim.currencyLines,chunk,a);
    if(!currency||!claim.currency||currency.sourceUrl!==sourceUrl) return null;
    currencyEvidence=currency;
  }
  const currencyText=quote+"\n"+(currencyEvidence?.quote??"");
  if(claim.currency&&!currencySupported(claim.currency,currencyText)) return null;
  for(const currency of currencies) {
    const label=currency.label.source.replace(/^\^\(\?:|\)\$$/g,"");
    if(new RegExp(label,"i").test((claim.textZh??"")+" "+(claim.unit??""))&&!currency.evidence.test(currencyText)) return null;
  }
  return {...claim,quote,sourceUrl,start,end,page:part?.page??null,document:part?.name??null,...(accountingBasisEvidence?{accountingBasisEvidence}:{}),...(currencyEvidence?{currencyEvidence}:{}),...(tableHeaderEvidence?{tableHeaderEvidence}:{})};
}
export function metadataCopy(a:AnalyzeInputArticle) {
  const entity=a.source.ownerEntityId?ENTITIES[a.source.ownerEntityId]:null;
  const name=entity?.displayTag??a.source.name;
  const status=a.bodyStatus==="unconfirmed"?"正文获取失败":"正文未读取";
  // Form 4 is a submission associated with this query company, never proof of its issuer role.
  return {kind:"none" as const,model:null,titleZh:a.title,summaryZh:`${name}相关官方披露：${a.title}。${status}，目前仅有公告标题与官方记录，具体事实请查看原文。`,reasonZh:null,receiptIds:[] as number[],reused:true};
}
export function disclosureCompany(a:AnalyzeInputArticle) {
  const owner=a.source.ownerEntityId??null;
  const isForm4=/SEC\s+4(?:\/A)?\s+filing|<TYPE>\s*4(?:\r?\n|<)|<ownershipDocument/i.test(a.title+"\n"+(a.bodyText??""));
  if(isForm4) {
    const text=a.bodyText??"";
    const issuer=/<issuer>[\s\S]*?<issuerName>([\s\S]*?)<\/issuerName>[\s\S]*?<\/issuer>/i.exec(text)?.[1]?.trim()??null;
    const issuerCik=/<issuer>[\s\S]*?<issuerCik>([\s\S]*?)<\/issuerCik>/i.exec(text)?.[1]?.trim()??null;
    const reportingOwner=/<reportingOwner>[\s\S]*?<rptOwnerName>([\s\S]*?)<\/rptOwnerName>/i.exec(text)?.[1]?.trim()??null;
    const reportingOwnerCik=/<reportingOwner>[\s\S]*?<rptOwnerCik>([\s\S]*?)<\/rptOwnerCik>/i.exec(text)?.[1]?.trim()??null;
    return {entityId:null,role:"associated",queryEntityId:owner,issuer,issuerCik,reportingOwner,reportingOwnerCik};
  }
  // A multi-issuer list has no owner: require its explicit issuer metadata, not mentions in the body.
  const issuer=/(?:发行人|發行人)：([^；;\n]+)/.exec(a.excerpt??"")?.[1]?.trim();
  const id=owner??Object.entries(ENTITIES).find(([,entity])=>issuer&&entity.aliases.some(alias=>alias===issuer))?.[0]??null;
  return {entityId:id,role:id?"issuer":"unknown",name:id?ENTITIES[id]?.displayTag:null};
}
export interface DisclosureFacts {
  company:ReturnType<typeof disclosureCompany>;publishedAt:string|null;publishedAtPrecision:"day"|"datetime"|"unknown";sourceUrl:string;
  stage:"proposed"|"approved"|"completed"|"unknown";reportingPeriod:string|null;
  announcementType:string|null;itemType:"earnings"|"capital_event"|"corporate_event";
  claims:GroundedClaim[];coverage:"complete"|"partial"|"unavailable";
  chunks:Array<{start:number;end:number;status:"ok"|"failed"|"unprocessed"}>;
  receiptIds:number[];reused:boolean;model:string;
}
function currentStage(claims:GroundedClaim[]) {
  const event=claims.find(c=>c.kind==="event");
  if(!event||event.stage&&event.stage!=="unknown") return undefined;
  return claims.find(c=>c.kind==="stage"&&c.sourceUrl===event.sourceUrl&&c.relatedEvent?.sourceUrl===event.sourceUrl&&c.relatedEvent.start===event.start&&c.relatedEvent.end===event.end&&c.relatedEvent.label===event.label);
}
export async function understandDisclosure(a:AnalyzeInputArticle,attemptTag?:string):Promise<DisclosureFacts> {
  const model=await modelFor("structure");
  const company=disclosureCompany(a);
  const result:DisclosureFacts={company,publishedAtPrecision:a.source.publicationDatePrecision??"unknown",stage:"unknown",reportingPeriod:null,publishedAt:a.publishedAt?.toISOString()??null,sourceUrl:a.url,
    announcementType:a.bodyEvidence?.parts.find(part=>/^(?:10-[KQ]|8-K|DEF 14A|4)(?:\/A)?$/.test(part.type))?.type??a.title,itemType:"corporate_event",claims:[],coverage:"unavailable",chunks:[],receiptIds:[],reused:true,model};
  if(!a.bodyText||a.bodyStatus!=="ok") return result;
  const chunks=splitDisclosure(a.bodyText);
  const progress = () => sql`UPDATE articles SET disclosure_progress = ${sql.json({ revision: a.revision, ...result } as never)} WHERE id=${a.id} AND revision=${a.revision}`;
  for(const [index, chunk] of chunks.entries()) {
    try {
      const lines=chunk.text.split("\n");
      const evidenceHints=lines.flatMap((line,i)=> /(?:prepared|編製|编制|根據|按照).*(?:GAAP|IFRS|財務報告準則|会计准则)|(?:currency|货币币种|貨幣幣種|U\.?S\.? dollars|Hong Kong dollars)/i.test(line) ? [{start:Math.max(1,i-2),end:Math.min(lines.length,i+4),text:lines.slice(Math.max(0,i-3),Math.min(lines.length,i+4)).join("\n")}] : []).slice(0,20);
      const subject=`article:${a.id}:r${a.revision}:disclosure:${chunk.start}:${documentHash(chunk.text)}`;
      let repair:Record<string,unknown>|null=null;
      for(let pass=0;pass<2;pass++) {
        const passSubject=pass?`${subject}:repair`:subject;
        const response:ChatJsonResult<z.infer<typeof DisclosureOutputSchema>>=await chatJson({model,purpose:"structure_article",subject:passSubject,sessionKey:`article:${a.id}@${a.revision}`,promptVersion:promptVersion("disclosure-facts"),
          system:promptText("disclosure-facts"),user:JSON.stringify({revision:a.revision,evidenceHash:a.bodyEvidence?.contentHash??null,company,title:a.title,publishedAt:result.publishedAt,sourceUrl:a.url,evidenceHints,...(repair?{repair}:{}),chunk:{...chunk,text:lines.map((line,index)=>`[${index+1}] ${line}`).join("\n")}}),
          schema:DisclosureOutputSchema,temperature:0,maxTokens:12000,timeoutMs:180000,attemptTag});
        result.receiptIds.push(response.receiptId);result.reused&&=response.reused;
        const candidates=response.data.claims.flatMap(c=>{const got=groundClaim(c,chunk,a);return got?[got]:[];});
        const checked=candidates.length?await chatJson({model,purpose:"structure_article",subject:`${passSubject}:verify`,sessionKey:`article:${a.id}@${a.revision}`,
          promptVersion:promptVersion("disclosure-verify"),system:promptText("disclosure-verify"),
          user:JSON.stringify({revision:a.revision,evidenceHash:a.bodyEvidence?.contentHash??null,company,title:a.title,publishedAt:result.publishedAt,claims:candidates.map((c,index)=>({index,...c}))}),schema:VerifySchema,
          temperature:0,maxTokens:3000,timeoutMs:120000,attemptTag}):null;
        if(checked){result.receiptIds.push(checked.receiptId);result.reused&&=checked.reused;}
        const accepted=new Set(checked?.data.accepted??[]);
        for(const link of checked?.data.stageLinks??[]) {
          const event=candidates[link.event],stage=candidates[link.stage];
          if(event?.kind==="event"&&stage?.kind==="stage"&&event.sourceUrl===stage.sourceUrl&&accepted.has(link.event)&&accepted.has(link.stage)) stage.relatedEvent={sourceUrl:event.sourceUrl,start:event.start,end:event.end,label:event.label};
        }
        result.claims.push(...candidates.filter((_,index)=>accepted.has(index)));
        if(index===0&&pass===0) result.itemType=response.data.itemType;
        if(pass||index||company.role!=="issuer") break;
        const coreLabels=["revenue","net_income","eps","dividend","buyback","issue_amount","loan_amount","guarantee_amount"];
        const missing=response.data.claims.filter(c=>["event","stage","reporting_period"].includes(c.kind)||(c.kind==="metric"&&coreLabels.includes(c.label))).filter(c=>!result.claims.some(g=>g.kind===c.kind&&g.label===c.label));
        const required:string[]=[];
        if(missing.some(c=>c.kind==="metric")) required.push("rejected metric evidence: every period number and unit must be inside evidenceLines; for EPS below a table header, span from that header through the EPS row. A standalone financing amount row has no reporting period: use period=null unless the cited range explicitly contains it. Do not copy a document-wide stage into a numeric row");
        if(!result.claims.some(c=>c.kind==="event"&&(result.itemType!=="earnings"||c.label==="earnings"))) required.push("core event: use a short description of the actual document topic, without claiming an unsupported publication action");
        if(result.itemType==="earnings"&&!result.claims.some(c=>c.kind==="reporting_period")) required.push("explicit primary reporting period");
        if(result.itemType==="earnings") {
          if(/摊薄|攤薄|稀释每股|稀釋每股|diluted/i.test(chunk.text)&&!result.claims.some(c=>c.kind==="metric"&&c.label==="eps")) required.push("explicit diluted EPS: include the reported current-period value, unit and period if supported by the table");
          if(/同比|比上年同期|year.over.year/i.test(chunk.text)&&result.claims.some(c=>c.kind==="metric"&&["revenue","net_income"].includes(c.label)&&!/%|％|percent/i.test(c.comparison??""))) required.push("reported year-on-year percentage for primary revenue and attributable net income: cite the percentage column and row, do not calculate or substitute the prior-period amount");
          if(result.claims.some(c=>c.kind==="metric"&&c.label==="dividend"&&!c.comparison&&/increase|增|上调|上調/i.test(c.quote)&&/%|％|percent/i.test(c.quote))) required.push("explicit dividend increase percentage: preserve the verified dividend value and payment date and include the quoted increase in comparison and textZh, without computing it");
        }
        const needsBasis=result.itemType==="earnings"&&evidenceHints.some(h=>/GAAP|IFRS|根據國際財務報告準則|按照.*会计准则/i.test(h.text))&&result.claims.some(c=>c.kind==="metric"&&["revenue","net_income","eps"].includes(c.label)&&!c.accountingBasis);
        if(needsBasis) required.push("accounting basis for EVERY acceptedCandidates metric with unknown basis: preserve all their separate periods, including quarter and half-year. Cite the explicit applicable preparation note using accountingBasisLines; distinguish standard and non-standard columns. Do not repair only the first period");
        if(!missing.length&&!required.length) break;
        // Actual acceptance exposed rejected essential facts: one focused evidence repair, never a blind retry loop.
        repair={required,rejectedCandidates:missing,verificationFeedback:checked?.data.rejected??[],acceptedCandidates:needsBasis?result.claims.filter(c=>c.kind==="metric"&&["revenue","net_income","eps"].includes(c.label)&&!c.accountingBasis):[]};
      }
      result.chunks.push({start:chunk.start,end:chunk.end,status:"ok"});
      result.coverage = index === chunks.length - 1 && !a.bodyEvidence?.relatedFailures?.length ? "complete" : "partial";
      await progress();
    } catch(error) {
      result.coverage = "partial";
      result.chunks.push({start:chunk.start,end:chunk.end,status:"failed"}, ...chunks.slice(index+1).map(c=>({start:c.start,end:c.end,status:"unprocessed" as const})));
      await progress();
      // Retain the worker's budget/unknown-receipt recovery, without hiding completed sections.
      throw error;
    }
  }
  result.claims=deduplicateClaims(result.claims);
  const financialTitle=/earnings|financial results|annual (?:report|results)|interim report|quarterly report|10-[KQ]|财报|財報|業績|业绩|(?:半年度|年度|中期|季度).*(?:报告|報告)/i.test(a.title);
  if(company.role==="issuer"&&result.itemType==="earnings"&&financialTitle&&!result.claims.some(c=>c.kind==="event"&&c.label==="earnings")) {
    const period=result.claims.find(c=>c.kind==="reporting_period");
    const revenue=period?result.claims.find(c=>c.kind==="metric"&&c.label==="revenue"&&c.period&&c.sourceUrl===period.sourceUrl&&(periodKey(c.period)===periodKey(period.value??"")||/^(本报告期|本報告期|报告期|報告期)$/.test(c.period))&&["net_income","eps"].every(label=>result.claims.some(m=>m.kind==="metric"&&m.label===label&&m.sourceUrl===c.sourceUrl&&periodKey(m.period??"")===periodKey(c.period!)))):null;
    // Reuse an already verified financial sentence, not a new model claim or a metadata-only conclusion.
    if(revenue) result.claims.unshift({...revenue,kind:"event",label:"earnings",value:null,stage:null});
  }
  if(result.itemType==="earnings") result.claims.sort((a,b)=>Number(b.kind==="event"&&b.label==="earnings")-Number(a.kind==="event"&&a.label==="earnings"));
  const primaryEvent = result.claims.find(c=>c.kind==="event");
  result.stage=currentStage(result.claims)?.stage??primaryEvent?.stage??"unknown";
  result.reportingPeriod=result.claims.find(c=>c.kind==="reporting_period")?.value??null;
  await progress();
  return result;
}

export function deduplicateClaims(claims:GroundedClaim[]):GroundedClaim[] {
  const seen = new Set<string>();
  return claims.filter(c => {
    const key = JSON.stringify([c.kind,c.label,c.value,c.unit,c.currency,c.period,c.accountingBasis,c.comparison,c.stage,c.sourceUrl,c.start,c.end,c.quote,c.relatedEvent]);
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** Render validated sentences, not a fresh opportunity for the model to invent facts. */
export function disclosureCopy(a:AnalyzeInputArticle,facts:DisclosureFacts) {
  if("issuer" in facts.company && facts.company.issuer && facts.company.reportingOwner) {
    return {kind:"verbatim" as const,model:null,titleZh:`SEC Form 4：${facts.company.issuer}相关申报`,
      summaryZh:`官方 Form 4 列明发行人为 ${facts.company.issuer}，申报持有人为 ${facts.company.reportingOwner}。交易方向和数量须按原文交易表核对。`,
      reasonZh:null,itemType:"corporate_event",authorRole:"principal",receiptIds:[] as number[],reused:true};
  }
  const events=facts.claims.filter(c=>c.kind==="event").sort((a,b)=>facts.itemType==="earnings"?Number(b.label==="earnings")-Number(a.label==="earnings"):0);
  const periods=facts.claims.filter(c=>c.kind==="reporting_period");
  const stage=currentStage([...events,...facts.claims.filter(c=>c.kind!=="event")]);
  const stages=stage?[stage]:[];
  const priority=["revenue","net_income","eps","guidance","dividend","buyback"];
  const metrics=facts.claims.filter(c=>c.kind==="metric").sort((a,b)=>{
    const rank=(label:string)=>{const i=priority.indexOf(label);return i<0?priority.length:i;};
    const basisRank=(basis:string|null|undefined)=> /^(?:IFRS|GAAP|U\.?S\.? GAAP|国际财务报告准则|國際財務報告準則|中国会计准则|中國會計準則)$/i.test(basis??"") ? 0 : /non[- ]?(?:GAAP|IFRS)|非國際財務|非国际财务/i.test(basis??"") ? 1 : 2;
    return rank(a.label)-rank(b.label)||basisRank(a.accountingBasis)-basisRank(b.accountingBasis);
  });
  const terms=facts.claims.filter(c=>c.kind==="term");
  const nonfinancialPriority=["issue_amount","loan_amount","guarantee_amount","interest_rate","dividend","buyback"];
  const primaryMetrics = facts.itemType==="earnings" ? priority.flatMap(label => metrics.filter(c=>c.label===label).slice(0,2)) : metrics.filter(c=>!priority.includes(c.label)||["dividend","buyback"].includes(c.label)).sort((a,b)=>{
    const rank=(label:string)=>{const index=nonfinancialPriority.indexOf(label);return index<0?nonfinancialPriority.length:index;};
    return rank(a.label)-rank(b.label);
  }).slice(0,4);
  const chosen=[...events.slice(0,1),...periods.slice(0,1),...stages.slice(0,1),...primaryMetrics.slice(0,12),...terms.slice(0,2)];
  const summary=chosen.map(c=>c.textZh.replace(/[。；;]+$/," ").trim()).join("；");
  if(!summary) return {...metadataCopy({...a,bodyStatus:"unconfirmed"}),summaryZh:"已读取官方正文，但尚未得到可核验的核心事实；请查看原文。"};
  return {kind:"understand" as const,model:facts.model,titleZh:events[0]?.textZh??a.title,
    summaryZh:summary+"。",reasonZh:metrics[0] ? `${metrics[0].textZh}；这是核对本次披露关键指标的一手依据。` : facts.itemType==="earnings"?"官方披露提供了核对报告期经营业绩与财务指标的一手依据。":facts.itemType==="capital_event"?"官方披露提供了核对资本事项条款与当前进度的一手依据。":"官方披露提供了核对重大公司事项与当前进度的一手依据。",
    itemType:facts.itemType,authorRole:"principal",receiptIds:[] as number[],reused:facts.reused};
}
