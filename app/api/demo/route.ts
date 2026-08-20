import { NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_CODE, demoAllowed } from "@/lib/demo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!demoAllowed()) {
    return NextResponse.json(
      { error: "Demo mode is disabled in this environment." },
      { status: 403 },
    );
  }

  const { code } = await req.json().catch(() => ({ code: "" }));
  if (String(code).trim() !== DEMO_CODE) {
    return NextResponse.json({ error: "Code not recognised" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, redirect: "/dashboard" });
  res.cookies.set(DEMO_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true, redirect: "/login" });
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
