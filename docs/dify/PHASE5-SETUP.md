# Dify Phase 5 — Agent tools → read-only NextOffice APIs

Lets a **Dify Agent / Chatflow** call NextOffice for live school data (cases, outbound, registry search).  
All tools are **read-only** and **org-scoped**. Writes (ลงรับ / อนุมัติ / ออกเลข) stay in NextOffice UI only.

## Architecture

```
Dify Agent tool call
    Authorization: Bearer <DIFY_TOOLS_API_KEY>
    X-Org-Id: <org>   (optional if DIFY_TOOLS_ORG_ID set)
        │
        ▼
NextOffice API  /dify-tools/*
        │
        ▼
Prisma / CasesService  (organizationId filter always)
```

## Environment

```env
ENABLE_DIFY=true
# or only tools:
ENABLE_DIFY_TOOLS=true

# Shared secret for tools (min 16 chars) — NOT the Dify app key
DIFY_TOOLS_API_KEY=generate_a_long_random_secret_here

# Default org when tools omit X-Org-Id
DIFY_TOOLS_ORG_ID=1

# Optional multi-school allowlist (comma-separated)
# DIFY_TOOLS_ALLOWED_ORG_IDS=1,2,3
```

`GET /dify/status` (JWT) reports `tools.keyConfigured` and `tools.defaultOrgId`.

## Endpoints (read-only)

Base: `{NEXT_OFFICE_API}/dify-tools`  
Auth header (either):

- `Authorization: Bearer <DIFY_TOOLS_API_KEY>`
- `X-Dify-Tool-Key: <DIFY_TOOLS_API_KEY>`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Ping + org scope |
| GET | `/search?q=&limit=` | Cases + outbound quick search |
| GET | `/cases?status=&urgency=&limit=` | List recent cases |
| GET | `/cases/:id` | Case detail + intake summary |
| GET | `/outbound/:id` | Outbound meta + body excerpt |
| GET | `/registry/search?q=&limit=` | Document registry search |

No POST/PATCH/DELETE on this controller.

## Register tools in Dify

1. Open Agent (or Chatflow with tools) → **Tools** → **Custom tool** / **OpenAPI**
2. Import OpenAPI from `docs/dify/dify-tools.openapi.yaml`  
   or add each tool manually (see below)
3. Server URL = public or LAN API base, e.g. `https://api.nextoffice.example` or `http://host.docker.internal:3001`
4. Auth: API Key header `Authorization` value `Bearer <DIFY_TOOLS_API_KEY>`  
   (or custom header `X-Dify-Tool-Key`)
5. Optional default header `X-Org-Id: 1`

### Manual tool examples

**search**

- GET `{base}/dify-tools/search?q={query}&limit=8`

**get_case**

- GET `{base}/dify-tools/cases/{case_id}`

**list_cases**

- GET `{base}/dify-tools/cases?status=registered&limit=10`

**get_outbound**

- GET `{base}/dify-tools/outbound/{id}`

**search_registry**

- GET `{base}/dify-tools/registry/search?q={query}`

## Agent system prompt (suggested)

```text
คุณเป็นผู้ช่วยสารบรรณของโรงเรียน ใช้ tools เพื่อค้นหาและอ่านข้อมูลจริงจาก NextOffice เท่านั้น
- ห้ามสร้างเลขที่หนังสือ / ลงรับ / อนุมัติ ผ่าน tools (ไม่มี write tools)
- ตอบอ้างอิงเลขเคส เลขทะเบียนที่ค้นได้
- ถ้า tool error หรือไม่พบข้อมูล ให้บอกตรง ๆ
```

## Security checklist

- [ ] `DIFY_TOOLS_API_KEY` long random; not committed  
- [ ] `DIFY_TOOLS_ORG_ID` set for single-tenant school  
- [ ] API not exposed publicly without TLS + key  
- [ ] Do not grant write scopes later without separate audit  
- [ ] Prefer internal network / NPM ACL for `/dify-tools/*`  

## Smoke test

```bash
export KEY=your_dify_tools_api_key
export API=http://localhost:3001

curl -s -H "Authorization: Bearer $KEY" -H "X-Org-Id: 1" \
  "$API/dify-tools/health"

curl -s -H "Authorization: Bearer $KEY" -H "X-Org-Id: 1" \
  "$API/dify-tools/search?q=งบประมาณ&limit=5"
```

## Files

| File | Role |
|------|------|
| `dify-tools.guard.ts` | API key + org allowlist |
| `dify-tools.service.ts` | Read-only queries |
| `dify-tools.controller.ts` | HTTP surface |
| `docs/dify/dify-tools.openapi.yaml` | Import into Dify |

## Next

| Phase | Work | Status |
|-------|------|--------|
| 6 | Ops / rate limit / audit / admin | See [PHASE6-SETUP.md](./PHASE6-SETUP.md) |

## Phases

| Phase | Topic |
|-------|--------|
| 1 | Policy chat app + Nest client + `/dify` page |
| 2 | Multi-app, workflow, case context, cache |
| 3 | ChatPanel + case embed |
| 4 | Outbound outline workflow → draft |
| 5 | Agent tools (this doc) |
| 6 | Ops / rate limit / audit / admin |
