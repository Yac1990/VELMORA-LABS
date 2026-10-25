/**
 * RBAC — permissions vérifiées côté serveur sur chaque endpoint d'administration.
 * Rôles du cahier des charges : owner, catalog_manager, marketing_editor, crm_manager, analyst.
 */
export type Permission =
  | "dashboard.read"
  | "catalog.read"
  | "catalog.write"
  | "imports.run"
  | "partners.read"
  | "partners.write"
  | "conversions.read"
  | "conversions.write"
  | "content.read"
  | "content.write"
  | "ai.use"
  | "ai.approve"
  | "social.read"
  | "social.write"
  | "crm.read"
  | "crm.write"
  | "settings.read"
  | "settings.write"
  | "users.manage"
  | "audit.read";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    "dashboard.read", "catalog.read", "catalog.write", "imports.run",
    "partners.read", "partners.write", "conversions.read", "conversions.write",
    "content.read", "content.write", "ai.use", "ai.approve",
    "social.read", "social.write", "crm.read", "crm.write",
    "settings.read", "settings.write", "users.manage", "audit.read",
  ],
  catalog_manager: [
    "dashboard.read", "catalog.read", "catalog.write", "imports.run",
    "partners.read", "partners.write", "conversions.read", "content.read", "settings.read",
  ],
  marketing_editor: [
    "dashboard.read", "catalog.read", "content.read", "content.write",
    "ai.use", "social.read", "social.write", "settings.read",
  ],
  crm_manager: ["dashboard.read", "crm.read", "crm.write", "settings.read"],
  analyst: [
    "dashboard.read", "catalog.read", "conversions.read", "crm.read",
    "content.read", "social.read", "settings.read", "audit.read",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export const ROLE_LABELS: Record<string, string> = {
  owner: "Administrateur propriétaire",
  catalog_manager: "Gestionnaire catalogue",
  marketing_editor: "Éditeur marketing",
  crm_manager: "Gestionnaire CRM",
  analyst: "Analyste (lecture seule)",
};

export const ROLE_ORDER = ["owner", "catalog_manager", "marketing_editor", "crm_manager", "analyst"];
