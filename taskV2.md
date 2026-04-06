# NextOffice V2 — Task Breakdown

> **ไฟล์แนบหลัก (ไฟล์ต้นฉบับ):** [`docs/Nextoffice_v2.pdf`](docs/Nextoffice_v2.pdf) (98 หน้า, 4.6 MB)
> เอกสารนี้คือ brainstorm session ฉบับเต็มที่ออกแบบ vision, value proposition, feature list, architecture, schema, pipeline, scoring system และ PRD ของ NextOffice V2

> **Last verified:** 2026-04-06
> Status Legend: `[ ]` pending | `[~]` in progress | `[x]` done

---

## Phase 1: Predictive + Conversational Workflow

### 1.1 CasePrediction Model
- [x] เพิ่ม model `CasePrediction` ใน `apps/api/prisma/schema.prisma`
- [x] `npx prisma db push && npx prisma generate`

### 1.2 Predictive Workflow Service
- [x] สร้าง `apps/api/src/ai/services/predictive-workflow.service.ts`
  - ทำนาย next steps, deadline, risk จากข้อมูล document + extraction
  - เรียก Claude API เพื่อสร้าง predictions
  - บันทึกลง CasePrediction table
- [x] เรียกจาก `CasesController` (cases.controller.ts)

### 1.3 Intent Classifier (NLU for LINE)
- [x] สร้าง `apps/api/src/ai/services/intent-classifier.service.ts`
  - รับ text message จาก LINE
  - วิเคราะห์ intent: forward, assign, ask_ai, create_memo, register, acknowledge
  - ดึง entities: target_department, urgency, document_reference
- [x] เพิ่ม NLU dispatch path ใน `line-webhook.controller.ts` (ก่อน regex matching, `handleNluIntent()`)

### 1.4 AI Draft Generator
- [x] สร้าง `apps/api/src/ai/services/draft-generator.service.ts`
  - สร้าง draft: บันทึกเสนอ, หนังสือตอบ, รายงานผล
  - ใช้ context จาก case + document + RAG results
- [x] เพิ่ม endpoint `POST /outbound/ai-draft`

### 1.5 Executive Snapshot
- [x] เพิ่ม `buildExecutiveSnapshotFlex()` ใน `line-messaging.service.ts`
  - สรุป: หนังสือเข้าวันนี้, เรื่องด่วน, เรื่องค้าง, เรื่องรออนุมัติ
- [x] เพิ่ม morning cron job 07:30 weekdays — `sendExecutiveSnapshot()` ใน `notification.service.ts` + cron ใน `notification.scheduler.ts`
- [x] เพิ่ม endpoint `GET /reports/:orgId/executive-snapshot`

### 1.6 Enhanced Quick Actions
- [x] เพิ่ม quick reply buttons ใน LINE: รับเข้า (ลงรับ), ส่งต่อ (มอบหมาย), รอพิจารณา, สร้างเรื่อง — ครบ 4 ปุ่มใน `buildOfficialDocumentReply()`
- [x] เชื่อมกับ handlers ใน `line-webhook.controller.ts`: regex `รอพิจารณา #\d+` + `สร้างเรื่อง`

### 1.7 API Endpoints (Phase 1)
- [x] `GET /cases/:id/predictions` — ดึง predictions ของ case
- [x] `POST /cases/:id/predictions/:predId/feedback` — accept/reject prediction
- [x] `GET /reports/:orgId/executive-snapshot` — ข้อมูล snapshot

### 1.8 Frontend (Phase 1)
- [x] `apps/web/src/app/cases/[id]/predictions/page.tsx`
- [x] `apps/web/src/app/reports/[orgId]/snapshot/page.tsx`
- [x] Components: `PredictionCard` (inline), `RiskBadge` (inline)

### 1.9 Feature Flags
- [x] `ENABLE_PREDICTIVE_WORKFLOW` — ใช้ใน predictive-workflow.service.ts
- [x] `ENABLE_NLU_COMMANDS` — ใช้ใน intent-classifier.service.ts
- [x] `ENABLE_EXECUTIVE_SNAPSHOT` — ใช้ใน notification.service.ts `sendExecutiveSnapshot()`

### Phase 1 Summary: ALL DONE

---

## Phase 2: Policy Intelligence + Project Memory

### 2.1 Horizon Intelligence System — Schema

#### Schema (7 models) — ALL DONE
- [x] `HorizonSource` — แหล่งข้อมูล (สพฐ./ศธ. websites, RSS)
- [x] `HorizonSourceDocument` — เอกสาร/ข่าวที่ดึงมา (dedup by contentHash)
- [x] `HorizonAgenda` — agenda ที่สกัดได้ (เช่น obec_ai_education_2026)
- [x] `HorizonDocumentAgenda` — junction table
- [x] `HorizonSignal` — สัญญาณเชิงนโยบาย (policy/urgency/funding/implementation)
- [x] `HorizonChunk` — chunks สำหรับ vector search (Qdrant)
- [x] `HorizonRecommendationPattern` — template คำแนะนำตามบริบทโรงเรียน

