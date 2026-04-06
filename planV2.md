# NextOffice V2 — Architecture & Implementation Plan

> **ไฟล์แนบหลัก (ไฟล์ต้นฉบับ):** [`docs/Nextoffice_v2.pdf`](docs/Nextoffice_v2.pdf) (98 หน้า, 4.6 MB)
> เอกสาร brainstorm ฉบับเต็มครอบคลุม: vision, value proposition, feature list (MVP/PRO/Enterprise), architecture, Horizon RAG schema, pipeline ingestion, scoring system, Obsidian integration, PRD

---

## 1. Vision

**V1:** ระบบรับหนังสือราชการผ่าน LINE + AI วิเคราะห์ + สร้าง workflow
**V2:** AI-powered Policy Intelligence System — เปลี่ยนหนังสือราชการให้เป็น "งาน + โครงการ + ความรู้ + การตัดสินใจ"

**Positioning:** "LINE คือมือ, NextOffice คือสมอง"

### 6 Core Capabilities (V2)
1. **Smart Receive** — รับหนังสืออัจฉริยะจาก LINE
2. **Instant Registry** — ลงรับอัตโนมัติทันที
3. **Pocket Workflow** — สั่งงานสารบรรณผ่าน LINE (conversational)
4. **Ask This Letter** — ถาม AI เกี่ยวกับหนังสือฉบับนี้
5. **Photo-to-Case** — แปลงรูปเอกสารเป็นเรื่องงาน
6. **Executive Snapshot** — สรุปหนังสือสำคัญสำหรับผู้บริหาร

---

## 2. Architecture Overview

```
LINE / Web Dashboard
       |
NextOffice API (NestJS, port 9911)
       |
  +-----------+------------------+------------------+
  |           |                  |                  |
Core Pipeline  RAG Layer      Project Memory    Knowledge Vault
  |           |                  |                  |
  |    +------+------+          |            Obsidian .md files
  |    |      |      |          |            (AI-generated notes)
  |  Policy Horizon  Retrieval  |
  |   RAG    RAG    Service    |
  |    |      |      |          |
  |    +------+------+          |
  |           |                  |
  |    Recommendation Engine     |
  |    (Claude + RAG context)    |
  |           |                  |
  +-----------+------------------+
       |
  +---------+---------+---------+
  |         |         |         |
MariaDB   Redis    MinIO    Qdrant
(Prisma)  (Bull)   (files)  (vectors)
```

### V2 Additions to Architecture
- **HorizonModule** (new) — crawl สพฐ./ศธ. → normalize → classify → agenda cluster → signal extract → embed
- **ProjectsModule** (new) — project CRUD + document-project matching
- **VaultModule** (new) — AI-generated Markdown notes → Obsidian vault sync
- **Predictive Workflow** — AI predicts next steps, deadlines, risks after case creation
- **NLU Intent Classifier** — natural language commands in LINE (ส่งเรื่องนี้ให้ฝ่ายวิชาการ)
- **Adaptive Routing** — learn org patterns for routing suggestions

---

## 3. New Prisma Models (14 total)

### Phase 1: CasePrediction

```prisma
model CasePrediction {
  id              BigInt   @id @default(autoincrement())
  inboundCaseId   BigInt
  predictionType  String   @db.VarChar(50)  // deadline, risk, next_step, assignee
  predictionValue String   @db.Text         // JSON with prediction details
  confidence      Decimal  @db.Decimal(5, 4)
  isAccepted      Boolean? // null = pending, true = accepted, false = rejected
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  inboundCase InboundCase @relation(fields: [inboundCaseId], references: [id])

  @@map("case_predictions")
}
```

### Phase 2: Horizon Intelligence (6 models)

