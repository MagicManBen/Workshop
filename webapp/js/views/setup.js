// Setup: manage box types, categories, subcategories, units, locations, and view
// the print-service status. Also exports the active category/subcategory list so
// the ChatGPT project can be kept in sync.
import {
  boxTypes,
  categories,
  subcategories,
  units,
  locations,
  heartbeats,
} from "../api.js";
import { $, el, clear, toast, modal, escapeHtml, fmtDate } from "../ui.js";
import { CONFIG } from "../supabase.js";
import { uploadBoxTypeImages, boxTypeImageStrip } from "./images_ui.js";

const TABS = ["Box types", "Categories", "Units", "Locations", "ChatGPT sync", "Service"];

export async function renderSetup(root) {
  const state = { tab: "Box types" };
  const tabbar = el("div", { class: "tabbar" });
  const body = el("div", {});
  root.append(
    el("div", { class: "card" }, [
      el("h2", { text: "Setup" }),
      tabbar,
      body,
    ])
  );

  function draw() {
    clear(tabbar);
    for (const t of TABS) {
      tabbar.append(
        el("button", {
          class: t === state.tab ? "active" : "",
          text: t,
          onClick: () => {
            state.tab = t;
            draw();
          },
        })
      );
    }
    clear(body);
    const map = {
      "Box types": boxTypesTab,
      Categories: categoriesTab,
      Units: unitsTab,
      Locations: locationsTab,
      "ChatGPT sync": chatgptTab,
      Service: serviceTab,
    };
    map[state.tab](body);
  }
  draw();
}

// ---- Box types ------------------------------------------------------
async function boxTypesTab(container) {
  container.append(el("p", { class: "muted", text: "Loading box types…" }));
  const rows = await boxTypes.list(true);
  clear(container);

  const list = el("div", { class: "list" });
  for (const bt of rows) {
    list.append(
      el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title", text: bt.name + (bt.is_active ? "" : " (inactive)") }),
          el("div", {
            class: "sub",
            text: [
              bt.manufacturer,
              bt.capacity,
              dims(bt),
            ].filter(Boolean).join(" · "),
          }),
        ]),
        el("button", { class: "btn small secondary", text: "Edit", onClick: () => boxTypeForm(bt, () => boxTypesTab(container)) }),
      ])
    );
  }
  if (!rows.length) list.append(el("p", { class: "muted", text: "No box types yet." }));

  container.append(
    el("div", { class: "row between" }, [
      el("h3", { text: "Box types" }),
      el("button", { class: "btn small", text: "+ New box type", onClick: () => boxTypeForm(null, () => boxTypesTab(container)) }),
    ]),
    list
  );
}

function dims(bt) {
  const i = [bt.internal_width_mm, bt.internal_depth_mm, bt.internal_height_mm];
  if (i.every((x) => x == null)) return "";
  return `int ${i.map((x) => x ?? "–").join("×")}mm`;
}

function boxTypeForm(existing, onSaved) {
  const v = existing || {};
  const f = {};
  const mk = (key, label, type = "text") => {
    const input = el("input", { type, value: v[key] ?? "" });
    f[key] = input;
    return el("label", { class: "field" }, [label, input]);
  };
  const activeSel = el("select", {}, [
    el("option", { value: "true", ...(v.is_active !== false ? { selected: "" } : {}) }, "Active"),
    el("option", { value: "false", ...(v.is_active === false ? { selected: "" } : {}) }, "Inactive"),
  ]);

  const imagesHost = el("div", {});
  const body = el("div", { class: "steps" }, [
    mk("name", "Name"),
    el("div", { class: "grid2" }, [mk("manufacturer", "Manufacturer / brand"), mk("capacity", "Capacity (e.g. 0.3 L)")]),
    el("div", { class: "grid3" }, [
      mk("internal_width_mm", "Internal W (mm)", "number"),
      mk("internal_depth_mm", "Internal D (mm)", "number"),
      mk("internal_height_mm", "Internal H (mm)", "number"),
    ]),
    el("div", { class: "grid3" }, [
      mk("external_width_mm", "External W (mm)", "number"),
      mk("external_depth_mm", "External D (mm)", "number"),
      mk("external_height_mm", "External H (mm)", "number"),
    ]),
    el("label", { class: "field" }, ["Notes", (f.notes = el("textarea", {}, v.notes || ""))]),
    el("label", { class: "field" }, ["Status", activeSel]),
    imagesHost,
    el("div", { class: "row end" }, [
      el("button", {
        class: "btn",
        text: existing ? "Save changes" : "Create box type",
        onClick: save,
      }),
    ]),
  ]);

  const close = modal(existing ? "Edit box type" : "New box type", body);

  if (existing) {
    imagesHost.append(el("h3", { text: "Images" }));
    boxTypeImageStrip(imagesHost, existing.id);
    uploadBoxTypeImages(imagesHost, existing.id);
  } else {
    imagesHost.append(el("p", { class: "muted", text: "Save first, then add images." }));
  }

  async function save() {
    const num = (x) => (x === "" || x == null ? null : Number(x));
    const payload = {
      name: f.name.value.trim(),
      manufacturer: f.manufacturer.value.trim() || null,
      capacity: f.capacity.value.trim() || null,
      internal_width_mm: num(f.internal_width_mm.value),
      internal_depth_mm: num(f.internal_depth_mm.value),
      internal_height_mm: num(f.internal_height_mm.value),
      external_width_mm: num(f.external_width_mm.value),
      external_depth_mm: num(f.external_depth_mm.value),
      external_height_mm: num(f.external_height_mm.value),
      notes: f.notes.value.trim() || null,
      is_active: activeSel.value === "true",
    };
    if (!payload.name) return toast("Name is required.", "bad");
    try {
      if (existing) await boxTypes.update(existing.id, payload);
      else await boxTypes.create(payload);
      toast("Box type saved.");
      close();
      onSaved && onSaved();
    } catch (e) {
      toast(e.message || "Save failed.", "bad");
    }
  }
}

