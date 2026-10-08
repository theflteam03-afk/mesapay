# Decisões técnicas

Registo das escolhas feitas onde o plano de arquitetura deixava margem ou onde foi preciso adaptar.

## Fase 1

### D1. App da mesa dentro de `apps/web`
O plano lista `apps/table` separado, mas põe o app da mesa no mesmo domínio do site (`mesapay.com.br/r/...`). Dois apps Next no mesmo domínio exigiriam rewrites/multi-zones e dois deploys a coordenar. A rota `/r/[slug]/m/[qrToken]` vive em `apps/web`, com bundle próprio (102 kB de JS inicial, meta < 200 kB). Os "4 apps" de `pnpm dev` são: web, dashboard, admin e print-agent.

### D2. Prisma 7 com driver adapter (`@prisma/adapter-pg`)
O Prisma 7 usa o gerador `prisma-client` (TypeScript puro, sem binário de query engine) e recebe a conexão por adapter. Funciona em Vercel e em redes que bloqueiam downloads de binários.

### D3. Script próprio de migrações (`packages/db/scripts/migrate.mjs`)
O CLI `prisma migrate` descarrega o binário `schema-engine` de `binaries.prisma.sh`, que é bloqueado em alguns ambientes (foi o caso do ambiente onde o projeto foi construído). O script usa o mesmo motor compilado para WebAssembly (`@prisma/schema-engine-wasm`, publicado pela Prisma no npm) para gerar o SQL, e grava o histórico na tabela padrão `_prisma_migrations` com o mesmo checksum. Resultado: as migrações são ficheiros Prisma normais e `prisma migrate deploy/status` continua compatível. O `prisma generate` também passa por um script (`scripts/generate.mjs`) que evita o mesmo download.

### D4. Row Level Security com papel `mesapay_app`
- Todas as tabelas têm RLS ativo. As de negócio têm `restaurantId` (incluindo `Guest`, `OrderItem`, `MenuOption*`, `PaymentAllocation`, que no plano não tinham) e a política `restaurantId = app_restaurant_id()`.
- `withTenant(restaurantId, fn)` abre uma transação, define `app.restaurant_id` e faz `SET LOCAL ROLE mesapay_app` (papel sem BYPASSRLS). Código do restaurante usa sempre `withTenant`.
- O cliente `prisma` "de sistema" (dono das tabelas) não é limitado pelo RLS: usado no admin SaaS, no login e em jobs.
- No Supabase, como não há políticas para `anon`/`authenticated`, a API REST automática não expõe nenhuma tabela.
- Testes em `packages/db/src/tenant.test.ts` tentam ler, alterar e inserir dados de outro restaurante e verificam que falham.

### D5. Autenticação própria em vez de Auth.js/Supabase Auth
O plano permitia ambos. Os fluxos são específicos (dispositivo do restaurante + PIN de funcionário; admin com 2FA obrigatório) e simples de implementar: senhas com bcrypt (custo 12), sessão em cookie httpOnly com JWT HS256 (`jose`, funciona no middleware edge), TOTP RFC 6238 implementado e testado contra os vetores oficiais. Sem dependência de um provedor externo.
- Dono: "dispositivo confiável" = cookie persistente de 30 dias; desmarcado = cookie de sessão (12 h máx.). O layout revalida no banco a cada pedido (dono removido ou restaurante suspenso perde acesso na hora).
- Admin: senha → cookie temporário de 10 min → código 2FA. No primeiro acesso o segredo é gerado, mostrado em QR e só gravado depois de confirmado.
- Rate limiting de login em memória (Fase 1). Na Fase 2 passa a Upstash Redis, com a mesma interface, porque na Vercel há várias instâncias.

### D6. `pinLookup` inclui o restaurante
`pinLookup = HMAC-SHA256(PIN_PEPPER, restaurantId + ":" + PIN)`. O mesmo PIN em dois restaurantes gera valores diferentes, e a unicidade continua garantida por `@@unique([restaurantId, pinLookup])`.

### D7. Campos acrescentados ao schema
`OwnerUser` (login do dono), `MenuOptionGroup`/`MenuOption` (opções com mínimo/máximo), `Order.number` + `Restaurant.nextOrderNumber` (#0187 no ticket), `OrderItem.station`/`reservedCents`, `Payment.serviceFeeCents`/`expiresAt` e o estado `EXPIRED`, `Printer.printerKey`, `DailyStat` (agregados do dashboard), `OrderStatus.PENDING_APPROVAL`, `RestaurantStatus.ONBOARDING`.

### D8. Interface
Tailwind CSS 4 com tokens em CSS variables (`packages/ui/src/styles.css`); componentes no estilo shadcn/ui escritos no pacote `ui` (sem o CLI do shadcn). Tema por restaurante via `data-theme` + `--brand`; a cor do texto sobre a cor da marca é escolhida pelo contraste WCAG. Fontes Inter e Bricolage Grotesque servidas localmente via `@fontsource` (sem chamadas ao Google Fonts).

### D9. Idiomas
`packages/i18n` com pt-BR (padrão), en e es. O app da mesa escolhe pelo `Accept-Language`, limitado aos idiomas ativos do restaurante. Painéis ficam em pt-BR.

### D10. Seed com dois restaurantes
O plano pede 1 restaurante demo; há um segundo pequeno (Café Aurora, modo escuro) para demonstrar o tema e testar o isolamento entre clientes.
