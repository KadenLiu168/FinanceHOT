# Company Disclosure Understanding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 官方公告正文、证据事实与安全摘要通过真实 A/H/US 验收。
**Architecture:** 现有采集/正文/分析/发布链路；免费格式读取，带定位的分块事实包，事实驱动写作。
**Tech Stack:** Node.js >=24.11、TypeScript、PostgreSQL、Poppler、既有 chatJson/receipts。
**Spec:** ../specs/2026-10-06-company-disclosure-understanding-design.md

## Global Constraints

65 sources、24 companies 保持；不新增 collector，不依赖付费抓取；site_fulltext/syndicate_fulltext false；测试外网/模型只用本地假服务，真实验收单独隔离；不操作运营数据，开发验收阶段不提交/推送/部署。用户已授权持续实施至验收完成，按 native 执行，不再重复审批。2026-10-07 验收完成后，用户另行明确授权将本次改动提交并同步 GitHub `main`；部署不在本次授权范围。

## Review Focus

- 200 验证页不是正文；extraction tests 验证格式和有效文本。
- PDF 财务表头/列可能错位；真实 fixture 核对期间、单位、数值。
- Form 4 的 owner/issuer 混淆；identity 对抗测试核对角色。
- 长文最后的数字不能消失；分块覆盖 tests 验证所有字符区间。
- 迟到提取不能覆盖新 revision；复用并扩展 extraction-consistency tests。

### Task 1: 证据与正文

Files: database/migrations/0053_body_evidence.sql, content/materials.ts, content/extract.ts, content/documents.ts, Dockerfile, industry/sources.json, tests/disclosure-extraction.test.ts.
Interfaces: BodyEvidence; readOfficialDocument(url, headers?) -> result; extractArticleBody preserves revision guard.
- [x] 新测试证明 PDF、SEC、验证页、状态及 revision 契约当前失败。
- [x] 添加可空证据、Poppler、受限直接获取及格式解析；官方 metadata 配置不冒充正文。
- [x] 运行 targeted tests，成功结果保存原文位置/哈希，失败明确降级。

### Task 2: 事实理解与写作

Files: editorial/disclosure.ts, editorial/input.ts, editorial/analyze.ts, editorial/writing.ts, industry/prompts/disclosure-facts.md, tests/disclosure-understanding.test.ts.
Interfaces: disclosureFacts(input) -> verified facts, coverage and receipts; render verified fact summary; analysis output contains disclosure.
- [x] 新测试覆盖数字/阶段/身份拒绝、metadata 保守摘要、完整分块区间。
- [x] 实现 facts schema、引用与角色校验、全正文分块调用、事实驱动写作并接入既有评分/归组。
- [x] 跑 targeted tests，保留普通行业原流程及付费回执/预算。

### Task 3: 真实材料回归与端到端

Files: tests/fixtures/disclosures/*, tests/disclosure-real-regression.test.ts, scripts/verify-disclosure-understanding.ts, docs/disclosure-understanding.md.
- [x] 从现有官方路径取得 A/H/US 各6条不同成功材料，各2份财报；原文建立金标。
- [x] 离线 fixture 验证18成功+6缺失/失败变体，清楚区分注入与观察。
- [x] 独立 _test 库、真实模型及 publication 读取验证结构化事实和摘要；2026-10-07 v15固定18条全部通过，保留回执复用说明。

### Task 4: 完整回归与交付

Files: docs/sources.md, docs/deploy.md, industry/README.md, final report.
- [x] npm run typecheck；DATABASE_URL=postgres://127.0.0.1:5432/financehot_disclosure_test npm test。
- [x] npm run build -w @aihot/web；node --test apps/web/tests/*.test.ts；isolated site smoke。
- [x] 独立审查实现及验收证据，修正真实发现的问题。
- [x] 仅把本任务文件返回用户工作区；逐项报告样本、限制、必要性与测试，不以假模型替代真实理解。

当前状态：实现、独立审查、离线/完整回归和18条真实模型/publication验收已完成；用户已另行授权提交并同步 GitHub `main`，本次不部署。
