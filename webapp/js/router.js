// Minimal hash-based router. Views register a render function keyed by name.
const routes = new Map();
let currentCleanup = null;

export function registerRoute(name, renderFn) {
  routes.set(name, renderFn);
}

export function navigate(name) {
  if (location.hash !== `#${name}`) location.hash = name;
  else render();
}

export function currentRoute() {
  return (location.hash || "#browse").slice(1).split("?")[0];
}

export function routeParams() {
  const q = (location.hash.split("?")[1] || "");
  return Object.fromEntries(new URLSearchParams(q));
}

export async function render() {
  const root = document.getElementById("view");
  if (!root) return;
  if (currentCleanup) {
    try {
      currentCleanup();
    } catch (e) {
      /* ignore */
    }
    currentCleanup = null;
  }
  const name = currentRoute();
  const fn = routes.get(name) || routes.get("browse");
  root.innerHTML = "";
  // Highlight active nav item.
  document.querySelectorAll("[data-route]").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === name);
  });
  const cleanup = await fn(root, routeParams());
  if (typeof cleanup === "function") currentCleanup = cleanup;
}

window.addEventListener("hashchange", render);
