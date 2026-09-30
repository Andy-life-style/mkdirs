(() => {
  const all = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  let overlay;
  let returnFocus;
  function close() {
    overlay?.remove();
    overlay = null;
    document.querySelector(".replica-backdrop")?.remove();
    document.body.style.overflow = "";
    returnFocus?.focus();
  }
  function toast(text) {
    document.querySelector(".replica-toast")?.remove();
    const el = document.createElement("div");
    el.className = "replica-toast";
    el.setAttribute("role", "status");
    el.textContent = text;
    document.body.append(el);
    setTimeout(() => el.remove(), 6000);
  }
  function menu(button, entries) {
    close();
    returnFocus = button;
    overlay = document.createElement("div");
    overlay.className = "replica-popover";
    overlay.setAttribute("role", "menu");
    const rect = button.getBoundingClientRect();
    overlay.style.top = `${Math.min(rect.bottom + 6, innerHeight - 220)}px`;
    overlay.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 230))}px`;
    for (const [label, action] of entries) {
      const option = document.createElement("button");
      option.type = "button";
      option.setAttribute("role", "menuitem");
      option.textContent = label;
      option.onclick = () => {
        close();
        action();
      };
      overlay.append(option);
    }
    document.body.append(overlay);
    overlay.querySelector("button")?.focus();
  }
  function update(key, value) {
    const url = new URL(location.href);
    url.searchParams.delete("page");
    value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    location.href = url.pathname + url.search;
  }
  const index = fetch("/replica-index.json").then((r) => r.json());
  async function tagMenu(button) {
    const tags = (await index).tags.sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const selected = new Set(
      (new URL(location.href).searchParams.get("tag") || "")
        .split(",")
        .filter(Boolean),
    );
    menu(button, []);
    const add = (label, checked, change) => {
      const row = document.createElement("label");
      row.className = "replica-tag-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = checked;
      checkbox.onchange = () => change(checkbox.checked);
      row.append(checkbox, document.createTextNode(label));
      overlay.append(row);
    };
    add("(Select All)", selected.size === tags.length, (checked) => {
      for (const tag of tags) {
        const slug = tag.route.split("/").at(-1);
        checked ? selected.add(slug) : selected.delete(slug);
      }
      for (const input of overlay.querySelectorAll("input"))
        input.checked = checked;
    });
    for (const tag of tags) {
      const slug = tag.route.split("/").at(-1);
      add(tag.name, selected.has(slug), (checked) => {
        checked ? selected.add(slug) : selected.delete(slug);
      });
    }
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Close";
    done.onclick = () => {
      close();
      update("tag", Array.from(selected).join(","));
    };
    overlay.append(done);
    overlay.querySelector("input")?.focus();
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (overlay && ["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      const options = all("button,a,input", overlay);
      const n = options.indexOf(document.activeElement);
      options[
        (n + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length
      ]?.focus();
    }
    if (overlay && e.key === "Tab") {
      const options = all("button,a,input", overlay);
      if (e.shiftKey && document.activeElement === options[0]) {
        e.preventDefault();
        options.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === options.at(-1)) {
        e.preventDefault();
        options[0]?.focus();
      }
    }
  });
  document.addEventListener("click", (e) => {
    if (overlay && !overlay.contains(e.target) && !e.target.closest("button"))
      close();
  });
  for (const button of all("button")) {
    const text = button.textContent.trim();
    const aria = button.getAttribute("aria-label") || "";
    if (text === "Toggle theme")
      button.onclick = () =>
        menu(
          button,
          ["Light", "Dark", "System"].map((label) => [
            label,
            () => {
              const mode = label.toLowerCase();
              localStorage.setItem("aitoolfame-theme", mode);
              const dark =
                mode === "dark" ||
                (mode === "system" &&
                  matchMedia("(prefers-color-scheme: dark)").matches);
              document.documentElement.classList.toggle("dark", dark);
              document.documentElement.classList.toggle("light", !dark);
              document.documentElement.style.colorScheme = dark
                ? "dark"
                : "light";
            },
          ]),
        );
    else if (text === "Toggle navigation menu")
      button.onclick = () => {
        close();
        returnFocus = button;
        const backdrop = document.createElement("div");
        backdrop.className = "replica-backdrop";
        backdrop.onclick = close;
        document.body.append(backdrop);
        overlay = document.createElement("nav");
        overlay.className = "replica-drawer";
        overlay.setAttribute("aria-label", "Mobile navigation");
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        const x = document.createElement("button");
        x.type = "button";
        x.textContent = "×";
        x.setAttribute("aria-label", "Close navigation");
        x.onclick = close;
        overlay.append(x);
        const title = document.createElement("strong");
        title.textContent = "AIToolFame";
        overlay.append(title);
        for (const [name, url] of [
          ["Home", "/"],
          ["Category", "/category"],
          ["Tag", "/tag"],
          ["Collection", "/collection"],
          ["Blog", "/blog"],
          ["Pricing", "/pricing"],
        ]) {
          const a = document.createElement("a");
          a.href = url;
          a.textContent = name;
          overlay.append(a);
        }
        document.body.append(overlay);
        document.body.style.overflow = "hidden";
        x.focus();
      };
    else if (text === "Reset")
      button.onclick = () => {
        location.href = location.pathname;
      };
    else if (text === "Select tags" || text.startsWith("Tag"))
      button.onclick = () => tagMenu(button);
    else if (
      text === "No Filter" ||
      text === "Featured" ||
      text === "Sponsored"
    )
      button.onclick = () =>
        menu(button, [
          ["No Filter", () => update("f", "")],
          ["Featured", () => update("f", "featured==true")],
        ]);
    else if (text.startsWith("Sort by"))
      button.onclick = () =>
        menu(button, [
          ["Sort by Time (dsc)", () => update("sort", "time-desc")],
          ["Sort by Time (asc)", () => update("sort", "time-asc")],
          ["Sort by Name (dsc)", () => update("sort", "name-desc")],
          ["Sort by Name (asc)", () => update("sort", "name-asc")],
        ]);
    else if (aria.startsWith("Toggle blog category"))
      button.onclick = async () => {
        const entry = (await index).blogs.find((b) => b.name === text);
        if (entry) location.href = entry.route;
      };
    else if (aria === "Toggle all blog categories")
      button.onclick = () => {
        location.href = "/blog";
      };
    else if (text.startsWith("Category") && !button.closest("a"))
      button.onclick = async () =>
        menu(
          button,
          (await index)[
            location.pathname.startsWith("/blog") ? "blogs" : "categories"
          ].map((c) => [
            c.name,
            () => {
              location.href = c.route;
            },
          ]),
        );
    else if (aria === "About Monthly Visitors")
      button.onclick = () =>
        toast(
          "Monthly Visitors — visitor statistics captured from AIToolFame. Powered by Cloudflare.",
        );
    else if (aria.includes("visitors")) button.onclick = () => toast(aria);
  }
  for (const form of all("form[data-replica-newsletter]"))
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = form.querySelector("input[type=email]");
      if (!input?.reportValidity()) return;
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const r = await fetch("/api/replica-newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: input.value }),
        });
        const data = await r.json();
        toast(data.message);
        if (r.ok) form.reset();
      } catch {
        toast("Unable to subscribe right now. Please try again later.");
      } finally {
        button.disabled = false;
      }
    });
  // Restore the static search fields that originally used React event handlers.
  for (const input of all('input[placeholder*="Search"]')) {
    input.name = "q";
    if (!input.closest("form"))
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          update("q", input.value);
        }
      });
  }
  // Keep tooltips accessible without the reference site's JavaScript.
  for (const el of all("[aria-label]"))
    if (
      !el.hasAttribute("title") &&
      !el.matches('nav,button[aria-label="Save tool"]')
    )
      el.title = el.getAttribute("aria-label");
})();
