# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted.

```bash
# Development (run both concurrently in separate terminals)
npm run dev:api        # NestJS API on http://localhost:9911
npm run dev:web        # Next.js web on http://localhost:9910

# Or run from the workspace directory
cd apps/api && npm run dev          # nest start --watch (PORT=9911 via .env)
cd apps/web && npm run dev          # next dev --port 9910

# Build
npm run build                       # builds all workspaces

# Prisma (run from apps/api)
cd apps/api
npx prisma generate                 # regenerate client after schema changes
npx prisma db push                  # push schema to DB (no migration files)
npx prisma studio                   # visual DB browser

# Lint (web only)
cd apps/web && npm run lint

# Spin up local infrastructure
docker compose up -d                # starts Redis and MinIO (MariaDB comes from Laragon)
```

There is no test runner configured. No `npm test` exists.

## Infrastructure Requirements

The API depends on five local services:
- **MariaDB** on `3306`, database `nextoffice_db` — provided by Laragon locally (not in docker-compose)
- **Redis** on `6379` (Bull queues)
- **MinIO** on `9000` (file storage, bucket `nextoffice`; console at `9001`)
- **Qdrant** on `6333` (vector DB — used by RAG services)
- **Face Recognition** on `8500` — Python FastAPI service (`services/face-recognition/`), runs via Docker

`docker compose up -d` starts Redis, MinIO, Qdrant, and Face Recognition. MariaDB is expected from Laragon. For production, docker-compose also builds and runs the API (port 9911→internal 3000) and Web (port 9910→internal 3001) containers.

Environment variables live in `apps/api/.env`. Copy from `.env.production.example` and fill in:
- `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_ID`
- `ANTHROPIC_API_KEY`
- `CLAUDE_MODEL` (default `claude-sonnet-4-6`)
- `JWT_SECRET` (random 64-char string), `JWT_EXPIRES_IN` (default `7d`)

For LINE webhook testing locally, use ngrok: `ngrok http 9911` → set Webhook URL to `https://<id>.ngrok.io/line/webhook` in LINE Developers Console.

## Architecture Overview

This is an AI-powered Thai government document management system (e-office) for schools. Documents arrive via LINE Bot, get processed by an AI pipeline, and results surface in a Next.js dashboard.

### Monorepo Layout

```
apps/api/     NestJS API (port 9911) — all business logic, AI, LINE
apps/web/     Next.js 16 frontend (port 9910) — dashboard only
packages/     shared-dto, shared-types (currently empty placeholders)
```

### API Module Graph

```
AppModule
├── PrismaModule (global — PrismaService injected everywhere)
├── QueueModule  (Bull/Redis — exports queues + QueueDispatcherService)
├── ProcessorModule (all Bull processors — imports QueueModule + LineModule + RagModule)
├── AuthModule   (JWT auth + roles — JwtAuthGuard, RolesGuard)
├── LineModule   (LINE webhook + messaging — imports QueueModule)
├── IntakeModule (file upload + storage — imports QueueModule)
├── AiModule     (OCR, classify, extract, workflows — imports RagModule + LineModule)
├── RagModule    (HorizonRag, PolicyRag, Retrieval, Reasoning)
├── AttendanceModule (check-in/out, leave, travel, geofence, face client)
├── ChatModule
├── CasesModule
├── DocumentsModule
├── OrganizationsModule
├── AcademicYearsModule
├── KnowledgeModule
└── NotificationsModule (SmartRoutingService — routes LINE push to correct staff by role/document type)
```

**Controllers per module:**
- `LineModule`: `line-webhook.controller`, `line-reply.controller`
- `IntakeModule`: `intake.controller`
- All other modules have one controller matching the module name.

**User roles (roleCode):** `ADMIN`, `DIRECTOR`, `VICE_DIRECTOR`, `HEAD_TEACHER`, `TEACHER`, `CLERK`. Role-based access uses `@Roles()` decorator + `RolesGuard`. DIRECTOR/VICE_DIRECTOR receive LINE push notifications after document registration via `line-workflow.service.ts → notifyDirectors()`.

**Google Drive integration** lives in `IntakeModule` (`google-drive.service.ts`); async backups run via `drive-backup.processor.ts` on the `file-intake` queue.

### Document Processing Pipeline

**Path 1: Image/File from LINE**
```
LINE → POST /line/webhook
  → LineWebhookController: reply "กรุณารอสักครู่" → dispatchLineIntake(eventId)
  → IntakeProcessor [queue: line-events, job: line.intake.received]
    → creates DocumentIntake record
  → dispatchOcr → OcrProcessor → OcrService (extracts text via Gemini API — not Anthropic)
  → dispatchClassify → ClassifierService
    → heuristic check first (Thai official doc patterns)
    → fallback to Claude LLM if heuristic score < 0.9
  → if official: dispatchOfficialProcess → OfficialWorkflowService
    → ExtractionService (metadata via Claude)
    → creates Document + InboundCase
    → ReasoningService.generateCaseOptions() [RAG + Claude → 3 options A/B/C]
    → LineMessagingService.reply() with QuickReply menu
  → if non-official: dispatchNonOfficialClarify → LineMessagingService.reply()
```

