# Team account provisioning (night before)

## Model

- Exactly **20** qualified teams.
- Public username = qualified **Team ID** (digits, e.g. `004`, `010`, `025`).
- List order maps to seats **1 → 20**.
- Passwords are generated at provision time, shown once as CSV, stored only as bcrypt on `teams.password_hash`.
- Login is Team ID + password only. No participant email UI.
- Sessions still use Supabase Auth (`auth.uid()`) after server-side bcrypt verification so RLS and `submit_decision` stay intact.

## Prerequisites (do not skip)

1. Isolated test database migrations through **`0012_teams_hash_column_grants.sql`** applied (`0001`–`0012` in order). Never point this procedure at the existing hosted competition unless an operator has explicitly chosen that project.
2. `apps/web/.env.local` (and Vercel) has:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)
   - `TEAM_PROVISION_SECRET` (server only; required — provision returns 503 if missing)
3. Auth: Email password provider on; public signup off; Google off.
4. Seeded competition `langlands-r3` with 20 seats (from `0005`).

## Production deploy checklist

1. Apply migrations `0007` and `0008` on hosted Supabase.
2. Set all four env vars on Vercel Production (and Preview if used).
3. Confirm Auth public signup is disabled.
4. Deploy the web app.
5. Night before: POST the final 20 Team IDs with `Authorization: Bearer $TEAM_PROVISION_SECRET`.
6. Download the one-time CSV; distribute privately; do not commit it.

## Provision (after you supply the final 20 IDs)

```bash
curl -sS -X POST "$ORIGIN/api/admin/provision-teams" \
  -H "Authorization: Bearer $TEAM_PROVISION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"teamIds":["004","010","025", "...18 more..."]}' \
  -o team-credentials.json
```

Response includes `credentials[]` and `csv`. Download once, distribute privately, delete local copies after handoff. Do not commit the file.

## What still needs approval before live provisioning

- Apply `0007` and `0008` on the hosted project.
- Set `TEAM_PROVISION_SECRET` (and the three Supabase env vars) on the server / Vercel.
- Provide the final 20 Team IDs.
- Run the POST above against the deployed (or local) app pointed at hosted Supabase.

Until those are approved, no accounts are created on hosted.
