# Dify Phase 1 — Chat app: ถามเกี่ยวกับหนังสือ / นโยบาย

Goal: one **Dify Chat** application for Thai school staff to ask about official letters (หนังสือราชการ) and education policy, called from NextOffice via NestJS.

> NextOffice remains system of record (ลงรับ / อนุมัติ / เลขที่). Dify is **Q&A only**.

---

## Architecture

```
Browser (/dify)  --JWT-->  NextOffice API  POST /dify/chat
                                |
                                | Bearer app-xxx
                                v
                         Dify API  /v1/chat-messages
```

| Piece | Location |
|-------|----------|
| Nest client | `apps/api/src/dify/` |
| API | `GET /dify/status`, `POST /dify/chat` |
| UI | `apps/web/src/app/dify/page.tsx` |
| Sidebar | จัดการงานอัจฉริยะ → ถาม AI หนังสือ/นโยบาย |
| Prompt blueprint | `docs/dify/chat-app-prompt.md` |

---

## 0. Self-host Dify (once)

Requirements: Docker, ≥2 CPU, ≥4 GB RAM. **Do not** share NextOffice MariaDB/Redis.

```bash
git clone https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
# Avoid port clashes with NextOffice (9910/9911) and NPM (80/443).
# Example: EXPOSE_NGINX_PORT=8088 EXPOSE_NGINX_SSL_PORT=8443
docker compose up -d
```

Open `http://<host>:80` (or your mapped port) → `/install` → create admin.

Add model provider: **OpenRouter** or **Google Gemini** (same keys as NextOffice if desired).

Docs: https://docs.dify.ai/getting-started/install-self-hosted

### Suggested host layout (CasaOS / Ubuntu)

| Item | Value |
|------|--------|
| Path | `/DATA/AppData/www/dify` (clone of langgenius/dify) |
| NPM domain | `dify.cnppai.com` → Dify nginx |
| API for Nest (Docker) | `http://host.docker.internal:<api-port>/v1` or internal network name |

---

## 1. Create the Chat app in Dify UI

1. **Studio** → **Create app** → **Chatbot** (or Chat).
2. Name: `NextOffice · หนังสือและนโยบาย`
3. Description: `ถามระเบียบสารบรรณ / นโยบายการศึกษา สำหรับบุคลากรโรงเรียน`
4. Open **Orchestrate** / Prompt:
   - Paste system prompt from [`chat-app-prompt.md`](./chat-app-prompt.md)
5. Add **input variable** (optional but recommended):
   - Variable name: `letter_context` (string, optional)
   - Label: บริบทหนังสือ
   - Use in prompt as `{{letter_context}}`
6. **Model**: Gemini Flash / OpenRouter equivalent; temperature ~0.3
7. (Optional) **Knowledge**: upload ระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ, school SOPs — or leave empty and rely on model knowledge for Phase 1
8. **Publish** → **API Access** → copy **API Key** (`app-...`)
9. Note API base: usually `http://<dify-host>/v1` (self-host) or `https://api.dify.ai/v1` (cloud)

---

## 2. NextOffice environment

Add to `apps/api` env (`.env` local / `.env.production`):

```env
ENABLE_DIFY=true
# Trailing /v1 required for Dify public API
DIFY_API_BASE=http://host.docker.internal:5001/v1
# or https://dify.cnppai.com/v1 depending on how you expose the API
DIFY_API_KEY_CHAT=app-xxxxxxxxxxxxxxxx
```

Aliases:

- `DIFY_API_KEY` is accepted if `DIFY_API_KEY_CHAT` is unset.

Feature flag:

- `ENABLE_DIFY=false` (default) → `/dify/status` reports disabled; `/dify/chat` returns 503.

Restart API after env change:

```bash
# local
npm run dev:api

# prod
docker compose --env-file .env.production up -d --force-recreate --no-deps api
```

---

## 3. Smoke test

```bash
# status (needs JWT cookie or Bearer)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/dify/status

# chat
curl -s -X POST http://localhost:3001/dify/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"หนังสือราชการมีกี่ประเภท?"}'
```

Or open **Web** → sidebar **ถาม AI หนังสือ/นโยบาย** → `/dify`.

---

## 4. Security notes

- Never put `DIFY_API_KEY_*` in `NEXT_PUBLIC_*` or browser code.
- Nest adds `user: user:{id}:org:{orgId}` for Dify conversation scoping.
- Do not send full PDF binaries in Phase 1; optional `letterContext` is short text only.
- Dify must not create registration numbers or approve documents.

---

## 5. Phase 1 checklist

- [ ] Dify Docker up + admin install
- [ ] Model provider (Gemini / OpenRouter) works in Dify
- [ ] Chat app created + published
- [ ] System prompt from `chat-app-prompt.md`
- [ ] Optional input `letter_context`
- [ ] API key in NextOffice env + `ENABLE_DIFY=true`
- [ ] `/dify` page shows “Dify พร้อม”
- [ ] Multi-turn works (`conversationId` retained)

---

## Next phases

| Phase | Work | Status |
|-------|------|--------|
| 2 | Multi-app, workflow, case context, caching | See [PHASE2-SETUP.md](./PHASE2-SETUP.md) |
| 3 | Embed in ChatPanel / case page | See [PHASE3-SETUP.md](./PHASE3-SETUP.md) |
| 4 | Outbound draft outline workflow | See [PHASE4-SETUP.md](./PHASE4-SETUP.md) |
| 5 | Agent tools → read-only NextOffice APIs | See [PHASE5-SETUP.md](./PHASE5-SETUP.md) |
