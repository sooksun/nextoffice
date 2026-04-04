# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted.

```bash
# Development (run both concurrently in separate terminals)
npm run dev:api        # NestJS API on http://localhost:3000
npm run dev:web        # Next.js web on http://localhost:3001

# Or run from the workspace directory
cd apps/api && npm run dev          # nest start --watch
cd apps/web && npm run dev          # next dev --port 3001

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
docker compose up -d                # starts MariaDB, Redis, MinIO
```

There is no test runner configured. No `npm test` exists.

## Infrastructure Requirements

The API depends on three local services (all default ports):
- **MariaDB** on `3306`, database `nextoffice_db`
- **Redis** on `6379` (Bull queues)
- **MinIO** on `9000` (file storage, bucket `nextoffice`)

Environment variables live in `apps/api/.env`. Copy from `.env.production.example` and fill in:
- `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_ID`
- `ANTHROPIC_API_KEY`
- `CLAUDE_MODEL` (default `claude-sonnet-4-6`)
- `JWT_SECRET` (random 64-char string), `JWT_EXPIRES_IN` (default `7d`)

For LINE webhook testing locally, use ngrok: `ngrok http 3000` → set Webhook URL to `https://<id>.ngrok.io/line/webhook` in LINE Developers Console.

## Architecture Overview

This is an AI-powered Thai government document management system (e-office) for schools. Documents arrive via LINE Bot, get processed by an AI pipeline, and results surface in a Next.js dashboard.

### Monorepo Layout

```
apps/api/     NestJS API (port 3000) — all business logic, AI, LINE
apps/web/     Next.js 16 frontend (port 3001) — dashboard only
packages/     shared-dto, shared-types (currently empty placeholders)
```

### API Module Graph

```
AppModule
├── PrismaModule (global — PrismaService injected everywhere)
├── QueueModule  (Bull/Redis — exports queues + QueueDispatcherService)
├── ProcessorModule (all Bull processors — imports QueueModule + LineModule + RagModule)
├── LineModule   (LINE webhook + messaging — imports QueueModule)
├── IntakeModule (file upload + storage — imports QueueModule)
├── AiModule     (OCR, classify, extract, workflows — imports RagModule + LineModule)
├── RagModule    (HorizonRag, PolicyRag, Retrieval, Reasoning)
├── ChatModule
├── CasesModule
├── DocumentsModule
└── OrganizationsModule
```

**Controllers per module:**
- `LineModule`: `line-webhook.controller`, `line-reply.controller`
- `IntakeModule`: `intake.controller`
- All other modules have one controller matching the module name.

**Google Drive integration** lives in `IntakeModule` (`google-drive.service.ts`); async backups run via `drive-backup.processor.ts` on the `file-intake` queue.

### Document Processing Pipeline

**Path 1: Image/File from LINE**
```
LINE → POST /line/webhook
  → LineWebhookController: dispatchLineIntake(eventId)
  → IntakeProcessor [queue: line-events, job: line.intake.received]
    → creates DocumentIntake record
  → dispatchOcr → OcrProcessor → OcrService (extracts text)
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

### Anthropic API Pattern

All LLM calls use `axios.post` directly to `https://api.anthropic.com/v1/messages` — **not** the Anthropic SDK. The pattern is consistent across `ClassifierService`, `ExtractionService`, `ReasoningService`, and `LineMenuActionProcessor`. Model is read from `config.get('CLAUDE_MODEL', 'claude-sonnet-4-6')`.

### Critical: BigInt Serialization

Prisma uses `BigInt` for all `@id` fields. JSON serialization will throw if a BigInt leaks into a response. Every service has a `serialize()` helper that converts IDs with `Number()` before returning. Always follow this pattern when adding new endpoints.

### Prisma Setup

Schema: `apps/api/prisma/schema.prisma`
Generated client output: `apps/api/generated/prisma` (custom path set in the `generator client` block of the schema — not the default location).

### TypeScript Configuration

- **API** (`apps/api`): `noImplicitAny: false`, `strictNullChecks: false` — strict mode is intentionally off. Path alias: `@shared/*` → `packages/shared-types/src/*`.
- **Web** (`apps/web`): `strict: true`. Path alias: `@/*` → `src/*`.

### Next.js Version Note

`apps/web` runs **Next.js 16**, which has breaking API changes from prior versions. Before modifying frontend code, read `apps/web/AGENTS.md` — it warns that conventions, APIs, and file structure differ from training data. Check `node_modules/next/dist/docs/` for current documentation.

### Web → API Communication

`apps/web/src/lib/api.ts` exports `apiFetch<T>()` — a thin wrapper around `fetch`. Base URL is `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`). All frontend API calls go through this helper.

Swagger docs for the API are available at `http://localhost:3000/api/docs` when running locally.

### Automated Hooks (`.claude/settings.json`)

PostToolUse hooks fire automatically after file edits:
- **ESLint** runs on any edited `apps/web/**/*.ts(x)` file.
- **TypeScript type check** runs asynchronously on edits to both `apps/web/**/*.ts(x)` and `apps/api/**/*.ts(x)` — output is tailed to the last 15 lines.
