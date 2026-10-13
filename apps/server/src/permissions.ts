export type Role = "ADMIN" | "EDITOR" | "VIEWER";
export type Capability = "read" | "comment" | "edit" | "share" | "manage";

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  if (capability === "read" || capability === "comment") return true;
  if (capability === "manage") return role === "ADMIN";
  return role === "ADMIN" || role === "EDITOR";
}

export function belongsToWorkspace(resourceWorkspaceId: string, requestedWorkspaceId: string): boolean {
  return resourceWorkspaceId === requestedWorkspaceId;
}

export function usableShare(
  share: { permission: "VIEW" | "EDIT"; expiresAt: Date; revokedAt: Date | null } | null,
  action: "read" | "edit",
  now = new Date(),
): boolean {
  if (!share || share.revokedAt || share.expiresAt.getTime() <= now.getTime()) return false;
  return action === "read" || share.permission === "EDIT";
}

export function sameOrigin(origin: string | undefined, allowedOrigin: string): boolean {
  // Mutating cookie-authenticated requests must supply an exact browser Origin.
  return origin === allowedOrigin;
}
