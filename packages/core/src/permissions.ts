/**
 * Matriz de permissões padrão por cargo (secção 8 do plano). O dono pode editar por funcionário.
 */
export const PERMISSIONS = [
  "tables.view", //        ver mesas e lançar pedidos
  "tables.cancelItem", //  cancelar item
  "tables.payment", //     registrar pagamento / fechar mesa
  "tables.manage", //      adicionar/remover mesas
  "menu", //
  "staff", //
  "dashboard", //          dashboard e exportações
  "settings", //           impressoras, taxa, pagamentos
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const STAFF_ROLES = ["WAITER", "BARTENDER", "KITCHEN", "CASHIER", "ADMIN", "OWNER"] as const;
export type StaffRoleName = (typeof STAFF_ROLES)[number];

export const DEFAULT_PERMISSIONS: Record<StaffRoleName, readonly Permission[]> = {
  WAITER: ["tables.view"],
  BARTENDER: ["tables.view"],
  KITCHEN: ["tables.view"],
  CASHIER: ["tables.view", "tables.cancelItem", "tables.payment"],
  ADMIN: ["tables.view", "tables.cancelItem", "tables.payment", "tables.manage", "menu", "staff", "dashboard"],
  OWNER: [...PERMISSIONS],
};

export function hasPermission(granted: readonly string[], needed: Permission): boolean {
  return granted.includes(needed);
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
