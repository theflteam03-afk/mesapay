/**
 * Identidade da marca. Troque aqui o nome provisório "MesaPay" pelo nome definitivo:
 * todos os apps leem destes valores.
 */
export const brand = {
  name: "MesaPay",
  tagline: "Seus clientes pedem e pagam pelo celular. Sua cozinha recebe na hora.",
  domain: "mesapay.com.br",
  supportEmail: "ola@mesapay.com.br",
  whatsapp: "",
  instagram: "",
  /** Cor padrão da marca (o restaurante pode usar a sua própria). */
  primaryColor: "#E11D48",
} as const;

export type Brand = typeof brand;
