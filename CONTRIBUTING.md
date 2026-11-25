# Contributing to Refly

Thanks for your interest in contributing to Refly! This is an open-source hobby project, and bug reports, ideas, docs improvements, and pull requests are all welcome.

## Local Development Setup

You can run the backend services (PostgreSQL + pgvector, local auth, PostgREST, file storage) in Docker while running Next.js natively with hot reload:

```bash
# 1. Generate local .env secrets
./scripts/setup.sh

# 2. Start only the local backend stack in Docker
docker compose up -d gateway

# 3. Install dependencies and start Next.js dev server
pnpm install
pnpm dev
```

Refly will be available at `http://localhost:3000`, talking to the local API gateway at `http://localhost:8000`.

## Running Checks

Before opening a pull request, please verify:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

If you changed Dockerfiles, environment variables, or database initialization, also verify the full containerized stack boots cleanly:

```bash
docker compose up -d --build
```

## Database Schema Changes

- Local Docker initialization lives in `docker/init/bootstrap.sql` (must remain **idempotent** so repeated startups are safe).
- Prisma schema & migrations live in `prisma/schema.prisma` and `prisma/migrations/`.
- Keep `docker/init/bootstrap.sql` and `supabase-schema.sql` in sync when adding tables, RPCs, indexes, or RLS policies.

## Guidelines

- Keep PRs focused and small where possible.
- Never commit `.env`, `.env.local`, API keys, or personal data.
- Add or update unit/API tests for new behavior.
- Match the existing code style (`pnpm format` runs Prettier).
