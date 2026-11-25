# Prisma Migration Workflow

This project uses Supabase for runtime queries and Prisma for schema migrations.

## Environment variables

Set these in your local `.env` (or `.env.local` if you load it for CLI tools):

You can generate the `DATABASE_URL` template from your existing Supabase URL:

```bash
pnpm supabase:db:url
```

To write it directly into `.env.local`:

```bash
pnpm supabase:db:url -- --write
```

```bash
DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
```

- Use a direct Postgres connection string for migrations.
- Keep `NEXT_PUBLIC_SUPABASE_URL` and publishable key for app runtime.

## Existing database baseline (one-time)

If your database already exists, do not run an init migration that recreates all tables.

1. Ensure `prisma/schema.prisma` matches your current schema.
2. Generate a baseline migration file:

```bash
mkdir -p prisma/migrations/0000_baseline
pnpm prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0000_baseline/migration.sql
```

3. Mark that baseline as already applied (so Prisma does not rerun it on your existing DB):

```bash
pnpm prisma migrate resolve --applied 0000_baseline
```

4. Apply real incremental migrations (for example, `202604130001_storage_quota`):

```bash
pnpm prisma:migrate:deploy
```

## Creating a migration

```bash
pnpm prisma:migrate:create --name add_some_change
```

Prisma will create a folder in `prisma/migrations/<timestamp>_add_some_change/`.

For Supabase-specific features (RLS, functions, triggers, storage policies), add SQL directly in that generated `migration.sql` file.

## Applying migrations

Local/dev:

```bash
pnpm prisma:migrate:dev
```

CI/production:

```bash
pnpm prisma:migrate:deploy
```

## Client generation

```bash
pnpm prisma:generate
```
