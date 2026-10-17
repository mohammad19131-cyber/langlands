import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in`);
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/sign-in`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/sign-in`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
