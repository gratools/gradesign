import { validateCustomFontCollection, type CustomFont } from "./fonts";
import { createTemplate } from "./templates";

export const DEFAULT_BRAND_COLORS = ["#2f4bff", "#ffd84a", "#12261f", "#ffffff"];
export type DesignPage = {
  id: string;
  name: string;
  canvas: Record<string, unknown>;
  thumbnail?: string;
};
export type PinnedComment = {
  id: string;
  pageId: string;
  text: string;
  x: number;
  y: number;
  createdAt: string;
};
export type Project = {
  id: string;
  title: string;
  pages: DesignPage[];
  comments: PinnedComment[];
  colors: string[];
  fonts?: CustomFont[];
  updatedAt: string;
};
export const STORAGE_KEY = "gradesign-projects-v1";
export function freshProject(): Project {
  return {
    id: crypto.randomUUID(),
    title: "A little space for big ideas",
    pages: [
      { id: crypto.randomUUID(), name: "Your next big idea", canvas: createTemplate("studio", 1920, 1080) },
    ],
    comments: [],
    colors: [...DEFAULT_BRAND_COLORS],
    fonts: [],
    updatedAt: new Date().toISOString(),
  };
}
export function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Project>;
  return (
    typeof p.id === "string" &&
    typeof p.title === "string" &&
    p.title.length <= 300 &&
    Array.isArray(p.pages) &&
    p.pages.length > 0 &&
    p.pages.length <= 100 &&
    p.pages.every(
      (x) =>
        x &&
        typeof x.id === "string" &&
        typeof x.name === "string" &&
        x.canvas &&
        typeof x.canvas === "object" &&
        !Array.isArray(x.canvas) &&
        (!x.canvas.objects || Array.isArray(x.canvas.objects)) &&
        ((x.canvas.width === undefined && x.canvas.height === undefined) ||
          [x.canvas.width, x.canvas.height].every(n => typeof n === "number" && Number.isInteger(n) && n >= 180 && n <= 3840)) &&
        (!x.thumbnail ||
          (typeof x.thumbnail === "string" &&
            /^data:image\/(png|jpeg|webp);base64,/i.test(x.thumbnail))),
    ) &&
    new Set(p.pages.map((x) => x.id)).size === p.pages.length &&
    Array.isArray(p.comments) &&
    p.comments.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        typeof c.pageId === "string" &&
        typeof c.text === "string" &&
        c.text.length <= 10000 &&
        Number.isFinite(c.x) &&
        Number.isFinite(c.y) &&
        typeof c.createdAt === "string",
    ) &&
    Array.isArray(p.colors) &&
    p.colors.length <= 100 &&
    p.colors.every((c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)) &&
    (p.fonts === undefined || validateCustomFontCollection(p.fonts)) &&
    typeof p.updatedAt === "string"
  );
}
export function downloadFile(data: string | Blob, name: string) {
  const blob =
    typeof data === "string" && !data.startsWith("data:")
      ? new Blob([data], { type: "application/octet-stream" })
      : data;
  const url = blob instanceof Blob ? URL.createObjectURL(blob) : blob;
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  if (blob instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 1000);
}
