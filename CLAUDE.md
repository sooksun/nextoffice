# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**NextOffice** — AI-powered e-office system for Thai schools. Handles document intake via LINE Bot, AI classification, RAG-based reasoning, and digital document management.

Monorepo with npm workspaces:
- `apps/api` — NestJS backend (port 3000 dev / 9911 prod)
- `apps/web` — Next.js 16 frontend (port 9910 dev, `next dev --port 9910`)
- `packages/shared-types` — shared TypeScript types
- `packages/shared-dto` — shared DTOs
- `services/face-recognition` — Python/InsightFace microservice

---

## Commands

```bash
# Development
npm run dev:api        # NestJS watch mode
npm run dev:web        # Next.js on port 9910

# API only
cd apps/api
npm run dev            # nest start --watch
npm run build          # nest build → dist/
npm run start          # node dist/main (prod)
npm test               # jest
npm run test:cov       # jest --coverage
npx prisma migrate dev # run DB migrations
npx prisma studio      # browse DB

# Database seeding
npm run seed:admin     # seed admin user
npm run seed:sarabun   # seed document templates
npm run seed:school    # seed school data

# Web only
cd apps/web
npm run dev            # next dev --port 9910
npm run build          # next build
npm run lint           # eslint

# Production deploy
bash deploy.sh         # full Docker deploy to Ubuntu server
```

---

## Architecture

### Backend (NestJS)

Each feature is a **NestJS module** under `apps/api/src/`. All modules follow the pattern: `module.ts`, `controllers/`, `services/`, `dto/`.

Key infrastructure modules:
- **PrismaModule** — `@Global()`, provides `PrismaService` everywhere; no need to import it per-module
- **AuthModule** — JWT-based auth. Use `JwtAuthGuard` + `@CurrentUser()` decorator on protected routes. `@OrgScope()` restricts queries to the user's `organizationId`
- **QueueModule / ProcessorModule** — Bull queues (Redis). Queue constants in `queue/queue.constants.ts`

Core feature modules:
- **IntakeModule** — LINE Bot webhook → document intake pipeline
- **DocumentsModule** — document CRUD, file storage via MinIO
- **CasesModule** — inbound case management
- **RagModule** — RAG pipeline: `RetrievalService` → `ReasoningService` (Gemini API). Vector store via Qdrant
- **AiModule** — Gemini API wrapper, OCR, classification
- **StampsModule** — PDF stamp generation (`pdf-lib`)
- **VaultModule** — file vault backed by MinIO
- **KnowledgeModule / KnowledgeImportModule** — knowledge base + import pipeline
- **NotificationsModule** — push notifications
- **AttendanceModule** — attendance + geofence + face recognition

### Document Intake Flow (LINE Bot → AI → Case)

```
LINE webhook → IntakeProcessor (queue) → MinIO storage + OCR
→ ClassifyProcessor → [OfficialProcessor | ClarificationProcessor]
→ Extract metadata (LLM) → Create Document + InboundCase
→ RAG pipeline (RetrievalService → Gemini reasoning)
→ Push LINE reply
```

### Database

MySQL/MariaDB via Prisma. Schema: `apps/api/prisma/schema.prisma`. Generated client at `apps/api/generated/prisma`.

Multi-tenant: every major table has `organizationId`. Hierarchy: `central_office → area_office → school`.

BigInt PKs throughout — **always serialize BigInt fields** before sending to JSON responses (including nested relations).

### Frontend (Next.js 16)

App Router under `apps/web/src/app/`. Layout: `AuthProvider` → `AppShell` (Sidebar + Header + ChatPanel).

Auth: JWT stored in `localStorage` + cookie (for SSR). `apiFetch()` in `lib/api.ts` handles auth headers and auto-redirects on 401. Server components use `getServerToken()` (reads cookie).

API calls: `apiFetch<T>(path, init?)` from `lib/api.ts` — never call the backend URL directly.

`INTERNAL_API_URL` (Docker internal) is used server-side; `NEXT_PUBLIC_API_URL` is used client-side.

### External Services (Docker Compose)

