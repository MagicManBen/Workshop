// Multi-photo picker for items. Holds files in memory with a role until the item
// is saved, then uploads (downscaled) to storage and records metadata. Allows
// preview, remove and replace before final confirmation.
import { images, storage } from "../api.js";
import { downscaleImage, imagePath } from "../images.js";
import { el, clear, toast } from "../ui.js";

const ROLES = [
  { key: "primary", label: "Primary" },
  { key: "overhead", label: "Overhead" },
  { key: "side", label: "Side view" },
  { key: "additional", label: "Additional" },
];

export function createImagePicker(host) {
  const staged = []; // { file, role, url }
  const grid = el("div", { class: "img-grid" });

  const roleSel = el("select", {}, ROLES.map((r) => el("option", { value: r.key }, r.label)));
  const input = el("input", { type: "file", accept: "image/*", multiple: "" });

  input.addEventListener("change", () => {
    for (const file of [...input.files]) {
      const entry = { file, role: roleSel.value, url: URL.createObjectURL(file) };
      staged.push(entry);
    }
    input.value = "";
    draw();
  });

  function draw() {
    clear(grid);
    staged.forEach((entry, idx) => {
      grid.append(
        el("div", { class: "img-chip" }, [
          el("img", { src: entry.url }),
          el("span", { class: "tag", text: entry.role }),
          el("button", {
            class: "rm",
            text: "✕",
            onClick: () => {
              staged.splice(idx, 1);
              draw();
            },
          }),
        ])
      );
    });
  }

  host.append(
    el("div", { class: "row" }, [
      el("label", { class: "field", style: "flex:1" }, ["Photo role", roleSel]),
      el("label", { class: "field", style: "flex:2" }, ["Add photos (camera or files)", input]),
    ]),
    grid
  );

  return {
    count: () => staged.length,
    async uploadFor(itemId) {
      let primaryUsed = false;
      for (const entry of staged) {
        try {
          const small = await downscaleImage(entry.file);
          const role = entry.role;
          const isPrimary = role === "primary" && !primaryUsed;
          if (isPrimary) primaryUsed = true;
          const path = imagePath("items", itemId, role, small);
          await storage.upload(path, small);
          await images.create({
            item_id: itemId,
            file_path: path,
            role,
            is_primary: isPrimary,
            source: "manual_upload",
          });
        } catch (e) {
          toast("An image failed to upload: " + (e.message || ""), "bad");
        }
      }
    },
  };
}
