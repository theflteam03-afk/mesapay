/**
 * Planos comerciais (secção 10 do plano). Valores em centavos.
 * Usado pelo site institucional e, na Fase 7, pela cobrança de assinaturas.
 */
export type PlanId = "START" | "PRO" | "BUSINESS";

export interface PlanInfo {
  id: PlanId;
  name: string;
  monthlyCents: number;
  /** preço por mês no plano anual (2 meses grátis) */
  annualMonthlyCents: number;
  highlight?: boolean;
  limits: { tables: number | null; staff: number | null };
  features: string[];
}

export const PLANS: PlanInfo[] = [
  {
    id: "START",
    name: "Start",
    monthlyCents: 24900,
    annualMonthlyCents: 20700,
    limits: { tables: 15, staff: 5 },
    features: [
      "Até 15 mesas e 5 funcionários com PIN",
      "Pedidos por QR + pedido do garçom",
      "Pagamento e divisão de conta no celular",
      "Redirecionamento para avaliação Google",
      "1 impressora (navegador)",
      "Dashboard: hoje, semana e mês",
      "Suporte por e-mail",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    monthlyCents: 44900,
    annualMonthlyCents: 37400,
    highlight: true,
    limits: { tables: 40, staff: 20 },
    features: [
      "Até 40 mesas e 20 funcionários",
      "Tudo do Start",
      "Cozinha + bar com impressora cloud",
      "Dashboard completo: ano, 30 dias, garçons, mapa de mesas",
      "Exportação Excel e PDF",
      "Menu em vários idiomas",
      "WhatsApp em horário comercial · configuramos o menu",
    ],
  },
  {
    id: "BUSINESS",
    name: "Business",
    monthlyCents: 79900,
    annualMonthlyCents: 66600,
    limits: { tables: null, staff: null },
    features: [
      "Mesas e funcionários ilimitados",
      "Tudo do Pro",
      "Impressoras ilimitadas + tela KDS",
      "Várias unidades e dashboard consolidado",
      "WhatsApp prioritário + gerente de conta",
      "Configuração completa + QR impressos",
    ],
  },
];
