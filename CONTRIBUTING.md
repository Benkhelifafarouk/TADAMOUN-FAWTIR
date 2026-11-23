# Contributing

## Ground rules

- **Never commit secrets.** Use `.env.local` (ignored) and `.env.example` for placeholders.
- **Never commit real personal data** or real bills. Demo identities are synthetic and labelled.
- **Do not weaken security to make a test pass.** Fix the code or the test's premise with an explanation.
- **No manual approval path.** The eligibility engine is the only source of `APPROVED`. A database trigger
  enforces it; do not add an administrative override.
- **No associations/partners.** The product deliberately has no association accounts or activation codes.
- **Money is integer centimes.** Never introduce floats or a second rounding convention.
- **No hardcoded UI text.** Add keys to both `lib/i18n/dictionaries/ar.ts` and `fr.ts`; the French
  dictionary is type-checked against the Arabic shape.

## Development workflow

```bash
npm install
npm run db:reset && npm run db:demo
npm run dev
```

Before opening a pull request:

```bash
npm run verify                 # typecheck + lint + tests
npm run build && npm run test:e2e
```

CI runs the same steps plus a dependency audit (`.github/workflows/ci.yml`).

## Database changes

1. Add a new file `database/migrations/0NN_description.sql` — never edit an applied migration (checksums
   abort the run).
2. Include constraints, indexes and RLS policies for any new table.
3. Add an integrity trigger if the change affects money or publication.
4. Add a test in `tests/integration` or `tests/security`.
5. Run `npm run db:migrate` and `npm run db:status`.

## Code layout

| Path | Rule |
|---|---|
| `app/` | Routing and composition only; reads via `lib/data`, writes via `lib/actions` |
| `lib/actions/` | `'use server'`; guard → Zod → service → audit → revalidate |
| `lib/*/service.ts` | Business rules and transactions; no HTTP concerns |
| `lib/eligibility/engine.ts` | Pure function: no I/O, no clock, no randomness |
| `lib/db/` | Driver abstraction and migrations; all SQL parameterised |
| `components/` | Presentation; no business logic |

## Tests

- Integration/security tests must use a real database (`tests/helpers/db.ts` → in-memory PGlite) and real
  migrations.
- Bill fixtures use the PDF generator so the OCR path is genuinely exercised.
- Give each bill fixture a unique nonce unless the test is specifically about duplicates.
- Add a case to `tests/unit/eligibility-engine.test.ts` for every new engine rule.

## Security

Report vulnerabilities privately to the operator address (see `SECURITY.md`). Do not open a public issue
with reproduction steps for an unpatched vulnerability.

## Commit messages

Conventional prefixes: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`, `security:`. Explain the
*why* in the body when the change affects money, eligibility or privacy.
