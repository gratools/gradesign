import QRCode from "qrcode";
export type QRSettings = { text: string; foreground: string; background: string; correction: "M" | "Q" | "H" };
export function qrOptions(settings: QRSettings) {
  if (!settings.text.trim()) throw new Error("Enter a link or text first.");
  if (new TextEncoder().encode(settings.text).length > 1200) throw new Error("Use shorter content (up to 1,200 bytes).");
  const luminance = (hex: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Choose valid colors.");
    const values = [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
  };
  const dark = luminance(settings.foreground), light = luminance(settings.background);
  if ((light + .05) / (dark + .05) < 4.5) throw new Error("Use a darker code and lighter background for reliable scanning.");
  return { errorCorrectionLevel: settings.correction, margin: 4, width: 1024, color: { dark: settings.foreground, light: settings.background } };
}
export async function generateQR(settings: QRSettings) {
  return QRCode.toDataURL(settings.text, qrOptions(settings));
}
