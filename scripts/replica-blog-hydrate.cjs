/** Restore blog UI that the reference renders only after client hydration. */
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("cheerio");

const root = path.resolve("content/aitoolfame");
const manifestFile = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const blog = load(
  fs.readFileSync(
    path.join(root, "pages", manifest.pages["/blog"].file),
    "utf8",
  ),
);
const avatars = Object.fromEntries(
  blog('img[alt="Hyhor"],img[alt="Nick Launches"]')
    .toArray()
    .map((element) => [blog(element).attr("alt"), blog(element).attr("src")]),
);
let updated = 0;
for (const [route, page] of Object.entries(manifest.pages)) {
  if (!/^\/blog\/[^/]+$/.test(route)) continue;
  const file = path.join(root, "pages", page.file);
  const $ = load(fs.readFileSync(file, "utf8"));
  const publisher = $("h2")
    .filter((_, element) => $(element).text().trim() === "Publisher")
    .parent();
  const avatar = publisher.find("span.rounded-full").first();
  const name = publisher
    .find("a,span")
    .filter((_, element) => Object.hasOwn(avatars, $(element).text().trim()))
    .first()
    .text()
    .trim();
  if (avatar.length && avatars[name] && !avatar.find("img").length) {
    avatar.append(
      $("<img>").addClass("aspect-square h-full w-full").attr({
        src: avatars[name],
        alt: name,
        title: name,
        loading: "lazy",
      }),
    );
    page.images = [...new Set([...(page.images || []), avatars[name]])];
  }
  const toc = $("h2")
    .filter((_, element) => $(element).text().trim() === "Table of Contents")
    .parent()
    .children("div")
    .first();
  if (!toc.length) continue;
  const tree = $("<div>").addClass("space-y-2");
  const list = $("<ul>").addClass("m-0 list-none").appendTo(tree);
  let section = null;
  $("article h2[id],article h3[id]").each((_, element) => {
    const heading = $(element);
    const li = $("<li>").addClass("mt-0 pt-1");
    $("<a>")
      .attr("href", `#${heading.attr("id")}`)
      .addClass("inline-block text-sm no-underline text-muted-foreground")
      .text(heading.text().trim())
      .appendTo(li);
    if (element.name === "h2") {
      list.append(li);
      section = li;
    } else if (section) {
      let nested = section.children("ul");
      if (!nested.length)
        nested = $("<ul>").addClass("m-0 list-none pl-4").appendTo(section);
      nested.append(li);
    } else {
      list.append(li);
    }
  });
  toc.empty().append(tree);
  fs.writeFileSync(file, $.html());
  updated++;
}
for (const [route, page] of Object.entries(manifest.pages)) {
  if (!route.startsWith("/blog")) continue;
  const $ = load(fs.readFileSync(path.join(root, "pages", page.file), "utf8"));
  page.images = [
    ...new Set(
      $("main img[src]")
        .toArray()
        .map((image) => $(image).attr("src")),
    ),
  ];
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
console.log(
  JSON.stringify({ articles: updated, avatars: Object.keys(avatars).length }),
);
