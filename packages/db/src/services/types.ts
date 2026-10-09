/**
 * Formatos (DTO) devolvidos pela API do app da mesa. Só tipos: pode ser importado
 * por componentes do navegador sem levar o Prisma para o bundle.
 */

export type OrderStatusDTO = "PENDING_APPROVAL" | "SENT" | "PRINTED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
export type SessionStatusDTO = "OPEN" | "PAYING" | "CLOSED";

export interface MenuOptionDTO {
  id: string;
  name: string;
  priceCents: number;
}

export interface MenuOptionGroupDTO {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOptionDTO[];
}

export interface MenuItemDTO {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  photoUrl: string | null;
  soldOut: boolean;
  optionGroups: MenuOptionGroupDTO[];
}

export interface MenuCategoryDTO {
  id: string;
  name: string;
  items: MenuItemDTO[];
}

export interface JoinResultDTO {
  sessionId: string;
  guestId: string;
  /** Nome mostrado na mesa (pode ganhar sufixo: "Ana (2)"). */
  displayName: string;
}

export interface BillItemDTO {
  id: string;
  orderId: string;
  orderNumber: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  options: string[];
  note: string | null;
  status: OrderStatusDTO;
  cancelled: boolean;
  paidCents: number;
}

export interface BillGroupDTO {
  /** null = itens lançados pelo garçom sem dono. */
  guestId: string | null;
  name: string | null;
  isMe: boolean;
  subtotalCents: number;
  items: BillItemDTO[];
}

export interface BillOrderDTO {
  id: string;
  number: number;
  status: OrderStatusDTO;
  channel: "QR" | "STAFF";
  createdAt: string;
  byName: string | null;
  itemCount: number;
}

export interface BillDTO {
  sessionId: string;
  status: SessionStatusDTO;
  tableNumber: number;
  serviceFeePct: number;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  me: { guestId: string; name: string } | null;
  guests: { id: string; name: string }[];
  groups: BillGroupDTO[];
  orders: BillOrderDTO[];
}

export interface CreateOrderResultDTO {
  orderId: string;
  number: number;
  status: OrderStatusDTO;
  /** true se este pedido já tinha sido recebido (reenvio do mesmo carrinho). */
  duplicate: boolean;
}

/** Códigos de erro estáveis: o celular traduz cada um para o idioma do cliente. */
export type ServiceErrorCode =
  | "TABLE_NOT_FOUND"
  | "RESTAURANT_UNAVAILABLE"
  | "INVALID_NAME"
  | "INVALID_DEVICE"
  | "NOT_A_GUEST"
  | "SESSION_NOT_FOUND"
  | "SESSION_CLOSED"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "EMPTY"
  | "TOO_MANY_ITEMS"
  | "INVALID_QUANTITY"
  | "ITEM_UNAVAILABLE"
  | "SOLD_OUT"
  | "INVALID_OPTION"
  | "OPTION_MIN"
  | "OPTION_MAX"
  | "NOTE_TOO_LONG"
  | "INTERNAL";

export interface ServiceErrorDTO {
  error: ServiceErrorCode;
  itemName?: string;
  group?: string;
  retryAfterMs?: number;
}
