import {
  DEFAULT_LOGIN_REDIRECT,
  apiAuthPrefix,
  authRoutes,
  publicRoutes,
} from "@/routes";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

/**
 * https://www.youtube.com/watch?v=1MTyCvS05V4
 * Next Auth V5 - Advanced Guide (2024)
 */
// Middleware only verifies the JWT. Providers, bcrypt and the database adapter
// stay in the Node.js auth route and must not be bundled into the Edge runtime.
const { auth } = NextAuth({ providers: [], session: { strategy: "jwt" } });

// since we have put role in user session, so we can know the role of the user
export default auth((req) => {
  const { nextUrl } = req;
  const replicaBusinessClosed =
    process.env.AITOOLFAME_REPLICA !== "false" &&
    (process.env.REPLICA_CMS_READY !== "true" ||
      process.env.REPLICA_BUSINESS_ENABLED !== "true");
  if (
    replicaBusinessClosed &&
    /^\/(?:auth|submit|dashboard|settings|edit|payment|publish|unsubscribe)(?:\/|$)/.test(
      nextUrl.pathname,
    )
  )
    return new Response(
      '<!doctype html><html lang="en"><meta name="robots" content="noindex"><title>Temporarily unavailable</title><body style="font:16px system-ui;max-width:40rem;margin:10vh auto;padding:1rem"><h1>Temporarily unavailable</h1><p>Accounts, submissions, email, and payments are not open yet.</p><a href="/">Return to the directory</a></body></html>',
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  if (
    replicaBusinessClosed &&
    /^\/api\/(?:auth|send-email|upload-image)(?:\/|$)/.test(nextUrl.pathname)
  )
    return Response.json(
      { message: "This feature is temporarily unavailable." },
      { status: 503 },
    );
  // Public reference content is isolated from the original CMS and its routes.
  const replicaRoute =
    /^\/(?:$|category(?:\/|$)|tag(?:\/|$)|collection(?:\/|$)|item(?:\/|$)|blog(?:\/|$)|pricing$|about$|privacy$|terms$|search$)/.test(
      nextUrl.pathname,
    );
  if (
    process.env.AITOOLFAME_REPLICA !== "false" &&
    replicaRoute &&
    req.method === "GET"
  ) {
    const target = new URL("/replica", nextUrl);
    const host = req.headers.get("host");
    if (host && /^localhost(?::\d+)?$/.test(host)) target.host = host;
    target.searchParams.set("route", nextUrl.pathname + nextUrl.search);
    const headers = new Headers(req.headers);
    headers.set("x-aitoolfame-route", nextUrl.pathname + nextUrl.search);
    return NextResponse.rewrite(target, { request: { headers } });
  }
  const isLoggedIn = !!req.auth;

  const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix);
  // const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isPublicRoute = publicRoutes.some((route) =>
    new RegExp(`^${route}$`).test(nextUrl.pathname),
  );
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);

  // do nothing if on api auth routes
  if (isApiAuthRoute) {
    return null;
  }

  // redirect to dashboard if logged in and on auth routes
  if (isAuthRoute) {
    if (isLoggedIn) {
      console.log("middleware, redirecting to dashboard");
      return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
    return null;
  }

  // redirect to login if not logged in and not on public routes
  // https://github.com/javayhu/nextjs-14-auth-v5-tutorial/blob/main/middleware.ts#L32
  if (!isLoggedIn && !isPublicRoute) {
    let callbackUrl = nextUrl.pathname;
    if (nextUrl.search) {
      callbackUrl += nextUrl.search;
    }

    const encodedCallbackUrl = encodeURIComponent(callbackUrl);

    return Response.redirect(
      new URL(`/auth/login?callbackUrl=${encodedCallbackUrl}`, nextUrl),
    );
  }

  return null;
});

// https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
// https://clerk.com/docs/references/nextjs/auth-middleware#usage
export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