| Service | Purpose | Port |
|---------|---------|------|
| Redis | Bull queues | internal |
| MinIO | File/object storage | 9001 (console) |
| Qdrant | Vector DB for RAG | 6333 |
| face-service | Python InsightFace | 8500 |

---

## Patterns to Follow

### Backend controller pattern
```typescript
@UseGuards(JwtAuthGuard)
@Controller('resource')
export class ResourceController {
  @Get()
  findAll(@CurrentUser() user: AuthUser) { ... }
}
```

### Frontend page pattern
- Client pages: `"use client"` at top, call `apiFetch` in `useEffect` or server actions
- Server components: call `apiFetch` directly (it uses cookie token server-side)
- Use `react-toastify` (via `lib/toast.tsx`) for user feedback

### Adding a new API module
1. Create `src/<feature>/` with `module.ts`, `controllers/`, `services/`, `dto/`
2. Register in `app.module.ts`
3. `PrismaService` is available via injection — no need to import `PrismaModule`
4. Export services that other modules need

---

## Claude Routing Rules

### Preferred Auto Skills
- Use `system-analyst` for requirement analysis, scope definition, users, roles, modules, and workflows.
- Use `architecture-design` for architecture, data flow, service boundaries, and integration design.
- Use `database-designer` for schema, entities, relationships, keys, constraints, and indexes.
- Use `backend-implementer` only for backend implementation work.
- Use `frontend-implementer` only for frontend implementation work.
- Use `test-engineer` when logic changes or new features are added.

### Manual-Only Skills
Do not automatically invoke these unless explicitly called with `/skill-name`:
- `delivery-manager`, `code-reviewer`, `release-readiness`, `read-assets`
- `debug-deep`, `migration-safe`, `api-contract-guardian`, `log-analyzer`
- `performance-optimizer`, `security-guard`, `env-config-checker`

### Routing Guidance
- New feature: `system-analyst` → `architecture-design` → `database-designer` → implementation → `test-engineer`
- Backend-only work: `backend-implementer`
- Frontend-only work: `frontend-implementer`
- Production bugs: ask for logs, stack traces, or reproduction steps before proposing fixes
- Treat debugging, migrations, API compatibility, security, performance, and deployment as separate concerns
- Do not combine reviewer, release manager, debugger, and implementer roles unless explicitly requested

---

## General Rules
- Think before coding. Keep changes small and reviewable.
- Reuse existing patterns before creating new ones.
- Do not change unrelated files.
- Database: do not change schema unless necessary; explain migration impact before applying.
- Before finishing, summarize: files changed, what was implemented, risks remaining, what to test next.

---

## Known Security Issues (TODO — ยังไม่ได้แก้)

### [HIGH] IDOR — Case endpoints ไม่มี org boundary check
- **ไฟล์:** `apps/api/src/cases/services/cases.service.ts` → `findById()`, `getOptions()`
- **ไฟล์:** `apps/api/src/cases/controllers/cases.controller.ts` → `GET /:id`, `PATCH /:id/status`, `PATCH /assignments/:id/status`
- **ปัญหา:** `findById()` query ด้วย case ID อย่างเดียว — ไม่กรอง `organizationId` ทำให้ user ใน org A อ่าน/แก้ข้อมูลของ org B ได้
- **วิธีแก้:** ส่ง `userOrgId` จาก `@CurrentUser()` เข้า service และเพิ่ม `where: { id, organizationId }` ใน query ทุก method ที่รับ case ID จากภายนอก

### [HIGH] Privilege Escalation — DIRECTOR สร้าง ADMIN ได้
- **ไฟล์:** `apps/api/src/auth/dto/register.dto.ts` → `roleCode` field
- **ไฟล์:** `apps/api/src/auth/services/auth.service.ts` → `register()` method
- **ปัญหา:** `RegisterDto` อนุญาต `roleCode = 'ADMIN'` และ `register()` service เขียนค่านี้ตรง ๆ ไปยัง DB โดยไม่ตรวจว่า caller มีสิทธิ์สร้าง ADMIN หรือเปล่า — DIRECTOR จึงสร้างบัญชี ADMIN ได้
- **วิธีแก้:**
  ```typescript
  // auth.service.ts → register()
  async register(dto: RegisterDto, callerRole: string) {
    if (dto.roleCode === 'ADMIN' && callerRole !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can create ADMIN accounts');
    }
    // ...
  }
  // auth.controller.ts → register()
  async register(@Body() dto: RegisterDto, @CurrentUser() caller: any) {
    return this.authService.register(dto, caller.roleCode);
  }
  ```

