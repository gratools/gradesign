import { z } from "zod";
import { customFontsSchema } from "./document-fonts.js";

export const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const emailSchema = z.email().max(254).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(12, "Use at least 12 characters").max(128);
export const titleSchema = z.string().trim().min(1).max(200);
export const signupSchema = z.object({ name: z.string().trim().min(1).max(100), email: emailSchema, password: passwordSchema }).strict();
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
// Portable project files include embedded custom fonts. Match the editor's import
// cap while keeping auth and other small requests under their smaller HTTP limit.
export const MAX_DOCUMENT_BYTES = 40_000_000;
export const documentSchema = z.record(z.string(), z.json()).superRefine((document, context) => {
  if (Buffer.byteLength(JSON.stringify(document), "utf8") > MAX_DOCUMENT_BYTES)
    context.addIssue({ code: "custom", message: "The design document exceeds the 40 MB limit; use smaller images or font files" });
  if (document.fonts !== undefined) {
    const fonts = customFontsSchema.safeParse(document.fonts);
    if (!fonts.success) for (const issue of fonts.error.issues)
      context.addIssue({ code: "custom", path: ["fonts", ...issue.path], message: issue.message });
  }
});
export const createDesignSchema = z.object({
  workspaceId: idSchema,
  folderId: idSchema.nullable().optional(),
  title: titleSchema,
  document: documentSchema,
}).strict();
export const updateDesignSchema = z.object({
  revision: z.number().int().nonnegative(),
  title: titleSchema.optional(),
  document: documentSchema.optional(),
  folderId: idSchema.nullable().optional(),
}).strict().refine((value) => value.title !== undefined || value.document !== undefined || value.folderId !== undefined, "Supply a change");
export const shareUpdateSchema = z.object({
  revision: z.number().int().nonnegative(),
  title: titleSchema.optional(),
  document: documentSchema.optional(),
}).strict().refine((value) => value.title !== undefined || value.document !== undefined, "Supply a change");
export const shareSchema = z.object({ permission: z.enum(["VIEW", "EDIT"]).default("VIEW"), expiresInDays: z.number().int().min(1).max(30).default(7) }).strict();
export const commentSchema = z.object({
  pageId: idSchema,
  x: z.number().min(0).max(100000),
  y: z.number().min(0).max(100000),
  body: z.string().trim().min(1).max(5000),
}).strict();
