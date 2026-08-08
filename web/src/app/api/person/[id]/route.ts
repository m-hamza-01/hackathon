import { NextResponse } from "next/server";
import { getPerson } from "@/lib/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Full-string match: parseInt would accept "123abc" and "4.5" as 123 / 4.
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const numId = parseInt(id, 10);

  try {
    const data = getPerson(numId);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/person]", err);
    return NextResponse.json({ error: "Failed to load person data" }, { status: 500 });
  }
}
