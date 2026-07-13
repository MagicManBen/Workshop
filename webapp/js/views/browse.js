// Browse & Search: full-text-ish search across items plus quick views (all items,
// all boxes, box contents, location contents, boxes needing labels, recent).
// Also renders item and box detail with images, placements and reprint.
import {
  searchItems,
  items,
  boxes,
  locations,
  placements,
  images,
  storage,
  printJobs,
} from "../api.js";
import { el, clear, toast, fmtDate, escapeHtml } from "../ui.js";
import { navigate, routeParams } from "../router.js";
import { assignPanel } from "./assign.js";
import { qrDataUrl } from "../qr.js";

export async function renderBrowse(root, params) {
  params = params || routeParams();
  if (params.item) return itemDetail(root, params.item);
  if (params.box) return boxDetail(root, params.box);
  if (params.location) return locationDetail(root, params.location);
  if (params.view) return quickView(root, params.view);

  // ---- Search home ----
  const card = el("div", { class: "card" });
  const input = el("input", {
    class: "big-input",
    type: "search",
    placeholder: "Search name, brand, model, part no, markings…",
    autocomplete: "off",
  });
  const results = el("div", { class: "list" });
  card.append(
    el("h2", { text: "Browse & search" }),
    el("div", { class: "row" }, [input, el("button", { class: "btn", text: "Search", onClick: run })]),
    results
  );

  const quick = el("div", { class: "card" }, [
    el("h2", { text: "Quick views" }),
    el("div", { class: "row" }, [
      qbtn("All items", "items"),
      qbtn("All boxes", "boxes"),
      qbtn("Labels not printed", "unprinted"),
      qbtn("Recent items", "recent-items"),
      qbtn("Recent boxes", "recent-boxes"),
      qbtn("Locations", "locations"),
    ]),
  ]);

  root.append(card, quick);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });

  async function run() {
    const term = input.value.trim();
    clear(results);
    if (!term) return;
    results.append(el("p", { class: "muted", text: "Searching…" }));
    let rows;
    try {
      rows = await searchItems(term);
    } catch (e) {
      clear(results);
      return results.append(el("p", { class: "pill bad", text: e.message || "Search failed." }));
    }
    clear(results);
    if (!rows.length) return results.append(el("p", { class: "muted", text: "No matches." }));
    for (const it of rows) results.append(await itemRow(it));
  }
}

function qbtn(label, view) {
  return el("button", { class: "btn secondary small", text: label, onClick: () => navigate(`browse?view=${view}`) });
}

async function itemRow(it) {
  const total = (it.placements || []).reduce((n, p) => n + Number(p.quantity || 0), 0);
  const where = (it.placements || [])
    .map((p) => (p.box ? `Box ${p.box.box_code}` : p.location ? p.location.name : "?") + ` (${p.quantity})`)
    .join(", ");
  const thumbNode = await itemThumb(it.id);
  return el("div", { class: "list-item", onClick: () => navigate(`browse?item=${it.id}`), style: "cursor:pointer" }, [
    thumbNode,
    el("div", { class: "grow" }, [
      el("div", { class: "title", text: it.name }),
      el("div", { class: "sub", text: [it.category?.name, it.subcategory?.name].filter(Boolean).join(" · ") }),
      el("div", { class: "sub", text: where || "Unplaced" }),
    ]),
    el("div", { class: "pill", text: `Total ${total}` }),
  ]);
}

async function itemThumb(itemId) {
  try {
    const imgs = await images.forItem(itemId);
    const primary = imgs.find((i) => i.is_primary) || imgs[0];
    if (primary) {
      const url = await storage.signedUrl(primary.file_path, 3600);
      return el("img", { class: "thumb", src: url, loading: "lazy" });
    }
  } catch (e) {
    /* ignore */
  }
  return el("div", { class: "thumb" });
}

