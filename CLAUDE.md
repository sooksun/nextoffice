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
- **CasesModule** — inbound case management; `CasesService` + `CaseWorkflowService`
- **RagModule** — RAG pipeline: `RetrievalService` → `ReasoningService` (Gemini API). Vector store via Qdrant
- **AiModule** — Gemini API wrapper, OCR, classification
- **GeminiModule** — low-level Gemini wrapper (`GeminiApiService`); provides `generateText()` + `generateFromParts()` for vision. Separate from AiModule
- **StampsModule** — PDF stamp generation (`pdf-lib`)
- **VaultModule** — file vault backed by MinIO
- **KnowledgeModule / KnowledgeImportModule** — knowledge base + import pipeline
- **NotificationsModule** — push notifications
- **AttendanceModule** — attendance + geofence + face recognition
- **LineModule** — LINE Bot + LIFF: webhook, messaging, pairing, workflow, inquiry, attendance, signature, session (10 services)
- **HorizonModule** — best-practice horizon knowledge base (separate from policy RAG)
- **TemplatesModule** — Word (.docx) template generation via `docx` library (6 document types)
- **ArchiveModule** — document archival
- **TrackingModule** — document tracking
- **DispatchModule** — document dispatch
- **LoansModule** — document loans
- **HandoverModule** — staff handover records
- **SearchModule** — quick/advanced full-text search
- **ChatModule** — AI chat interface
- **ProjectsModule** — project topics + documents + reports
- **CircularModule / PresentationModule / DownloadModule** — circular docs, presentations, downloadable files
- **NewsModule / TenderModule / WebboardModule** — news posts, tenders, forum threads
- **MessagesModule** — private messaging
- **DigitalSignatureModule** — digital signature capture + verification
- **EmailModule** — email integration
- **CalendarModule / AcademicYearsModule** — scheduling and school year management
- **OrganizationsModule** — organization hierarchy management

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

#### Next.js API Routes (`apps/web/src/app/api/`)

- `api/proxy/[...path]/route.ts` — Server-side proxy to backend; use when CSP blocks direct client → API calls (HTTP-in-HTTPS)
- `api/files/intake/[id]/route.ts` — Serve LINE-uploaded intake files with JWT auth
- `api/files/outbound/[id]/route.ts` — Serve outbound document files
- `api/files/signature/[id]/route.ts` — Serve staff signature images
- `api/staff-config/[id]/signature/route.ts` — Staff signature upload/download

#### LINE LIFF Mini-App (`apps/web/src/app/liff/`)

Standalone LINE LIFF context — no AppShell, uses LIFF SDK auth instead of JWT cookie. Key pages:
- `liff/` — dashboard with task stats + quick links
- `liff/cases/` — case list + detail with options + assignment approval (Director flow)
- `liff/outbound/` — outbound document approval workflow
- `liff/attendance/` + `liff/checkin/` — GPS + camera + face recognition check-in
- `liff/leave/` + `liff/travel/` — leave and travel request submission
- `liff/face-register/` — InsightFace registration flow
- `liff/signature/` + `liff/sign/` — digital signature pad + capture
- `liff/news/` + `liff/calendar/` — news feed and calendar view
- `liff/registry/` + `liff/search/` — document registry lookup + search

#### Main App Pages (selected)

- `director/` — Director dashboard, case routing, assignment management
- `cases/[id]/` — Case detail with inline รับทราบ + assignment de-dup UI
- `track/` — Public document tracking
- `leave/` — Leave management
- `outbound/[id]/` — Outbound document with Word download (`OutboundPdfButton`)
- `intakes/` — LINE intake document list (director view with file proxy)

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
- Thai date formatting: use `lib/thai-date.ts`

### LIFF page pattern
LIFF pages do not use AppShell. Auth is via LIFF SDK token, not JWT cookie. When a LIFF action must call the backend, send the LIFF `idToken` in the Authorization header or use the LINE pairing flow to resolve a local JWT.

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

## AI Chat Document Assistant + Sidebar UX Fix (session 2026-07-01)

