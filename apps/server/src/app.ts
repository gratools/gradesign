import { Prisma, PrismaClient, type User } from "@prisma/client";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z, ZodError } from "zod";
import type { Config } from "./config.js";
import { belongsToWorkspace, can, sameOrigin, usableShare, type Capability } from "./permissions.js";
import { collaborationToken, DUMMY_PASSWORD_HASH, hashPassword, hashToken, randomToken, verifyPassword } from "./security.js";
import { commentSchema, createDesignSchema, idSchema, loginSchema, shareSchema, shareUpdateSchema, signupSchema, titleSchema, updateDesignSchema } from "./validation.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: User;
    }
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const safeUser = (user: User) => ({ id: user.id, name: user.name, email: user.email, tier: user.tier });
const jsonValue = (value: Record<string, unknown>) => value as Prisma.InputJsonObject;

export function createApp(db: PrismaClient, config: Config) {
  const app = express();
  const cookieName = config.production ? "__Host-forma_session" : "forma_session";
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: config.cookieSameSite, path: "/" } as const;
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
    if (config.production) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
  app.use(cors({ origin: config.webOrigin, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
  const standardJSON = express.json({ limit: "2mb", strict: true });
  const designJSON = express.json({ limit: "41mb", strict: true });
  app.use((req, res, next) => {
    const carriesDocument = (req.method === "POST" && /^\/api\/designs\/?$/.test(req.path)) ||
      (req.method === "PATCH" && /^\/api\/(?:designs|shares)\/[^/]+\/?$/.test(req.path));
    (carriesDocument ? designJSON : standardJSON)(req, res, next);
  });
  app.use(cookieParser());
  app.use((req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req.get("origin"), config.webOrigin)) {
      next(new HttpError(403, "The request Origin is not allowed"));
      return;
    }
    next();
  });
  const authRateLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many authentication attempts; try again later" },
  });

  async function loadUser(req: Request) {
    if (req.authUser) return req.authUser;
    const token: unknown = req.cookies?.[cookieName];
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date()) return null;
    req.authUser = session.user;
    return session.user;
  }

  async function requireUser(req: Request) {
    const user = await loadUser(req);
    if (!user) throw new HttpError(401, "Sign in to continue");
    return user;
  }

  async function workspaceAccess(req: Request, workspaceId: string, capability: Capability) {
    const user = await requireUser(req);
    const membership = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } });
    if (!membership) throw new HttpError(404, "Workspace not found");
    if (!can(membership.role, capability)) throw new HttpError(403, "Your workspace role does not permit this action");
    return { user, membership };
  }

  async function designAccess(req: Request, designId: string, capability: Capability) {
    const user = await requireUser(req);
    const design = await db.design.findFirst({ where: { id: designId, workspace: { memberships: { some: { userId: user.id } } } } });
    if (!design) throw new HttpError(404, "Design not found");
    const access = await workspaceAccess(req, design.workspaceId, capability);
    return { ...access, design };
  }

  async function validateFolder(folderId: string | null | undefined, workspaceId: string) {
    if (!folderId) return;
    const folder = await db.folder.findUnique({ where: { id: folderId }, select: { workspaceId: true } });
    if (!folder || !belongsToWorkspace(folder.workspaceId, workspaceId)) throw new HttpError(400, "Folder does not belong to this workspace");
  }

  async function sessionResponse(user: User) {
    const memberships = await db.membership.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
    return { user: safeUser(user), workspaces: memberships.map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, role })) };
  }

  async function startSession(userId: string, req: Request, res: Response) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const previous: unknown = req.cookies?.[cookieName];
    // Rotate any existing browser session, including during sign-in as another user.
    if (typeof previous === "string") await db.session.deleteMany({ where: { tokenHash: hashToken(previous) } });
    await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
    res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
  }

  app.get("/health", (_req, res) => { res.json({ status: "ok", service: "forma-api" }); });

  app.get("/api/session", async (req, res) => {
    const user = await loadUser(req);
    res.json(user ? await sessionResponse(user) : { user: null, workspaces: [] });
  });

  app.post("/api/auth/signup", authRateLimit, async (req, res) => {
    const data = signupSchema.parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const user = await db.user.create({
      data: {
        email: data.email,
        name: data.name,
        credential: { create: { passwordHash } },
        memberships: { create: { role: "ADMIN", workspace: { create: { name: `${data.name}'s workspace` } } } },
      },
    });
    await startSession(user.id, req, res);
    res.status(201).json(await sessionResponse(user));
  });

  app.post("/api/auth/login", authRateLimit, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await db.user.findUnique({ where: { email: data.email }, include: { credential: true } });
    const valid = await verifyPassword(data.password, user?.credential?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!valid || !user) throw new HttpError(401, "Email or password is incorrect");
    await startSession(user.id, req, res);
    res.json(await sessionResponse(user));
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token: unknown = req.cookies?.[cookieName];
    if (typeof token === "string") await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });

  app.post("/api/workspaces", async (req, res) => {
    const user = await requireUser(req);
    const { name } = z.object({ name: titleSchema }).strict().parse(req.body);
    const workspace = await db.workspace.create({ data: { name, memberships: { create: { userId: user.id, role: "ADMIN" } } } });
    res.status(201).json({ workspace: { ...workspace, role: "ADMIN" } });
  });

  app.get("/api/workspaces/:workspaceId/members", async (req, res) => {
    const workspaceId = idSchema.parse(req.params.workspaceId);
    await workspaceAccess(req, workspaceId, "read");
    const members = await db.membership.findMany({
      where: { workspaceId },
      select: { role: true, createdAt: true, user: { select: { id: true, name: true } } },
    });
    res.json({ members });
  });

  // Directly add an existing registered account; no email is sent. An invitation
  // workflow with acceptance and delivery is intentionally left to an adapter.
  app.post("/api/workspaces/:workspaceId/members", async (req, res) => {
    const workspaceId = idSchema.parse(req.params.workspaceId);
    await workspaceAccess(req, workspaceId, "manage");
    const data = z.object({ email: z.email().max(254).transform((value) => value.toLowerCase()), role: z.enum(["ADMIN", "EDITOR", "VIEWER"]) }).strict().parse(req.body);
    const account = await db.user.findUnique({ where: { email: data.email }, select: { id: true, name: true } });
    if (!account) throw new HttpError(404, "The account must register before it can be added");
    const member = await db.membership.create({ data: { workspaceId, userId: account.id, role: data.role } });
    res.status(201).json({ member: { role: member.role, user: account } });
  });

  app.get("/api/workspaces/:workspaceId/folders", async (req, res) => {
    const workspaceId = idSchema.parse(req.params.workspaceId);
    await workspaceAccess(req, workspaceId, "read");
    res.json({ folders: await db.folder.findMany({ where: { workspaceId }, orderBy: { name: "asc" }, take: 500 }) });
  });

  app.post("/api/workspaces/:workspaceId/folders", async (req, res) => {
    const workspaceId = idSchema.parse(req.params.workspaceId);
    await workspaceAccess(req, workspaceId, "edit");
    const { name } = z.object({ name: titleSchema }).strict().parse(req.body);
    res.status(201).json({ folder: await db.folder.create({ data: { workspaceId, name } }) });
  });

  app.get("/api/designs", async (req, res) => {
    const user = await requireUser(req);
    const filter = z.object({ workspaceId: idSchema.optional(), folderId: idSchema.optional(), cursor: idSchema.optional() }).strict().parse(req.query);
    if (filter.workspaceId) await workspaceAccess(req, filter.workspaceId, "read");
    if (filter.folderId) {
      const folder = await db.folder.findUnique({ where: { id: filter.folderId } });
      if (!folder) throw new HttpError(404, "Folder not found");
      await workspaceAccess(req, folder.workspaceId, "read");
      if (filter.workspaceId) await validateFolder(filter.folderId, filter.workspaceId);
    }
    const designs = await db.design.findMany({
      where: { workspaceId: filter.workspaceId, folderId: filter.folderId, workspace: { memberships: { some: { userId: user.id } } } },
      select: { id: true, workspaceId: true, folderId: true, title: true, revision: true, thumbnailUrl: true, createdAt: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      cursor: filter.cursor ? { id: filter.cursor } : undefined,
      skip: filter.cursor ? 1 : 0,
      take: 51,
    });
    const hasMore = designs.length > 50;
    const page = designs.slice(0, 50);
    res.json({ designs: page, nextCursor: hasMore ? page.at(-1)?.id ?? null : null });
  });

  app.post("/api/designs", async (req, res) => {
    const data = createDesignSchema.parse(req.body);
    const { user } = await workspaceAccess(req, data.workspaceId, "edit");
    await validateFolder(data.folderId, data.workspaceId);
    const design = await db.design.create({ data: { ...data, document: jsonValue(data.document), createdById: user.id } });
    res.status(201).json({ design });
  });

  app.get("/api/designs/:id", async (req, res) => {
    const { design, membership } = await designAccess(req, idSchema.parse(req.params.id), "read");
    res.json({ design, permission: can(membership.role, "edit") ? "edit" : "view" });
  });

  app.patch("/api/designs/:id", async (req, res) => {
    const { design, user } = await designAccess(req, idSchema.parse(req.params.id), "edit");
    const data = updateDesignSchema.parse(req.body);
    await validateFolder(data.folderId, design.workspaceId);
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.design.updateMany({
        where: { id: design.id, revision: data.revision, workspace: { memberships: { some: { userId: user.id, role: { in: ["ADMIN", "EDITOR"] } } } } },
        data: { title: data.title, document: data.document === undefined ? undefined : jsonValue(data.document), folderId: data.folderId, revision: { increment: 1 } },
      });
      if (result.count !== 1) throw new HttpError(409, "This design changed or access was revoked. Reload before saving; your local version has not been overwritten.");
      return tx.design.findUniqueOrThrow({ where: { id: design.id } });
    });
    res.json({ design: updated });
  });

  app.delete("/api/designs/:id", async (req, res) => {
    const { design, user } = await designAccess(req, idSchema.parse(req.params.id), "edit");
    const { revision } = z.object({ revision: z.number().int().nonnegative() }).strict().parse(req.body);
    const result = await db.design.deleteMany({ where: { id: design.id, revision, workspace: { memberships: { some: { userId: user.id, role: { in: ["ADMIN", "EDITOR"] } } } } } });
    if (result.count !== 1) throw new HttpError(409, "The design changed or access was revoked; reload before deleting");
    res.status(204).end();
  });

  app.post("/api/designs/:id/collaboration-token", async (req, res) => {
    const { user, design } = await designAccess(req, idSchema.parse(req.params.id), "edit");
    if (config.collaborationSecret.length < 32) throw new HttpError(503, "The collaboration service has not been configured");
    res.json(collaborationToken(user.id, design.id, config.collaborationSecret));
  });

  app.post("/api/designs/:id/share", async (req, res) => {
    const { user, design } = await designAccess(req, idSchema.parse(req.params.id), "share");
    const data = shareSchema.parse(req.body ?? {});
    const token = randomToken();
    const expiresAt = new Date(Date.now() + data.expiresInDays * 24 * 60 * 60_000);
    const share = await db.shareLink.create({ data: { designId: design.id, createdById: user.id, tokenHash: hashToken(token), permission: data.permission, expiresAt } });
    // Return the bearer secret once. It cannot be retrieved from the database.
    res.status(201).json({ share: { id: share.id, permission: share.permission, expiresAt }, token, url: `${config.webOrigin}/?share=${encodeURIComponent(token)}` });
  });

  app.get("/api/designs/:id/shares", async (req, res) => {
    const { design } = await designAccess(req, idSchema.parse(req.params.id), "share");
    const shares = await db.shareLink.findMany({ where: { designId: design.id }, select: { id: true, permission: true, createdAt: true, expiresAt: true, revokedAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
    res.json({ shares });
  });

  app.delete("/api/designs/:id/shares/:shareId", async (req, res) => {
    const { design } = await designAccess(req, idSchema.parse(req.params.id), "share");
    const result = await db.shareLink.updateMany({ where: { id: idSchema.parse(req.params.shareId), designId: design.id }, data: { revokedAt: new Date() } });
    if (!result.count) throw new HttpError(404, "Share link not found");
    res.status(204).end();
  });

  async function publicShare(req: Request, action: "read" | "edit") {
    const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(req.params.token);
    const share = await db.shareLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { design: true } });
    if (!usableShare(share, action) || !share) throw new HttpError(404, "Share link is unavailable or does not allow this action");
    return share;
  }

  const sharedDesign = (design: { id: string; title: string; document: Prisma.JsonValue; revision: number; updatedAt: Date }) => ({ id: design.id, title: design.title, document: design.document, revision: design.revision, updatedAt: design.updatedAt });
  app.get("/api/shares/:token", async (req, res) => {
    const share = await publicShare(req, "read");
    res.json({ design: sharedDesign(share.design), permission: share.permission.toLowerCase(), expiresAt: share.expiresAt });
  });

  app.patch("/api/shares/:token", async (req, res) => {
    const share = await publicShare(req, "edit");
    const data = shareUpdateSchema.parse(req.body);
    const design = await db.$transaction(async (tx) => {
      const result = await tx.design.updateMany({
        where: { id: share.designId, revision: data.revision, shareLinks: { some: { id: share.id, permission: "EDIT", revokedAt: null, expiresAt: { gt: new Date() } } } },
        data: { title: data.title, document: data.document === undefined ? undefined : jsonValue(data.document), revision: { increment: 1 } },
      });
      if (!result.count) throw new HttpError(409, "The design changed or the link expired; reload before saving");
      return tx.design.findUniqueOrThrow({ where: { id: share.designId } });
    });
    res.json({ design: sharedDesign(design) });
  });

  app.get("/api/designs/:id/comments", async (req, res) => {
    const { design } = await designAccess(req, idSchema.parse(req.params.id), "read");
    const comments = await db.comment.findMany({ where: { designId: design.id }, include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" }, take: 500 });
    res.json({ comments });
  });

  app.post("/api/designs/:id/comments", async (req, res) => {
    const { design, user } = await designAccess(req, idSchema.parse(req.params.id), "comment");
    const data = commentSchema.parse(req.body);
    const document = design.document as { pages?: { id?: string }[] } | null;
    if (!Array.isArray(document?.pages) || !document.pages.some((page) => page?.id === data.pageId)) throw new HttpError(400, "Comment page does not exist in this design");
    const comment = await db.comment.create({ data: { ...data, designId: design.id, authorId: user.id }, include: { author: { select: { id: true, name: true } } } });
    res.status(201).json({ comment });
  });

  app.patch("/api/designs/:id/comments/:commentId", async (req, res) => {
    const { design, user, membership } = await designAccess(req, idSchema.parse(req.params.id), "comment");
    const data = z.object({ resolved: z.boolean() }).strict().parse(req.body);
    const comment = await db.comment.findFirst({ where: { id: idSchema.parse(req.params.commentId), designId: design.id } });
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.authorId !== user.id && !can(membership.role, "edit")) throw new HttpError(403, "Only the author or an editor may resolve this comment");
    res.json({ comment: await db.comment.update({ where: { id: comment.id }, data }) });
  });

  app.use((_req, res) => { res.status(404).json({ error: "Route not found" }); });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof ZodError) { res.status(400).json({ error: "Invalid request", issues: error.issues.map(({ path, message }) => ({ path: path.join("."), message })) }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "This account or membership already exists" }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") { res.status(409).json({ error: "A referenced item changed; refresh and retry" }); return; }
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") { res.status(413).json({ error: "Request is too large. Design documents are limited to 40 MB; other requests to 2 MiB." }); return; }
    if (error instanceof SyntaxError && "status" in error && error.status === 400) { res.status(400).json({ error: "Malformed JSON" }); return; }
    // Do not log request bodies, passwords, tokens, or Prisma query values.
    console.error("Request failed:", error instanceof Error ? error.name : "UnknownError");
    res.status(500).json({ error: "The server could not complete this request" });
  });
  return app;
}
