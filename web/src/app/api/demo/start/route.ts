/**
 * GET /api/demo/start
 *
 * Sets the foreman_demo cookie and redirects to the app root, allowing
 * visitors to browse the sample dataset without connecting Jira.
 *
 * Cookie is intentionally NOT httpOnly so client components can read it
 * via document.cookie to show demo-mode affordances.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { appOrigin } from "@/lib/app-origin";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.set("foreman_demo", "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
    // not httpOnly — client components read it via document.cookie
  });

  // NextResponse.redirect requires an absolute URL; appOrigin() handles
  // proxy-forwarded headers so this works correctly behind Railway.
  const origin = appOrigin(req);
  return NextResponse.redirect(`${origin}/`);
}
