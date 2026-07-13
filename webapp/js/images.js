// Client-side image downscaling before upload, to keep storage reasonable while
// still storing a good-quality image. Large photos are resized so the longest
// edge is at most MAX_EDGE px; smaller images are left untouched.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

export async function downscaleImage(file) {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // e.g. HEIC without decoder — upload original.

  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) {
    bitmap.close?.();
    return file;
  }

  const scale = MAX_EDGE / longest;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((res) =>
    canvas.toBlob(res, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

// Build a storage path like `items/<id>/<role>-<timestamp>.jpg`.
export function imagePath(kind, ownerId, role, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}/${ownerId}/${role}-${stamp}-${rand}.${ext}`;
}
