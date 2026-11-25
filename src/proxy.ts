import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env";

/** Routes that require an authenticated Hunter. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/study",
  "/subjects",
  "/quests",
  "/achievements",
  "/profile",
  "/history",
  "/analytics",
  "/settings",
  "/awakening",
];

/** Routes that make no sense once signed in. */
const AUTH_ROUTES = ["/login", "/signup"];

/**
 * Next.js 16 proxy (formerly middleware).
 *
 * Two jobs: refresh the Supabase session cookie on every request so Server
 * Components see a valid token, and keep unauthenticated visitors out of
 * protected routes. This is convenience, not authorisation — every table is
 * additionally guarded by RLS.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // Without configuration the app renders its own setup screen.
  if (!isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Using getUser() (not getSession()) validates the JWT with the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  return response;
}

function withSessionCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth cookies must be
     * refreshed for HTML navigations and server actions alike.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)",
  ],
};
