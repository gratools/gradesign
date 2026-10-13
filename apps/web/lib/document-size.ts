import type { DesignJSON } from "./canvas-types";

export const PRESENTATION_SIZES = [
  { id: "16:9", label: "Widescreen · 16:9", width: 1920, height: 1080 },
  { id: "9:16", label: "Vertical · 9:16", width: 1080, height: 1920 },
  { id: "4:3", label: "Standard · 4:3", width: 1440, height: 1080 },
  { id: "3:4", label: "Portrait · 3:4", width: 1080, height: 1440 },
  { id: "legacy", label: "Original · 3:2", width: 960, height: 640 },
] as const;

export function validateCanvasSize(width: unknown, height: unknown) {
  if (
    typeof width !== "number" || typeof height !== "number" ||
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 180 || height < 180 || width > 3840 || height > 3840
  ) throw new Error("Page width and height must be whole numbers from 180 to 3,840 pixels.");
  return { width, height };
}

/** Old documents intentionally retain their original 960 × 640 canvas. */
export function getCanvasSize(json: DesignJSON | undefined) {
  if (json?.width === undefined && json?.height === undefined)
    return { width: 960, height: 640 };
  return validateCanvasSize(json?.width, json?.height);
}

/** Fit the old page inside the new page, preserving object proportions and groups. */
export function resizeCanvasJSON(
  json: DesignJSON,
  width: number,
  height: number,
  fitContents = false,
): DesignJSON {
  const size = validateCanvasSize(width, height);
  const previous = getCanvasSize(json);
  const copy = structuredClone(json);
  if (fitContents) {
    const scale = Math.min(width / previous.width, height / previous.height);
    const dx = (width - previous.width * scale) / 2;
    const dy = (height - previous.height * scale) / 2;
    const fit = (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const object = value as Record<string, unknown>;
      const number = (key: string, fallback: number) =>
        typeof object[key] === "number" ? object[key] as number : fallback;
      object.left = number("left", 0) * scale + dx;
      object.top = number("top", 0) * scale + dy;
      object.scaleX = number("scaleX", 1) * scale;
      object.scaleY = number("scaleY", 1) * scale;
      // Child coordinates are group-relative, so scaling only the group preserves them.
    };
    if (Array.isArray(copy.objects)) copy.objects.forEach(fit);
    for (const key of ["backgroundImage", "overlayImage", "clipPath"]) fit(copy[key]);
  }
  return { ...copy, ...size };
}