---

## Known Deployment Pitfalls (อ่านก่อน deploy ทุกครั้ง)

### [RESOLVED] Google Login หายหลัง rebuild web image

**สถานะ:** แก้ถาวรแล้ว (session 2026-04-15) — ไม่เกิดอีกแม้ rebuild โดยไม่ export env

**สาเหตุเดิม:** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` ถูก bake ตอน `docker build` → ถ้า build โดยไม่มีค่า ปุ่มหายทันที

**วิธีที่แก้:**
- `login/layout.tsx` เปลี่ยนเป็น **Server Component** อ่าน `process.env.GOOGLE_CLIENT_ID` ตอน **runtime** แทน
- `login/GoogleAuthProvider.tsx` (ใหม่) — client wrapper + React Context ส่งสัญญาณให้ page
- `login/page.tsx` ใช้ `useGoogleEnabled()` hook แทน `process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `docker-compose.yml` web service เพิ่ม `env_file: .env.production` → `GOOGLE_CLIENT_ID` โหลดตอน `docker compose up`
- `Dockerfile` ลบ `ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID` ออกแล้ว

**ผลลัพธ์:** `docker compose up -d --build web` ทำได้ตรงๆ ปุ่ม Google ไม่หายอีก

**Caveat ที่ค้นพบเพิ่ม:** เมื่อใส่ `env_file: .env.production` ใน web service ตัวแปร `PORT=3000` (ที่ตั้งไว้สำหรับ api) จะ **shadow** `ENV PORT=3001` ใน Dockerfile → web container listen 3000 แทน 3001 → reverse proxy เจอ 502 — ต้องใส่ `PORT: "3001"` และ `HOSTNAME: "0.0.0.0"` ใน `environment:` (override env_file)

**Caveat ที่ 2 — Next.js static optimization:** Server Component ที่อ่าน `process.env` ถูก pre-render ตอน `next build` → ค่าถูก bake เข้า static HTML → runtime env ไม่มีผล วิธีแก้: ใส่ `export const dynamic = "force-dynamic";` ใน `login/layout.tsx` เพื่อบังคับ render ทุก request

---

### Technical Decisions (session 2026-04-15)
- **Document templates format** — เปลี่ยนจาก `@napi-rs/canvas` (PDF) มาใช้ `docx` library (v9.6.1) generate Word (.docx) ไฟล์: `apps/api/src/templates/templates.service.ts` — ทั้ง 6 ประเภท return `Buffer` ของ `.docx`
- **Font path** — Sarabun fonts + kruth02.png อยู่ที่ `apps/api/src/stamps/fonts/` (nest-cli copy ไป `dist/src/stamps/fonts/` ผ่าน assets config)
- **Response classification** — เพิ่ม `responseType`/`requiresResponse`/`hasBeenReplied` ใน schema + classifier service + backfill script (`prisma/backfill-response-classification.js`)
- **Outbound Word download** — `GET /outbound/documents/:id/word` endpoint คืน `.docx` buffer, frontend component: `apps/web/src/app/outbound/[id]/OutboundPdfButton.tsx`

---

### Knowledge Import Pipeline (session 2026-04-16) — COMPLETED & STABLE

**สถานะ:** ทำงานได้ครบ pipeline แล้ว — Upload → OCR → Chunk → Embed → Qdrant → DONE

#### Architecture
```
POST /knowledge-import (multipart)
  → KnowledgeImportService.create() → MinIO upload + DB record (status=PENDING)
  → Bull queue 'knowledge.import.embed'
  → KnowledgeImportProcessor.handleEmbed()
      ├─ ดาวน์โหลดไฟล์จาก MinIO (base64)
      └─ runWorkerInline() → knowledge-worker.js::processItem()
           ├─ Gemini Vision OCR → extractedText
           ├─ splitText() → chunks (~1200 chars, overlap 150)
           ├─ embedBatch() → Gemini gemini-embedding-001 (768 dim)
           └─ Qdrant upsert → collection 'knowledge'
  → status=DONE, chunkCount saved
```

