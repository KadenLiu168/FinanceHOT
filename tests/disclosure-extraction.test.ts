import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { extractFromUrl } from "@aihot/backend/content/extract";

config.allowPrivateNetworkFetch = true;
const body = "Official financial results revenue 100 million and net income 20 million. ".repeat(10);
const server = http.createServer((req,res) => {
  if (req.url === "/linked") { res.writeHead(200,{"content-type":"text/html"});res.end('<html><body><h1>Results</h1><a href="/report.htm">Financial report</a><a href="https://unrelated.example/evil.pdf">Annual report</a></body></html>'); }
  else if (req.url === "/report.htm") {res.writeHead(200,{"content-type":"text/html"});res.end(`<html><body><article>linked financial report ${body}</article></body></html>`);}
  else if (req.url === "/anchors.htm") {res.writeHead(200,{"content-type":"text/html"});res.end(`<html><body><article>${body}<a href="#results">Financial results</a><a href="/anchors.htm#report">Annual report</a></article></body></html>`);}
  else if (req.url === "/submission") { res.writeHead(200, {"content-type":"text/plain"}); res.end(`<SEC-DOCUMENT>\n<DOCUMENT>\n<TYPE>10-K\n<SEQUENCE>1\n<FILENAME>annual.htm\n<TEXT>\n<html><body><article>${body}</article></body></html>\n</TEXT>\n</DOCUMENT>\n<DOCUMENT>\n<TYPE>EX-101.INS\n<TEXT>hidden XBRL</TEXT>\n</DOCUMENT>`); }
  else { res.writeHead(200,{"content-type":"text/html"}); res.end("<html><body>Please verify you are human</body></html>"); }
});
await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
after(async()=>{server.close();await closeDb();});
test("official SEC submission extracts primary text without paid fallback",async()=>{
  const got = await extractFromUrl(`${base}/submission`,"test",undefined,{official:true});
  assert.ok(got);
  assert.ok(got.text.includes("net income 20 million"));
  assert.ok(!got.text.includes("hidden XBRL"));
  assert.equal(got.evidence?.status,"fulltext available");
  assert.equal(got.evidence?.format,"sec");
});
test("official 200 challenge page safely fails without invoking Jina",async()=>{
  assert.equal(await extractFromUrl(`${base}/challenge`,"test",undefined,{official:true}),null);
});
test("SEC HTML omits hidden iXBRL resources while preserving visible table units and values",async()=>{
 const { parseDocument }=await import("@aihot/backend/content/documents");
 const html=`<html><body><div style="display:none"><ix:header><ix:resources>hiddenGhost 99999999</ix:resources></ix:header></div><main><h1>Financial statements in millions</h1><table><tr><th>Metric</th><th>2025</th></tr><tr><td>Revenue</td><td>100</td></tr></table><p>${body}</p></main></body></html>`;
 const parsed=await parseDocument({body:Buffer.from(html),url:"https://www.sec.gov/example",headers:new Headers({"content-type":"text/html"})});
 assert.ok(!parsed.text.includes("hiddenGhost"));assert.match(parsed.text,/Revenue.*100/);assert.match(parsed.text,/in millions/);
});
test("an official HTML document can read its explicitly linked PDF while refusing unrelated origins",async()=>{
 const {readOfficialDocument}=await import("@aihot/backend/content/documents");
 const result=await readOfficialDocument(`${base}/linked`);
 assert.ok(result.body?.text.includes("linked financial report"));
 assert.ok(result.evidence.parts.some(p=>p.sourceUrl?.endsWith("/report.htm")));
});
test("financial table-of-contents fragments do not download and append the same document",async()=>{
 const {readOfficialDocument}=await import("@aihot/backend/content/documents");
 const result=await readOfficialDocument(`${base}/anchors.htm`);
 assert.equal(result.evidence.parts.length,1);
 assert.equal(result.body?.text.match(/Official financial results/g)?.length,10);
});
test("hidden financial data inside the selected main element is excluded before sanitizing HTML",async()=>{
 const {parseDocument}=await import("@aihot/backend/content/documents");
 const html=`<html><body><main><div style="display:none"><ix:header><ix:resources>hiddenGhost 99999999</ix:resources></ix:header></div><p>${body}</p></main></body></html>`;
 const parsed=await parseDocument({body:Buffer.from(html),url:"https://www.sec.gov/hidden",headers:new Headers({"content-type":"text/html"})});
 assert.ok(!parsed.text.includes("hiddenGhost"));assert.ok(!parsed.text.includes("99999999"));
});