### Sidebar — เลิก auto-collapse เมื่อ mouse out
`hooks/useSideMenu.ts` / `components/Sidebar.tsx` / `components/AppShell.tsx` — ลบ hover-to-expand/auto-collapse behavior (`compactMenuOnHover`, `onMouseEnter`/`onMouseLeave`) ทิ้งทั้งหมด เหลือปุ่ม toggle เดียว (ChevronLeft บนแถบโลโก้) เป็นตัวควบคุม compact mode + ทำให้ปุ่มแสดงตลอด (เดิมซ่อนจนกว่าจะถึงจอ `2xl`) — CSS rule `.side-menu--on-hover` ที่ไม่ใช้แล้วก็ลบออกจาก `globals.css`

### AI Assistant สร้างร่างใบลา/ไปราชการจากแชท — NEW

**Flow:**
```
ChatPanel → POST /chat/compose
  → keyword gate (looksLikeDocumentRequest — คำถามทั่วไปข้ามไป RAG ทันที)
  → DocumentIntentService.classify() — LLM 1 call, แยก ask vs create_document + สกัดฟิลด์ (disableThinking:true)
  → DocumentDraftService.build() — autofill จาก JWT (user/org) + สร้าง draft ผ่าน LeaveService/TravelService เดิม
  → คืน { kind, missingFields, formUrl, warnings }
  → ถ้าขาดข้อมูลบังคับ: ChatPanel เปิด popup (Radix Dialog) → กด "รับทราบ" → redirect ไป formUrl (?draftId=...&missing=...)
  → หน้าฟอร์ม (leave/new, leave/travel/new) prefill จาก draft, ข้ามฟิลด์ที่อยู่ใน "missing"
    (กัน placeholder ทับข้อมูลจริง), PATCH-then-submit แทน POST สร้างซ้ำ
```

**ขอบเขต MVP:** ใบลา (LeaveRequest) + ใบไปราชการ (TravelRequest) เท่านั้น — ยังไม่รองรับหนังสือส่งออก/เอกสารประเภทอื่น. `/chat/message` (RAG Q&A เดิม) ไม่ถูกแตะ — `/chat/compose` เป็น endpoint ใหม่แยกต่างหาก

**Critical Files:**
| File | หน้าที่ |
|---|---|
| `chat/document/document-spec.ts` | field metadata กลาง (label/required/source ต่อ doc type), leave-type Thai synonym map, keyword gate regex |
| `chat/document/date.util.ts` | normalize วันที่ พ.ศ./ค.ศ./เลขไทย → ISO CE, `bangkokTodayIso`, `daysBetweenInclusive` |
| `chat/services/document-intent.service.ts` | LLM classify+extract รวมใน call เดียว (ลด latency), parse JSON แบบทนทาน (fullwidth normalize + boundary extract) |
| `chat/services/document-draft.service.ts` | `AutoFillContext` (user/org จาก JWT เท่านั้น) + สร้าง draft + คำนวณ missing/warning |
| `chat/controllers/chat.controller.ts` | `POST /chat/compose` |
| `web/components/ChatPanel.tsx` + `web/components/chat/DocDraftCard.tsx` | UI การ์ดร่างเอกสารในแชท + alert popup + redirect |
| `web/app/leave/new/page.tsx`, `web/app/leave/travel/new/page.tsx` | รับ `?draftId=&missing=` แล้ว prefill |
| `attendance/services/travel.service.ts` | เพิ่ม `update()` (เดิมมีแต่ `LeaveService.update()` — travel ขาด PATCH ทำให้แก้ draft ต่อไม่ได้) |

