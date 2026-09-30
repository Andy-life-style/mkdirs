/** Same-origin Sanity API transport through the already available headless Chrome. */
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

module.exports = async function createBrowserTransport(base, token) {
  const chrome = spawn(
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    [
      "--headless",
      "--remote-debugging-pipe",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${path.join(os.tmpdir(), `replica-sanity-${process.pid}`)}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true },
  );
  let id = 0;
  let buffer = "";
  const pending = new Map();
  chrome.stdio[4].on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\0")) {
      const cut = buffer.indexOf("\0");
      const raw = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      if (!raw) continue;
      const message = JSON.parse(raw);
      const wait = pending.get(message.id);
      if (!wait) continue;
      clearTimeout(wait.timer);
      pending.delete(message.id);
      message.error
        ? wait.reject(new Error(JSON.stringify(message.error)))
        : wait.resolve(message.result);
    }
  });
  function send(method, params, sessionId) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Chrome API timeout: ${method}`));
      }, 60000);
      pending.set(requestId, { resolve, reject, timer });
      chrome.stdio[3].write(
        `${JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
      );
    });
  }
  const { targetId } = await send("Target.createTarget", { url: base });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await send("Runtime.enable", {}, sessionId);
  const origin = new URL(base).origin;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const state = await send(
        "Runtime.evaluate",
        {
          expression: "({origin:location.origin,ready:document.readyState})",
          returnByValue: true,
        },
        sessionId,
      );
      if (
        state.result?.value?.origin === origin &&
        state.result.value.ready === "complete"
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    chrome.kill();
    throw new Error("Sanity browser transport did not reach the API origin");
  }
  let queue = Promise.resolve();
  async function performRequest(url, options = {}) {
    const body = options.body;
    const expression = `(async () => {
      const bytes = ${body ? `Uint8Array.from(atob(${JSON.stringify(Buffer.from(body).toString("base64"))}), c => c.charCodeAt(0))` : "undefined"};
      const r = await fetch(${JSON.stringify(base + url)}, {
        method: ${JSON.stringify(options.method || "GET")},
        headers: { Authorization: "Bearer " + ${JSON.stringify(token)}, ...${JSON.stringify(options.headers || {})} },
        body: bytes,
      });
      return { status: r.status, text: await r.text() };
    })()`;
    const result = await send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails)
      throw new Error(`Chrome fetch: ${result.exceptionDetails.text}`);
    const response = result.result.value;
    if (!response) throw new Error("Chrome fetch returned no response");
    if (response.status < 200 || response.status >= 300)
      throw new Error(
        `Sanity ${response.status}: ${response.text.slice(0, 300)}`,
      );
    return JSON.parse(response.text);
  }
  return {
    request(url, options = {}) {
      const result = queue.then(() => performRequest(url, options));
      queue = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    close() {
      chrome.kill();
    },
  };
};
