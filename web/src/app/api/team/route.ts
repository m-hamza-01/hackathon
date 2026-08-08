import { NextResponse } from "next/server";
import { getMockTeam } from "@/lib/mock";

export async function GET() {
  return NextResponse.json(getMockTeam());
}
