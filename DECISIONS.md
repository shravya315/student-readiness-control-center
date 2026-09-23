# Architecture Decisions

## Decision 1 — Backend
Use Node.js + Express + TypeScript because it matches the team's existing JavaScript/TypeScript experience and supports the required REST API cleanly.

## Decision 2 — Data ownership
PostgreSQL is the source of truth for tenants, users, students, competencies, attempts, and idempotency records. MongoDB is append-only operational event storage.

## Decision 3 — Tenant isolation
Tenant identity is derived from authenticated server-side identity, never from a client-supplied tenant identifier.

## Deferred improvements

A dedicated production cache layer with distributed invalidation is
deferred.

The current implementation prioritizes correctness through PostgreSQL
queries and tenant-scoped data access rather than introducing cache
invalidation complexity during the assessment.

A future implementation could introduce a tenant-aware cache with keys
containing tenant ID and all relevant query parameters.
