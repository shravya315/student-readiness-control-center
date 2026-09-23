# Student Readiness Control Center

A multi-tenant full-stack assessment project built for the Infinite Locus
readiness assessment.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Relational DB: PostgreSQL + Prisma
- Event store: MongoDB + Mongoose
- Validation: Zod
- Testing: Vitest, React Testing Library, Supertest

## Architecture

PostgreSQL is the source of truth for:

- Tenants
- Users
- Students
- Competencies
- Attempts
- Idempotency records
- Outbox events

MongoDB stores published operational events.

Authentication is JWT-based. Tenant identity is derived from the
authenticated server-side identity and is never trusted from client input.

## Core Features

### Student Readiness

The system calculates readiness using the latest non-voided attempt for
each competency.

Competency weights:

| Competency | Weight |
|---|---:|
| Frontend | 30% |
| Backend | 30% |
| Databases | 25% |
| Problem Solving | 15% |

Readiness states:

- `READY` — score >= 80
- `NEARLY_READY` — score >= 65
- `DEVELOPING` — score >= 50
- `NEEDS_PREPARATION` — score < 50
- `INCOMPLETE` — one or more competencies are missing

When two attempts have the same submission timestamp, the attempt ID is
used as the tie-breaker.

### Multi-Tenancy

All student, attempt, activity, and readiness operations are tenant
scoped.

The tenant ID is derived from the authenticated JWT rather than from a
client-supplied tenant identifier.

Cross-tenant access is rejected without exposing the existence of another
tenant's resources.

### Idempotency

Attempt submission requires an `Idempotency-Key`.

The system supports:

- Replaying the same request safely.
- Rejecting reuse of a key with a different request body.
- Handling concurrent requests using the same key.
- Database-level uniqueness for tenant + idempotency key.

### Optimistic Concurrency

Student updates use an `expectedVersion`.

If the stored version has changed, the API returns:

```text
409 VERSION_CONFLICT

## Development Verification

The application was verified locally using the following commands:

```bash
cd server
npm test
17 tests passing
cd client
npm test
4 tests passing
cd client
npm run build