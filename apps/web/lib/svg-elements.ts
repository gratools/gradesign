/** Only standalone vector primitives may enter the canvas from the icon API. */
export function safeIconSVG(source: string): string {
  if (source.length > 100_000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Unsupported icon.");
  const doc = new window.DOMParser().parseFromString(source, "image/svg+xml");
  const tags = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
  const attrs = new Set("xmlns width height viewBox d points x y x1 x2 y1 y2 cx cy r rx ry transform fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity fill-opacity stroke-opacity fill-rule clip-rule".split(" "));
  const nodes = [...doc.querySelectorAll("*")];
  if (doc.documentElement.tagName !== "svg" || nodes.length > 400) throw new Error("Unsupported icon.");
  for (const node of nodes) {
    if (!tags.has(node.tagName)) throw new Error("Unsupported icon content.");
    for (const attr of [...node.attributes]) {
      if (!attrs.has(attr.name) || /url\s*\(|[<>]/i.test(attr.value)) throw new Error("Unsupported icon attribute.");
      if (/currentColor/i.test(attr.value)) node.setAttribute(attr.name, attr.value.replace(/currentColor/gi, "#252821"));
    }
  }
  return new window.XMLSerializer().serializeToString(doc.documentElement);
}

export function emojiImage(emoji: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Emoji rendering is unavailable.");
  ctx.font = '180px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 128, 136, 230);
  return canvas.toDataURL("image/png");
}
