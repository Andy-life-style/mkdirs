try {
  const saved = localStorage.getItem("aitoolfame-theme") || "light";
  const dark =
    saved === "dark" ||
    (saved === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
} catch {}
