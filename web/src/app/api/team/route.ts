import { NextResponse } from "next/server";
import { getTeam } from "@/lib/queries";

export async function GET() {
  try {
    return NextResponse.json(getTeam());
  } catch (err) {
    console.error("[/api/team]", err);
    return NextResponse.json({ error: "Failed to load team data" }, { status: 500 });
  }
}