**Path 2: Text message / QuickReply from LINE**
```
LINE → POST /line/webhook
  → LineWebhookController: dispatchLineMenuAction(eventId)
  → LineMenuActionProcessor [queue: line-events, job: line.menu.action]
    → looks up active LineConversationSession for user
    → reads DocumentAiResult.extractedText as document context
    → PolicyRagService.search() + HorizonRagService.search()
    → builds action-specific prompt → callClaude()
    → LineMessagingService.buildRagActionReply() → reply
```

Menu action routing (`TEXT_TO_ACTION` in `line-menu-action.processor.ts`):
`สรุปเอกสาร`→summarize, `แปลเอกสาร`→translate, `ดึงสาระสำคัญ`→extract_key, `ร่างตอบ`/`ร่างข้อความตอบ`→draft_reply, `สร้างบันทึกเสนอ`→create_memo, `มอบหมายงาน`→assign_task, `เก็บเป็นเอกสารอ้างอิง`→save_reference (no LLM), anything else→freeform.

### Queue Architecture

Four Bull queues: `line-events`, `file-intake`, `ai-processing`, `outbound-messages`.

All dispatch calls go through `QueueDispatcherService`. Job names follow the pattern `domain.noun.verb` (e.g., `line.intake.received`, `ai.ocr.extract`). Multiple `@Processor(QUEUE_NAME)` classes on the same queue coexist — each handles its own job names via `@Process('job.name')`.

### RAG System

`PolicyRagService` and `HorizonRagService` both use **keyword-based scoring** (not vector embeddings — noted in comments as a future upgrade). `RetrievalService` merges results from both and computes a weighted `finalScore = semantic×0.4 + trust×0.25 + freshness×0.15 + contextFit×0.2`. `ReasoningService` calls `RetrievalService` then Claude to generate 3 options (A=safe, B=balanced, C=innovative).

### LLM / AI API Patterns

**Anthropic (Claude):** All LLM calls use `axios.post` directly to `https://api.anthropic.com/v1/messages` — **not** the Anthropic SDK. The pattern is consistent across `ClassifierService`, `ExtractionService`, `ReasoningService`, and `LineMenuActionProcessor`. Model is read from `config.get('CLAUDE_MODEL', 'claude-sonnet-4-6')`.

**Google Gemini (OCR):** `OcrService` uses `gemini-api.service.ts` — not Anthropic. OCR is the only part of the pipeline that calls Gemini.

### Critical: BigInt Serialization

Prisma uses `BigInt` for all `@id` fields. JSON serialization will throw if a BigInt leaks into a response. Every service has a `serialize()` helper that converts IDs with `Number()` before returning. Always follow this pattern when adding new endpoints.

**Nested relations too:** When a query uses `include:` (e.g., `include: { organization: true, aiResult: true }`), the `serialize()` method must also convert BigInt fields inside every nested object. Forgetting this causes `"Do not know how to serialize a BigInt"` crashes on any API endpoint that returns joined data.

### Prisma Setup

Schema: `apps/api/prisma/schema.prisma`
Generated client output: `apps/api/generated/prisma` (custom path set in the `generator client` block of the schema — not the default location).

Prisma v7 with MariaDB driver adapter: `apps/api/prisma.config.js` configures `@prisma/adapter-mariadb` for migrations. Prisma CLI commands (generate, db push, migrate) must be run from `apps/api/`.

### TypeScript Configuration

- **API** (`apps/api`): `noImplicitAny: false`, `strictNullChecks: false` — strict mode is intentionally off. Path alias: `@shared/*` → `packages/shared-types/src/*`.
- **Web** (`apps/web`): `strict: true`. Path alias: `@/*` → `src/*`.

### Next.js Version Note

`apps/web` runs **Next.js 16**, which has breaking API changes from prior versions. Before modifying frontend code, read `apps/web/AGENTS.md` — it warns that conventions, APIs, and file structure differ from training data. Check `node_modules/next/dist/docs/` for current documentation.

### Web → API Communication

`apps/web/src/lib/api.ts` exports `apiFetch<T>()` — a thin wrapper around `fetch`. Uses `INTERNAL_API_URL` for server-side rendering (Docker: `http://api:3000`) and `NEXT_PUBLIC_API_URL` for client-side (browser: public URL). All frontend API calls go through this helper.

Swagger docs for the API are available at `http://localhost:9911/api/docs` when running locally.

### Document Workflow

Case status state machine (transitions enforced in `case-workflow.service.ts` → `VALID_TRANSITIONS`):
```
new → analyzing → proposed (RAG done) → registered (ลงรับ) → assigned → in_progress → completed → archived
```

