# Part C — Production Incident Report

## Incident: Duplicate Attempts, Incorrect Readiness Scores, and Cross-Tenant Data Exposure

### 1. Incident Summary

On 2026-06-02, a production deployment introduced multiple reliability and data-isolation issues in the Student Readiness Control Center.

The incident involved:

- Duplicate assessment attempts being created for the same `Idempotency-Key`.
- Readiness scores changing unexpectedly because duplicate attempts affected the latest-attempt calculation.
- A student name from another tenant becoming visible in a dashboard response.
- A MongoDB publishing timeout occurring during the same period.
- Successful `201` responses being returned even though one MongoDB event publication failed.

The incident indicates failures across idempotency enforcement, tenant-scoped caching, readiness calculation/indexing, and event publishing reliability.

---

## 2. Impact

### User impact

The observed impact included:

1. A single logical assessment submission could result in multiple database attempts.
2. Student readiness scores could change unexpectedly.
3. A student name belonging to another tenant could appear in a dashboard response.
4. Operational events could fail to reach MongoDB even though the API returned success.

### Data integrity impact

The PostgreSQL data contained duplicate attempts associated with the same idempotency key.

The incident also created a risk that readiness calculations would use an unintended latest attempt.

### Tenant isolation impact

The dashboard cache key did not include tenant information:

```text
students:READY

3. Timeline
10:05

The affected deployment was released.

Shortly after deployment

Two POST requests were received using the same Idempotency-Key.

Both requests resulted in committed attempts:

Attempt 991
Attempt 992
During event publishing

A MongoDB operation timed out.

The error was caught and logged, but the API returned 201.

Detection

The following symptoms were identified:

Duplicate attempts.
Unexpected readiness score changes.
Cross-tenant student-name exposure.
MongoDB publishing failure.
4. Evidence and Root Causes
Duplicate attempts

The idempotency_records table did not have a unique constraint on:

tenant_id + key

Therefore, concurrent requests could both pass an application-level
"record does not exist" check.

Cache isolation

The cache key was:

students:READY

It did not contain the tenant ID, status, page, or other query parameters.

This could cause one tenant's cached response to be returned to another tenant.

Attempt indexing

The attempts table only had an index on:

student_id

The readiness query requires filtering and ordering by tenant, student,
competency, submission time, and attempt ID.

Readiness calculation

Readiness was calculated in application code by reading attempts and
selecting the latest attempt.

Insufficient indexing made this query less efficient and increased the
risk of reliability problems as data grew.

MongoDB publishing

MongoDB publication was performed separately from the PostgreSQL write.
A MongoDB timeout was caught and logged while the API still returned
success.

5. Immediate Containment
Identify all attempts created during the incident window.
Find duplicate submissions using tenant and idempotency key.
Invalidate affected dashboard cache entries.
Investigate potentially affected tenants.
Preserve application, PostgreSQL, MongoDB, and deployment logs.
6. Durable Repairs
Idempotency

Add a database-level unique constraint:

UNIQUE (tenant_id, key)

Concurrent requests using the same key should resolve to the existing
idempotency record instead of creating duplicate attempts.

Tenant-aware caching

Cache keys must include the tenant and relevant query parameters, for
example:

students:{tenantId}:{status}:{search}:{sort}:{page}:{pageSize}
Attempt indexing

Add an index supporting the readiness query:

(tenant_id, student_id, competency_id, submitted_at, id)
Event reliability

Use a transactional outbox so the attempt and attempt.succeeded event
are committed together in PostgreSQL.

A background publisher should retry failed MongoDB publication.

MongoDB events should use a stable event ID so retries do not create
duplicates.

7. Data Repair

For duplicate attempts:

Identify duplicate logical submissions.
Determine the valid attempt.
Void the incorrect duplicate attempt.
Recalculate readiness for affected students.

For cache contamination:

Invalidate affected cache entries.
Rebuild them using tenant-aware keys.

For MongoDB events:

Identify unpublished outbox events.
Retry publication.
Verify that each event exists only once in MongoDB.
8. Verification

The following tests and checks should be performed:

Idempotency
Same key + same request → one attempt.
Same key + different request → 409.
Concurrent same-key requests → one attempt.
Tenant isolation
Tenant A cannot access Tenant B students.
Tenant A cannot access Tenant B activity.
Cache entries cannot be reused across tenants.
Readiness
Latest non-voided attempt is selected.
Equal timestamps use attempt ID as the tie-breaker.
Voided attempts are ignored.
Missing competency produces INCOMPLETE.
Outbox
Successful attempts create one outbox event.
Failed MongoDB publication remains retryable.
Retries do not create duplicate MongoDB events.
9. Facts vs Hypotheses
Confirmed facts
Two requests used the same idempotency key.
Attempts 991 and 992 were committed.
The idempotency table lacked the required unique constraint.
The cache key lacked tenant information.
The attempts table lacked the required composite index.
MongoDB publishing timed out.
The MongoDB error was caught and logged.
The API returned 201.
Evidence still required

The following require additional production evidence:

Exact number of affected tenants.
Exact number of users who saw another tenant's data.
Whether the duplicate attempts directly caused every observed score
change.
Whether any additional duplicate attempts existed.
10. Lessons Learned

Critical invariants such as idempotency and tenant isolation must be
enforced at the database and authorization boundaries rather than relying
only on application-level checks.

External event publishing should use a durable transactional outbox with
retry-safe delivery.

Incident investigation should clearly separate confirmed facts from
hypotheses and verify both the technical repair and affected data.


**This shorter version is the one I recommend you use.** It covers the required Part C areas without making your submission unnecessarily long. :contentReference[oaicite:1]{index=1}

After saving it, just tell me **“saved”** and we'll move to `DECISIONS.md`.