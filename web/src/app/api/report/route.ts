import { NextResponse } from "next/server";
import { getReport } from "@/lib/report";

export async function GET() {
  try {
    return NextResponse.json(getReport());
  } catch (err) {
    console.error("[/api/report]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