// ---- Categories & subcategories ------------------------------------
async function categoriesTab(container) {
  container.append(el("p", { class: "muted", text: "Loading…" }));
  const [cats, subs] = await Promise.all([
    categories.list(true),
    subcategories.list(true),
  ]);
  clear(container);
  container.append(
    el("div", { class: "row between" }, [
      el("h3", { text: "Categories & subcategories" }),
      el("button", { class: "btn small", text: "+ New category", onClick: () => catForm(null, () => categoriesTab(container)) }),
    ]),
    el("p", { class: "muted", text: "Only you can manage these. The ChatGPT project must only choose from active entries — it must never invent categories." })
  );

  for (const c of cats) {
    const kids = subs.filter((s) => s.category_id === c.id);
    const subList = el("div", { class: "list" });
    for (const s of kids) {
      subList.append(
        el("div", { class: "list-item" }, [
          el("div", { class: "grow" }, [
            el("div", { class: "title", text: s.name + (s.is_active ? "" : " (inactive)") }),
            el("div", { class: "sub", text: s.id }),
          ]),
          el("button", { class: "btn small secondary", text: "Edit", onClick: () => subForm(c, s, () => categoriesTab(container)) }),
        ])
      );
    }
    container.append(
      el("div", { class: "card", style: "background:var(--panel-2)" }, [
        el("div", { class: "row between" }, [
          el("h3", { text: c.name + (c.is_active ? "" : " (inactive)") }),
          el("div", { class: "row" }, [
            el("button", { class: "btn small secondary", text: "Edit category", onClick: () => catForm(c, () => categoriesTab(container)) }),
            el("button", { class: "btn small", text: "+ Subcategory", onClick: () => subForm(c, null, () => categoriesTab(container)) }),
          ]),
        ]),
        subList,
      ])
    );
  }
}

function catForm(existing, onSaved) {
  const v = existing || {};
  const name = el("input", { type: "text", value: v.name || "" });
  const order = el("input", { type: "number", value: v.sort_order ?? 0 });
  const active = el("select", {}, [
    el("option", { value: "true", ...(v.is_active !== false ? { selected: "" } : {}) }, "Active"),
    el("option", { value: "false", ...(v.is_active === false ? { selected: "" } : {}) }, "Inactive"),
  ]);
  const body = el("div", { class: "steps" }, [
    el("label", { class: "field" }, ["Name", name]),
    el("div", { class: "grid2" }, [
      el("label", { class: "field" }, ["Sort order", order]),
      el("label", { class: "field" }, ["Status", active]),
    ]),
    el("div", { class: "row end" }, [el("button", { class: "btn", text: "Save", onClick: save })]),
  ]);
  const close = modal(existing ? "Edit category" : "New category", body);
  async function save() {
    const payload = { name: name.value.trim(), sort_order: Number(order.value) || 0, is_active: active.value === "true" };
    if (!payload.name) return toast("Name required.", "bad");
    try {
      if (existing) await categories.update(existing.id, payload);
      else await categories.create(payload);
      toast("Category saved.");
      close();
      onSaved();
    } catch (e) {
      toast(e.message || "Save failed.", "bad");
    }
  }
}

