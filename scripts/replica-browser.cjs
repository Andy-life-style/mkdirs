/** Chrome CDP verification; never submits anything to the reference site. */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const mode = process.argv[2] || "local";
const quick = process.argv.includes("--quick");
const publicSmoke = process.argv.includes("--public-smoke");
const dir = path.join(os.tmpdir(), "aitoolfame-verification");
fs.mkdirSync(dir, { recursive: true });
const chrome = spawn(
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  [
    "--headless",
    "--remote-debugging-pipe",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${path.join(dir, `profile-${mode}-${process.pid}`)}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true },
);
let seq = 0;
let buffer = "";
const pending = new Map();
const listeners = new Set();
chrome.stderr.on("data", () => {});
chrome.stdio[4].on("data", (b) => {
  buffer += b;
  while (buffer.includes("\0")) {
    const cut = buffer.indexOf("\0");
    const raw = buffer.slice(0, cut);
    buffer = buffer.slice(cut + 1);
    if (!raw) continue;
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error
        ? p.reject(new Error(JSON.stringify(m.error)))
        : p.resolve(m.result);
    } else for (const f of listeners) f(m);
  }
});
function send(method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout ${method}`));
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    chrome.stdio[3].write(
      `${JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      })}\0`,
    );
  });
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const routeArgument = process.argv.find((value) =>
  value.startsWith("--route="),
);
const routes = routeArgument
  ? [routeArgument.slice(8)]
  : publicSmoke
    ? [
        "/",
        "/category",
        "/category?page=2",
        "/category?q=cursor",
        "/category?sort=name-asc",
        "/category?sort=name-desc",
        "/category/video",
        "/tag/free",
        "/collection",
        "/item/cursor",
        "/item/crawlready",
        "/item/faceless-reels",
        "/item/datahabibi",
        "/blog",
        "/blog/launch-directory-seo-first-90-days",
        "/pricing",
      ]
    : quick
      ? ["/"]
      : [
          "/",
          "/category",
          "/category?page=2",
          "/category/video",
          "/tag",
          "/tag/free",
          "/collection",
          "/item/cursor",
          "/blog",
          "/blog/category/seo",
          "/blog/launch-directory-seo-first-90-days",
          "/pricing",
          "/about",
          "/privacy",
          "/terms",
          "/auth/login",
          "/auth/register",
          "/auth/reset",
          "/submit",
        ];
async function main() {
  console.log("SCREENSHOT_DIR", dir);
  const captureAvatars = process.argv.includes("--avatar-binaries");
  const captureImages = process.argv.includes("--image-binaries");
  if (captureAvatars || captureImages) {
    let urls = [
      "https://lh3.googleusercontent.com/a/ACg8ocKLZKKgj_3kJNx2xzxuM4gBLdhd4qTaiht-9A5JTr8Vpe1LeeM=s96-c",
      "https://lh3.googleusercontent.com/a/ACg8ocIV003bmFuszTKQfJ3uq1MK3dd_Pqi18V5LlArQnu_ofeQuBYI=s96-c",
    ];
    if (captureImages) {
      const { load } = require("cheerio");
      const manifest = JSON.parse(
        fs.readFileSync("content/aitoolfame/manifest.json", "utf8"),
      );
      const locals = new Set();
      for (const [route, page] of Object.entries(manifest.pages)) {
        if (!route.startsWith("/blog")) continue;
        const $ = load(
          fs.readFileSync(
            path.join("content/aitoolfame/pages", page.file),
            "utf8",
          ),
        );
        $("main img[src]").each((_, element) =>
          locals.add($(element).attr("src")),
        );
      }
      urls = Object.entries(manifest.assets)
        .filter(
          ([url, asset]) =>
            url.startsWith("https://cdn.sanity.io/images/") &&
            locals.has(asset.local) &&
            url.includes("auto=format"),
        )
        .map(([url]) => url);
    }
    const { targetId } = await send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const cmd = (method, params) => send(method, params, sessionId);
    await cmd("Page.enable");
    await cmd("Network.enable");
    await cmd("Network.setCacheDisabled", { cacheDisabled: true });
    if (captureImages)
      await cmd("Network.setExtraHTTPHeaders", {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
    const cached = [];
    for (const url of urls) {
      let response;
      let finish;
      const completed = new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Avatar timeout: ${url}`)),
          30000,
        );
        const listener = (event) => {
          if (event.sessionId !== sessionId) return;
          if (
            event.method === "Network.responseReceived" &&
            event.params.response.url === url
          )
            response = event.params;
          if (event.method === "Network.loadingFinished") {
            finish = event.params.requestId;
            if (response?.requestId === finish) {
              clearTimeout(timer);
              listeners.delete(listener);
              resolve();
            }
          }
        };
        listeners.add(listener);
      });
      await cmd("Page.navigate", { url });
      await completed;
      if (!response?.response?.mimeType?.startsWith("image/"))
        throw new Error(
          `Unexpected avatar response: ${response?.response?.mimeType}`,
        );
      const body = await cmd("Network.getResponseBody", {
        requestId: response.requestId,
      });
      const bytes = body.base64Encoded
        ? Buffer.from(body.body, "base64")
        : Buffer.from(body.body);
      const file = `${captureImages ? "image" : "avatar"}-${crypto.createHash("sha256").update(url).digest("hex").slice(0, 24)}.bin`;
      fs.writeFileSync(path.join(dir, file), bytes);
      cached.push({
        url,
        file,
        contentType: response.response.mimeType,
        bytes: bytes.length,
      });
    }
    fs.writeFileSync(
      path.join(
        dir,
        captureImages ? "image-binaries.json" : "avatar-binaries.json",
      ),
      JSON.stringify(cached, null, 2),
    );
    console.log(JSON.stringify(cached));
    await send("Browser.close");
    return;
  }
  const accessUrl = process.env.REPLICA_BROWSER_ACCESS_URL;
  if (accessUrl) {
    const { targetId } = await send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const cmd = (method, params) => send(method, params, sessionId);
    await cmd("Page.enable");
    await cmd("Runtime.enable");
    await cmd("Page.navigate", { url: accessUrl });
    let location;
    for (let n = 0; n < 120; n++) {
      const response = await cmd("Runtime.evaluate", {
        expression:
          'document.readyState === "complete" ? ({href:location.href,title:document.title}) : null',
        returnByValue: true,
      });
      location = response.result.value;
      if (location) break;
      await delay(250);
    }
    if (
      !location ||
      new URL(location.href).hostname !==
        new URL(process.env.REPLICA_BROWSER_ORIGIN).hostname ||
      location.title === "Temporarily unavailable"
    )
      throw new Error("Preview access did not reach the public home page");
    await send("Target.closeTarget", { targetId });
  }
  if (process.argv.includes("--interactions")) {
    await require("./replica-interactions.cjs")({ send, delay, mode, dir });
    await send("Browser.close");
    return;
  }
  const report = [];
  for (const route of routes) {
    for (const width of quick || publicSmoke ? [1440, 390] : [1440, 390, 768]) {
      const height = width === 390 ? 844 : 1000;
      const { targetId } = await send("Target.createTarget", {
        url: "about:blank",
      });
      const { sessionId } = await send("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const cmd = (m, p) => send(m, p, sessionId);
      const errors = [];
      const warnings = [];
      const resources = [];
      const imageRequests = [];
      const responses = [];
      const listener = (m) => {
        if (m.sessionId !== sessionId) return;
        if (m.method === "Runtime.exceptionThrown")
          errors.push(
            `${m.params.exceptionDetails.text}: ${m.params.exceptionDetails.exception?.description || ""}`,
          );
        if (
          m.method === "Runtime.consoleAPICalled" &&
          m.params.type === "error"
        )
          errors.push(
            m.params.args
              .map((arg) => arg.value ?? arg.description ?? "")
              .join(" "),
          );
        if (
          m.method === "Runtime.consoleAPICalled" &&
          m.params.type === "warning"
        )
          warnings.push(
            m.params.args
              .map((arg) => arg.value ?? arg.description ?? "")
              .join(" "),
          );
        if (m.method === "Log.entryAdded" && m.params.entry.level === "warning")
          warnings.push(m.params.entry.text);
        if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
          errors.push(m.params.entry.text);
        if (
          m.method === "Network.responseReceived" &&
          m.params.type === "Image"
        ) {
          resources.push({
            url: m.params.response.url,
            mime: m.params.response.mimeType,
            status: m.params.response.status,
          });
          imageRequests.push({
            url: m.params.response.url,
            mime: m.params.response.mimeType,
            requestId: m.params.requestId,
          });
        }
        if (
          m.method === "Network.responseReceived" &&
          m.params.type === "Document"
        )
          responses.push(m.params.response.status);
      };
      listeners.add(listener);
      await cmd("Page.enable");
      await cmd("Runtime.enable");
      await cmd("Log.enable");
      await cmd("Network.enable");
      if (process.argv.includes("--page-image-binaries"))
        await cmd("Network.setCacheDisabled", { cacheDisabled: true });
      await cmd("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width === 390,
      });
      if (width === 390)
        await cmd("Emulation.setTouchEmulationEnabled", {
          enabled: true,
          maxTouchPoints: 1,
        });
      const evaluate = async (expression) => {
        const r = await cmd("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (r.exceptionDetails)
          throw new Error(JSON.stringify(r.exceptionDetails));
        return r.result.value;
      };
      const origin =
        mode === "reference"
          ? "https://aitoolfame.com"
          : process.env.REPLICA_BROWSER_ORIGIN || "http://localhost:3000";
      const nav = await cmd("Page.navigate", { url: origin + route });
      if (nav.errorText) throw new Error(nav.errorText);
      for (let n = 0; n < 120; n++) {
        if (
          await evaluate(
            'document.readyState === "complete" && document.body.innerText.trim().length > 30',
          )
        )
          break;
        await delay(250);
      }
      await evaluate("document.fonts.ready.then(()=>true)");
      await evaluate(
        "(async()=>{document.documentElement.style.scrollBehavior='auto';for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight){scrollTo(0,y);await new Promise(r=>setTimeout(r,70));}scrollTo({top:0,behavior:'instant'});await Promise.race([Promise.all(Array.from(document.images,i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))),new Promise(r=>setTimeout(r,3000))]);return true})()",
      );
      await delay(150);
      const state = await evaluate(
        '({title:document.title,url:location.href,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,h1:document.querySelector("h1")?.innerText,textLength:document.body.innerText.length,images:document.images.length,broken:Array.from(document.images).filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src),pending:Array.from(document.images).filter(i=>!i.complete).length,overlay:!!document.querySelector("[data-nextjs-dialog]"),buttons:document.querySelectorAll("button").length,links:document.querySelectorAll("a").length})',
      );
      if (process.argv.includes("--inspect"))
        state.inspect = await evaluate(
          '({authorNodes:Array.from(document.querySelectorAll("main span.rounded-full")).map(e=>({outer:e.outerHTML,html:e.parentElement?.outerHTML,background:getComputedStyle(e).backgroundImage})),images:Array.from(document.querySelectorAll("main img")).map(e=>({alt:e.alt,src:e.src,currentSrc:e.currentSrc,outer:e.outerHTML})),portals:Array.from(document.querySelectorAll("nextjs-portal,[data-nextjs-dialog]")).map(e=>({html:e.outerHTML.slice(0,3000),shadow:e.shadowRoot?.innerText}))})',
        );
      if (process.argv.includes("--inspect"))
        state.article = await evaluate(
          '({publisher:Array.from(document.querySelectorAll("*")).find(e=>e.children.length===0&&e.textContent?.trim()==="Publisher")?.parentElement?.outerHTML.slice(0,8000),toc:Array.from(document.querySelectorAll("*")).find(e=>e.children.length===0&&e.textContent?.trim()==="Table of Contents")?.parentElement?.outerHTML.slice(0,20000),headings:Array.from(document.querySelectorAll("article h2,article h3,main h2,main h3")).map(e=>({tag:e.tagName,id:e.id,text:e.innerText})).slice(0,50)})',
        );
      if (process.argv.includes("--inspect"))
        state.imageDetails = await evaluate(
          'Array.from(document.querySelectorAll("main img")).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {alt:e.alt,x:r.x,y:r.y,width:r.width,height:r.height,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight,objectFit:s.objectFit,transform:s.transform,opacity:s.opacity,borderRadius:s.borderRadius}})',
        );
      if (process.argv.includes("--inspect")) state.resources = resources;
      const name = `${
        route === "/"
          ? "home"
          : route.replace(/[^a-z0-9]+/gi, "-").replace(/^-/, "")
      }-${width}`;
      const image = await cmd("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      fs.writeFileSync(
        path.join(dir, `${mode}-${name}.png`),
        Buffer.from(image.data, "base64"),
      );
      if (width !== 768) {
        const full = await cmd("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width, height: state.height, scale: 1 },
        });
        fs.writeFileSync(
          path.join(dir, `${mode}-${name}-full.png`),
          Buffer.from(full.data, "base64"),
        );
      }
      if (process.argv.includes("--page-image-binaries")) {
        const captured = [];
        for (const entry of imageRequests.filter((item) =>
          item.url.startsWith("https://cdn.sanity.io/images/"),
        )) {
          const body = await cmd("Network.getResponseBody", {
            requestId: entry.requestId,
          });
          const bytes = body.base64Encoded
            ? Buffer.from(body.body, "base64")
            : Buffer.from(body.body);
          const filename = `page-image-${crypto.createHash("sha256").update(entry.url).digest("hex").slice(0, 24)}-${width}.bin`;
          fs.writeFileSync(path.join(dir, filename), bytes);
          captured.push({
            ...entry,
            filename,
            bytes: bytes.length,
            sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          });
        }
        fs.writeFileSync(
          path.join(dir, `${mode}-${name}-images.json`),
          JSON.stringify(captured, null, 2),
        );
      }
      report.push({
        route,
        width,
        ...state,
        status: responses.at(-1),
        errors,
        warnings,
      });
      console.log(
        JSON.stringify({
          mode,
          route,
          width,
          status: responses.at(-1),
          h1: state.h1,
          overflow: state.scrollWidth > width,
          broken: state.broken.length,
          errors: errors.length,
        }),
      );
      listeners.delete(listener);
      await send("Target.closeTarget", { targetId });
      fs.writeFileSync(
        path.join(
          dir,
          `${mode}-report${routeArgument ? `-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}` : ""}.json`,
        ),
        JSON.stringify(report, null, 2),
      );
    }
  }
  await send("Browser.close");
}
main()
  .catch((e) => {
    console.error(e);
    chrome.kill();
    process.exitCode = 1;
  })
  .finally(() => {
    for (const p of pending.values()) clearTimeout(p.timer);
  });