```prisma
model HorizonSource {
  id             BigInt   @id @default(autoincrement())
  sourceCode     String   @unique @db.VarChar(50)
  sourceName     String   @db.VarChar(255)
  sourceType     String   @db.VarChar(50)    // website, rss, api, manual
  organizationName String @db.VarChar(255)   // สพฐ., ศธ.
  baseUrl        String   @db.Text
  trustLevel     Decimal  @db.Decimal(3, 2)  // 0.00-1.00
  fetchFrequency String   @db.VarChar(30)    // hourly, daily, weekly
  configJson     String?  @db.Text           // JSON scraper config
  isActive       Boolean  @default(true)
  lastFetchAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  documents HorizonSourceDocument[]

  @@map("horizon_sources")
}

model HorizonSourceDocument {
  id              BigInt   @id @default(autoincrement())
  sourceId        BigInt
  externalId      String?  @db.VarChar(255)
  title           String   @db.Text
  url             String   @db.Text
  contentType     String   @db.VarChar(50)    // news, policy_news, event, announcement
  publishedAt     DateTime?
  fetchedAt       DateTime @default(now())
  rawText         String   @db.LongText
  normalizedText  String?  @db.LongText
  summaryText     String?  @db.LongText
  contentHash     String   @db.VarChar(128)   // SHA-256 for dedup
  qualityScore    Decimal? @db.Decimal(5, 4)
  status          String   @db.VarChar(30)    // fetched, normalized, classified, embedded
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  source  HorizonSource  @relation(fields: [sourceId], references: [id])
  agendas HorizonDocumentAgenda[]
  signals HorizonSignal[]
  chunks  HorizonChunk[]

  @@unique([sourceId, contentHash])
  @@map("horizon_source_documents")
}

model HorizonAgenda {
  id             BigInt   @id @default(autoincrement())
  agendaCode     String   @unique @db.VarChar(100) // obec_ai_education_2026
  agendaTitle    String   @db.VarChar(255)
  agendaType     String   @db.VarChar(50)    // policy_push, campaign, event_series, reform_signal
  agendaScope    String   @db.VarChar(50)    // national, regional, district
  leadOrg        String?  @db.VarChar(255)
  currentStatus  String   @db.VarChar(50)    // emerging, active, peak, fading, closed
  priorityScore  Decimal? @db.Decimal(5, 4)
  momentumScore  Decimal? @db.Decimal(5, 4)
  summaryText    String?  @db.LongText
  topicTags      String?  @db.Text           // JSON array of topic codes
  startDate      DateTime? @db.Date
  endDate        DateTime? @db.Date
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  documents HorizonDocumentAgenda[]
  recommendations HorizonRecommendationPattern[]

  @@map("horizon_agendas")
}

model HorizonDocumentAgenda {
  id                  BigInt  @id @default(autoincrement())
  horizonDocumentId   BigInt
  horizonAgendaId     BigInt
  relationType        String  @db.VarChar(50) // primary, secondary, mention
  confidenceScore     Decimal @db.Decimal(5, 4)
  createdAt           DateTime @default(now())

  document HorizonSourceDocument @relation(fields: [horizonDocumentId], references: [id])
  agenda   HorizonAgenda         @relation(fields: [horizonAgendaId], references: [id])

  @@map("horizon_document_agendas")
}

model HorizonSignal {
  id                BigInt  @id @default(autoincrement())
  horizonDocumentId BigInt
  signalType        String  @db.VarChar(50) // policy_signal, event_signal, urgency_signal, funding_signal
  signalTitle       String  @db.VarChar(255)
  signalText        String  @db.LongText
  actionabilityLevel String @db.VarChar(30) // low, medium, high
  targetEntities    String? @db.VarChar(255) // schools, districts, teachers
  effectiveDate     DateTime? @db.Date
  expiresAt         DateTime? @db.Date
  createdAt         DateTime @default(now())

  document HorizonSourceDocument @relation(fields: [horizonDocumentId], references: [id])

  @@map("horizon_signals")
}

model HorizonChunk {
  id                BigInt  @id @default(autoincrement())
  horizonDocumentId BigInt
  chunkIndex        Int
  chunkText         String  @db.LongText
  sectionLabel      String? @db.VarChar(100) // title, summary, body, agenda_signal
  tokenCount        Int?
  qdrantPointId     String? @db.VarChar(100)
  embeddedAt        DateTime?
  createdAt         DateTime @default(now())

  document HorizonSourceDocument @relation(fields: [horizonDocumentId], references: [id])

  @@map("horizon_chunks")
}

model HorizonRecommendationPattern {
  id                  BigInt  @id @default(autoincrement())
  horizonAgendaId     BigInt
  contextProfileCode  String  @db.VarChar(100) // remote_low_budget, urban_large_school
  recommendationTitle String  @db.VarChar(255)
  recommendationText  String  @db.LongText
  feasibilityNote     String? @db.Text
  riskNote            String? @db.Text
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  agenda HorizonAgenda @relation(fields: [horizonAgendaId], references: [id])

  @@map("horizon_recommendation_patterns")
}
```

### Phase 2: Project Memory (4 models)

