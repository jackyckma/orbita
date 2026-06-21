# Multi-replica operations

Orbita is designed for **stateless API replicas** with **Postgres as the single source of truth**. No in-process session state.

## Safe across replicas

| Component | Mechanism |
|-----------|-----------|
| Sessions / messages | Postgres rows |
| Memory / embeddings | Postgres + pgvector |
| Credentials vault | Postgres ciphertext; `ORBITA_SECRETS_KEY` must be identical on all replicas |
| Trajectory | Postgres append-only events |
| Rate limiting | Postgres `rate_limit_counters` (fixed window per key) |
| API key auth | Postgres lookup |

## Caveats

### Scheduler tick

Each replica runs `startSchedulerTick` (5s poll). **Multiple replicas can fire the same job** unless you run a single API replica or add an external leader lock (not in v1).

**Recommendation for production:** one scheduler-active replica, or accept duplicate ticks and make webhook consumers idempotent.

### Migrations

`runMigrations` runs on every API startup. Migrations are idempotent (`IF NOT EXISTS`). Safe on parallel deploys; brief lock contention possible.

### Rate limit windows

Fixed-window counters are replica-safe but not a token bucket. Bursts at window boundaries can exceed nominal RPM slightly.

## Zeabur / PaaS checklist

1. Set identical env on all replicas: `DATABASE_URL`, `ORBITA_SECRETS_KEY`, `ORBITA_ADMIN_TOKEN`, LLM keys.
2. Use managed Postgres (included Zeabur service); enable pgvector.
3. Health: `GET /v1/health` for load balancer probes.
4. Prefer **one replica** until scheduler leader election exists, or document idempotent webhook handlers.
5. Git deploy from `main`; verify version in health after rollout.

## Local Docker

`docker compose up` runs single API + Postgres — no replica concerns.

## Observability

- Trajectory: `GET /v1/sessions/{id}/trajectory` and `/trajectory/replay`
- Prod smoke: `scripts/smoke-prod.sh`
- Session eval: `scripts/eval-session.sh`
