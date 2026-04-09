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