**กฎสำคัญที่ยึดตอน implement (เจอจาก adversarial review 2 รอบ, 6 บั๊กจริง — กันไม่ให้พลาดซ้ำ):**
- userId/organizationId **มาจาก JWT เท่านั้น** ห้ามรับค่าจาก LLM เด็ดขาด (กัน IDOR — AI ห้ามสร้างเอกสารแทนคนอื่นแม้ user จะสั่งในแชท)
- ฟิลด์ที่ backend ต้องเขียน placeholder ลง DB (เช่นวันที่=วันนี้ เพื่อผ่าน NOT NULL constraint) เพราะ AI ไม่รู้ค่าจริง **ต้อง flag เป็น "missing" แล้วส่ง key ไปกับ `formUrl`** (`&missing=startDate,leaveType`) — ฝั่งฟอร์ม **ห้าม prefill** ฟิลด์เหล่านั้น ไม่งั้น user จะเห็นฟอร์มดูครบแล้วส่งข้อมูลผิดโดยไม่รู้ตัว (เจอเป็น high-severity finding)
- หน้าฟอร์มที่รับ `?draftId=` **ต้อง block-render จนกว่า prefill fetch จะเสร็จ** (`prefillReady` guard แบบเดียวกับที่ `travel/new` มีอยู่แล้ว) — ไม่งั้น user กด submit ก่อน `editingDraftId` ถูกตั้งค่า จะหลุดไป POST branch แทน PATCH สร้าง record ซ้ำ
- เปิด draft ที่ status ≠ `draft` (ถูก submit ไปแล้ว) ผ่าน `?draftId=` เดิมซ้ำ (เช่นกดปุ่มในแชทซ้ำ) ต้อง **แจ้ง error + ล็อกปุ่มส่ง** (`draftLocked`) ห้ามเปิดฟอร์มเปล่าเงียบๆ แล้วปล่อยให้ submit สร้างซ้ำ
- ก่อน commit ทุก endpoint ใหม่ผ่าน multi-agent adversarial review (แยกมิติ review → verify แบบ refute-first) อย่างน้อย 1 รอบ — คุ้มเวลาเพราะเจอบั๊ก logic ที่ `tsc`/unit test ปกติจับไม่ได้ (เช่น date-comparison เทียบกับ placeholder ผิด, field ที่ intent service สกัดมาแต่ service ปลายทางไม่รับ)

**Deploy note:** feature นี้ **ไม่มี schema change** (ใช้ตาราง `leave_requests`/`travel_requests` เดิม) → deploy แค่ rebuild `api`+`web`:
```bash
git pull origin main
docker compose build api web
docker compose up -d --force-recreate --no-deps api web
```
ไม่ต้องรัน `prisma db push`

---

## Security Hardening (session 2026-06-22) — RESOLVED

ตรวจ codebase ทั้งระบบ (security + performance) แล้วแก้กลุ่มมั่นใจสูง/เสี่ยงต่ำ. `tsc --noEmit` ผ่านทั้งหมด.

### ช่องโหว่เดิม 2 ข้อ — แก้ไปก่อนหน้าแล้ว (เอกสารเก่าระบุว่ายังไม่แก้ → ไม่จริง)
- **[HIGH] IDOR — Cases**: `cases.service.ts` `findById()`/`getOptions()` รับ `callerOrgId` + filter `organizationId` แล้ว; controller ส่ง `user.organizationId`+`user.roleCode` จริง
- **[HIGH] Privilege Escalation — register**: `auth.service.ts:159` มี `ForbiddenException` + ROLE_RANK + org check แล้ว

### แก้เพิ่มใน session นี้
**Auth/secrets**
- `auth.service.ts` — JWT secret เปลี่ยน `config.get('JWT_SECRET','...dev-secret')` → `getOrThrow('JWT_SECRET')` (ทั้ง validate + sign) กัน fallback secret ที่ forge token ได้

**Missing guards (เดิมเปิด public)**
- `organizations.controller.ts` — class-level `@UseGuards(JwtAuthGuard)` (เดิม GET list/tree/:id เปิด public = leak ทุก org)
- `line-reply.controller.ts` — `@UseGuards(JwtAuthGuard)` (เดิม `POST /line/push` ส่งข้อความหา LINE user ใครก็ได้)
- `academic-years.controller.ts` — `JwtAuthGuard` + `@Roles('ADMIN')` บน create/set-current
- `horizon-sources.controller.ts` — `JwtAuthGuard+RolesGuard @Roles('ADMIN')` (กัน SSRF source + pipeline abuse)
- `horizon-intelligence.controller.ts` — `JwtAuthGuard` ทั้ง class + `@Roles('ADMIN')` บน `pipeline/run`

