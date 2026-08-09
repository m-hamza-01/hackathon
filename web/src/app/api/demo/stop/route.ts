/**
 * GET /api/demo/stop
 *
 * Expires the foreman_demo cookie and redirects back to /connect so the
 * visitor can connect their own Jira instance.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { appOrigin } from "@/lib/app-origin";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  // maxAge 0 expires the cookie immediately
  cookieStore.set("foreman_demo", "", { path: "/", maxAge: 0 });

  const origin = appOrigin(req);
  return NextResponse.redirect(`${origin}/connect`);
}
