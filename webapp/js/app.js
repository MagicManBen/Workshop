// App bootstrap: wires auth gating, navigation, print-service status, and the
// router. Views are registered from their modules.
import { getSession, signIn, signOut, onAuthChange } from "./auth.js";
import { registerRoute, render, navigate } from "./router.js";
import { heartbeats } from "./api.js";
import { CONFIG } from "./supabase.js";
import { $, toast } from "./ui.js";

import { renderBrowse } from "./views/browse.js";
import { renderAddBox } from "./views/addbox.js";
import { renderAddItem } from "./views/additem.js";
import { renderSetup } from "./views/setup.js";

registerRoute("browse", renderBrowse);
registerRoute("addbox", renderAddBox);
registerRoute("additem", renderAddItem);
registerRoute("setup", renderSetup);

const loginEl = $("#login");
const appEl = $("#app");

function showLogin() {
  loginEl.classList.remove("hidden");
  appEl.classList.add("hidden");
}
function showApp() {
  loginEl.classList.add("hidden");
  appEl.classList.remove("hidden");
  if (!location.hash) navigate("browse");
  else render();
  pollServiceStatus();
}

// ---- Login form ----
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    await signIn($("#loginEmail").value.trim(), $("#loginPassword").value);
  } catch (err) {
    $("#loginError").textContent = err.message || "Sign in failed.";
  }
});

$("#signOut").addEventListener("click", async () => {
  await signOut();
});

$("#navToggle").addEventListener("click", () => {
  $("#nav").classList.toggle("open");
});
// Close the mobile nav after choosing a destination.
$("#nav").addEventListener("click", (e) => {
  if (e.target.closest("a")) $("#nav").classList.remove("open");
});

// ---- Print service status indicator ----
let statusTimer;
async function pollServiceStatus() {
  clearInterval(statusTimer);
  const update = async () => {
    try {
      const rows = await heartbeats.latest();
      const hb = rows && rows[0];
      const el = $("#svcStatus");
      if (!hb) {
        el.className = "svc-status offline";
        el.textContent = "Printer service: unknown";
        return;
      }
      const ageSec = (Date.now() - new Date(hb.last_seen_at)) / 1000;
      const online = ageSec < CONFIG.HEARTBEAT_ONLINE_SECONDS && hb.status === "online";
      el.className = `svc-status ${online ? "online" : "offline"}`;
      el.textContent = online ? "Printer service: online" : "Printer service: offline";
    } catch (e) {
      /* ignore transient errors */
    }
  };
  update();
  statusTimer = setInterval(update, 15000);
}

onAuthChange((session) => {
  if (session) showApp();
  else showLogin();
});

// Initial state.
(async () => {
  const session = await getSession();
  if (session) showApp();
  else showLogin();
})();

// Expose a tiny helper for debugging in the console.
window.toast = toast;

// Register the service worker for PWA/offline shell (best-effort).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
