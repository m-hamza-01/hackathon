import { NextResponse } from "next/server";
import { getMockAskResponse } from "@/lib/mock";

export async function POST() {
  // Artificial delay so the loading state is visible during demos
  await new Promise((resolve) => setTimeout(resolve, 800));
  return NextResponse.json(getMockAskResponse());
}