### 2.2 HorizonModule — ALL DONE

#### HorizonModule (`apps/api/src/horizon/`)
- [x] `horizon.module.ts`
- [x] `horizon-source.service.ts` — CRUD แหล่งข้อมูล
- [x] `horizon-fetch.service.ts` — HTTP crawler + content extraction
- [x] `horizon-normalize.service.ts` — text cleanup, dedup
- [x] `horizon-classify.service.ts` — LLM topic tagging + agenda clustering
- [x] `horizon-signal.service.ts` — signal extraction
- [x] `horizon-embed.service.ts` — chunk + embed into Qdrant
- [x] `horizon-pipeline.service.ts` — orchestrator

### 2.3 Queue Jobs — ALL DONE
- [x] เพิ่ม `QUEUE_HORIZON = 'horizon-processing'`
- [x] Register ใน `queue.module.ts`
- [x] `horizon.processor.ts` with 5 jobs:
  - [x] `horizon.fetch.sources`
  - [x] `horizon.parse.documents`
  - [x] `horizon.extract.intelligence`
  - [x] `horizon.score.agendas`
  - [x] `horizon.publish.rag`

### 2.4 Scoring System — DONE
- [x] Document Quality Score (qualityScore in HorizonSourceDocument)
- [x] Agenda Priority Score: recency(0.3) + frequency(0.25) + momentum(0.25) + base(0.2)
- [x] Momentum Score: documents_last_14d / documents_last_60d_normalized
- [x] Match Score: semantic(35%) + topic_overlap(20%) + agenda_priority(15%) + momentum(10%) + actionability_fit(10%) + context_fit(10%)

### 2.5 Horizon Controllers & Endpoints — ALL DONE
- [x] `horizon-sources.controller.ts`
- [x] `horizon-intelligence.controller.ts`
- [x] Endpoints:
  - [x] `GET /horizon/sources`
  - [x] `POST /horizon/sources`
  - [x] `POST /horizon/sources/:id/fetch`
  - [x] `GET /horizon/documents`
  - [x] `GET /horizon/agendas`
  - [x] `GET /horizon/signals`
  - [x] `POST /horizon/pipeline/run`

### 2.6 RAG Enhancement — ALL DONE
- [x] เปิด Qdrant vector search ใน `HorizonRagService` — `searchHorizonV2()` method
- [x] เพิ่ม source type `horizon_v2` ใน `RetrievalService`
- [x] Feature flag `ENABLE_HORIZON_V2` gating

### 2.7 Project Memory Schema — ALL DONE
- [x] `Project` — โครงการโรงเรียน
- [x] `ProjectTopic` — junction table
- [x] `ProjectDocument` — เชื่อม document ↔ project (auto_matched / manual)
- [x] `ProjectReport` — รายงานผลโครงการ

### 2.8 ProjectsModule — ALL DONE
- [x] `projects.module.ts`
- [x] `projects.service.ts` — CRUD
- [x] `project-matching.service.ts` — semantic + topic overlap + policy alignment matching
- [x] `projects.controller.ts`

### 2.9 Adaptive Workflow — ALL DONE
- [x] เพิ่ม model `WorkflowPattern` — learned routing patterns per org
- [x] `workflow-learning.service.ts` — `learnFromCase()` + `suggestRouting()`
- [x] `workflow-patterns.controller.ts`

### 2.10 Registration & Integration — ALL DONE
- [x] `HorizonModule` imported in `app.module.ts`
- [x] `ProjectsModule` imported in `app.module.ts`
- [x] `HorizonProcessor` registered in `processor.module.ts`
- [x] Dispatch methods in `queue-dispatcher.service.ts`:
  - [x] `dispatchHorizonFetchAll()`
  - [x] `dispatchHorizonFetchSource()`
  - [x] `dispatchHorizonParse()`
  - [x] `dispatchHorizonExtract()`
  - [x] `dispatchHorizonScore()`
  - [x] `dispatchHorizonPublish()`
  - [x] `dispatchHorizonFullPipeline()`

### 2.11 Frontend (Phase 2) — ALL DONE
- [x] `apps/web/src/app/horizon/page.tsx` — overview
- [x] `apps/web/src/app/horizon/sources/page.tsx` — manage sources
- [x] `apps/web/src/app/horizon/agendas/page.tsx` — agendas browser
- [x] `apps/web/src/app/horizon/signals/page.tsx` — signals list
- [x] `apps/web/src/app/projects/page.tsx` — projects list
- [x] `apps/web/src/app/projects/[id]/page.tsx` — project detail
- [x] Sidebar nav items: Horizon Intelligence + Projects

