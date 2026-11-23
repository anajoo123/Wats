# عَون | Awn — Mutual Aid Circles

Privacy-first community mutual aid platform built with Next.js App Router, strict TypeScript, Tailwind CSS, bilingual Arabic/English (`RTL`/`LTR`), PWA offline safe retry queue, and Supabase PostgreSQL RLS migrations + pgTAP verification.

## Architecture (Modular Monolith)
- `modules/<name>/{schema,repo,policy,service}.ts` (`auth`, `countries`, `circles`, `needs`, `matching`, `privacy`, `sos`, `moderation`, `impact`, `surprises`)
- `lib/security/`: HMAC signed `HttpOnly` sessions, `Idempotency-Key` deduplication, per-user/IP rate limits, binary JPEG/PNG EXIF/GPS stripper, signed media access
- `supabase/migrations/`: Complete Postgres schema, `transition_need()` state-machine RPC, deny-by-default RLS policies, and `country_config` seed
- `supabase/tests/rls_policies.test.sql`: pgTAP security verification suite

## Local & CI Verification
```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## Supabase & Vercel Deployment
1. Run `supabase/migrations/0001_schema.sql`, `0002_rls_and_functions.sql`, and `0003_seed_countries.sql` in your Supabase project.
2. Execute `supabase/tests/rls_policies.test.sql` with pgTAP (`supabase test db`).
3. Configure environment variables from `.env.example` in Vercel (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `SENTRY_DSN`). Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
4. Push to `main` to run `.github/workflows/ci.yml`.
