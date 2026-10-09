import type { Metadata } from "next";
import { getKitchenBoard } from "@mesapay/db/print";
import { getDictionary } from "@mesapay/i18n";
import { requireOwnerSession } from "@/lib/session";
import { KitchenScreen } from "./kitchen-screen";

export const metadata: Metadata = { title: "Cozinha" };
export const dynamic = "force-dynamic";

export default async function CozinhaPage() {
  const { restaurant } = await requireOwnerSession();
  const board = await getKitchenBoard(restaurant.id);
  return <KitchenScreen initialBoard={board} m={getDictionary("pt-BR").dashboard.kitchen} />;
}
