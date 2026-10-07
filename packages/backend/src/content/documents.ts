// Free official-document extraction. Network requests retain the shared SSRF/redirect guards.
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { guardedFetch, type GuardedResponse } from "../lib/http-fetch.ts";
import { sanitizeBody } from "./sanitize.ts";

export interface DocumentPart { sourceUrl?: string; contentHash?: string; name: string; type: string; start: number; end: number; page?: number }
export interface BodyEvidence {
  schemaVersion: 1;
  status: "metadata-only" | "fulltext available" | "fulltext extraction failed";
  sourceUrl: string;
  resolvedUrl: string;
  format: "pdf" | "html" | "sec" | "unknown";
  parser: string;
  fetchedAt: string;
  contentHash: string | null;
  textHash: string | null;
  parts: DocumentPart[];
  failureReason: string | null;
  relatedFailures?: Array<{url:string;reason:string}>;
}
export const documentHash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
export const officialDisclosure = (config: Record<string, unknown>) => config.disclosureRole === "statutory" || config.disclosureRole === "issuer_ir";
export interface OfficialBody { html: string; text: string; evidence: BodyEvidence }

/** Keep table rows, columns and paragraphs rather than joining financial cells into an ambiguous number. */
export function documentText(html: string): string {
  const $ = load(html);
  $('script,style,noscript,svg,ix\\:hidden,ix\\:header,[hidden],[style*="display:none"],[style*="display: none"]').remove();
  $("td,th").append(" | ");
  $("tr,p,div,li,h1,h2,h3,h4,br").append("\n");
  return $.root().text().replace(/\r/g, "").replace(/[ \t]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}

export async function parseDocument(response: Pick<GuardedResponse,"body"|"url"|"headers">): Promise<OfficialBody> {
  const { body, url } = response;
  const evidence: BodyEvidence = { schemaVersion: 1, status: "fulltext available", sourceUrl: url, resolvedUrl: url,
    format: "unknown", parser: "", fetchedAt: new Date().toISOString(), contentHash: documentHash(body), textHash: null, parts: [], failureReason: null };
  let text = "", html = "";
  if (body.subarray(0,5).toString() === "%PDF-") {
    evidence.format = "pdf"; evidence.parser = "poppler-layout";
    const dir = await mkdtemp(path.join(tmpdir(),"financehot-document-"));
    try {
      const input = path.join(dir,"document.pdf"), output = path.join(dir,"document.txt");
      await writeFile(input,body);
      // stdout is bounded; the output file is only produced inside this temporary directory.
      const result = await promisify(execFile)("pdftotext", ["-layout","-enc","UTF-8",input,"-"], {timeout:30_000,maxBuffer:16*1024*1024});
      await writeFile(output,result.stdout);
      const pages = (await readFile(output,"utf8")).split("\f");
      for (let i=0;i<pages.length;i++) { const page=pages[i]!.trim(); if (!page) continue;
        const start=text.length; text+=page+"\n\n"; evidence.parts.push({name:"document.pdf",type:"pdf",page:i+1,start,end:text.length}); }
    } finally { await rm(dir,{recursive:true,force:true}); }
    html = `<pre>${escapeHtml(text)}</pre>`;
  } else {
    const raw = body.toString("utf8");
    if (/^\s*<SEC-DOCUMENT>/i.test(raw)) {
      evidence.format="sec"; evidence.parser="sec-documents";
      for (const match of raw.matchAll(/<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi)) {
        const section=match[1]!;
        const type=/<TYPE>\s*([^\r\n<]+)/i.exec(section)?.[1]?.trim()??"";
        if (!/^(10-[KQ](?:\/A)?|8-K(?:\/A)?|DEF 14A|4(?:\/A)?|EX-99(?:\..*)?|EX-2(?:\..*)?)$/i.test(type)) continue;
        const inner=/<TEXT>([\s\S]*?)<\/TEXT>/i.exec(section)?.[1]??"";
        const name=/<FILENAME>\s*([^\r\n<]+)/i.exec(section)?.[1]?.trim()??type;
        const got=/^4(?:\/A)?$/i.test(type) ? inner.trim() : documentText(inner); if (!got) continue;
        const start=text.length; text+=`【SEC document: ${name}; type: ${type}】\n${got}\n\n`;
        evidence.parts.push({name,type,start,end:text.length});
      }
      html=`<pre>${escapeHtml(text)}</pre>`;
    } else if (/html/i.test(response.headers.get("content-type")??"") || /<html\b/i.test(raw.slice(0,2000))) {
      evidence.format="html"; evidence.parser="html-document";
      const $=load(raw);
      // Remove hidden input before sanitization discards the attributes and custom tag names.
      $('script,style,noscript,svg,ix\\:hidden,ix\\:header,[hidden],[style*="display:none"],[style*="display: none"]').remove();
      if (/verify (?:that )?you are human|access denied|request rejected|enable javascript and cookies/i.test($("title").text()+" "+$("body").text().slice(0,500))) throw new Error("challenge-page");
      const section=$("article,main,[role=main],.content").first();
      html=sanitizeBody(section.length?$.html(section):$.html($("body")),url);
      text=documentText(html);
      evidence.parts=[{name:new URL(url).pathname.split("/").pop()??"document",type:"html",start:0,end:text.length}];
    } else throw new Error("unsupported-format");
  }
  if (text.replace(/\s/g,"").length<200 || text.includes("\u0000") || (text.match(/\uFFFD/g)?.length??0)>text.length/100) throw new Error("unreadable-document");
  evidence.textHash=documentHash(text);
  return {html,text,evidence};
}
const escapeHtml=(text:string)=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

export async function readOfficialDocument(url: string, headers?: Record<string,string>, options: { relatedPrefixes?: string[]; followLinks?: boolean } = {}): Promise<{body: OfficialBody|null; evidence: BodyEvidence}> {
  let response: GuardedResponse | undefined;
  try {
    response=await guardedFetch(url,{headers,timeoutMs:30_000,maxBytes:32*1024*1024});
    if(response.status!==200) throw new Error(`http-${response.status}`);
    let body: OfficialBody | null = null;
    let parseError: unknown;
    try { body = await parseDocument(response); } catch(error) { parseError = error; }
    if(options.followLinks !== false && /html/i.test(response.headers.get("content-type") ?? "")) {
      const $ = load(response.text());
      const currentDocument=new URL(response.url);currentDocument.hash="";
      const targets: string[] = [];
      for(const element of $("a[href]").toArray()) {
        const link=$(element); const href=link.attr("href")!;
        let target: URL;
        try { target = new URL(href,response.url); } catch { continue; }
        target.hash="";
        const trusted = target.origin === new URL(response.url).origin || (options.relatedPrefixes ?? []).some(prefix => target.href.startsWith(prefix.endsWith("/") ? prefix : prefix + "/"));
        if(!trusted || !/^https?:$/.test(target.protocol) || !/\.(pdf|htm|html|txt)$/i.test(target.pathname) || !/financial|earnings|results|report|exhibit|附件|公告|报告|報告|業績|财报|財務/i.test(link.text())) continue;
        if(target.href !== currentDocument.href && !targets.includes(target.href)) targets.push(target.href);
      }
      const failures:Array<{url:string;reason:string}>=[];
      for(const target of targets.slice(0,5)) {
        // Do not forward arbitrary credentials to a linked origin.
        const safeHeaders = Object.fromEntries(Object.entries(headers ?? {}).filter(([name])=>["user-agent","accept","accept-language"].includes(name.toLowerCase())));
        const related = await readOfficialDocument(target,safeHeaders,{followLinks:false});
        if(!related.body) {failures.push({url:target,reason:related.evidence.failureReason ?? "failed"});continue;}
        if(!body) body=related.body;
        else {
          const offset=body.text.length;body.text+="\n\n"+related.body.text;
          body.html+="\n"+related.body.html;
          body.evidence.parts.push(...related.evidence.parts.map(part=>({...part,sourceUrl:target,contentHash:related.evidence.contentHash??undefined,start:part.start+offset+2,end:part.end+offset+2})));
        }
        for(const part of body.evidence.parts) part.sourceUrl ??= related.body === body ? target : response.url;
      }
      if(body) body.evidence.relatedFailures=failures;
    }
    if(!body) throw parseError ?? new Error("unreadable-document");
    body.evidence.sourceUrl=url;
    body.evidence.textHash=documentHash(body.text);
    return {body,evidence:body.evidence};
  } catch (error) {
    const message=error instanceof Error?error.message:"extraction-failed";
    return {body:null,evidence:{schemaVersion:1,status:"fulltext extraction failed",sourceUrl:url,resolvedUrl:response?.url??url,
      format:response?.body.subarray(0,5).toString()==="%PDF-"?"pdf":"unknown",parser:"direct",fetchedAt:new Date().toISOString(),
      contentHash:response?documentHash(response.body):null,textHash:null,parts:[],failureReason:/^(http-\d+|challenge-page|unsupported-format|unreadable-document)$/.test(message)?message:"fetch-or-parse-failed"}};
  }
}
