import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate only. Middleware runs on the edge runtime and cannot open SQLite,
 * so this checks for the presence of a session cookie and nothing more —
 * /dashboard revalidates the session properly on the server before rendering.
 * Never treat this as the authorisation boundary.
 */
export function middleware(req: NextRequest) {
  // Demo mode has its own cookie. Without this the demo dashboard gets bounced
  // to /login before the page ever runs.
  const hasDemo = req.cookies.has("invext_demo");
  const hasSession = req.cookies.has("invext_session") || hasDemo;
  const { pathname } = req.nextUrl;

  // In a demo-enabled environment /dashboard renders sample data instead of
  // redirecting, so you can peek at it without signing in.
  const demoOK =
    process.env.ALLOW_DEMO_IN_PROD === "1" || process.env.NODE_ENV !== "production";

  if (pathname.startsWith("/dashboard") && !hasSession && !demoOK) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if ((pathname === "/login" || pathname === "/signup") && hasSession && !hasDemo) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/login", "/signup"] };
