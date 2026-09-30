const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ send, delay, mode, dir }) => {
  const { targetId } = await send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const cmd = (m, p) => send(m, p, sessionId);
  const evaluate = async (expression) => {
    const r = await cmd("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await cmd("Page.enable");
  await cmd("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const origin =
    mode === "reference" ? "https://aitoolfame.com" : "http://localhost:3000";
  async function open(route) {
    await cmd("Page.navigate", { url: origin + route });
    for (let i = 0; i < 120; i++) {
      if (
        await evaluate(
          'document.readyState==="complete" && document.body.innerText.length>50',
        )
      )
        break;
      await delay(250);
    }
    await delay(300);
  }
  const results = [];
  if (process.argv.includes("--assets")) {
    await open("/blog");
    await delay(2000);
    const images = await evaluate(
      'Array.from(document.querySelectorAll("main img")).map(i=>({alt:i.alt,src:i.src,currentSrc:i.currentSrc,parent:i.parentElement.outerHTML}))',
    );
    fs.writeFileSync(
      path.join(dir, `${mode}-runtime-images.json`),
      JSON.stringify(images, null, 2),
    );
    console.log(JSON.stringify(images));
    await send("Target.closeTarget", { targetId });
    return;
  }
  async function screenshot(name) {
    const r = await cmd("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(dir, `${mode}-interaction-${name}.png`),
      Buffer.from(r.data, "base64"),
    );
  }
  await open("/category");
  for (const text of ["Select tags", "No Filter", "Sort by Time (dsc)"]) {
    const clicked = await evaluate(
      `(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}&&b.getBoundingClientRect().width>0);b?.click();return !!b})()`,
    );
    await delay(300);
    const menu = await evaluate(
      'Array.from(document.querySelectorAll("[role=menu],[role=listbox],[data-radix-popper-content-wrapper],.replica-popover")).map(e=>e.innerText).join(" | ")',
    );
    results.push({ check: text, clicked, menu });
    await screenshot(text.replaceAll(" ", "-"));
    await cmd("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await cmd("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
  }
  if (mode !== "reference") {
    await open("/");
    await evaluate(
      '(()=>{const f=document.querySelector("form:has(input[name=q])");f.querySelector("input").value="Cursor";f.requestSubmit();})()',
    );
    for (let i = 0; i < 60; i++) {
      await delay(250);
      if (
        await evaluate(
          'location.search.includes("Cursor") && document.querySelector("h1")?.textContent.includes("Search results")',
        )
      )
        break;
    }
    results.push({
      check: "search",
      ...(await evaluate(
        '({url:location.href,heading:document.querySelector("h1")?.textContent,cards:Array.from(document.querySelectorAll("[data-replica-grid] [data-replica-card]")).map(e=>e.dataset.replicaCard)})',
      )),
    });
    await open("/category?sort=name-asc");
    results.push({
      check: "sort",
      names: await evaluate(
        'Array.from(document.querySelectorAll("[data-replica-grid] h3")).map(e=>e.innerText)',
      ),
    });
    await open("/category?tag=free");
    results.push({
      check: "tag-filter",
      cards: await evaluate(
        'document.querySelectorAll("[data-replica-grid] [data-replica-card]").length',
      ),
    });
    await open("/");
    await evaluate(
      'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Toggle theme").click()',
    );
    await evaluate(
      'Array.from(document.querySelectorAll(".replica-popover button")).find(b=>b.textContent==="Dark").click()',
    );
    results.push({
      check: "dark",
      value: await evaluate(
        'document.documentElement.classList.contains("dark")',
      ),
    });
    await screenshot("dark");
    await evaluate('localStorage.setItem("aitoolfame-theme","light")');
    await open("/");
    await cmd("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await evaluate(
      'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Toggle navigation menu").click()',
    );
    results.push({
      check: "mobile-menu",
      links: await evaluate(
        'Array.from(document.querySelectorAll(".replica-drawer a")).map(a=>a.getAttribute("href"))',
      ),
    });
    await screenshot("mobile-menu");
    await cmd("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    results.push({
      check: "escape-closes-menu",
      value: await evaluate('!document.querySelector(".replica-drawer")'),
    });
    await open("/pricing");
    results.push({
      check: "mobile-overflow",
      ...(await evaluate(
        '({innerWidth,scrollWidth:document.documentElement.scrollWidth,offenders:Array.from(document.querySelectorAll("body *")).filter(e=>e.getBoundingClientRect().right>391&&getComputedStyle(e).position!=="absolute").slice(0,12).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,80)}))})',
      )),
    });
    results.push({
      check: "newsletter-validation",
      ...(await evaluate(
        '(async()=>{const r=await fetch("/api/replica-newsletter",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"invalid"})});return {status:r.status,body:await r.json()}})()',
      )),
    });
  }
  fs.writeFileSync(
    path.join(dir, `${mode}-interactions.json`),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  await send("Target.closeTarget", { targetId });
};
