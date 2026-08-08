import { NextResponse } from "next/server";
import { ask } from "@/lib/engine";
import { synthesizeAsk } from "@/lib/synthesize";

export async function GET() {
  return NextResponse.json(
    { error: "Use POST with a JSON body: {title, description?}" },
    { status: 405 }
  );
}

export async function POST(req: Request) {
  let title: string;
  let description: string | undefined;

  try {
    const body = await req.json() as { title?: string; description?: string };
    title = (body.title ?? "").trim();
    description = body.description?.trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const result = ask({ title, description });
    // LLM writes prose only (rationale, questions, whys); every number and the
    // candidate order pass through from the engine. Falls back to deterministic
    // templates when ANTHROPIC_API_KEY is absent — never throws.
    const response = await synthesizeAsk(result, title, description);
    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/ask]", err);
    return NextResponse.json({ error: "Engine error — please try again" }, { status: 500 });
  }
}
