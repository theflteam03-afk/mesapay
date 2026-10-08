import { prisma } from "@mesapay/db";

export const WEB = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";
export const DASHBOARD = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3001";
export const ADMIN = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002";

export async function tableUrl(slug: string, number: number): Promise<string> {
  const table = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug }, number } });
  return `${WEB}/r/${slug}/m/${table.qrToken}`;
}

export { prisma };
