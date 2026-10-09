import type { ServiceErrorCode } from "./types";

/** Erro de regra de negócio com código estável (traduzido no celular/painel) e status HTTP. */
export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    readonly status: number,
    readonly extra: { itemName?: string; group?: string; retryAfterMs?: number } = {},
  ) {
    super(code);
    this.name = "ServiceError";
  }
}
