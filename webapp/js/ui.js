// Small DOM + UI helpers shared across views. Deliberately dependency-free.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

let toastTimer;
export function toast(message, kind = "ok") {
  let t = $("#toast");
  if (!t) {
    t = el("div", { id: "toast" });
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.className = `toast ${kind} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 3500);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// A simple modal. Returns a close() function.
export function modal(title, contentNode, { onClose } = {}) {
  const overlay = el("div", { class: "modal-overlay" });
  const close = () => {
    overlay.remove();
    onClose && onClose();
  };
  const box = el("div", { class: "modal" }, [
    el("div", { class: "modal-head" }, [
      el("h3", { text: title }),
      el("button", { class: "icon-btn", text: "✕", onClick: close }),
    ]),
    el("div", { class: "modal-body" }, [contentNode]),
  ]);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  return close;
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    const body = el("div", {}, [
      el("p", { text: message }),
      el("div", { class: "row end" }, [
        el("button", {
          class: "btn secondary",
          text: "Cancel",
          onClick: () => {
            close();
            resolve(false);
          },
        }),
        el("button", {
          class: "btn",
          text: "Confirm",
          onClick: () => {
            close();
            resolve(true);
          },
        }),
      ]),
    ]);
    const close = modal("Please confirm", body, {
      onClose: () => resolve(false),
    });
  });
}

export function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}
