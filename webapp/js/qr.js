// QR preview for the browser. Payload is the raw box code (matches the printed
// label). Uses the `qrcode` library from a CDN and renders to a data URL.
import QRCode from "https://esm.sh/qrcode@1.5.4";

export async function qrDataUrl(text, size = 260) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "Q",
    margin: 2,
    width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
