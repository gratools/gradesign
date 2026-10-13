import { getCanvasSize } from "./document-size";

export type DesignJSON = Record<string, unknown>;

export function isSafeCanvasImage(src: string, origin: string): boolean {
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(src))
    return true;
  try {
    const url = new URL(src, origin);
    return (
      ["http:", "https:", "blob:"].includes(url.protocol) &&
      url.origin === new URL(origin).origin
    );
  } catch {
    return false;
  }
}

/** Validate imported scenes before Fabric constructs objects or starts image requests. */
export function validateCanvasJSON(value: unknown, origin: string): DesignJSON {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("This page is not a valid design.");
  const source = value as DesignJSON;
  if (source.objects !== undefined && !Array.isArray(source.objects))
    throw new Error("This page has an invalid element list.");
  if (Array.isArray(source.objects) && source.objects.length > 2000)
    throw new Error("A page can contain up to 2,000 elements.");
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  const unsafeKeys = new Set([
    "__proto__",
    "prototype",
    "constructor",
    "canvas",
    "group",
    "parent",
    "render",
    "dispose",
    "toObject",
    "toJSON",
    "set",
    "get",
    "initialize",
  ]);
  let nodes = 0,
    textLength = 0;
  while (stack.length) {
    const next = stack.pop()!;
    if (++nodes > 100_000 || next.depth > 32)
      throw new Error("This design is too complex to open safely.");
    if (typeof next.value === "number" && !Number.isFinite(next.value))
      throw new Error("This design contains an invalid number.");
    if (typeof next.value === "string") {
      textLength += next.value.length;
      if (textLength > 32 * 1024 * 1024)
        throw new Error("This design is too large. Use smaller images.");
    }
    if (!next.value || typeof next.value !== "object") continue;
    if (seen.has(next.value))
      throw new Error("This design contains circular data.");
    seen.add(next.value);
    for (const [key, child] of Object.entries(next.value)) {
      if (unsafeKeys.has(key) || key.startsWith("_"))
        throw new Error("This design contains unsupported element properties.");
      if (
        key === "src" &&
        (typeof child !== "string" || !isSafeCanvasImage(child, origin))
      )
        throw new Error(
          "Import remote images as PNG, JPEG, WebP, GIF or AVIF files first.",
        );
      if (
        ["width", "height", "fontSize", "radius", "rx", "ry"].includes(key) &&
        typeof child === "number" &&
        (child < 0 || child > 32_768)
      )
        throw new Error(
          "This design contains an element with invalid dimensions.",
        );
      if (typeof child === "function" || typeof child === "symbol")
        throw new Error("This design contains unsupported data.");
      stack.push({ value: child, depth: next.depth + 1 });
    }
  }
  // Fabric applies top-level JSON fields to the Canvas instance. Only scene data belongs here.
  const document: DesignJSON = {
    version: "6.9.0",
    ...getCanvasSize(source),
    objects: source.objects ?? [],
    background: source.background ?? "#ffffff",
  };
  for (const key of ["backgroundImage", "overlayImage", "overlay", "clipPath"])
    if (source[key] !== undefined) document[key] = source[key];
  return document;
}

export type SelectionInfo = {
  id: string;
  type: string;
  fill: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  underline?: boolean;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  canRound: boolean;
  canBorder: boolean;
  canRemoveBackground: boolean;
  opacity: number;
  angle: number;
  locked: boolean;
  textSelection?: { start: number; end: number };
  mixed?: string[];
};

export type LayerInfo = {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
};

export type CanvasProps = {
  initialJSON?: DesignJSON;
  onChange: (json: DesignJSON, thumbnail: string) => void;
  onSelection: (selection: SelectionInfo | null) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  zoom: number;
  grid: boolean;
};

export type CanvasHandle = {
  addText: (kind: "heading" | "subheading" | "body") => void;
  addShape: (
    kind: "rectangle" | "circle" | "triangle" | "star" | "line",
  ) => void;
  removeImageBackground: (process: (src: string) => Promise<string>) => Promise<void>;
  addSVG: (svg: string, name: string) => Promise<void>;
  addImage: (src: string, name?: string) => Promise<void>;
  updateSelection: (props: Record<string, unknown>) => void;
  captureTextSelection: () => void;
  refreshFonts: () => void;
  removeSelection: () => void;
  duplicateSelection: () => Promise<void>;
  group: () => void;
  ungroup: () => void;
  align: (
    direction: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) => void;
  undo: () => void;
  redo: () => void;
  load: (json: DesignJSON) => Promise<void>;
  resize: (width: number, height: number, fitContents?: boolean) => Promise<void>;
  getJSON: () => DesignJSON;
  getLayers: () => LayerInfo[];
  selectLayer: (id: string) => void;
  toggleLayer: (id: string, property: "visible" | "locked") => void;
  moveLayer: (id: string, direction: "up" | "down") => void;
  renameLayer: (id: string, name: string) => void;
  export: (format: "png" | "jpeg" | "svg", multiplier?: number) => string;
  setBackground: (color: string) => void;
  setBackgroundImage: (src: string | null) => Promise<void>;
  applyTemplate: (id: string) => Promise<void>;
};
