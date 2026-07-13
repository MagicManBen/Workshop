// Assign stock to a box (by scanning/typing its code) or directly to a location.
// Supports quantity + unit, and the underlying api.placements.place() de-dupes
// by adding to an existing row for the same item + target. Also records a
// stock movement for history.
import { boxes, locations, units, placements, movements } from "../api.js";
import { el, clear, toast } from "../ui.js";

export function assignPanel(host, item, onDone) {
  clear(host);
  const target = { mode: "box", box: null, location_id: null };

  const modeBox = el("button", { class: "active", text: "In a box" });
  const modeLoc = el("button", { text: "At a location" });
  const tabbar = el("div", { class: "tabbar" }, [modeBox, modeLoc]);

  const boxPanel = el("div", { class: "steps" });
  const locPanel = el("div", { class: "steps hidden" });

  // --- Box target: scan or type a code ---
  const codeInput = el("input", {
    class: "big-input",
    type: "text",
    inputmode: "numeric",
    maxlength: "10",
    placeholder: "Scan or type 10-digit box code",
    autocomplete: "off",
  });
  const boxInfo = el("div", { class: "muted", text: "" });
  const resolveBox = async () => {
    const code = codeInput.value.trim();
    if (!/^\d{10}$/.test(code)) {
      target.box = null;
      boxInfo.textContent = "Enter exactly 10 digits.";
      return;
    }
    try {
      const box = await boxes.byCode(code);
      if (!box) {
        target.box = null;
        boxInfo.textContent = "No box with that code.";
      } else {
        target.box = box;
        boxInfo.textContent = `Box ${box.box_code} · ${box.box_type?.name || ""}`;
      }
    } catch (e) {
      boxInfo.textContent = e.message || "Lookup failed.";
    }
  };
  // A keyboard-wedge scanner sends the value then Enter — resolve on both.
  codeInput.addEventListener("change", resolveBox);
  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      resolveBox();
    }
  });
  boxPanel.append(
    el("label", { class: "field" }, ["Box", codeInput]),
    boxInfo
  );

  // --- Location target ---
  const locSelect = el("select", {}, [el("option", { value: "" }, "Loading…")]);
  locPanel.append(el("label", { class: "field" }, ["Location", locSelect]));

  // --- Quantity + unit (shared) ---
  const qty = el("input", { type: "number", value: "1", min: "0", step: "0.001" });
  const unitSel = el("select", {}, [el("option", { value: "" }, "Loading…")]);
  const qtyRow = el("div", { class: "grid2" }, [
    el("label", { class: "field" }, ["Quantity", qty]),
    el("label", { class: "field" }, ["Unit", unitSel]),
  ]);

  const actions = el("div", { class: "row end" }, [
    el("button", { class: "btn", text: "Assign stock", onClick: submit }),
  ]);

  host.append(tabbar, boxPanel, locPanel, qtyRow, actions);

  // Load units + locations.
  (async () => {
    const [us, paths] = await Promise.all([units.list(), locations.paths()]);
    clear(unitSel);
    unitSel.append(el("option", { value: "" }, "— unit —"));
    us.forEach((u) => unitSel.append(el("option", { value: u.id }, u.name)));
    const pieces = us.find((u) => u.name === "Pieces");
    if (pieces) unitSel.value = pieces.id;
    clear(locSelect);
    locSelect.append(el("option", { value: "" }, "— choose location —"));
    paths.forEach((p) => locSelect.append(el("option", { value: p.id }, p.full_path)));
  })();

  modeBox.addEventListener("click", () => {
    target.mode = "box";
    modeBox.classList.add("active");
    modeLoc.classList.remove("active");
    boxPanel.classList.remove("hidden");
    locPanel.classList.add("hidden");
  });
  modeLoc.addEventListener("click", () => {
    target.mode = "location";
    modeLoc.classList.add("active");
    modeBox.classList.remove("active");
    locPanel.classList.remove("hidden");
    boxPanel.classList.add("hidden");
  });

  async function submit() {
    const quantity = Number(qty.value);
    if (!(quantity > 0)) return toast("Enter a quantity greater than 0.", "bad");
    const unit_id = unitSel.value || null;

    let box_id = null;
    let location_id = null;
    if (target.mode === "box") {
      await resolveBox();
      if (!target.box) return toast("Resolve a valid box code first.", "bad");
      box_id = target.box.id;
    } else {
      location_id = locSelect.value;
      if (!location_id) return toast("Choose a location.", "bad");
    }

    try {
      await placements.place({ item_id: item.id, box_id, location_id, quantity, unit_id });
      await movements.record({
        item_id: item.id,
        movement_type: "add",
        quantity,
        unit_id,
        to_box_id: box_id,
        to_location_id: location_id,
        note: "Assigned via web app",
      });
      toast("Stock assigned.");
      onDone && onDone();
    } catch (e) {
      toast(e.message || "Assign failed.", "bad");
    }
  }
}