**IDOR cross-tenant (pattern: controller ส่ง `user.organizationId` → service `findFirst({where:{id,organizationId}})`)**
- `loans` (`returnDocument`), `dispatch` (`markDelivered`,`generateReceiptPdf`), `handover` (`findOne`,`approve`,`complete`,`generatePdf`)
- `projects` (`findOne`,`update`,`addDocument`,`getDocuments` + บังคับ scope `findAll`/`create` ตาม org; ADMIN ข้ามได้)
- `archive` — controller เดิมเชื่อ `:orgId` จาก URL + `userId` จาก body → ใส่ `assertOrg()` (ADMIN ข้ามได้) + ใช้ `user.id` เป็น actor; service scope `archiveDocument`/`approveDestruction`/`confirmDestruction`
- `intake.updateAiResult`, `leave`/`travel` (`approve`,`reject`,`getById`), `stamps` (ย้าย org-check ก่อนเสิร์ฟไฟล์ stamped)

**Performance**
- DB index (apply ผ่าน `prisma db push`): `inbound_cases [organizationId,status]/[organizationId,receivedAt]/[organizationId,dueDate]`, `line_conversation_sessions [lineUserIdRef,status]/[documentIntakeId]`, `document_intakes [organizationId]`
- `intake.listIntakes` — `omit` LongText (`extractedText`,`structuredSummaryJson`,`nextActionJson`) จาก list payload + cap `limit ≤ 100`
- defensive `take` cap บน list ที่ไม่มี pagination: loans/dispatch/handover/projects (500)

### Hardening รอบ 2 (session 2026-06-22, ต่อจากด้านบน) — แก้แล้วแบบ backwards-compatible
- **httpOnly cookie (foundation)**: `auth.controller.ts` ตั้ง httpOnly+SameSite cookie ตอน login/google/impersonate/switch + เพิ่ม `POST /auth/logout`; `jwt-auth.guard.ts` อ่าน token จาก Bearer **หรือ** cookie; `apiFetch` ใส่ `credentials:'include'`. ของเดิม Bearer/localStorage ยังทำงาน (ไม่พัง) → ขั้นถอด localStorage ทิ้งทั้งหมดต้องทดสอบ login/LIFF/upload สดก่อน
- **CSP**: `main.ts` เปิด CSP แบบ **Report-Only** (ไม่ block) + HSTS แบบ opt-in ผ่าน `ENABLE_HSTS=true` → ตรวจ violation report แล้วค่อยพลิก `reportOnly:false`
- **proxy allowlist**: `api/proxy/[...path]` เปลี่ยนจาก denylist → **allowlist** ของ controller base paths (⚠️ prod ใช้ `NEXT_PUBLIC_API_URL=/api/proxy` ทุก call ผ่าน proxy — เพิ่ม controller ใหม่ต้องเติม segment ใน list ด้วย) + forward `cookie`/`set-cookie` สองทาง
- **`?token=` ออกแล้ว**: `api/files/intake|face-template` อ่าน cookie อย่างเดียว; LIFF (`cases/[id]`,`sign/[id]`) เลิกแนบ `&token=` ใน iframe URL
- **docker ports**: ถอด `9001` (MinIO console) + `6333` (Qdrant) ออกจาก host → internal network เท่านั้น

### ยังเป็นข้อเสนอ (ยังไม่ทำ)
- ถอด JWT ออกจาก localStorage ทั้งหมด (uploads/PDF/LIFF ต้องเปลี่ยนมาใช้ cookie) — ต้องรันแอปทดสอบ
- พลิก CSP `reportOnly:false` หลัง report สะอาด
- MinIO default cred `minioadmin:minioadmin` ใน `docker-compose.yml` → ตั้ง `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` ใน `.env.production`
- `reports.service` หลาย query ต่อ status/stage → รวมเป็น `groupBy` (index ใหม่ช่วยลดผลกระทบแล้ว)

---

## Known Deployment Pitfalls (อ่านก่อน deploy ทุกครั้ง)

### [IMPORTANT] DB ใช้ `prisma db push` ไม่ใช่ migrations
- migration history ค้างที่ `20260403145328_init` แต่ DB จริงมีครบ 89 models (เพิ่มผ่าน `db push` มาตลอด)
- **ห้ามรัน `npx prisma migrate dev`** — มันเจอ drift แล้วจะขอ **reset (ล้าง) DB**
- เปลี่ยน schema → แก้ `schema.prisma` แล้ว `npx prisma db push` (จาก `apps/api`)
- ดู impact ก่อน (read-only): `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`

