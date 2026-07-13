// Add Item: capture photos, optionally paste ChatGPT JSON (validated), review and
// edit an item form, save it (never automatically), then assign quantity + place
// it in a box or location.
import { categories, subcategories, items } from "../api.js";
import { el, clear, toast } from "../ui.js";
import { validateItemJson } from "./json_validate.js";
import { createImagePicker } from "./item_images.js";
import { assignPanel } from "./assign.js";
import { navigate } from "../router.js";

export async function renderAddItem(root) {
  const card = el("div", { class: "card" }, [el("h2", { text: "Add an item" })]);
  root.append(card);
  const container = el("div", { class: "steps" });
  card.append(container);

  const [cats, subs] = await Promise.all([categories.list(false), subcategories.list(false)]);

  // ---- Photos ----
  const photosCard = el("div", { class: "card", style: "background:var(--panel-2)" }, [el("h3", { text: "1 · Photos" })]);
  const picker = createImagePicker(photosCard);
  container.append(photosCard);

  // ---- JSON paste ----
  const jsonCard = el("div", { class: "card", style: "background:var(--panel-2)" });
  jsonCard.append(
    el("h3", { text: "2 · Identify (paste ChatGPT JSON) — optional" }),
    el("p", { class: "muted", text: "Paste JSON from your ChatGPT project, or skip and enter details manually below." })
  );
  const jsonInput = el("textarea", { style: "min-height:130px;font-family:monospace;font-size:12px", placeholder: '{ "name": "...", "category_id": "...", "subcategory_id": "..." }' });
  const jsonMsg = el("div", {});
  jsonCard.append(
    el("label", { class: "field" }, ["ChatGPT JSON", jsonInput]),
    el("div", { class: "row" }, [
      el("button", { class: "btn small", text: "Validate & load", onClick: doValidate }),
      el("button", { class: "btn small secondary", text: "Clear", onClick: () => { jsonInput.value = ""; clear(jsonMsg); } }),
    ]),
    jsonMsg
  );
  container.append(jsonCard);

  // ---- Review form ----
  const form = buildForm(cats, subs);
  const formCard = el("div", { class: "card", style: "background:var(--panel-2)" }, [
    el("h3", { text: "3 · Review & confirm" }),
    form.node,
    el("div", { class: "row end" }, [
      el("button", { class: "btn", text: "Save item", onClick: save }),
    ]),
  ]);
  container.append(formCard);

  function doValidate() {
    clear(jsonMsg);
    const res = validateItemJson(jsonInput.value, cats, subs);
    for (const e of res.errors) jsonMsg.append(el("div", { class: "pill bad", text: e, style: "display:block;margin:4px 0" }));
    for (const w of res.warnings) jsonMsg.append(el("div", { class: "pill warn", text: w, style: "display:block;margin:4px 0" }));
    if (res.value) {
      form.load(res.value);
      if (res.ok) toast("JSON loaded into the form. Review before saving.");
      else toast("JSON had errors — fix or edit the form manually.", "bad");
    }
  }

  async function save() {
    const payload = form.collect();
    if (!payload.name) return toast("Item name is required.", "bad");
    let item;
    try {
      item = await items.create(payload);
    } catch (e) {
      return toast(e.message || "Could not save item.", "bad");
    }
    // Upload any staged photos now that we have an id.
    if (picker.count()) {
      toast("Uploading photos…");
      await picker.uploadFor(item.id);
    }
    toast("Item saved.");
    showAssign(container, item);
  }
}

function buildForm(cats, subs) {
  const f = {};
  const catSel = el("select", {}, [el("option", { value: "" }, "— category —"), ...cats.map((c) => el("option", { value: c.id }, c.name))]);
  const subSel = el("select", {}, [el("option", { value: "" }, "— subcategory —")]);
  function refreshSubs(selectedSub = "") {
    clear(subSel);
    subSel.append(el("option", { value: "" }, "— subcategory —"));
    subs.filter((s) => s.category_id === catSel.value).forEach((s) => subSel.append(el("option", { value: s.id, ...(s.id === selectedSub ? { selected: "" } : {}) }, s.name)));
  }
  catSel.addEventListener("change", () => refreshSubs());

  f.name = el("input", { type: "text" });
  f.brand = el("input", { type: "text" });
  f.model = el("input", { type: "text" });
  f.part_number = el("input", { type: "text" });
  f.markings = el("input", { type: "text" });
  f.description = el("textarea", {});
  f.notes = el("textarea", {});
  f.specs = el("textarea", { style: "font-family:monospace;font-size:12px", placeholder: "{ }" });

  const node = el("div", { class: "steps" }, [
    el("label", { class: "field" }, ["Name *", f.name]),
    el("div", { class: "grid2" }, [
      el("label", { class: "field" }, ["Category", catSel]),
      el("label", { class: "field" }, ["Subcategory", subSel]),
    ]),
    el("div", { class: "grid2" }, [
      el("label", { class: "field" }, ["Brand / manufacturer", f.brand]),
      el("label", { class: "field" }, ["Make / model", f.model]),
    ]),
    el("div", { class: "grid2" }, [
      el("label", { class: "field" }, ["Part number", f.part_number]),
      el("label", { class: "field" }, ["Visible markings", f.markings]),
    ]),
    el("label", { class: "field" }, ["Description", f.description]),
    el("label", { class: "field" }, ["Specifications (JSON)", f.specs]),
    el("label", { class: "field" }, ["Notes", f.notes]),
  ]);

  return {
    node,
    load(v) {
      f.name.value = v.name || "";
      catSel.value = v.category_id || "";
      refreshSubs(v.subcategory_id || "");
      f.brand.value = v.brand || "";
      f.model.value = v.model || "";
      f.part_number.value = v.part_number || "";
      f.markings.value = v.markings || "";
      f.description.value = v.description || "";
      f.notes.value = v.notes || "";
      f.specs.value = v.specifications && Object.keys(v.specifications).length ? JSON.stringify(v.specifications, null, 2) : "";
    },
    collect() {
      let specifications = {};
      if (f.specs.value.trim()) {
        try {
          specifications = JSON.parse(f.specs.value);
        } catch (e) {
          toast("Specifications must be valid JSON — saving as note instead.", "bad");
          specifications = {};
        }
      }
      return {
        name: f.name.value.trim(),
        category_id: catSel.value || null,
        subcategory_id: subSel.value || null,
        brand: f.brand.value.trim() || null,
        model: f.model.value.trim() || null,
        part_number: f.part_number.value.trim() || null,
        markings: f.markings.value.trim() || null,
        description: f.description.value.trim() || null,
        notes: f.notes.value.trim() || null,
        specifications,
      };
    },
  };
}

function showAssign(container, item) {
  clear(container);
  const card = el("div", { class: "card", style: "background:var(--panel-2)" }, [
    el("div", { class: "row between" }, [
      el("h3", { text: `Assign “${item.name}”` }),
      el("span", { class: "pill ok", text: "item saved" }),
    ]),
    el("p", { class: "muted", text: "Enter a quantity and place it in a box (scan/type the code) or at a location. You can assign again to split across boxes." }),
  ]);
  const panelHost = el("div", {});
  card.append(panelHost);
  assignPanel(panelHost, item, () => assignPanel(panelHost, item, null));
  container.append(
    card,
    el("div", { class: "row" }, [
      el("button", { class: "btn secondary", text: "View item", onClick: () => navigate(`browse?item=${item.id}`) }),
      el("button", { class: "btn secondary", text: "Add another item", onClick: () => navigate("additem") }),
    ])
  );
}
