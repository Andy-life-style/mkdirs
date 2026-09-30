import { renderReplica } from "@/lib/replica";
import { load } from "cheerio";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const route =
    request.headers.get("x-aitoolfame-route") ||
    request.nextUrl.searchParams.get("route") ||
    (request.nextUrl.pathname !== "/replica"
      ? request.nextUrl.pathname + request.nextUrl.search
      : "/");
  if (!route.startsWith("/") || route.startsWith("//"))
    return new Response("Invalid route", { status: 400 });
  const result = await renderReplica(new URL(route, request.nextUrl.origin));
  const $ = load(result.html);
  const businessUnavailable =
    process.env.REPLICA_CMS_READY !== "true" ||
    process.env.REPLICA_BUSINESS_ENABLED !== "true";
  if (businessUnavailable) {
    $(
      'a[href^="/submit"], a[href^="/auth/"], a[href^="/dashboard"], a[href^="/payment"]',
    ).remove();
    $('button[aria-label="Save tool"]').remove();
    $("button").each((_, button) => {
      const label = $(button).text().trim();
      if (label === "Submit" || label === "Sign In") $(button).remove();
      if (label === "Go Submit") {
        $(button).replaceWith(
          '<span class="replica-unavailable">Currently unavailable</span>',
        );
      }
    });
    $("form[data-replica-newsletter]").replaceWith(
      '<p class="replica-unavailable">Newsletter signup is temporarily unavailable.</p>',
    );
  }
  const live = process.env.VERCEL_ENV === "production";
  $('meta[name="robots"]').attr(
    "content",
    live ? "index,follow" : "noindex,nofollow",
  );
  return new Response($.html(), {
    status: result.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": live ? "index, follow" : "noindex, nofollow",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
