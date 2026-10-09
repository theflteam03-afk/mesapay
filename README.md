# MesaPay

SaaS multi-restaurante de pedidos e pagamentos por QR Code: o cliente escaneia a mesa, pede pelo celular, o pedido imprime na cozinha e a mesa paga e divide a conta sem chamar o garçom.

> Nome provisório. Para trocar a marca, edite `packages/config/src/brand.ts`.

## Estado das fases

| Fase | Conteúdo | Estado |
| --- | --- | --- |
| 1. Fundação | Monorepo, schema, migrações, RLS, seed, login do dono e do admin (2FA), temas | ✅ concluída |
| 2. App da mesa + pedidos | Nome no navegador, carrinho, envio, conta da mesa ao vivo | ⏳ |
| 3. Impressão | PrintJob, navegador, agente ESC/POS, CloudPRNT, KDS | ⏳ |
| 4. Painel do restaurante | Mesas, PIN, lançar pedido, Menu, Funcionários, Configurações | ⏳ |
| 5. Pagamentos | Mercado Pago (Pix, cartão, wallets), divisão de conta, Google | ⏳ |
| 6. Dashboard e relatórios | Gráficos, mapa de mesas, ranking, Excel/PDF | ⏳ |
| 7. Admin SaaS + site + assinaturas | Assistente, duplicar, dashboard global, landing, checkout | ⏳ |

## Estrutura

```text
apps/
  web/          site institucional (/) + app da mesa (/r/{slug}/m/{qrToken})   :3000
  dashboard/    painel do restaurante                                           :3001
  admin/        painel SaaS da empresa (e-mail + senha + 2FA)                    :3002
  print-agent/  agente de impressão local (Fase 3; hoje só /health)            :3010
packages/
  db/           schema Prisma, migrações, RLS, seed, cliente + withTenant()
  core/         regras de negócio puras (dinheiro em centavos, tokens, permissões)
  auth/         senhas, PINs, TOTP (2FA), sessões em cookie, rate limit
  i18n/         pt-BR, en, es
  ui/           componentes e tokens de tema (claro/escuro + cor do restaurante)
  config/       tsconfig, marca, planos, variáveis de ambiente
e2e/            testes Playwright
docs/           DECISIONS.md (decisões técnicas) e DEPLOY.md (produção)
```

## Como rodar localmente

Pré-requisitos: **Node 20.11+**, **pnpm 10** (`corepack enable`) e **Docker** (ou um PostgreSQL 16 qualquer).

```bash
cp .env.example .env          # nada precisa de conta externa para desenvolver
docker compose up -d          # PostgreSQL em localhost:5432
pnpm install
pnpm run setup                # (com "run"! `pnpm setup` sozinho é outro comando do pnpm) gera o cliente Prisma, aplica migrações e cria o seed
pnpm dev                      # sobe os 4 apps
```

| App | URL | Acesso de demonstração |
| --- | --- | --- |
| Site | http://localhost:3000 | — |
| App da mesa | link “Abrir app da mesa” em cada mesa do painel | sem login |
| Painel do restaurante | http://localhost:3001 | `dono@demo.mesapay.com.br` / `mesapay123` |
| Admin SaaS | http://localhost:3002 | `admin@mesapay.com.br` / `mesapay-admin-123` |
| Agente de impressão | http://127.0.0.1:3010/health | — |

- No **primeiro login do admin** o 2FA é obrigatório: aparece um QR Code para o Google Authenticator / 1Password / Authy.
- PINs dos funcionários do seed: João (garçom) `1111`, Marina (caixa) `2222`, Carla (dona) `9999`. O PIN entra em uso na Fase 4.
- Há um segundo restaurante, **Café Aurora** (`dono@aurora.mesapay.com.br` / `mesapay123`), em modo escuro, para ver o tema e o isolamento entre clientes.

### Banco de dados

```bash
pnpm db:migrate                       # aplica migrações pendentes
pnpm db:migrate:new "nome da mudança" # depois de editar packages/db/prisma/schema.prisma
pnpm db:seed                          # idempotente
pnpm db:reset                         # APAGA tudo e recria (só dev)
```

As migrações ficam em `packages/db/prisma/migrations` no formato padrão do Prisma (`prisma migrate deploy` também funciona). Veja em `docs/DECISIONS.md` porque existe um script próprio.

## Testes

```bash
pnpm lint          # ESLint (sem `any`, sem avisos)
pnpm typecheck     # TypeScript estrito
pnpm test          # Vitest: regras de negócio, auth/2FA, i18n, tema e isolamento RLS (precisa do banco com seed)
pnpm test:e2e      # Playwright: sobe os apps sozinho (ou reutiliza o `pnpm dev`)
```

Na primeira vez, instale o navegador do Playwright: `pnpm --filter @mesapay/e2e exec playwright install chromium`.

**Critério de aceite da Fase 1** (coberto pelos testes E2E): `pnpm dev` sobe os 4 apps; o login do dono e do admin (com 2FA) funcionam; o seed aparece no painel (10 mesas, 30 pratos, 3 funcionários), no admin e no app da mesa.

## Produção

Passo a passo para Supabase, Vercel, domínios e Mercado Pago em [`docs/DEPLOY.md`](docs/DEPLOY.md).

> Em modo produção (`pnpm build` + `next start`) `AUTH_SECRET` e `PIN_PEPPER` são obrigatórios — gere-os com `openssl rand -base64 32`. Em `pnpm dev` há valores fixos só de desenvolvimento.
