# NextOffice AI/RAG Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       LINE BOT (WEBHOOK)                         │
│  User sends document (image/PDF) via LINE chat                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │   LineWebhookController        │
        │  (LINE signature verified)     │
        └────────────┬───────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │   IntakeProcessor              │
        │ (QUEUE_LINE_EVENTS)            │
        └────────────┬───────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
      Fetch      Store         Run
      from       in            OCR
      LINE      MinIO          (sync)
                              
         └───────────┼───────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │   ClassifyProcessor            │
        │ (QUEUE_AI_PROCESSING)          │
        │  Heuristic + LLM checks        │
        └────────────┬───────────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
    IS OFFICIAL?              IS NON-OFFICIAL?
         │                        │
         ▼                        ▼
    OfficialProcessor      ClarificationProcessor
    (Queue Job)            (Queue Job)
         │                        │
         │                    ┌───┴────────┐
         │                    │ Open       │
         │                    │ Session    │
         │                    │            │
         │                    ▼            │
         │                 Push Quick    User
         │                 Reply Options Selects
         │                               Action
         │                               
    ┌────┴────────────────┐              
    │ Extract Metadata    │              
    │ (LLM)               │              
    └────┬────────────────┘              
         │
    ┌────┴──────────────────────────────┐
    │  Create Document + InboundCase    │
    │  + Google Calendar events         │
    │  + Apply Smart Routing             │
    └────┬──────────────────────────────┘
         │
    ┌────┴──────────────────────────────┐
    │   RAG PIPELINE                     │
    │   (ReasoningService)               │
    │                                    │
    │  ┌─────────────────────────────┐  │
    │  │ RetrievalService            │  │
    │  │ ─────────────────────────── │  │
    │  │ 1. PolicyRagService         │  │
    │  │    (keyword search)         │  │
    │  │ 2. HorizonRagService        │  │
    │  │    (keyword search)         │  │
    │  │ 3. (Optional)               │  │
    │  │    HybridSearchService      │  │
    │  │    (vector + keyword)       │  │
    │  │                             │  │
    │  │ Score: 0.4*semantic +       │  │
    │  │        0.25*trust +         │  │
    │  │        0.15*freshness +     │  │
    │  │        0.2*contextFit       │  │
    │  └────────────┬────────────────┘  │
    │               │                    │
    │       ┌───────┴────────┐           │
    │       │ LLM Reasoning  │           │
    │       │ (Gemini API)   │           │
    │       │                │           │
    │       │ Generate:      │           │
    │       │ - Option A     │           │
    │       │ - Option B     │           │
    │       │ - Option C     │           │
    │       │ with scores    │           │
    │       └────────────────┘           │
    └────┬──────────────────────────────┘
         │
    ┌────┴──────────────────┐
    │  Open LINE Session    │
    │  Send Result Flex Msg │
    │  + Buttons            │
    └─────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────┐
    │   USER (Director/Clerk in LINE)      │
    │   - ลงรับหนังสือ (register)          │
    │   - มอบหมายงาน (assign)               │
    │   - สรุปเอกสาร (summarize)            │
    │   - ร่างตอบ (draft reply)             │
    └──────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────┐
    │   CaseWorkflowService                │
    │   ──────────────────────────────────  │
    │   register() →                        │
    │   assign() → (create assignment +     │
    │              Google Calendar reminder │
    │   updateStatus() →                    │
    │   checkAutoComplete() →               │
    └──────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────┐
    │   Case in DB                         │
    │   Status: new → analyzing → proposed │
    │           → registered → assigned    │
    │           → in_progress → completed  │
    │                         → archived    │
    └──────────────────────────────────────┘
```

---

## Data Models & Storage

```
┌─────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL (Prisma)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LINE INTEGRATION:                                              │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ LineEvent       │  │ LineUser         │  │ LineConv      │ │
│  │ ───────────────┐│  │ ─────────────────│  │ Session       │ │
│  │ id              │  │ id               │  │ ─────────────┐│ │
│  │ lineUserId      ├──┤ lineUserId       │  │ id            │ │
│  │ eventType       │  │ organizationId   │  │ lineUserIdRef │ │
│  │ messageType     │  │ ...              │  │ sessionType   │ │
│  │ rawPayloadJson  │  │                  │  │ documentIntake│ │
│  │ receiveStatus   │  │                  │  │ ...           │ │
│  └─────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                 │
│  DOCUMENT INTAKE:                                               │
│  ┌───────────────────────┐  ┌──────────────────────────┐      │
│  │ DocumentIntake        │  │ DocumentAiResult         │      │
│  │ ──────────────────────│  │ ──────────────────────── │      │
│  │ id                    │  │ id                       │      │
│  │ lineEventId           │  │ documentIntakeId         │      │
│  │ lineUserIdRef         │  │ extractedText            │      │
│  │ sourceChannel         │  │ isOfficialDocument       │      │
│  │ mimeType              │  │ classificationLabel      │      │
│  │ fileSize, sha256      │  │ issuingAuthority         │      │
│  │ uploadStatus          │  │ documentNo, documentDate │      │
│  │ ocrStatus             │  │ subjectText              │      │
│  │ classifierStatus      │  │ deadlineDate             │      │
│  │ aiStatus              │  │ summaryText              │      │
│  └───────────────────────┘  │ meetingDate/Time/Loc     │      │
│                              │ nextActionJson           │      │
│                              └──────────────────────────┘      │
│                                                                 │
│  CASE MANAGEMENT:                                               │
│  ┌──────────────────────┐  ┌──────────────────┐               │
│  │ InboundCase          │  │ CaseAssignment   │               │
│  │ ──────────────────── │  │ ─────────────────│               │
│  │ id                   │  │ id               │               │
│  │ organizationId       │  │ inboundCaseId    │               │
│  │ sourceDocumentId     │  │ assignedToUserId │               │
│  │ title                │  │ assignedByUserId │               │
│  │ registrationNo       │  │ role             │               │
│  │ status               │  │ status           │               │
│  │ urgencyLevel         │  │ dueDate          │               │
│  │ dueDate              │  │ googleCalendarEV │               │
│  │ directorNote         │  └──────────────────┘               │
│  │ selectedOptionId     │  ┌──────────────────┐               │
│  │ googleCalendarEventId│  │ CaseOption       │               │
│  └──────────────────────┘  │ ─────────────────│               │
│  ┌──────────────────────┐  │ id               │               │
│  │ CaseActivity         │  │ inboundCaseId    │               │
│  │ ──────────────────── │  │ optionCode (A/B/)│               │
│  │ id                   │  │ title            │               │
│  │ inboundCaseId        │  │ description      │               │
│  │ action (register,    │  │ feasibilityScore │               │
│  │         assign,      │  │ innovationScore  │               │
│  │         status)      │  │ complianceScore  │               │
│  │ detail (JSON)        │  │ overallScore     │               │
│  │ userId               │  └──────────────────┘               │
│  │ createdAt            │                                      │
│  └──────────────────────┘                                      │
│                                                                 │
│  DOCUMENTS & RAG:                                               │
│  ┌──────────────────────┐  ┌──────────────────┐               │
│  │ Document             │  │ DocumentChunk    │               │
│  │ ──────────────────── │  │ ─────────────────│               │
│  │ id                   │  │ id               │               │
│  │ title                │  │ documentId       │               │
│  │ sourceType           │  │ chunkIndex       │               │
│  │ documentType         │  │ chunkText        │               │
│  │ issuingAuthority     │  │ tokenCount       │               │
│  │ fullText             │  │ qdrantPointId    │               │
│  │ publishedAt          │  │ embeddedAt       │               │
│  └──────────────────────┘  └──────────────────┘               │
│  ┌──────────────────────┐  ┌──────────────────┐               │
│  │ PolicyItem           │  │ HorizonItem      │               │
│  │ ──────────────────── │  │ ─────────────────│               │
│  │ id                   │  │ id               │               │
│  │ documentId           │  │ documentId       │               │
│  │ summaryForAction     │  │ summary          │               │
│  │ mandatoryLevel       │  │ evidenceStrength │               │
│  │ complianceRiskLevel  │  │ scope, sector    │               │
│  │ clauses (relation)   │  │ practices (rel)  │               │
│  └──────────────────────┘  └──────────────────┘               │
│  ┌──────────────────────────────────────────┐                 │
│  │ CaseRetrievalResult (audit trail)        │                 │
│  │ ─────────────────────────────────────── │                 │
│  │ id                                       │                 │
│  │ inboundCaseId                            │                 │
│  │ sourceType (horizon|policy|context)      │                 │
│  │ sourceRecordId                           │                 │
│  │ retrievalRank                            │                 │
│  │ semanticScore, trustScore, freshness     │                 │
│  │ contextFitScore, finalScore              │                 │
│  │ rationale                                │                 │
│  └──────────────────────────────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Vector Store (Qdrant)

```
┌──────────────────────────────────────────────────────┐
│                    QDRANT                            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  COLLECTION: "knowledge" (768-dim cosine)            │
│  ────────────────────────────────────────            │
│  Points:                                             │
│  ├─ policy_clause:{id} → {sourceType, sourceId}    │
│  │  (from PolicyItem + HorizonItem embeddings)     │
│  │                                                  │
│  └─ horizon_practice:{id} → {sourceType, sourceId} │
│                                                      │
│  COLLECTION: "documents" (768-dim cosine)            │
│  ─────────────────────────────────────              │
│  Points:                                             │
│  ├─ {uuid} → {documentId, chunkId, chunkIndex,     │
│  │            documentType, sourceType, text}      │
│  │  (from DocumentChunk embeddings)                 │
│  │                                                  │
│  └─ Used only if HybridSearchService enabled       │
│                                                      │
│  EMBEDDING MODEL: text-embedding-004 (Gemini)       │
│  ─────────────────────────────────                  │
│  - API: generativelanguage.googleapis.com            │
│  - Dimension: 768                                    │
│  - Used by: ChunkingService, HybridSearchService    │
│                                                      │
│  BATCH LOADING:                                      │
│  - Sequential (to avoid rate limits)                │
│  - Non-blocking failures (per-item error handling)  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## File Storage (MinIO)

```
┌──────────────────────────────────────────────────────┐
│                     MINIO                            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Path Structure:                                     │
│  ├─ line_chat/                                      │
│  │  ├─ images/                                      │
│  │  │  └─ {intake_id}/{filename}                   │
│  │  ├─ pdfs/                                        │
│  │  │  └─ {intake_id}/{filename}                   │
│  │  └─ documents/                                   │
│  │     └─ {intake_id}/{filename}                   │
│  │                                                  │
│  └─ archived/                                       │
│     └─ {year}/{month}/{document_id}                │
│                                                      │
│  Metadata Stored:                                    │
│  - fileSize (bytes)                                  │
│  - sha256 (hash)                                     │
│  - uploadedAt (timestamp)                            │
│  - originalFileName                                  │
│                                                      │
│  Lifecycle:                                          │
│  1. IntakeProcessor stores raw file                 │
│  2. DocumentAiResult references via storagePath     │
│  3. Archived after case completion (optional)        │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Queue System (Bull)

```
┌──────────────────────────────────────────────────┐
│          REDIS + BULL QUEUE SYSTEM                │
├──────────────────────────────────────────────────┤
│                                                  │
│  QUEUE: QUEUE_LINE_EVENTS                        │
│  ──────────────────────────────────              │
│  Processor: IntakeProcessor                      │
│                                                  │
│  Job: line.intake.received                       │
│  Data: {lineEventId: string}                     │
│  ├─ Fetch file from LINE servers                 │
│  ├─ Detect MIME type                             │
│  ├─ Create DocumentIntake record                 │
│  ├─ Store file in MinIO                          │
│  ├─ Run OCR (Gemini Vision)                      │
│  ├─ Create DocumentAiResult                      │
│  ├─ Update IntakeProcessor status                │
│  └─ Dispatch ClassifyProcessor                   │
│                                                  │
│  QUEUE: QUEUE_AI_PROCESSING                      │
│  ──────────────────────────────────              │
│  Processors: ClassifyProcessor, OfficialProcessor│
│              ClarificationProcessor              │
│                                                  │
│  Job: ai.classify.document                       │
│  Data: {documentIntakeId: string}                │
│  ├─ Load DocumentAiResult                        │
│  ├─ Heuristic check (Thai patterns)              │
│  ├─ LLM classification (if score <0.9)           │
│  ├─ Update classification in DB                  │
│  └─ Route:                                       │
│     ├─ OFFICIAL → ai.official.process            │
│     └─ NON_OFFICIAL → ai.clarification.queue     │
│                                                  │
│  Job: ai.official.process                        │
│  Data: {documentIntakeId: string}                │
│  ├─ Open LINE session (non-blocking)             │
│  ├─ Extract metadata (LLM)                       │
│  ├─ Create Document record                       │
│  ├─ Create InboundCase record                    │
│  ├─ Create Google Calendar meeting event (if)    │
│  ├─ Apply smart routing                          │
│  ├─ Generate case options (RAG pipeline)         │
│  └─ Push LINE message with result + buttons      │
│                                                  │
│  Job: ai.clarification.queue                     │
│  Data: {documentIntakeId: string}                │
│  ├─ Open clarification session                   │
│  └─ Push non-official document options           │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## RAG Pipeline (RetrievalService)

```
INPUT: caseId, query, organizationId
│
├─ Option 1: Keyword-Only (Default)
│  │
│  ├─ PolicyRagService.search(query, topK=5)
│  │  ├─ Load 100 PolicyItem records
│  │  ├─ Score: tokenizer.computeRelevance(query, text)
│  │  ├─ Filter: score > 0.05
│  │  ├─ Compute trustScore (mandatoryLevel+jurisdictionLevel)
│  │  ├─ Compute freshnessScore (age-based decay)
│  │  └─ Return top 5
│  │
│  ├─ HorizonRagService.search(query, topK=5)
│  │  ├─ Load 100 HorizonItem records
│  │  ├─ Score: tokenizer.computeRelevance(query, text)
│  │  ├─ Filter: score > 0.05
│  │  ├─ Compute trustScore (evidenceStrength)
│  │  ├─ Compute freshnessScore (age-based decay)
│  │  └─ Return top 5
│  │
│  └─ Compute contextFitScore from OrganizationContextScore table
│
├─ Option 2: Hybrid Search (If HybridSearchService enabled)
│  │
│  ├─ Embed query with text-embedding-004 (768-dim)
│  │
│  ├─ Vector search:
│  │  ├─ Search COLLECTION_KNOWLEDGE for policy/horizon items
│  │  ├─ Search COLLECTION_DOCUMENTS for document chunks
│  │  └─ Return results with vectorScore (0-1 cosine)
│  │
│  ├─ Keyword search:
│  │  ├─ TF-IDF on policy items (computeRelevance)
│  │  └─ TF-IDF on horizon items (computeRelevance)
│  │
│  └─ Blend: hybridScore = 0.6*vectorScore + 0.4*keywordScore
│
├─ Final Scoring (all options)
│  │
│  ├─ FINAL_SCORE = 
│  │    0.4×semanticScore +
│  │    0.25×trustScore +
│  │    0.15×freshnessScore +
│  │    0.2×contextFitScore
│  │
│  └─ Sort by FINAL_SCORE (descending)
│
├─ Audit Trail
│  │
│  └─ Save each result to CaseRetrievalResult table:
│     ├─ inboundCaseId, sourceType, sourceRecordId
│     ├─ semanticScore, trustScore, freshnessScore, contextFitScore
│     ├─ finalScore, retrievalRank
│     └─ rationale (first 100 chars)
│
└─ RETURN: RetrievalResult[]
   ├─ sourceType: 'horizon' | 'policy' | 'context'
   ├─ finalScore: 0-1
   ├─ data: complete source record
   └─ Passed to ReasoningService for option generation
```

---

## Reasoning Pipeline (ReasoningService)

```
INPUT: caseId, orgId, query
│
├─ Retrieve context
│  ├─ Call RetrievalService
│  ├─ Filter top 3 horizon items
│  └─ Filter top 3 policy items
│
├─ Option Generation
│  │
│  ├─ IF GEMINI_API_KEY set:
│  │  │
│  │  ├─ Build prompt from 'reasoning.options' system prompt
│  │  │  ├─ Replace {{query}} with case query
│  │  │  ├─ Replace {{horizon_context}} with top 3 horizon items
│  │  │  └─ Replace {{policy_context}} with top 3 policy items
│  │  │
│  │  ├─ Call Gemini API
│  │  │  ├─ Temperature: from system prompt config
│  │  │  ├─ Max tokens: from system prompt config
│  │  │  └─ Expect JSON array response
│  │  │
│  │  ├─ Parse JSON response
│  │  │  ├─ Extract options array
│  │  │  └─ Each option: {code, title, description, ...scores}
│  │  │
│  │  └─ Return LLM-generated options
│  │
│  └─ ELSE (No LLM):
│     └─ Return hardcoded options (A/B/C)
│
├─ Score Explanation (for each option)
│  │
│  ├─ feasibilityScore (0-1): Can we implement?
│  ├─ innovationScore (0-1): How novel is this?
│  ├─ complianceScore (0-1): Does it follow policies?
│  └─ overallScore = weighted average of above
│
├─ Save to Database
│  │
│  ├─ For each option:
│  │  └─ Create CaseOption record with all fields
│  │
│  ├─ For each option reference:
│  │  └─ Create CaseOptionReference (links to policy/horizon items)
│  │
│  └─ Update InboundCase status: 'proposed'
│
└─ RETURN: void (data saved to DB)
```

---

## Classifier Pipeline (ClassifierService)

```
INPUT: extractedText (from OCR), fileMeta {mimeType, originalFileName}
│
├─ STEP 1: Heuristic Check (Fast Path)
│  │
│  ├─ Thai pattern matching (5 weighted indicators):
│  │  ├─ ที่\s+\w+\/\d+  → 0.25 (document ID pattern)
│  │  ├─ เรื่อง\s+.+     → 0.20 (subject marker)
│  │  ├─ เรียน\s+.+     → 0.20 (recipient marker)
│  │  ├─ ด้วย\s+.+      → 0.15 (preamble marker)
│  │  └─ จึงเรียนมาเพื่อ/ขอแสดงความนับถือ → 0.20 (closing)
│  │
│  ├─ Sum weights (max 1.0)
│  │
│  └─ IF score ≥ 0.9:
│     └─ OFFICIAL (confident, no LLM needed)
│
├─ STEP 2: LLM Classification (Fallback)
│  │
│  ├─ IF GEMINI_API_KEY NOT set:
│  │  └─ UNKNOWN (return null confidence)
│  │
│  ├─ Prepare prompt
│  │  ├─ System prompt: 'classify.llm'
│  │  └─ Replace {{extracted_text}} with first 3000 chars
│  │
│  ├─ Call Gemini API
│  │  └─ Expect JSON: {is_official_document: bool, confidence: 0-1}
│  │
│  ├─ Parse response
│  │  ├─ Extract: is_official_document, confidence
│  │  ├─ Map to label:
│  │  │  ├─ true + confidence ≥ 0.85 → 'official_letter'
│  │  │  ├─ true + confidence < 0.85 → 'possibly_official'
│  │  │  ├─ false → 'non_official'
│  │  │  └─ null → 'unknown'
│  │  └─ Return classification result
│  │
│  └─ ON ERROR: fallback to 'unknown'
│
└─ RETURN: ClassificationResult
   ├─ isOfficialDocument: boolean | null
   ├─ classificationLabel: 'official_letter' | 'possibly_official' | 'non_official' | 'unknown'
   ├─ classificationConfidence: 0-1
   └─ Used to route to OfficialProcessor or ClarificationProcessor
```

---

## Extraction Pipeline (ExtractionService)

```
INPUT: extractedText (from OCR)
│
├─ IF GEMINI_API_KEY set:
│  │
│  ├─ Prepare prompt
│  │  ├─ System prompt: 'extract.metadata'
│  │  └─ Replace {{extracted_text}} with first 4000 chars
│  │
│  ├─ Call Gemini API
│  │  └─ Expect JSON: {
│  │      issuing_authority, recipient, document_no,
│  │      document_date (BE or CE), deadline_date,
│  │      subject, summary, intent, urgency,
│  │      actions: string[],
│  │      is_meeting, meeting_date, meeting_time, meeting_location
│  │    }
│  │
│  ├─ Parse response
│  │  └─ Extract all fields
│  │
│  ├─ Normalize dates
│  │  ├─ Buddhist Era (>2500) → CE (subtract 543)
│  │  ├─ Handle formats: YYYY-MM-DD, DD/MM/YYYY
│  │  └─ Return YYYY-MM-DD CE
│  │
│  └─ Return OfficialMetadata struct
│
└─ ELSE (No LLM):
   │
   ├─ Heuristic extraction
   │  ├─ /เรื่อง\s+/ → subjectText
   │  ├─ /ที่\s+[\w\/\.-]+/ → documentNo
   │  ├─ /เรียน\s+/ → recipient
   │  └─ text.substring(0, 200) → summary
   │
   └─ Return minimal OfficialMetadata
```

---

## Score Calculation Example

```
Case: School receives official letter about curriculum change
Query: "หลักสูตรใหม่" (new curriculum)

RETRIEVAL RESULTS:

Policy Item #123: "Curriculum Change Procedures"
  ├─ Semantic Score: 0.8 (strong keyword match)
  ├─ Trust Score: 0.95 (mandatory level, national jurisdiction)
  ├─ Freshness Score: 0.9 (published 1 year ago)
  ├─ Context Fit Score: 0.85 (organization type matches)
  └─ FINAL = 0.4×0.8 + 0.25×0.95 + 0.15×0.9 + 0.2×0.85
            = 0.32 + 0.2375 + 0.135 + 0.17
            = 0.8625

Horizon Item #45: "Curriculum Implementation Case Study"
  ├─ Semantic Score: 0.7 (good keyword match)
  ├─ Trust Score: 0.8 (medium evidence strength)
  ├─ Freshness Score: 0.85 (published 2 years ago)
  ├─ Context Fit Score: 0.75 (different sector)
  └─ FINAL = 0.4×0.7 + 0.25×0.8 + 0.15×0.85 + 0.2×0.75
            = 0.28 + 0.20 + 0.1275 + 0.15
            = 0.7575

Policy Item #289: "Budget Guidelines"
  ├─ Semantic Score: 0.3 (weak keyword match)
  ├─ Trust Score: 0.9 (mandatory)
  ├─ Freshness Score: 0.8
  ├─ Context Fit Score: 0.8
  └─ FINAL = 0.4×0.3 + 0.25×0.9 + 0.15×0.8 + 0.2×0.8
            = 0.12 + 0.225 + 0.12 + 0.16
            = 0.625

RANKING: Policy#123 (0.8625) > Horizon#45 (0.7575) > Policy#289 (0.625)

CASE OPTIONS GENERATED:
Option A: "Conservative" - Apply official policy exactly
Option B: "Balanced" - Adapt policy to school context
Option C: "Innovation" - Implement new best practices

Scores for Option B:
  ├─ Feasibility: 0.8 (doable with planning)
  ├─ Innovation: 0.65 (some new elements)
  └─ Compliance: 0.9 (closely follows policy)
```