```prisma
model Project {
  id              BigInt    @id @default(autoincrement())
  organizationId  BigInt
  name            String    @db.VarChar(255)
  description     String?   @db.Text
  status          String    @db.VarChar(50)  // draft, active, completed, archived
  startDate       DateTime? @db.Date
  endDate         DateTime? @db.Date
  budgetAmount    Decimal?  @db.Decimal(12, 2)
  responsibleUserId BigInt?
  policyAlignment String?   @db.Text         // JSON: aligned policies
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  topics       ProjectTopic[]
  documents    ProjectDocument[]
  reports      ProjectReport[]

  @@map("projects")
}

model ProjectTopic {
  id        BigInt @id @default(autoincrement())
  projectId BigInt
  topicCode String @db.VarChar(100)
  score     Decimal? @db.Decimal(5, 4)

  project Project @relation(fields: [projectId], references: [id])

  @@unique([projectId, topicCode])
  @@map("project_topics")
}

model ProjectDocument {
  id             BigInt  @id @default(autoincrement())
  projectId      BigInt
  inboundCaseId  BigInt?
  documentId     BigInt?
  linkType       String  @db.VarChar(30) // auto_matched, manual
  matchScore     Decimal? @db.Decimal(5, 4)
  matchRationale String?  @db.Text
  createdAt      DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id])

  @@map("project_documents")
}

model ProjectReport {
  id          BigInt   @id @default(autoincrement())
  projectId   BigInt
  reportType  String   @db.VarChar(50) // progress, final, evaluation
  period      String?  @db.VarChar(50) // Q1-2026, annual-2026
  content     String?  @db.LongText
  status      String   @db.VarChar(30) // draft, submitted, approved
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id])

  @@map("project_reports")
}
```

### Phase 2: Adaptive Workflow (1 model)

```prisma
model WorkflowPattern {
  id              BigInt  @id @default(autoincrement())
  organizationId  BigInt
  documentType    String  @db.VarChar(50)
  topicCode       String  @db.VarChar(100)
  routedToGroup   String? @db.VarChar(100)
  assignedToRole  String? @db.VarChar(100)
  avgProcessDays  Decimal? @db.Decimal(6, 2)
  sampleCount     Int     @default(1)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([organizationId, documentType, topicCode])
  @@map("workflow_patterns")
}
```

### Phase 3: Knowledge Vault (2 models)

```prisma
model KnowledgeNote {
  id              BigInt   @id @default(autoincrement())
  organizationId  BigInt?
  noteType        String   @db.VarChar(50)  // policy, letter, project, report, agenda
  title           String   @db.VarChar(255)
  contentMd       String   @db.LongText     // Markdown content
  frontmatterJson String?  @db.Text         // YAML frontmatter as JSON
  folderPath      String?  @db.VarChar(255) // e.g. 01_Policies/
  status          String   @db.VarChar(30)  // ai_draft, reviewed, published, archived
  sourceType      String?  @db.VarChar(50)  // inbound_case, horizon_document, project
  sourceId        BigInt?
  linkedNotes     String?  @db.Text         // JSON: [{noteId, relation}]
  confidence      Decimal? @db.Decimal(5, 4)
  syncedAt        DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("knowledge_notes")
}

model KnowledgeVaultConfig {
  id              BigInt   @id @default(autoincrement())
  organizationId  BigInt   @unique
  vaultPath       String   @db.VarChar(500)
  syncEnabled     Boolean  @default(false)
  lastSyncAt      DateTime?
  configJson      String?  @db.Text
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("knowledge_vault_configs")
}
```

---

## 4. New Module Structure

### HorizonModule (Phase 2)
```
apps/api/src/horizon/
  horizon.module.ts
  controllers/
    horizon-sources.controller.ts
    horizon-intelligence.controller.ts
  services/
    horizon-source.service.ts
    horizon-fetch.service.ts
    horizon-normalize.service.ts
    horizon-classify.service.ts
    horizon-signal.service.ts
    horizon-embed.service.ts
    horizon-pipeline.service.ts
```

### ProjectsModule (Phase 2)
```
apps/api/src/projects/
  projects.module.ts
  controllers/
    projects.controller.ts
  services/
    projects.service.ts
    project-matching.service.ts
```

### VaultModule (Phase 3)
```
apps/api/src/vault/
  vault.module.ts
  controllers/
    vault.controller.ts
    knowledge-notes.controller.ts
  services/
    note-generator.service.ts
    vault-sync.service.ts
    knowledge-graph.service.ts
```

---

## 5. Queue Design (V2 Additions)

### New Queue
```typescript
// queue.constants.ts
export const QUEUE_HORIZON = 'horizon-processing';
```

### Horizon Pipeline Jobs
```
horizon.fetch.sources       → ดึงข่าว/นโยบายจากเว็บ
horizon.parse.documents     → normalize + dedup + classify
horizon.extract.intelligence → topic tagging + signal extraction + agenda linking
horizon.score.agendas       → คำนวณ priority/freshness/momentum
horizon.publish.rag         → chunk + embed → Qdrant
```