function subForm(cat, existing, onSaved) {
  const v = existing || {};
  const name = el("input", { type: "text", value: v.name || "" });
  const order = el("input", { type: "number", value: v.sort_order ?? 0 });
  const active = el("select", {}, [
    el("option", { value: "true", ...(v.is_active !== false ? { selected: "" } : {}) }, "Active"),
    el("option", { value: "false", ...(v.is_active === false ? { selected: "" } : {}) }, "Inactive"),
  ]);
  const body = el("div", { class: "steps" }, [
    el("p", { class: "muted", text: `Category: ${cat.name}` }),
    el("label", { class: "field" }, ["Name", name]),
    el("div", { class: "grid2" }, [
      el("label", { class: "field" }, ["Sort order", order]),
      el("label", { class: "field" }, ["Status", active]),
    ]),
    el("div", { class: "row end" }, [el("button", { class: "btn", text: "Save", onClick: save })]),
  ]);
  const close = modal(existing ? "Edit subcategory" : "New subcategory", body);
  async function save() {
    const payload = { category_id: cat.id, name: name.value.trim(), sort_order: Number(order.value) || 0, is_active: active.value === "true" };
    if (!payload.name) return toast("Name required.", "bad");
    try {
      if (existing) await subcategories.update(existing.id, payload);
      else await subcategories.create(payload);
      toast("Subcategory saved.");
      close();
      onSaved();
    } catch (e) {
      toast(e.message || "Save failed.", "bad");
    }
  }
}

// ---- Units ----------------------------------------------------------
async function unitsTab(container) {
  container.append(el("p", { class: "muted", text: "Loading…" }));
  const rows = await units.list(true);
  clear(container);
  const list = el("div", { class: "list" });
  for (const u of rows) {
    list.append(
      el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title", text: u.name + (u.is_active ? "" : " (inactive)") }),
          el("div", { class: "sub", text: u.abbreviation || "" }),
        ]),
        el("button", { class: "btn small secondary", text: "Edit", onClick: () => unitForm(u, () => unitsTab(container)) }),
      ])
    );
  }
  container.append(
    el("div", { class: "row between" }, [
      el("h3", { text: "Quantity units" }),
      el("button", { class: "btn small", text: "+ New unit", onClick: () => unitForm(null, () => unitsTab(container)) }),
    ]),
    list
  );
}

function unitForm(existing, onSaved) {
  const v = existing || {};
  const name = el("input", { type: "text", value: v.name || "" });
  const abbr = el("input", { type: "text", value: v.abbreviation || "" });
  const active = el("select", {}, [
    el("option", { value: "true", ...(v.is_active !== false ? { selected: "" } : {}) }, "Active"),
    el("option", { value: "false", ...(v.is_active === false ? { selected: "" } : {}) }, "Inactive"),
  ]);
  const body = el("div", { class: "steps" }, [
    el("div", { class: "grid2" }, [
      el("label", { class: "field" }, ["Name", name]),
      el("label", { class: "field" }, ["Abbreviation", abbr]),
    ]),
    el("label", { class: "field" }, ["Status", active]),
    el("div", { class: "row end" }, [el("button", { class: "btn", text: "Save", onClick: save })]),
  ]);
  const close = modal(existing ? "Edit unit" : "New unit", body);
  async function save() {
    const payload = { name: name.value.trim(), abbreviation: abbr.value.trim() || null, is_active: active.value === "true" };
    if (!payload.name) return toast("Name required.", "bad");
    try {
      if (existing) await units.update(existing.id, payload);
      else await units.create(payload);
      toast("Unit saved.");
      close();
      onSaved();
    } catch (e) {
      toast(e.message || "Save failed.", "bad");
    }
  }
}

// ---- Locations ------------------------------------------------------
async function locationsTab(container) {
  container.append(el("p", { class: "muted", text: "Loading…" }));
  const [rows, paths] = await Promise.all([locations.list(true), locations.paths()]);
  const pathById = Object.fromEntries(paths.map((p) => [p.id, p.full_path]));
  clear(container);
  const list = el("div", { class: "list" });
  for (const l of rows) {
    list.append(
      el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title", text: pathById[l.id] || l.name }),
          el("div", { class: "sub", text: l.is_active ? "" : "inactive" }),
        ]),
        el("button", { class: "btn small secondary", text: "Edit", onClick: () => locForm(l, rows, () => locationsTab(container)) }),
      ])
    );
  }
  container.append(
    el("div", { class: "row between" }, [
      el("h3", { text: "Workshop locations" }),
      el("button", { class: "btn small", text: "+ New location", onClick: () => locForm(null, rows, () => locationsTab(container)) }),
    ]),
    el("p", { class: "muted", text: "Build a hierarchy by choosing a parent (e.g. Workshop → Back wall → Rack 3)." }),
    list
  );
}

