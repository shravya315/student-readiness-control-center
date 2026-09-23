# AI Log

Record every material AI-assisted contribution used for the assessment.

| Date | Tool | Prompt / Task | Accepted output | Rejected/changed output | Verification |
|---|---|---|---|---|---|
| 2026-09-22 | ChatGPT | Project planning and scaffold | Initial architecture/scaffold | N/A | Reviewed files and will verify locally |

| 2026-09-23 | ChatGPT | Backend reliability and security review | Tenant isolation, idempotency, optimistic concurrency, and transactional outbox implementation guidance | Reviewed and adapted implementation to the starter code | Backend tests: 17/17 passing |
| 2026-09-23 | ChatGPT | Readiness calculation and database test design | Tests for missing competencies, weighted scores, latest attempts, timestamp tie-breaking, tenant isolation, and voided attempts | Adjusted expected weighted score after verification | Readiness tests passing |
| 2026-09-23 | ChatGPT | Frontend reliability test design | Tests for duplicate submission, request cancellation, out-of-order responses, and VERSION_CONFLICT handling | Adjusted import/rendering setup during debugging | Frontend tests: 4/4 passing |
| 2026-09-23 | ChatGPT | Production incident analysis | Structure and remediation ideas for duplicate attempts, cache isolation, indexing, and MongoDB publishing failure | Reviewed against the assessment incident scenario | Documented in INCIDENT.md |
| 2026-09-23 | ChatGPT | Engineering documentation | Drafted tradeoffs and deferred improvement for DECISIONS.md | Adapted to existing project decisions | Reviewed against assessment requirements |
