/**
 * Creates or rotates the local development organiser Auth user.
 * Does not touch teams, rounds, submissions, or production credential files.
 * Writes plaintext once to a gitignored file; does not log the password.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_ORGANISER_EMAIL } from "../lib/organiser-login";
import { generateTeamPassword } from "../lib/team-password";
import { assertProvisionTarget, organiserCredentialsTrust } from "../lib/supabase-target";

const ENV_PATH = resolve(process.cwd(), "apps/web/.env.local");
const CREDENTIALS_PATH = resolve(process.cwd(), ".organiser-local.json");

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Local organiser setup needs the existing Supabase env.`);
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(ENV_PATH);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  const target = assertProvisionTarget(url);
  if (!target.ok) {
    throw new Error(target.error);
  }
  if (existsSync(CREDENTIALS_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8")) as unknown;
      const trust = organiserCredentialsTrust(existing, url);
      if (!trust.ok) {
        process.stderr.write(
          `Existing organiser credentials file is not valid for this target (${trust.reason}). It will not be used.\n`,
        );
      }
    } catch {
      process.stderr.write(
        "Existing organiser credentials file could not be parsed and will not be used.\n",
      );
    }
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Service role must not be exposed as NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.");
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: competition, error: competitionError } = await admin
    .from("competitions")
    .select("id, slug, status")
    .eq("slug", "langlands-r3")
    .maybeSingle();
  if (competitionError || !competition?.id) {
    throw new Error("langlands-r3 competition not found.");
  }

  const password = generateTeamPassword();
  let userId: string | null = null;
  let page = 1;
  for (;;) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw new Error(listed.error.message);
    const match = listed.data.users.find((user) => user.email?.toLowerCase() === LOCAL_ORGANISER_EMAIL);
    if (match) {
      userId = match.id;
      break;
    }
    if (listed.data.users.length < 200) break;
    page += 1;
  }

  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email: LOCAL_ORGANISER_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Local organiser" },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Failed to create organiser Auth user.");
    }
    userId = created.data.user.id;
  } else {
    const updated = await admin.auth.admin.updateUserById(userId, {
      password,
      email: LOCAL_ORGANISER_EMAIL,
      email_confirm: true,
    });
    if (updated.error) throw new Error(updated.error.message);
  }

  const { data: membership, error: membershipError } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (membership) {
    throw new Error("Refusing to use a team account as organiser.");
  }

  const { data: profile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profileLookupError) throw new Error(profileLookupError.message);
  if (!profile) {
    const { error: profileInsertError } = await admin.from("profiles").insert({
      id: userId,
      display_name: "Local organiser",
      role: "organiser",
    });
    if (profileInsertError) throw new Error(profileInsertError.message);
  } else {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ role: "organiser", display_name: "Local organiser" })
      .eq("id", userId);
    if (profileError) throw new Error(profileError.message);
  }

  const { error: staffError } = await admin.from("competition_staff").upsert(
    {
      competition_id: competition.id,
      user_id: userId,
      staff_role: "organiser",
    },
    { onConflict: "competition_id,user_id" },
  );
  if (staffError) throw new Error(staffError.message);

  const { data: staff } = await admin
    .from("competition_staff")
    .select("staff_role")
    .eq("competition_id", competition.id)
    .eq("user_id", userId)
    .maybeSingle();
  if ((staff as { staff_role?: string } | null)?.staff_role !== "organiser") {
    throw new Error("competition_staff.staff_role was not organiser after upsert.");
  }

  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
  writeFileSync(
    CREDENTIALS_PATH,
    `${JSON.stringify(
      {
        email: LOCAL_ORGANISER_EMAIL,
        password,
        userId,
        competitionId: competition.id,
        projectRef: target.ref,
        createdAt: new Date().toISOString(),
        warning: "Local development only. Gitignored. Not a team account.",
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  process.stdout.write(`Local organiser ready: ${LOCAL_ORGANISER_EMAIL}\n`);
  process.stdout.write(`Credentials file: ${CREDENTIALS_PATH}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