### Vault Jobs (ใช้ queue `ai-processing` เดิม)
```
vault.note.generate  → trigger เมื่อ case registered/completed
vault.sync.batch     → daily cron หรือ manual
```

---

## 6. Scoring System (Horizon RAG V2)

### Document Quality Score
```
document_quality = source_trust × 0.35
                 + text_completeness × 0.20
                 + extraction_confidence × 0.25
                 + uniqueness × 0.20
```

### Agenda Priority Score
```
agenda_priority = recency × weight
                + frequency × weight
                + official_weight × weight
                + actionability × weight
                + coverage × weight
```

### Momentum Score
```
momentum = documents_last_14_days / documents_last_60_days_normalized
```

### Final Match Score (document ↔ agenda)
```
final_match = semantic_similarity × 0.35
            + topic_overlap × 0.20
            + agenda_priority × 0.15
            + momentum × 0.10
            + actionability_fit × 0.10
            + context_fit × 0.10
```

---

## 7. Obsidian Vault Structure (Phase 3)

```
NextOffice-Knowledge/
  00_Inbox/           ← AI drafts waiting for review
  01_Policies/        ← POL-OBEC-AI-2026.md
  02_Official_Letters/ ← DOC-2026-0014.md
  03_Projects/        ← PRJ-ACTIVE-LEARNING-2026.md
  04_Reports/         ← RPT-PRJ-ACTIVE-LEARNING-Q1-2026.md
  05_Agendas/         ← AGD-ZERO-DROPOUT-2026.md
  06_People/          ← (future)
  07_Schools/         ← (future)
  99_System/          ← config, templates
```

### Note Lifecycle
```
ai_draft → reviewed → published → archived
```

### Frontmatter Template
```yaml
---
id: DOC-2026-0014
type: official_letter
status: ai_draft
confidence: 0.91
source_ids: [1201]
topic_tags: [ai_in_education, digital_transformation]
linked_projects: [PRJ-AI-TEACHER-SUPPORT]
updated_at: 2026-04-06T16:35:00
---
```

---

## 8. Migration Strategy

1. **Additive only** — ไม่แก้ไข table/column เดิม เพิ่มแค่ model ใหม่
2. **Feature flags** — ทุก feature ใหม่มี env var ควบคุม (`ENABLE_*`)
3. **Queue isolation** — `QUEUE_HORIZON` แยกจาก 4 queue เดิม
4. **Schema push** — ใช้ `npx prisma db push` ตาม practice เดิม
5. **Backward compatible** — LINE bot flow เดิมทำงานได้ไม่เปลี่ยน
6. **Rollback** — ปิด feature flag = feature off, tables ยังอยู่แต่ไม่ใช้

---

## 9. Phase Implementation Order

| Phase | Weeks | Focus | Deliverables |
|-------|-------|-------|-------------|
| 1 | 1-4 | Predictive + Conversational | CasePrediction, NLU, Executive Snapshot, Quick Actions |
| 2 | 5-9 | Policy Intelligence + Project Memory | HorizonModule (6 models), ProjectsModule (4 models), WorkflowPattern, Qdrant activation |
| 3 | 10-13 | Knowledge Vault + Analytics | VaultModule (2 models), AI Drafts, KPI Dashboard |
| 4 | 14-16 | Enterprise | Multi-tenant, Policy Alignment Score |

---

## 10. Key Integration Points (Existing Files to Modify)

| File | Modification |
|------|-------------|
| `apps/api/prisma/schema.prisma` | Add 14 new models |
| `apps/api/src/app.module.ts` | Register HorizonModule, ProjectsModule, VaultModule |
| `apps/api/src/queue/queue.constants.ts` | Add `QUEUE_HORIZON` |
| `apps/api/src/queue/queue.module.ts` | Register horizon queue |
| `apps/api/src/queue/services/queue-dispatcher.service.ts` | Add dispatch methods |
| `apps/api/src/line/controllers/line-webhook.controller.ts` | Add NLU path before regex |
| `apps/api/src/queue/processors/official.processor.ts` | Call prediction + project matching |
| `apps/api/src/rag/services/horizon-rag.service.ts` | Add Qdrant vector search |
| `apps/api/src/rag/services/retrieval.service.ts` | Add `horizon_v2` source type |
| `apps/web/src/components/Sidebar.tsx` | Add nav: Horizon, Projects, Vault, Analytics |
