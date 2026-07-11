# Dify Phase 6 — Ops, rate limit, audit, admin UI

Production hardening for Phases 1–5. **No schema migration.**

## Features

| Feature | Detail |
|---------|--------|
| **Rate limit (tools)** | `DIFY_TOOLS_RATE_LIMIT` per org+key window (default 60/min) |
| **Rate limit (chat/workflow)** | `DIFY_CHAT_RATE_LIMIT` per user (default 30/min) |
| **IP allowlist (tools)** | `DIFY_TOOLS_IP_ALLOWLIST=10.0.0.0,192.168.1.` |
| **Audit buffer** | In-memory last ~300 events (tools + chat + workflow) |
| **Admin API** | `GET /dify/admin/overview`, `GET /dify/admin/audit`, `POST /dify/admin/audit/clear` |
| **Admin UI** | `/admin/dify` (ADMIN / DIRECTOR) |

## Env

```env
# Existing Phase 1–5 vars...
ENABLE_DIFY=true
DIFY_API_BASE=http://host.docker.internal:5001/v1
DIFY_API_KEY_CHAT=app-...
DIFY_TOOLS_API_KEY=long_secret_min_16
DIFY_TOOLS_ORG_ID=1

# Phase 6 ops
DIFY_TOOLS_RATE_LIMIT=60
DIFY_TOOLS_RATE_WINDOW_MS=60000
# DIFY_TOOLS_IP_ALLOWLIST=127.0.0.1,10.0.0.,192.168.

DIFY_CHAT_RATE_LIMIT=30
DIFY_CHAT_RATE_WINDOW_MS=60000
```

## Admin API (JWT)

```bash
curl -s -H "Authorization: Bearer $USER_JWT" \
  "$API/dify/admin/overview"

curl -s -H "Authorization: Bearer $USER_JWT" \
  "$API/dify/admin/audit?limit=50&kind=tool"
```

Never returns full secrets — tools key is fingerprint only (`abcd…wxyz`).

## Notes

- Audit/rate-limit state is **per process** (lost on restart / multi-instance). For multi-replica, add Redis later.
- 429 on tools when rate exceeded; chat uses 503 with Thai message.
- Open `/admin/dify` for live dashboard.

## Checklist

- [ ] Rate limits tuned for school traffic  
- [ ] IP allowlist on production if tools exposed  
- [ ] ADMIN can open `/admin/dify` and see audit after a tool call  
- [ ] Docs linked from CLAUDE.md  

## All phases

| # | Topic |
|---|--------|
| 1 | Policy chat + Nest + `/dify` |
| 2 | Multi-app, case context, cache |
| 3 | ChatPanel + case embed |
| 4 | Outbound outline workflow |
| 5 | Agent read-only tools |
| 6 | Ops / rate limit / audit / admin (this) |