function locForm(existing, allLocations, onSaved) {
  const v = existing || {};
  const name = el("input", { type: "text", value: v.name || "" });
  const parent = el("select", {}, [
    el("option", { value: "" }, "— none (top level) —"),
    ...allLocations
      .filter((l) => l.id !== v.id)
      .map((l) => el("option", { value: l.id, ...(v.parent_id === l.id ? { selected: "" } : {}) }, l.name)),
  ]);
  const active = el("select", {}, [
    el("option", { value: "true", ...(v.is_active !== false ? { selected: "" } : {}) }, "Active"),
    el("option", { value: "false", ...(v.is_active === false ? { selected: "" } : {}) }, "Inactive"),
  ]);
  const body = el("div", { class: "steps" }, [
    el("label", { class: "field" }, ["Name", name]),
    el("label", { class: "field" }, ["Parent location", parent]),
    el("label", { class: "field" }, ["Status", active]),
    el("div", { class: "row end" }, [el("button", { class: "btn", text: "Save", onClick: save })]),
  ]);
  const close = modal(existing ? "Edit location" : "New location", body);
  async function save() {
    const payload = { name: name.value.trim(), parent_id: parent.value || null, is_active: active.value === "true" };
    if (!payload.name) return toast("Name required.", "bad");
    try {
      if (existing) await locations.update(existing.id, payload);
      else await locations.create(payload);
      toast("Location saved.");
      close();
      onSaved();
    } catch (e) {
      toast(e.message || "Save failed.", "bad");
    }
  }
}

// ---- ChatGPT sync ---------------------------------------------------
async function chatgptTab(container) {
  container.append(el("p", { class: "muted", text: "Loading…" }));
  const [cats, subs] = await Promise.all([categories.list(false), subcategories.list(false)]);
  clear(container);

  const exportObj = {
    exported_at: new Date().toISOString(),
    note: "Active workshop categories and subcategories. ChatGPT must ONLY choose from these IDs and must never create or rename categories.",
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      subcategories: subs
        .filter((s) => s.category_id === c.id)
        .map((s) => ({ id: s.id, name: s.name })),
    })),
  };
  const json = JSON.stringify(exportObj, null, 2);
  const ta = el("textarea", { readonly: "", style: "min-height:260px;font-family:monospace;font-size:12px" }, json);

  container.append(
    el("h3", { text: "ChatGPT project sync" }),
    el("p", { class: "muted", text: "Copy this active category/subcategory list into your ChatGPT project instructions so its JSON references valid IDs." }),
    el("div", { class: "row" }, [
      el("button", {
        class: "btn small",
        text: "Copy to clipboard",
        onClick: async () => {
          await navigator.clipboard.writeText(json);
          toast("Category list copied.");
        },
      }),
      el("button", {
        class: "btn small secondary",
        text: "Download .json",
        onClick: () => {
          const blob = new Blob([json], { type: "application/json" });
          const a = el("a", { href: URL.createObjectURL(blob), download: "workshop-categories.json" });
          a.click();
        },
      }),
    ]),
    el("label", { class: "field" }, ["Active categories JSON", ta])
  );
}

// ---- Service status -------------------------------------------------
async function serviceTab(container) {
  container.append(el("p", { class: "muted", text: "Loading service status…" }));
  const rows = await heartbeats.latest();
  clear(container);
  container.append(el("h3", { text: "Print service status" }));
  if (!rows.length) {
    container.append(el("p", { class: "muted", text: "No service has reported in yet. Start the Mac print service." }));
    return;
  }
  for (const hb of rows) {
    const ageSec = (Date.now() - new Date(hb.last_seen_at)) / 1000;
    const online = ageSec < CONFIG.HEARTBEAT_ONLINE_SECONDS && hb.status === "online";
    container.append(
      el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title", text: hb.service_name }),
          el("div", { class: "sub", text: `Last seen ${fmtDate(hb.last_seen_at)} · printer ${hb.detail?.printer_available ? "available" : "unavailable"}` }),
        ]),
        el("span", { class: `pill ${online ? "ok" : "bad"}`, text: online ? "online" : "offline" }),
      ])
    );
  }
}