### Phase 2 Summary: ALL DONE (48/48 items)

---

## Phase 3: Knowledge Vault + AI Drafts + Analytics

### 3.1 Obsidian Knowledge Vault

#### Schema (2 models)
- [x] `KnowledgeNote` — AI-generated Markdown notes (5 types)
- [x] `KnowledgeVaultConfig` — per-org vault configuration

#### VaultModule (`apps/api/src/vault/`)
- [x] `note-generator.service.ts` — LLM generates structured Markdown
- [x] `vault-sync.service.ts` — writes .md files to vault path
- [x] `knowledge-graph.service.ts` — manages note linkages

#### Note Types (AI สร้างอัตโนมัติ)
- Policy Note: สาระนโยบาย + หนังสือที่เกี่ยว + โครงการ
- Letter Note: 1 หนังสือ = 1 note (เรื่อง, เลข, deadline, intent)
- Project Note: วัตถุประสงค์ + ผู้รับผิดชอบ + หนังสือ + รายงาน
- Report Note: รอบรายงาน + โครงการ + สรุปผล
- Agenda Note: ช่วงเวลา + ความเคลื่อนไหว + implication

#### Queue Jobs (2)
- [x] `vault.note.generate` — trigger เมื่อ case registered/completed
- [x] `vault.sync.batch` — daily cron

### 3.2 Enhanced Analytics
- [x] `GET /reports/:orgId/processing-times` — เวลาเฉลี่ยแต่ละขั้นตอน
- [x] `GET /reports/:orgId/bottlenecks` — จุดที่ค้างนาน
- [x] `GET /reports/:orgId/kpi` — KPI dashboard

### 3.3 AI Draft Endpoint
- [x] `POST /outbound/ai-draft` — สร้างร่างเอกสาร (บันทึกเสนอ/หนังสือตอบ/รายงานผล)

### 3.4 Frontend (Phase 3: 5 pages)
- [x] `apps/web/src/app/vault/page.tsx` — notes browser
- [x] `apps/web/src/app/vault/[id]/page.tsx` — note detail (Markdown preview)
- [x] `apps/web/src/app/vault/graph/page.tsx` — knowledge graph
- [x] `apps/web/src/app/vault/settings/page.tsx` — vault config
- [x] `apps/web/src/app/reports/[orgId]/analytics/page.tsx` — analytics dashboard
- [x] Sidebar: Knowledge Vault section + Analytics section

### Phase 3 Summary: ALL DONE

---

## Phase 4: Enterprise Features

### 4.1 Multi-tenant
- [x] `@OrgScope()` decorator สำหรับ district → school hierarchy (`apps/api/src/auth/decorators/org-scope.decorator.ts`)
- [x] `OrgScopeService` — `getAccessibleOrgIds()`, `canAccess()` (`apps/api/src/auth/services/org-scope.service.ts`)
- [x] `GET /reports/district/:parentOrgId/summary` — รายงานระดับเขตรวมทุกโรงเรียน
- [x] Frontend: `apps/web/src/app/reports/district/page.tsx`
- [x] Sidebar: รายงานระดับเขต link under วิเคราะห์ section

### 4.2 Policy Alignment Score
- [x] `PolicyAlignmentService` — `getAlignmentForCase(caseId)` (`apps/api/src/rag/services/policy-alignment.service.ts`)
- [x] `GET /cases/:id/policy-alignment` — คะแนนความสอดคล้องกับนโยบาย
- [x] Registered in `RagModule` providers + exports

### 4.3 Enhanced Recommendation (V2 context in RAG)
- [x] `ReasoningService.getEnhancedContext()` — horizon agendas + project context + workflow patterns
- [x] V2 context injected into `generateCaseOptions()` LLM prompt

### Phase 4 Summary: ALL DONE

---

## Feature Flags (Environment Variables)

| Flag | Phase | Default | Status |
|------|-------|---------|--------|
| `ENABLE_PREDICTIVE_WORKFLOW` | 1 | `false` | [x] Implemented |
| `ENABLE_NLU_COMMANDS` | 1 | `false` | [x] Implemented |
| `ENABLE_EXECUTIVE_SNAPSHOT` | 1 | `false` | [x] Implemented |
| `ENABLE_HORIZON_V2` | 2 | `false` | [x] Implemented |
| `ENABLE_PROJECT_MATCHING` | 2 | `false` | [x] Implemented |
| `ENABLE_VAULT` | 3 | `false` | [x] Implemented |

---

## Overall Progress

| Phase | Total Items | Done | Partial | Pending | % |
|-------|------------|------|---------|---------|---|
| 1 | 21 | 21 | 0 | 0 | 100% |
| 2 | 48 | 48 | 0 | 0 | 100% |
| 3 | 15 | 15 | 0 | 0 | 100% |
| 4 | 10 | 10 | 0 | 0 | 100% |

### ALL PHASES COMPLETE
