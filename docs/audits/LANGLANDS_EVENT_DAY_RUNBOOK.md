# Langlands R3 — event-day runbook

For the person running the hall. You do not need Supabase, SQL, or the engine.

**Competition:** 20 teams, 6 rounds, 18 minutes each unless you add time.  
**Town:** Ashfen. **Currency:** credits.

---

## Right now (rehearsal project, 28 Oct 2026)

This is the **rehearsal** database `fgqitafevklmuhybuwzw`, not production.

- Event `langlands-r3` is **manual** (not automatic).
- Round 1 is still marked **open**, but the official closing time has **already passed**.
- 20 teams are seated. Only seats **1** and **2** have a saved plan. The other 18 have nothing saved.
- The second-save database fix (migration `0013`) is in the website code. It still needs to be applied on this rehearsal database by a human in the Supabase SQL editor for **this** project only.
- Do **not** use `supabase db push`. The CLI on this machine is linked to the **production** project.

**Safe next clicks on `/room`:**

1. If you want teams to keep practising: **Add 5 minutes** (repeat until the clock is live again). Then apply `0013` before asking anyone to save twice.
2. If you are finished with this mock Round 1: **Close submissions** — know that 18 teams will get a hold (no projects, remaining credits in reserve). Then Score → Publish only if you intend to keep those results.
3. Do not lock, score, or publish just to “test the buttons” on a round you still need.

Never open the production project `npwgkqfljrqhvuiateqk` to run SQL.

---

## The day before

1. Confirm the live website points at the **event** database, not a leftover rehearsal project.
2. Confirm 20 team logins exist. Passwords were shown **once** at provisioning. Keep the CSV offline. Do not put it in email threads, chat, or git.
3. Sign in as organiser at `/sign-in` with the staff email. You should land on `/room`.
4. From a second browser (or private window), sign in as Team `001`. You should see the Ashfen map at `/play`.
5. Save a small plan, wait for **Saved**. Reload. The same plan should still be there.
6. Sign out of the test team. Do not lock or publish a practice round on the live event unless you intend to throw that round away.

---

## What delegates do each round

1. Sign in with Team ID (digits, e.g. `004`) and password.
2. Read the round briefing.
3. Choose up to **two** projects and split remaining credits across sectors.
4. Wait until the screen says the plan is **saved**. If it errors, the last good save is still on the server; try Save again.
5. When time ends, they wait. They cannot change the plan after submissions close.

---

## How you start

On `/room`:

1. Confirm Round 1 is waiting (or already open for a rehearsal).
2. Click **Start automatic event** if you want the server to close, score, publish, and open the next round after each deadline.
3. Or stay in **Manual** and click **Open round 1**. That starts an 18-minute server clock.

The clock on the wall of the website is a display. The server time is what counts.

---

## What happens automatically

**Only if** the event status is **live** (Start automatic event) **and** something calls `/api/event/tick` every minute:

- Vercel Cron with `CRON_SECRET` or `EVENT_TICK_SECRET`, **or**
- You leave `/room` open (it pings every 20 seconds as a backup).

Each ping does **one** safe step:

1. If the deadline has passed → close submissions (unsaved teams get a hold).
2. Then score all 20 towns.
3. Then publish if scoring succeeded.
4. Then open the next round.
5. After Round 6 is published → mark the event finished.

If a step fails, automatic progress **stops**. The round is not skipped. Use the message on `/room` and retry the same step.

**Without cron and without `/room` open, automatic mode will not advance.** Use the manual buttons.

---

## Manual fallback (always works)

On the highlighted round:

| You want | Click |
| --- | --- |
| Give more time | **Add 5 minutes** (repeat as needed) |
| Stop saving | **Close submissions** |
| Calculate scores | **Score this round** |
| Show results | **Publish results** |
| Continue | **Open next round** (only after publish) |

Do not publish if scoring failed. Do not open the next round until this one is published.

---

## How you know it worked

- After **Close submissions**: teams can no longer save. Holds are listed.
- After **Score**: you see a successful run. If you see an error, score again. Do not publish.
- After **Publish**: the public board updates. Players see official results.
- After **Open next round**: `/play` shows the new year and a new 18-minute clock.

---

## Failures

| Problem | What to do |
| --- | --- |
| Team cannot sign in | Check Team ID digits and password from the private CSV. Do not reset the database. |
| Save error | Ask them to press Save again. Their last successful save is still there. |
| “Could not replace previous save” | Apply migration `0013` on this database if it is missing, then they retry. |
| Network drop | Reload. Edits that were not saved are gone; the last server save remains. |
| Scoring error | Stay closed. Click **Score this round** again. Never hand-edit scores. |
| Next round will not open | The previous round is not published, or the event is paused. |
| Wrong team data on screen | Sign out and in. Never share another team’s login. |

---

## Never click during a healthy live round

- **Abandon round** / **Restore** unless a deputy has decided the round is void.
- Anything that rewrites published scores (there is no such button — do not invent one in SQL).
- Database reset, table delete, or “fix it in Supabase”.

---

## Pause

**Pause automatic** stops the runner. Teams can still save while the round is open. You can still run manual steps. **Resume automatic** continues from the current round. Pause does not skip a year.

---

## When it is over

After Round 6 is published, `/board` is the official ranking. Ecology 40, Welfare 25, Economy 15, Resilience 10, Efficiency 10. Ties use the published order, not a rewritten formula.

---

## Pre-event checklist

- [ ] Website points at the event database
- [ ] 20 Team IDs provisioned; CSV offline
- [ ] Public signup disabled on Auth
- [ ] Organiser can open `/room`
- [ ] One test team can save and reload on `/play`
- [ ] Migration `0013` applied (second save works)
- [ ] You know whether the hall will use **automatic** (cron or `/room` left open) or **manual**
- [ ] Deputy knows not to void a published round

## Go / no-go

- **GO** only if the test team saved twice, reloaded, and `/room` showed the real round.
- **CONDITIONAL GO** if the hall is manual-only and save/reload worked.
- **NO-GO** if save still errors, or this website still points at a rehearsal archive.