#### Critical Files
| File | หน้าที่ |
|---|---|
| `apps/api/src/knowledge-import/knowledge-worker.js` | standalone JS worker (zero npm deps) |
| `apps/api/src/knowledge-import/knowledge-import.processor.ts` | Bull processor, calls worker inline |
| `apps/api/src/rag/services/embedding.service.ts` | EmbeddingService (ใช้ gemini-embedding-001) |
| `apps/web/src/app/knowledge/import/page.tsx` | Frontend UI + auto-poll |

#### Bug ที่แก้แล้ว (session 2026-04-16)

**[CRITICAL] Infinite loop ใน splitText() → V8 heap OOM**
- สาเหตุ: `start = breakPoint - OVERLAP_CHARS` เมื่อ `breakPoint >= text.length` ทำให้ loop วนซ้ำไม่จบ สร้าง string ล้านๆ ก้อนจน heap หมด
- แก้: เพิ่ม `if (breakPoint >= text.length) break;` ก่อน overlap calculation
- แก้ทั้ง 2 ไฟล์: `knowledge-worker.js` + `rag/services/chunking.service.ts`

**[CRITICAL] Embedding model deprecated**
- `text-embedding-004` ถูกลบออกจาก Gemini API v1beta → HTTP 404
- แก้: เปลี่ยนเป็น `gemini-embedding-001` + `outputDimensionality: 768`
- แก้ทั้ง 2 ไฟล์: `knowledge-worker.js` + `rag/services/embedding.service.ts`

**[PERF] Fork overhead eliminated**
- เดิม: `child_process.fork()` knowledge-worker.js → โหลด module ใหม่ทุกครั้ง
- แก้: `runWorkerInline()` ใช้ `require(workerPath)` (cached) เรียกตรง — ประหยัด heap ~250 MB
- Worker ยังรัน fork ได้ถ้า `process.send` มี (backward compat)

**[UX] Frontend ไม่ auto-refresh สถานะ**
- แก้: เพิ่ม polling loop ทุก 4 วินาที เมื่อมี item ที่ status=PENDING/PROCESSING
- หยุดอัตโนมัติเมื่อทุก item เป็น terminal state (DONE/ERROR)
- ไฟล์: `apps/web/src/app/knowledge/import/page.tsx` → `fetchItems(silent=true)` + useEffect polling

#### Embedding Spec
- Model: `gemini-embedding-001`
- Dimension: 768 (truncated via `outputDimensionality`)
- Batch size: 100 texts per batchEmbedContents call
- Qdrant collection: `knowledge`, cosine similarity

#### Deploy note
เมื่อแก้ไข `knowledge-worker.js` หรือ processor → rebuild **api** container:
```bash
docker compose build api && docker compose up -d api
```
เมื่อแก้ไข frontend → rebuild **web** container:
```bash
docker compose build web && docker compose up -d web
```

---

### RAG System Architecture (session 2026-04-18) — COMPLETED & STABLE

**สถานะ:** pipeline ทำงานได้ครบ — Hybrid Search + Reranker + Reasoning → CaseOptions

#### Pipeline (end-to-end)

```
User Query / Case Description
  │
  ▼
QueryRewriterService          ← LLM expansion (ข้ามถ้า query ≤ 25 chars)
  │
  ▼
HybridSearchService           ← RRF fusion (vector + keyword)
  ├─ EmbeddingService         → Gemini gemini-embedding-001, dim=768
  ├─ VectorStoreService       → Qdrant cosine search, pool=20
  ├─ ThaiTokenizerService     → TF-IDF keyword scoring
  ├─ RRF(k=60)                → normalize + merge ranks
  └─ MMR(λ=0.7)               → diversify top candidates
  │
  ▼
RerankerService               ← Gemini 2.0 Flash, score 0–10, min=3
  │
  ▼
RetrievalService              ← final score blend + persist CaseRetrievalResult
  │                             hybrid path: rerank×0.60 + hybrid×0.25 + contextFit×0.15
  │                             fallback path: semantic×0.40 + trust×0.25 + freshness×0.15 + contextFit×0.20
  ▼
ReasoningService              ← Gemini Flash, top 3 horizon + top 3 policy
  └─ Save CaseOption + CaseOptionReference
```