### [IMPORTANT] หลัง `prisma db push` ต้อง re-run `npm run search:index`
- Quick search (`/search/quick`) ใช้ **portable trigram FULLTEXT** (Thai) — คอลัมน์ `search_text` + `@@fulltext` อยู่ใน schema (db push สร้างให้) แต่ **stored function `fn_search_trigrams` + triggers อยู่นอก schema** → `db push` ไม่ดูแลให้ และถ้า reset DB จะหายไป
- ทุกครั้งหลัง `db push`/reset DB (dev หรือ prod) ต้องรัน `npm run search:index` (= `node prisma/apply-search-index.js`) เพื่อติดตั้ง function/triggers + backfill `search_text` ใหม่ — `deploy.sh` ทำให้อัตโนมัติแล้ว (chain ต่อจาก db push)
- **dev = MySQL 8 / prod = MariaDB 11** → ใช้ default-parser FULLTEXT (ไม่ใช่ ngram ที่ MariaDB ไม่รองรับ); trigram ยาว 3 ตัวเพื่อให้ผ่าน `innodb_ft_min_token_size=3`
- ถ้าแก้ separator/tokenizer: ต้องแก้ให้ตรงกัน **ทั้ง 3 ที่** — `src/search/search-trigram.util.ts` (SEPARATORS), `prisma/apply-search-index.js` (REPLACE chain), `prisma/sql/search-index.sql` — ไม่งั้น index/query ไม่ match
- term < 3 ตัวอักษร (สร้าง trigram ไม่ได้) → controller fallback เป็น `LIKE` อัตโนมัติ

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

### Technical Decisions (session 2026-04-20)
- **Assignment de-dup UI** — Director's case page prevents duplicate assignments; shows existing assignee before re-assigning
- **รับทราบ (acknowledge)** — Inline optimistic-update button on cases page + visibility refetch; also works from LIFF case detail
- **Intake file proxy** — Director viewing LINE-uploaded intake files was returning 404; fixed by routing through `api/files/intake/[id]` with JWT header
- **API proxy for CSP** — Direct client → HTTP API calls blocked by browser CSP (HTTPS page → HTTP backend); solved with Next.js `/api/proxy/[...path]` server-side route

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

---

### Metadata Extraction — Thinking Model Truncation (session 2026-04-22) — RESOLVED

**สถานะ:** แก้แล้ว (commit `0b27b84`) — ExtractionService ดึง metadata ครบทุกฟิลด์

#### อาการ
หลัง upload หนังสือราชการผ่าน LINE:
- Classification ผ่าน "หนังสือราชการ ความมั่นใจ 100%" ✓
- แต่ **เลขที่หนังสือ / ลงวันที่ / หน่วยงาน / actions = ว่างหมด** (`—`)
- ชื่อเรื่องมา (จาก regex fallback)
- "สรุปโดย AI" แสดง OCR text ดิบ (ไม่ใช่ประโยคสรุป)

#### สาเหตุจริง (ตามลำดับที่ค้นพบ)

