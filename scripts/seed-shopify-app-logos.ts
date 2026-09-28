import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Readable } from "node:stream";
import { createClient, requester } from "@sanity/client";
import { load } from "cheerio";
import dotenv from "dotenv";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";
import sharp from "sharp";
import ts from "typescript";

/**
 * Install first: pnpm add -D sharp cheerio
 * Run from repository root: pnpm exec tsx scripts/seed-shopify-app-logos.ts
 *
 * Only updates icon/image on existing published items from the 100-app seed.
 * Existing icon/image always skips the item, even if FORCE_LOGO_UPDATE is set.
 * No document creation, publishing, text changes, or asset deletion.
 * Reads the seed's AST, NEVER imports/executes its main() function.
 * Missing/ambiguous items and items with drafts/releases are left untouched.
 * Each app is independent; failures are reported and produce a nonzero exit.
 * A revision conflict leaves the uploaded asset available for reuse next run.
 */

type App = { name: string; handle: string };
type ImageField = {
  _type?: string;
  asset?: { _ref?: string };
  alt?: string;
  [key: string]: unknown;
};
type Item = {
  _id: string;
  _rev: string;
  name?: string;
  slug?: { current?: string };
  link?: string;
  website?: string;
  url?: string;
  appStoreUrl?: string;
  shopifyAppStoreUrl?: string;
  icon?: ImageField;
  image?: ImageField;
  logo?: unknown;
};

const normalize = (value?: string) => (value ?? "").trim().toLowerCase();
const hasImage = (item: Item) =>
  Boolean(item.icon?.asset?._ref || item.image?.asset?._ref);

async function readSeedApps(): Promise<App[]> {
  const path = resolve(process.cwd(), "scripts/seed-shopify-apps.ts");
  const source = ts.createSourceFile(
    path,
    await readFile(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const apps: App[] = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "apps" ||
        !declaration.initializer ||
        !ts.isArrayLiteralExpression(declaration.initializer)
      )
        continue;
      for (const element of declaration.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        const fields: Record<string, string> = {};
        for (const property of element.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            ts.isStringLiteral(property.initializer)
          )
            fields[property.name.text] = property.initializer.text;
        }
        if (fields.name && fields.handle) {
          apps.push({ name: fields.name, handle: fields.handle });
        }
      }
    }
  }
  if (
    apps.length !== 100 ||
    new Set(apps.map((app) => app.handle)).size !== 100 ||
    apps.some((app) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.handle))
  )
    throw new Error("Cannot safely read the expected 100 seed apps.");
  return apps;
}

function webUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(value, base);
    if (!["https:", "http:"].includes(url.protocol)) return;
    if (url.username || url.password) return;
    url.hash = "";
    return url.href;
  } catch {
    return;
  }
}

function storedUrls(item: Item): string[] {
  return [
    item.link,
    item.website,
    item.url,
    item.appStoreUrl,
    item.shopifyAppStoreUrl,
  ]
    .map((value) => webUrl(value))
    .filter((value): value is string => Boolean(value));
}

function appHandle(value: string): string | undefined {
  const url = new URL(value);
  if (url.hostname !== "apps.shopify.com") return;
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length === 1 ? parts[0].toLowerCase() : undefined;
}