#### Services & Critical Files

| Service | File | หน้าที่ |
|---|---|---|
| `RetrievalService` | `rag/services/retrieval.service.ts` | orchestrator — เลือก hybrid vs fallback, persist results |
| `HybridSearchService` | `rag/services/hybrid-search.service.ts` | RRF + MMR fusion |
| `RerankerService` | `rag/services/reranker.service.ts` | LLM reranking pass |
| `ReasoningService` | `rag/services/reasoning.service.ts` | generate CaseOptions via LLM |
| `EmbeddingService` | `rag/services/embedding.service.ts` | Gemini embedding (single + batch) |
| `VectorStoreService` | `rag/services/vector-store.service.ts` | Qdrant client wrapper |
| `QueryRewriterService` | `rag/services/query-rewriter.service.ts` | query expansion (pronoun resolution) |
| `QueryCacheService` | `rag/services/query-cache.service.ts` | answer cache (10 min page / 24 hr knowledge) |
| `HorizonRagService` | `rag/services/horizon-rag.service.ts` | best-practice horizon search |
| `PolicyRagService` | `rag/services/policy-rag.service.ts` | policy/regulation search (trust + freshness score) |
| `ThaiTokenizerService` | `rag/services/thai-tokenizer.service.ts` | TF-IDF keyword search |

#### Qdrant Collections

| Collection | Content | Distance |
|---|---|---|
| `knowledge` | policy clauses + horizon practices (from KnowledgeImport) | Cosine |
| `documents` | chunked document text (from DocumentsModule) | Cosine |

#### Key Config Values

| Parameter | Value | หมายเหตุ |
|---|---|---|
| Embedding model | `gemini-embedding-001` | เปลี่ยนจาก text-embedding-004 ที่ deprecated |
| Embedding dim | 768 | truncated via `outputDimensionality` |
| Reranker model | `gemini-2.0-flash` | `GEMINI_MODEL` env var |
| Hybrid pool size | 20 candidates | ก่อน rerank |
| Final top-K | 8 | หลัง rerank + filter |
| Rerank min score | 3/10 | ต่ำกว่านี้ตัดทิ้ง |
| RRF k | 60 | Cormack et al. 2009 default |
| MMR λ | 0.7 | relevance-biased (ลด redundancy 30%) |
| Vector score threshold | 0.3 | ต่ำกว่านี้ไม่นำเข้า pool |
| Min hybrid score | 0.05 | filter ก่อน MMR |
| Chunk size | 1200 chars / 800 tokens | |
| Chunk overlap | 150 chars | |

#### Cases Integration Points

**1. Generate CaseOptions** (`ReasoningService.generateCaseOptions`)
- เรียกหลัง intake pipeline สร้าง InboundCase
- ดึง top 3 horizon + top 3 policy → เขียน CaseOption + CaseOptionReference

**2. Recommend Assignment** (`CasesService.recommendAssignment`)
- เรียกเมื่อ Director ต้องการคำแนะนำ routing
- ใช้ PolicyRagService + HorizonRagService โดยตรง (ไม่ผ่าน hybrid)
- คืนชื่อกลุ่ม + draft director note

#### Policy Scoring Rules

- **Trust score**: mandatory rule +0.2, recommended +0.1, national scope +0.1
- **Freshness score**: ≤1yr=0.95, ≤2yr=0.90, ≤5yr=0.80, ≤10yr=0.65, >10yr=0.50

#### Known Issue — Gemini 429 Rate Limit

- `knowledge-worker.js` เพิ่ม `httpsPostWithRetry` แล้ว: retry สูงสุด 5 ครั้ง, delay 5s→10s→20s→40s→60s
- ครอบทั้ง OCR call และ embedding batch call
- ถ้า item ผิดพลาดด้วย 429 ให้กด **ลองใหม่** ในหน้า `/knowledge/import` — จะ retry อัตโนมัติ
