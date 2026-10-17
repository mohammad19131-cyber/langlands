import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase/server";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createServerSupabase();
  if (supabase) {
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/sign-in`, { status: 303 });
}
