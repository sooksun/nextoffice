# Dify Phase 4 — Outbound draft outline workflow

Builds on Phases 1–3. Dify produces a **structured letter outline**; NextOffice **persists** it as `OutboundDocument` with `status=draft` and **no `documentNo`** until approve.

## Architecture

```
User (outbound/new or case response dialog)
        │
        ▼
POST /outbound/dify-outline
POST /outbound/dify-outline-from-case
        │
        ▼
OutboundService → DifyApiService.runWorkflow(kind: outbound_outline)
        │
        ▼
Dify Workflow app (JSON outputs)
        │
        ▼
OutboundDocument.create({ status: draft, documentNo: null })
        │
        ▼
Redirect /outbound/:id  → user edits → approve → RegistrationCounter number
```

## Env

```env
ENABLE_DIFY=true
DIFY_API_BASE=http://host.docker.internal:5001/v1
# Prefer dedicated key; falls back to DIFY_API_KEY_WORKFLOW
DIFY_API_KEY_OUTBOUND_OUTLINE=app-zzzz
# or
# DIFY_API_KEY_WORKFLOW=app-yyyy
```

`GET /dify/status` → `apps.outboundOutline: true` when key present.

## Create the Workflow app in Dify

1. Studio → **Workflow**
2. Name: `NextOffice · ร่างโครงหนังสือส่ง`
3. **Start** inputs (text):

| Variable | Required | Notes |
|----------|----------|--------|
| `prompt` | yes | User instruction or assembled case brief |
| `letter_type` | yes | e.g. `external_letter`, `internal_memo` |
| `letter_context` | no | Inbound letter summary (case path) |
| `org_name` | no | School name |
| `org_address` | no | |
| `org_area` | no | |
| `org_id` | no | |
| `case_id` | no | |
| `case_title` | no | |
| `draft_type` | no | `reply` / `memo` / … |

4. LLM node: system prompt — see [outbound-outline-prompt.md](./outbound-outline-prompt.md)
5. End node: expose outputs as either:
   - individual fields: `subject`, `bodyText`, `recipientOrg`, `recipientName`, … or
   - one string field `result` / `outline` containing JSON
6. Publish → API key → `DIFY_API_KEY_OUTBOUND_OUTLINE`

## API

### From free prompt

```http
POST /outbound/dify-outline
{ "letterType": "external_letter", "prompt": "ร่างหนังสือถึง สพป. เรื่องรายงานผล..." }
```

### From inbound case

```http
POST /outbound/dify-outline-from-case
{ "caseId": 42, "draftType": "reply", "letterType": "external_letter" }
```

Response includes `id`, outline fields, `provider: "dify"`, `workflowRunId`. **Never** includes a new official document number.

## UI

| Place | Action |
|-------|--------|
| `/outbound/new` | Mode **Dify ร่างโครงหนังสือ** |
| Case “สร้างเอกสารตอบสนอง” | Button **Dify ร่างโครง** |

## Rules

- Dify must **not** invent `documentNo` / เลขทะเบียน  
- Numbering still only in `OutboundService.approve` via `RegistrationCounter`  
- Double-create avoided: frontend redirects to returned `id`  

## Checklist

- [ ] Workflow app published + JSON output  
- [ ] `DIFY_API_KEY_OUTBOUND_OUTLINE` or WORKFLOW set  
- [ ] `POST /outbound/dify-outline` creates draft without documentNo  
- [ ] Approve still mints number  
- [ ] Case path links `relatedInboundCaseId`  

## Next

| Phase | Work | Status |
|-------|------|--------|
| 5 | Agent tools → read-only NextOffice APIs | See [PHASE5-SETUP.md](./PHASE5-SETUP.md) |