// ---- Item detail ----------------------------------------------------
async function itemDetail(root, itemId) {
  root.append(el("p", { class: "muted", text: "Loading item…" }));
  let it, place, imgs;
  try {
    [it, place, imgs] = await Promise.all([
      items.get(itemId),
      placements.forItem(itemId),
      images.forItem(itemId),
    ]);
  } catch (e) {
    clear(root);
    return root.append(el("p", { class: "pill bad", text: e.message || "Not found." }));
  }
  clear(root);

  const gallery = el("div", { class: "img-grid" });
  for (const img of imgs) {
    try {
      const url = await storage.signedUrl(img.file_path, 3600);
      gallery.append(el("div", { class: "img-chip" }, [el("img", { src: url }), el("span", { class: "tag", text: img.is_primary ? "primary" : img.role })]));
    } catch (e) {}
  }

  const placeList = el("div", { class: "list" });
  const total = place.reduce((n, p) => n + Number(p.quantity || 0), 0);
  for (const p of place) {
    placeList.append(
      el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title", text: p.box ? `Box ${p.box.box_code}` : p.location ? p.location.name : "—" }),
          el("div", { class: "sub", text: `${p.quantity} ${p.unit?.name || ""}` }),
        ]),
        el("button", { class: "btn small secondary", text: "Remove", onClick: async () => { await placements.remove(p.id); toast("Placement removed."); navigate(`browse?item=${itemId}`); } }),
      ])
    );
  }
  if (!place.length) placeList.append(el("p", { class: "muted", text: "Not placed anywhere yet." }));

  const assignHost = el("div", {});

  root.append(
    el("div", { class: "card" }, [
      el("div", { class: "row between" }, [
        el("h2", { text: it.name }),
        el("button", { class: "btn small secondary", text: "← Back", onClick: () => navigate("browse") }),
      ]),
      el("div", { class: "sub muted", text: [it.category?.name, it.subcategory?.name].filter(Boolean).join(" · ") }),
      gallery,
      detailRows(it),
    ]),
    el("div", { class: "card" }, [
      el("div", { class: "row between" }, [el("h3", { text: "Placements" }), el("span", { class: "pill", text: `Total ${total}` })]),
      placeList,
    ]),
    el("div", { class: "card" }, [el("h3", { text: "Assign / move stock" }), assignHost])
  );
  assignPanel(assignHost, it, () => navigate(`browse?item=${itemId}`));
}

function detailRows(it) {
  const rows = [
    ["Brand", it.brand],
    ["Model", it.model],
    ["Part number", it.part_number],
    ["Markings", it.markings],
    ["Description", it.description],
    ["Notes", it.notes],
  ].filter(([, v]) => v);
  const specs = it.specifications && Object.keys(it.specifications).length ? JSON.stringify(it.specifications) : null;
  if (specs) rows.push(["Specifications", specs]);
  return el("table", {}, [
    el("tbody", {}, rows.map(([k, v]) => el("tr", {}, [el("th", { text: k }), el("td", { text: String(v) })]))),
  ]);
}

// ---- Box detail -----------------------------------------------------
async function boxDetail(root, code) {
  root.append(el("p", { class: "muted", text: "Loading box…" }));
  let box, contents;
  try {
    box = await boxes.byCode(code);
    if (!box) throw new Error("No box with that code.");
    contents = await placements.forBox(box.id);
  } catch (e) {
    clear(root);
    return root.append(el("p", { class: "pill bad", text: e.message }));
  }
  clear(root);
  const qr = await qrDataUrl(box.box_code, 200);

  const list = el("div", { class: "list" });
  for (const p of contents) {
    list.append(
      el("div", { class: "list-item", style: "cursor:pointer", onClick: () => navigate(`browse?item=${p.item_id}`) }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title", text: p.item?.name || "—" }),
          el("div", { class: "sub", text: `${p.quantity} ${p.unit?.name || ""}` }),
        ]),
      ])
    );
  }
  if (!contents.length) list.append(el("p", { class: "muted", text: "Empty box." }));

  const printed = !!box.label_printed_at;
  root.append(
    el("div", { class: "card" }, [
      el("div", { class: "row between" }, [
        el("h2", { text: `Box ${box.box_code}` }),
        el("button", { class: "btn small secondary", text: "← Back", onClick: () => navigate("browse") }),
      ]),
      el("div", { class: "sub muted", text: box.box_type?.name || "" }),
      el("div", { class: "row" }, [
        el("div", { class: "qr-box" }, [el("img", { src: qr })]),
        el("div", { class: "steps" }, [
          el("span", { class: `pill ${printed ? "ok" : "warn"}`, text: printed ? `label printed ${fmtDate(box.label_printed_at)}` : "label not printed yet" }),
          el("span", { class: "pill", text: `status: ${box.status}` }),
          el("button", { class: "btn small", text: printed ? "Reprint label" : "Print label", onClick: () => reprintBox(box) }),
        ]),
      ]),
    ]),
    el("div", { class: "card" }, [el("h3", { text: "Contents" }), list])
  );
}