// Prefer app-specific icons, then structured data and filtered social images.
function logoCandidates(html: string, pageUrl: string, app: App): string[] {
  const $ = load(html);
  const candidates = new Map<string, number>();
  const base = webUrl($("base[href]").first().attr("href"), pageUrl) ?? pageUrl;
  const compact = (value: string) => normalize(value).replace(/[^a-z0-9]/g, "");
  const names = [app.name, app.handle, $("h1").first().text()]
    .map(compact)
    .filter((name) => name.length >= 3);
  const named = (value: string) =>
    names.some((name) => compact(value).includes(name));
  const unwanted =
    /screenshot|screen[-_ ]?shot|banner|hero|preview|gallery|promotional|carousel|placeholder/i;
  const add = (value: unknown, score = 60, context = "") => {
    const url = webUrl(value, base);
    if (!url || unwanted.test(`${url} ${context}`)) return;
    const rank =
      score +
      (named(`${url} ${context}`) ? 20 : 0) +
      (/logo|icon|avatar/i.test(`${url} ${context}`) ? 10 : 0);
    candidates.set(url, Math.max(candidates.get(url) ?? 0, rank));
  };
  const imageValue = (value: unknown): void => {
    if (typeof value === "string") add(value);
    else if (Array.isArray(value)) value.forEach(imageValue);
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      add(record.contentUrl ?? record.url ?? record["@id"]);
    }
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const types = [record["@type"]].flat();
    const entityName = typeof record.name === "string" ? record.name : "";
    if (
      entityName &&
      !named(entityName) &&
      types.some((type) =>
        /Application|Organization|Person|Product/.test(String(type)),
      )
    )
      return;
    if (
      types.some((type) =>
        ["SoftwareApplication", "WebApplication", "MobileApplication"].includes(
          String(type),
        ),
      )
    ) {
      imageValue(record.logo);
      imageValue(record.icon);
      imageValue(record.image);
    }
    if (
      !types.length ||
      types.some((type) => /WebPage|Organization|Product/.test(String(type)))
    ) {
      imageValue(record.logo);
      imageValue(record.icon);
      imageValue(record.image);
    }
    if (record["@graph"]) visit(record["@graph"]);
    if (record.mainEntity) visit(record.mainEntity);
  };
  // Match the listing heading, avoiding icons of recommended/related apps.
  if (new URL(pageUrl).hostname === "apps.shopify.com") {
    const title = normalize($("h1").first().text()).replace(/\s+/g, " ");
    const icon = $('img[src*="/listing_images/"][src*="/icon/"]')
      .filter(
        (_, element) =>
          Boolean(title) &&
          normalize($(element).attr("alt")).replace(/\s+/g, " ") === title,
      )
      .first();
    add(icon.attr("src"), 100);
  }
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      visit(JSON.parse($(element).text()));
    } catch {
      // Malformed structured data must not prevent trying the primary icon.
    }
  });
  $("meta").each((_, element) => {
    const meta = $(element);
    const key = normalize(meta.attr("property") ?? meta.attr("name"));
    if (
      [
        "og:image",
        "og:image:url",
        "og:image:secure_url",
        "twitter:image",
        "twitter:image:src",
      ].includes(key)
    )
      add(meta.attr("content"), 30);
  });
  $("img").each((_, element) => {
    const img = $(element);
    const label = [img.attr("alt"), img.attr("title"), img.attr("aria-label")]
      .filter(Boolean)
      .join(" ");
    const context = `${label} ${img.attr("class") ?? ""}`;
    // Exclude related-app cards, including relative App Store links.
    const anchor = webUrl(img.closest("a[href]").attr("href"), base);
    if (anchor && appHandle(anchor) && appHandle(anchor) !== app.handle) return;
    const sources: { url: string; size: number }[] = [];
    for (const attribute of ["srcset", "data-srcset"]) {
      for (const entry of (img.attr(attribute) ?? "").split(",")) {
        const [url, size] = entry.trim().split(/\s+/);
        if (url) sources.push({ url, size: Number.parseFloat(size) || 0 });
      }
    }
    sources.sort((a, b) => b.size - a.size);
    for (const attribute of ["src", "data-src", "data-lazy-src"]) {
      const url = img.attr(attribute);
      if (url) sources.push({ url, size: 0 });
    }
    for (const { url } of sources) {
      const matches = named(`${context} ${url}`);
      if (/\/listing_images\/.*\/icon\//i.test(url) && label && !matches)
        continue;
      if (!matches && !/logo|icon|avatar/i.test(`${context} ${url}`)) continue;
      add(url, matches ? 80 : 40, context);
    }
  });
  return Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([url]) => url);
}

function failureReason(error: unknown): string {
  if (error instanceof Error) {
    if (/^HTTP \d{3}$/.test(error.message)) return error.message;
    if (
      [
        "Invalid redirect",
        "Expected HTML",
        "Too many redirects",
        "No usable logo",
        "Item changed",
        "Image dimensions rejected",
      ].includes(error.message)
    )
      return error.message;
    if (error.name === "AbortError") return "request timed out";
  }
  return "network, image decode, or Sanity request failed";
}

