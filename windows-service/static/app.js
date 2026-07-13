"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg, kind = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  setTimeout(() => { t.className = "toast"; }, 4000);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  let body = null;
  try { body = await res.json(); } catch (_) { /* not json */ }
  if (!res.ok) {
    const detail = (body && (body.detail || body.message)) || res.statusText;
    throw new Error(detail);
  }
  return body;
}

function codeValue() {
  return ($("#code").value || "").trim();
}

function validCode(code) {
  return /^\d{10}$/.test(code);
}

// --------------------------------------------------------------------------
// Status
// --------------------------------------------------------------------------
async function refreshStatus() {
  try {
    const s = await api("/api/status");
    const p = s.printer;
    const badge = $("#printer-status");
    if (p.available) {
      badge.className = "pill ok";
      badge.innerHTML = `<span class="dot"></span> ${p.resolved} (${p.status})`;
    } else {
      badge.className = "pill bad";
      badge.innerHTML = `<span class="dot"></span> No TD-2120N found`;
    }
    $("#label-dims").textContent =
      `${s.label.width_mm}×${s.label.height_mm} mm @ ${s.label.dpi} dpi ` +
      `(${s.label.width_px}×${s.label.height_px} px)`;

    const pm = $("#preview-mode-badge");
    if (s.preview_only) {
      pm.className = "pill warn";
      pm.innerHTML = `<span class="dot"></span> PREVIEW-ONLY MODE`;
      pm.style.display = "inline-flex";
    } else {
      pm.style.display = "none";
    }
  } catch (e) {
    toast(`Status error: ${e.message}`, "bad");
  }
}

// --------------------------------------------------------------------------
// Preview
// --------------------------------------------------------------------------
function doPreview() {
  const code = codeValue();
  if (!validCode(code)) { toast("Enter exactly 10 digits.", "warn"); return; }
  const img = $("#preview-img");
  img.src = `/api/preview?code=${encodeURIComponent(code)}&t=${Date.now()}`;
  img.style.display = "block";
}

// --------------------------------------------------------------------------
// Printing
// --------------------------------------------------------------------------
async function doPrint(previewOnly) {
  const code = codeValue();
  if (!validCode(code)) { toast("Enter exactly 10 digits.", "warn"); return; }
  try {
    const body = { code };
    if (previewOnly) body.preview_only = true;
    const r = await api("/api/print", { method: "POST", body: JSON.stringify(body) });
    toast(r.message, r.success ? (r.preview_only ? "warn" : "ok") : "bad");
    loadHistory();
  } catch (e) {
    toast(`Print failed: ${e.message}`, "bad");
    loadHistory();
  }
}

async function doTestPrint() {
  try {
    const r = await api("/api/print-test", { method: "POST" });
    toast(r.message, r.success ? (r.preview_only ? "warn" : "ok") : "bad");
    loadHistory();
  } catch (e) {
    toast(`Test print failed: ${e.message}`, "bad");
    loadHistory();
  }
}

async function doReprint(id) {
  try {
    const r = await api("/api/reprint", { method: "POST", body: JSON.stringify({ id }) });
    toast(r.message, r.success ? (r.preview_only ? "warn" : "ok") : "bad");
    loadHistory();
  } catch (e) {
    toast(`Reprint failed: ${e.message}`, "bad");
  }
}

// --------------------------------------------------------------------------
// History
// --------------------------------------------------------------------------
async function loadHistory() {
  try {
    const { items } = await api("/api/history?limit=50");
    const tb = $("#history-body");
    tb.innerHTML = "";
    for (const it of items) {
      const tr = document.createElement("tr");
      const when = it.created_at.replace("T", " ").replace("+00:00", "Z");
      const ok = it.success
        ? `<span class="status-good">ok</span>`
        : `<span class="status-bad">fail</span>`;
      const mode = it.preview_only ? "preview" : it.action;
      tr.innerHTML =
        `<td class="muted">${it.id}</td>` +
        `<td class="code">${it.code}</td>` +
        `<td>${mode}</td>` +
        `<td>${ok}</td>` +
        `<td class="muted">${when}</td>` +
        `<td><button class="ghost" data-reprint="${it.id}">Reprint</button></td>`;
      tb.appendChild(tr);
    }
    $$("[data-reprint]").forEach((b) =>
      b.addEventListener("click", () => doReprint(Number(b.dataset.reprint)))
    );
  } catch (e) {
    toast(`History error: ${e.message}`, "bad");
  }
}

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------
async function loadConfig() {
  const c = await api("/api/config");
  $("#c_width").value = c.label.width_mm;
  $("#c_height").value = c.label.height_mm;
  $("#c_dpi").value = c.label.dpi;
  $("#c_margin").value = c.label.margin_mm;
  $("#c_ecc").value = c.qr.ecc;
  $("#c_quiet").value = c.qr.quiet_zone;
  $("#c_position").value = c.qr.position;
  $("#c_font").value = c.text.font;
  $("#c_fontsize").value = c.text.font_size;
  $("#c_group").value = c.text.group_digits;
  $("#c_printer").value = c.printer.name;
  $("#c_preview").checked = c.app.preview_only;
}

async function saveConfig() {
  const patch = {
    label: {
      width_mm: parseFloat($("#c_width").value),
      height_mm: parseFloat($("#c_height").value),
      dpi: parseInt($("#c_dpi").value, 10),
      margin_mm: parseFloat($("#c_margin").value),
    },
    qr: {
      ecc: $("#c_ecc").value,
      quiet_zone: parseInt($("#c_quiet").value, 10),
      position: $("#c_position").value,
    },
    text: {
      font: $("#c_font").value,
      font_size: parseInt($("#c_fontsize").value, 10),
      group_digits: parseInt($("#c_group").value, 10),
    },
    printer: { name: $("#c_printer").value },
    app: { preview_only: $("#c_preview").checked },
  };
  try {
    await api("/api/config", { method: "POST", body: JSON.stringify(patch) });
    toast("Configuration saved.", "ok");
    refreshStatus();
    if (validCode(codeValue())) doPreview();
  } catch (e) {
    toast(`Save failed: ${e.message}`, "bad");
  }
}

async function loadPrinters() {
  try {
    const { printers } = await api("/api/printers");
    const sel = $("#printer-list");
    sel.innerHTML = `<option value="">(auto-detect Brother TD-2120N)</option>`;
    for (const p of printers) {
      const o = document.createElement("option");
      o.value = p.name;
      o.textContent = `${p.name}${p.is_default ? " [default]" : ""}`;
      sel.appendChild(o);
    }
  } catch (e) { /* ignore */ }
}

// --------------------------------------------------------------------------
// Wire up
// --------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  $("#btn-preview").addEventListener("click", doPreview);
  $("#btn-print").addEventListener("click", () => doPrint(false));
  $("#btn-print-preview").addEventListener("click", () => doPrint(true));
  $("#btn-test").addEventListener("click", doTestPrint);
  $("#btn-refresh").addEventListener("click", refreshStatus);
  $("#btn-save-config").addEventListener("click", saveConfig);
  $("#code").addEventListener("keydown", (e) => { if (e.key === "Enter") doPreview(); });
  $("#printer-list").addEventListener("change", (e) => {
    $("#c_printer").value = e.target.value;
  });

  refreshStatus();
  loadConfig();
  loadPrinters();
  loadHistory();
  setInterval(refreshStatus, 15000);
});