1. **Thinking model eats output budget** ← ตัวจริง
   - `gemini-2.5-flash` เป็น thinking model — default `thinkingBudget = dynamic`
   - `maxOutputTokens: 1650` ถูกใช้กับ internal reasoning ส่วนใหญ่ → เหลือ ~300 tokens สำหรับ JSON
   - Response ถูกตัดกลางคัน: `raw="```json\n{\n  \"subject\": \"...\",\n  \"intent\": \"เพื่อแจ้งและประชาสัมพันธ์`
   - `indexOf('{')` เจอ (start=8) แต่ `lastIndexOf('}')` ไม่เจอ (end=-1) → fallback ทำงาน
   - Fallback extraction ไม่มีข้อมูล metadata → ว่างหมด

2. **Fullwidth brackets** (ไม่ใช่สาเหตุเคสนี้ แต่เคยเจอ)
   - Gemini บางครั้งส่ง `｛｝：，` (U+FF5B/FF5D/FF1A/FF0C) แทน ASCII
   - `JSON.parse` fail — แก้ด้วย `.replace(/｛/g, '{')` ก่อน parse

3. **Gemini ไม่ fill top-level fields**
   - บาง response มี `structured_summary.sender` แต่ `issuing_authority = ""`
   - Gemini ส่ง `document_no: 13` (number) แทน string `"ศธ ๐๕๐๔๕/..."`

#### วิธีแก้ (4 ชั้นป้องกัน)

**1. Disable thinking mode** (แก้สาเหตุหลัก) — `apps/api/src/gemini/gemini-api.service.ts`
```typescript
// Gemini direct API
generationConfig: {
  ...,
  thinkingConfig: { thinkingBudget: 0 },  // ← สำคัญสุด
}

// OpenRouter
body.reasoning = { max_tokens: 0 };
```
Service รับ `disableThinking?: boolean` — pass `true` จาก `ExtractionService` และ `ClassifierService` (งาน JSON structured)

**2. Normalize fullwidth chars** — `extraction.service.ts`
```typescript
const normalized = rawText
  .replace(/｛/g, '{').replace(/｝/g, '}')
  .replace(/：/g, ':').replace(/，/g, ',');
```

**3. JSON boundary extraction** — ไม่ใช้ regex strip markdown fence
```typescript
const start = normalized.indexOf('{');
const end = normalized.lastIndexOf('}');
// ทนต่อ ```json prefix, prose wrappers, อะไรก็ได้
```

**4. Regex fallback เมื่อ Gemini ส่งฟิลด์ว่าง** — `regexFallback()` ใน `extraction.service.ts`
- `docNo`: match `ที่ ศธ ๐๕๐๔๕/๑ ๔๗๓` / `ที่ กสศ.๐๖/๙๕๖๒`
- `docDate`: parse `๑๓ มีนาคม ๒๕๖๙` (รองรับเลขไทย + แปลง พ.ศ.→ค.ศ.)
- `authority`: match บรรทัด `สำนักงาน.../กระทรวง.../กรม.../โรงเรียน.../เทศบาล...`

และ `documentNo: String(parsed.document_no ?? '').trim()` — cast number → string

#### กฎทอง
> **ทุกครั้งที่ใช้ `gemini-2.5-flash` (หรือ thinking model รุ่นใหม่กว่า) กับงาน JSON/structured output → ต้องส่ง `disableThinking: true` เสมอ**
> ไม่งั้น tokens จะถูกกิน response ตัดกลางคัน แม้ `maxOutputTokens` ตั้งสูงแค่ไหนก็ไม่พอ

#### Debug Tip
ถ้า ExtractionService WARN `no JSON found` — เปิด log แบบ single-line:
```
WARN Extraction: no JSON found — start=X end=Y charCodes=[...] raw="..."
```
- `end=-1` = response ถูกตัด → thinking budget issue
- `charCodes` มี 65403 (U+FF5B) = fullwidth bracket → normalize issue
- `start=-1` = ไม่มี `{` เลย → Gemini ไม่ได้ส่ง JSON กลับมา (prompt issue)

#### Files Changed (session 2026-04-22)
| File | การแก้ไข |
|---|---|
| `apps/api/src/gemini/gemini-api.service.ts` | เพิ่ม `disableThinking?` ใน 4 methods + `thinkingConfig` / `reasoning.max_tokens` |
| `apps/api/src/ai/services/extraction.service.ts` | normalize fullwidth + indexOf JSON boundary + regex fallback (`regexFallback()`) + `disableThinking: true` |
| `apps/api/src/ai/services/classifier.service.ts` | `disableThinking: true` |
| `apps/api/src/system-prompts/default-prompts.ts` | prompt `extract.metadata` v2-fieldfix — เจาะจง `document_no` / `document_date` / `issuing_authority` ชัดเจนขึ้น |
| `apps/api/src/system-prompts/system-prompts.service.ts` | เพิ่ม `extract.metadata: '[v2-fieldfix]'` ใน `FORCE_UPDATE_MARKER` |