async function main() {
  const apps = await readSeedApps();
  const env = dotenv.config({ path: resolve(process.cwd(), ".env") });
  if (env.error) throw new Error("Cannot read .env in the repository root.");
  const required = (key: string) => {
    const value = env.parsed?.[key]?.trim();
    if (!value) throw new Error(`Missing ${key} in .env`);
    return value;
  };
  // Same Sanity requester middleware as seed-shopify-apps.ts.
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const proxyRequester = proxyUrl ? requester.clone() : undefined;
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  if (proxyRequester && agent) {
    proxyRequester.use({
      finalizeOptions: (options) => ({ ...options, agent }),
    });
  }
  const client = createClient({
    projectId: required("NEXT_PUBLIC_SANITY_PROJECT_ID"),
    dataset: required("NEXT_PUBLIC_SANITY_DATASET"),
    token: required("SANITY_API_TOKEN"),
    apiVersion: "2024-08-01",
    useCdn: false,
    perspective: "raw",
    ...(proxyRequester ? { requester: proxyRequester } : {}),
  });

  // Keep proxy support for page/image downloads too. No Sanity auth is forwarded.
  const download = async (url: string, kind: "html" | "image") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      let current = url;
      for (let redirect = 0; redirect <= 5; redirect++) {
        const response = await fetch(current, {
          agent,
          signal: controller.signal,
          redirect: "manual",
          size: kind === "html" ? 5 * 1024 * 1024 : 10 * 1024 * 1024,
          headers: {
            "User-Agent": "Mkdirs-Shopify-Logo-Importer/1.0",
            Accept: kind === "html" ? "text/html" : "image/*",
            "Accept-Language": "en",
          },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          (response.body as Readable | null)?.destroy();
          const next = webUrl(response.headers.get("location"), current);
          if (!next) throw new Error("Invalid redirect");
          current = next;
          continue;
        }
        if (!response.ok) {
          (response.body as Readable | null)?.destroy();
          throw new Error(`HTTP ${response.status}`);
        }
        const mime = response.headers.get("content-type") ?? "";
        if (
          kind === "html" &&
          !/text\/html|application\/xhtml\+xml/i.test(mime)
        ) {
          (response.body as Readable | null)?.destroy();
          throw new Error("Expected HTML");
        }
        return {
          buffer: Buffer.from(await response.arrayBuffer()),
          url: current,
        };
      }
      throw new Error("Too many redirects");
    } finally {
      clearTimeout(timer);
    }
  };

  const items = await client.fetch<Item[]>(
    '*[_type == "item"]{_id, _rev, name, slug, link, website, url, appStoreUrl, shopifyAppStoreUrl, icon, image, logo}',
  );
  const published = items.filter(
    (item) => !/^(drafts|versions)\./.test(item._id),
  );
  const counts = { updated: 0, skipped: 0, failed: 0 };
  const failures: { handle: string; name: string; reason: string }[] = [];
  const fail = (app: App, reason: string) => {
    counts.failed++;
    failures.push({ handle: app.handle, name: app.name, reason });
    console.error(`[failed] ${app.handle}: ${reason}`);
  };
  const claimed = new Set<string>();
  // Resolve the entire plan before any upload, including reused non-seed IDs.
  const plan = apps.map((app) => {
    const matches = published.filter(
      (item) =>
        item._id === `seed-shopify-item-${app.handle}` ||
        normalize(item.slug?.current) === app.handle ||
        normalize(item.name) === normalize(app.name) ||
        storedUrls(item).some((url) => appHandle(url) === app.handle),
    );
    if (matches.length > 1) throw new Error(`Ambiguous item: ${app.handle}`);
    const item = matches[0];
    if (item && claimed.has(item._id))
      throw new Error(`Item matched twice: ${item._id}`);
    if (item) claimed.add(item._id);
    return { app, item };
  });

  console.log(
    "100 seed apps; missing images only; output: icon + image (512x512 PNG).",
  );
  for (const { app, item } of plan) {
    if (!item) {
      fail(app, "no published item; not created");
      continue;
    }
    const hasUnpublished = items.some(
      (entry) =>
        entry._id === `drafts.${item._id}` ||
        (entry._id.startsWith("versions.") &&
          entry._id.split(".").slice(2).join(".") === item._id),
    );
    if (hasImage(item)) {
      console.log(`[skipped-existing] ${app.handle}: already has icon/image.`);
      counts.skipped++;
      continue;
    }
    if (hasUnpublished) {
      fail(app, "draft/release exists; left untouched");
      continue;
    }
    let stage = "find logo";
    const attempts: string[] = [];
    let uploadedAsset: string | undefined;
    try {
      const urls = storedUrls(item);
      const pages = Array.from(
        new Set([
          ...urls.filter((url) => appHandle(url) === app.handle),
          `https://apps.shopify.com/${app.handle}`,
          ...urls.filter((url) => new URL(url).hostname !== "apps.shopify.com"),
        ]),
      );
      let png: Buffer | undefined;
      for (const page of pages) {
        try {
          const html = await download(page, "html");
          for (const candidate of logoCandidates(
            html.buffer.toString("utf8"),
            html.url,
            app,
          )) {
            try {
              const image = await download(candidate, "image");
              // Decode verifies actual image data even if the CDN's MIME is generic.
              const processor = sharp(image.buffer, {
                limitInputPixels: 25_000_000,
              });
              const metadata = await processor.metadata();
              if (
                !metadata.width ||
                !metadata.height ||
                metadata.width < 32 ||
                metadata.height < 32 ||
                Math.max(
                  metadata.width / metadata.height,
                  metadata.height / metadata.width,
                ) > 1.5
              )
                throw new Error("Image dimensions rejected");
              png = await processor
                .rotate()
                .resize(512, 512, {
                  fit: "contain",
                  position: "centre",
                  background: { r: 255, g: 255, b: 255, alpha: 0 },
                })
                .png()
                .toBuffer();
              break;
            } catch (error) {
              attempts.push(`image: ${failureReason(error)}`);
            }
          }
        } catch (error) {
          attempts.push(`page: ${failureReason(error)}`);
        }
        if (png) break;
      }
      if (!png) throw new Error("No usable logo");
      stage = "recheck item";
      const current = await client.getDocument<Item>(item._id);
      if (current && hasImage(current)) {
        counts.skipped++;
        console.log(
          `[skipped-existing] ${app.handle}: image added since initial query.`,
        );
        continue;
      }
      if (!current || current._rev !== item._rev)
        throw new Error("Item changed");
      stage = "upload asset";
      // Sanity's image assets are content-addressed. Reuse identical PNGs,
      // including an upload left by an earlier revision-conflicted patch.
      const sha1 = createHash("sha1").update(png).digest("hex");
      uploadedAsset =
        (await client.fetch<string | null>(
          '*[_type == "sanity.imageAsset" && sha1hash == $sha1][0]._id',
          { sha1 },
        )) ?? undefined;
      if (!uploadedAsset) {
        uploadedAsset = (
          await client.assets.upload("image", png, {
            filename: `shopify-${app.handle}-logo-512.png`,
            contentType: "image/png",
          })
        )._id;
      }
      stage = "patch images (revision guarded)";
      const asset = { _type: "reference", _ref: uploadedAsset };
      const fields: Record<string, ImageField> = {};
      for (const field of ["icon", "image"] as const) {
        // Preserve alt/custom subfields; old crop/hotspot do not fit the new square.
        const { crop, hotspot, ...previous } = current[field] ?? {};
        fields[field] = {
          ...previous,
          _type: "image",
          asset,
          alt: previous.alt ?? `${current.name ?? app.name} logo`,
        };
      }
      await client
        .patch(item._id)
        .ifRevisionId(current._rev)
        .set(fields)
        .commit();
      counts.updated++;
      console.log(`[updated] ${app.handle}`);
    } catch (error) {
      // Do not log SDK/network errors: request headers may contain credentials.
      const detail =
        stage === "find logo"
          ? `; ${Array.from(new Set(attempts)).join("; ") || "no matching logo candidates"}`
          : "";
      fail(
        app,
        `${stage}: ${failureReason(error)}${detail}${uploadedAsset ? `; asset retained: ${uploadedAsset}` : ""}`,
      );
    }
  }
  console.table(counts);
  console.log(`Failure list (${failures.length}):`);
  for (const failure of failures) console.log(JSON.stringify(failure));
  if (counts.failed) process.exitCode = 1;
}

main().catch(() => {
  console.error(
    "Logo import aborted. Check dependencies, .env, the 100-app seed, unique item matches, and Sanity access. Credentials are never logged.",
  );
  process.exitCode = 1;
});