`ReasoningService.generateCaseOptions()` sets status to `proposed` after generating options A/B/C. The `register()` method in `CaseWorkflowService` generates a registration number and transitions to `registered`.

### LINE Bot: Pairing & Workflow

**Auto-pairing flow** (`line-pairing.service.ts` → `handleAutoLink()`):
1. Unlinked LINE user sends any message → system prompts for email
2. User types email → matched against `User.email` → auto-linked if unique
3. Session tracked via `LineConversationSession` with `sessionType: 'pairing'`
4. Legacy 6-digit pairing code (`ผูกบัญชี 123456`) still works as fallback

**Webhook command routing** (`line-webhook.controller.ts`): Messages are intercepted in this order:
1. Auto-pairing check (unlinked users)
2. Regex command matching (ผูกบัญชี/ลงรับ/มอบหมาย/รับทราบ/เสร็จแล้ว/งานของฉัน/อนุมัติส่ง/รออนุมัติ)
3. Text fallback → RAG pipeline via `dispatchLineMenuAction`
4. Image/File → immediate "กรุณารอสักครู่" reply → `dispatchLineIntake`

**LINE Commands Regex Reference:**

| Command | Pattern | Handler |
|---------|---------|---------|
| ผูกบัญชี 123456 | `^ผูกบัญชี\s*(\d{6})$` | `pairingSvc.handlePairingMessage` |
| ลงรับ #3 | `^ลงรับ\s*#(\d+)$` | `workflowSvc.handleRegister` |
| มอบหมาย #3 | `^มอบหมาย\s*#(\d+)$` | `workflowSvc.handleShowStaffList` |
| มอบหมายให้ #3 @5 | `^มอบหมายให้\s*#(\d+)\s*@(\d+)$` | `workflowSvc.handleAssignTo` |
| รับทราบ #1 | `^รับทราบ\s*#(\d+)$` | `workflowSvc.handleAcceptAssignment` |
| เสร็จแล้ว #1 | `^เสร็จแล้ว\s*#(\d+)$` | `workflowSvc.handleCompleteAssignment` |
| งานของฉัน | `^(งานของฉัน\|สถานะงาน)$` | `workflowSvc.handleMyTasks` |
| อนุมัติส่ง #3 | `^อนุมัติส่ง\s*#(\d+)$` | `inquirySvc.handleOutboundApprove` (DIRECTOR/VICE_DIRECTOR only) |
| รออนุมัติ | `^(รออนุมัติ\|หนังสือรออนุมัติ\|รายการรออนุมัติ)$` | `inquirySvc.handlePendingOutbound` (DIRECTOR/VICE_DIRECTOR only) |

### Face Recognition Service

`services/face-recognition/` — Python FastAPI microservice, port **8500**, runs as a Docker container alongside the API.

- **Stack**: FastAPI + InsightFace/ArcFace (buffalo_l model, CPU)
- **Routes**: `POST /face/register`, `POST /face/verify`, `GET /health`
- **Usage**: `AttendanceModule` calls it via `face-client.service.ts` for biometric check-in/out
- The InsightFace model is pre-downloaded during Docker build (`buffalo_l` via `FaceAnalysis`)
- To rebuild: `docker compose up -d --build face-recognition`

### Production Deployment

- **Domain**: `nextoffice.cnppai.com` — API on port 9911, Web on port 9910
- **Server path**: `/DATA/AppData/www/nextoffice`
- **MariaDB**: runs on host at `192.168.1.4:3306` (not in Docker)
- `.env.production` is gitignored — must be edited directly on the server
- **Deploy**: `git pull && docker compose up -d --build api web`
- `PUBLIC_API_URL` must be set in `.env.production` for the web dashboard to work — it becomes `NEXT_PUBLIC_API_URL` at build time (browser URL). `INTERNAL_API_URL` is set in docker-compose.yml for server-side rendering.

### Cursor AI Integration

This project uses **both Claude Code (terminal) and Cursor AI** side-by-side:
- Cursor reads project context from `.cursor/rules/project.mdc` (which references this file)
- Claude Code reads this `CLAUDE.md` directly
- Both share the same filesystem, git repo, ESLint, and TypeScript config

**Role split:**
- Cursor AI → inline edits, screenshot/image error analysis, quick fixes
- Claude Code → shell commands, git, multi-file refactors, Prisma CLI

**Conflict rule:** Only one tool edits a file at a time. When Claude Code is running, wait for it to finish before using Cursor inline edit on the same file.

If architecture changes, update `CLAUDE.md` **and** `.cursor/rules/project.mdc` together.

### Automated Hooks (`.claude/settings.json`)

PostToolUse hooks fire automatically after file edits:
- **ESLint** runs on any edited `apps/web/**/*.ts(x)` file.
- **TypeScript type check** runs asynchronously on edits to both `apps/web/**/*.ts(x)` and `apps/api/**/*.ts(x)` — output is tailed to the last 15 lines.