async function reprintBox(box) {
  try {
    await printJobs.enqueue(box.box_code, box.id, { source: "webapp-reprint" });
    toast("Print job queued.");
  } catch (e) {
    toast(e.message || "Could not queue.", "bad");
  }
}

// ---- Location detail ------------------------------------------------
async function locationDetail(root, locationId) {
  root.append(el("p", { class: "muted", text: "Loading…" }));
  const [paths, contents] = await Promise.all([locations.paths(), placements.forLocation(locationId)]);
  const path = paths.find((p) => p.id === locationId);
  clear(root);
  const list = el("div", { class: "list" });
  for (const p of contents) {
    list.append(
      el("div", { class: "list-item", style: "cursor:pointer", onClick: () => navigate(`browse?item=${p.item_id}`) }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title", text: p.item?.name || "—" }),
          el("div", { class: "sub", text: `${p.quantity} ${p.unit?.name || ""}` }),
        ]),
      ])
    );
  }
  if (!contents.length) list.append(el("p", { class: "muted", text: "Nothing stored here." }));
  root.append(
    el("div", { class: "card" }, [
      el("div", { class: "row between" }, [
        el("h2", { text: path?.full_path || "Location" }),
        el("button", { class: "btn small secondary", text: "← Back", onClick: () => navigate("browse?view=locations") }),
      ]),
      list,
    ])
  );
}

// ---- Quick views ----------------------------------------------------
async function quickView(root, view) {
  const card = el("div", { class: "card" }, [
    el("div", { class: "row between" }, [
      el("h2", { text: titleFor(view) }),
      el("button", { class: "btn small secondary", text: "← Back", onClick: () => navigate("browse") }),
    ]),
  ]);
  root.append(card);
  const body = el("div", { class: "list" });
  card.append(body);
  body.append(el("p", { class: "muted", text: "Loading…" }));

  try {
    if (view === "items" || view === "recent-items") {
      const rows = await items.recent(view === "recent-items" ? 20 : 200);
      clear(body);
      if (!rows.length) body.append(el("p", { class: "muted", text: "No items yet." }));
      for (const it of rows)
        body.append(
          el("div", { class: "list-item", style: "cursor:pointer", onClick: () => navigate(`browse?item=${it.id}`) }, [
            await itemThumb(it.id),
            el("div", { class: "grow" }, [
              el("div", { class: "title", text: it.name }),
              el("div", { class: "sub", text: [it.category?.name, it.subcategory?.name].filter(Boolean).join(" · ") }),
            ]),
          ])
        );
    } else if (view === "boxes" || view === "recent-boxes" || view === "unprinted") {
      const rows = view === "unprinted" ? await boxes.notPrinted() : await boxes.list();
      const list = view === "recent-boxes" ? rows.slice(0, 20) : rows;
      clear(body);
      if (!list.length) body.append(el("p", { class: "muted", text: "No boxes." }));
      for (const b of list)
        body.append(
          el("div", { class: "list-item", style: "cursor:pointer", onClick: () => navigate(`browse?box=${b.box_code}`) }, [
            el("div", { class: "grow" }, [
              el("div", { class: "title", text: `Box ${b.box_code}` }),
              el("div", { class: "sub", text: b.box_type?.name || "" }),
            ]),
            el("span", { class: `pill ${b.label_printed_at ? "ok" : "warn"}`, text: b.label_printed_at ? "printed" : "not printed" }),
          ])
        );
    } else if (view === "locations") {
      const paths = await locations.paths();
      clear(body);
      if (!paths.length) body.append(el("p", { class: "muted", text: "No locations yet." }));
      for (const p of paths)
        body.append(
          el("div", { class: "list-item", style: "cursor:pointer", onClick: () => navigate(`browse?location=${p.id}`) }, [
            el("div", { class: "grow" }, [el("div", { class: "title", text: p.full_path })]),
          ])
        );
    }
  } catch (e) {
    clear(body);
    body.append(el("p", { class: "pill bad", text: e.message || "Failed to load." }));
  }
}

function titleFor(view) {
  return {
    items: "All items",
    "recent-items": "Recent items",
    boxes: "All boxes",
    "recent-boxes": "Recent boxes",
    unprinted: "Labels not printed",
    locations: "Locations",
  }[view] || "Browse";
}
