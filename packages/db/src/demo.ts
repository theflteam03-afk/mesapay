/** Credenciais do seed de desenvolvimento (também usadas pelos testes E2E). Nunca usar em produção. */
export const DEMO = {
  slug: "demo",
  ownerEmail: "dono@demo.mesapay.com.br",
  ownerPassword: "mesapay123",
  adminEmail: "admin@mesapay.com.br",
  adminPassword: "mesapay-admin-123",
  staff: [
    { name: "João Silva", role: "WAITER", pin: "1111" },
    { name: "Marina Costa", role: "CASHIER", pin: "2222" },
    { name: "Carla Mendes", role: "OWNER", pin: "9999" },
  ] satisfies { name: string; role: "WAITER" | "CASHIER" | "OWNER"; pin: string }[],
} as const;
