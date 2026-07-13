// Shared image UI: upload widgets and thumbnail strips backed by the private
// storage bucket. Downscales before upload and stores metadata in the images
// table. Thumbnails use short-lived signed URLs since the bucket is private.
import { images, storage } from "../api.js";
import { downscaleImage, imagePath } from "../images.js";
import { el, clear, toast } from "../ui.js";

async function thumb(path) {
  try {
    const url = await storage.signedUrl(path, 3600);
    return el("img", { class: "thumb", src: url, loading: "lazy" });
  } catch (e) {
    return el("div", { class: "thumb" });
  }
}

// ---- Box type images ----
export async function boxTypeImageStrip(host, boxTypeId) {
  const grid = el("div", { class: "img-grid" });
  host.append(grid);
  const rows = await images.forBoxType(boxTypeId);
  for (const img of rows) {
    const chip = el("div", { class: "img-chip" }, [
      await thumb(img.file_path),
      el("span", { class: "tag", text: img.is_primary ? "primary" : img.role }),
      el("button", {
        class: "rm",
        text: "✕",
        onClick: async () => {
          await storage.remove(img.file_path);
          await images.remove(img.id);
          chip.remove();
          toast("Image removed.");
        },
      }),
    ]);
    grid.append(chip);
  }
}

export function uploadBoxTypeImages(host, boxTypeId) {
  const input = el("input", { type: "file", accept: "image/*", multiple: "" });
  const primaryChk = el("input", { type: "checkbox" });
  host.append(
    el("div", { class: "row", style: "margin-top:10px" }, [
      el("label", { class: "field" }, ["Add images", input]),
      el("label", { class: "row", style: "gap:6px" }, [primaryChk, "Set first as primary"]),
    ])
  );
  input.addEventListener("change", async () => {
    for (const file of [...input.files]) {
      try {
        const small = await downscaleImage(file);
        const path = imagePath("box-types", boxTypeId, "additional", small);
        await storage.upload(path, small);
        await images.create({
          box_type_id: boxTypeId,
          file_path: path,
          role: primaryChk.checked ? "primary" : "additional",
          is_primary: primaryChk.checked,
          source: "manual_upload",
        });
        primaryChk.checked = false;
      } catch (e) {
        toast(e.message || "Upload failed.", "bad");
      }
    }
    toast("Images uploaded.");
    // Refresh strip.
    const grid = host.querySelector(".img-grid");
    if (grid) grid.remove();
    boxTypeImageStrip(host, boxTypeId);
  });
}
