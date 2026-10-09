# MesaPay — instruções para o Claude Code

SaaS multi-restaurante de pedidos e pagamentos por QR Code. A especificação completa está no plano de arquitetura (no projeto do claude.ai do dono); o que interessa à fase atual está em `docs/FASE-4.md`. O estado de cada fase está no `README.md` e as decisões tomadas em `docs/DECISIONS.md` (D1–D25). **Leia-os antes de mudar arquitetura.**

## Regras do projeto (do plano)

- Construir **uma fase de cada vez** e não avançar sem confirmação do dono. Cada fase termina com Vitest + Playwright a passar, README atualizado e decisões novas em `docs/DECISIONS.md`.
- TypeScript estrito, **sem `any`**. Dinheiro sempre em **centavos inteiros** (`Int`), nunca float.
- Todo o texto de interface em **pt-BR**, via `packages/i18n` (pt-BR, en, es — o tipo obriga a ter as três).
- App da mesa mobile-first (< 200 kB de JS inicial); painel otimizado para PC e tablet.
- Multi-tenant: tudo o que é feito em nome de um restaurante passa por `withTenant(restaurantId, fn)` (RLS no Postgres). O cliente `prisma` "de sistema" ignora RLS: só para admin SaaS, login, jobs e para resolver tokens (QR, printerKey) antes de saber o restaurante.

## Comandos

```bash
docker compose up -d        # Postgres local (localhost:5432)
pnpm install
pnpm run setup              # COM "run": `pnpm setup` é um comando interno do pnpm
pnpm dev                    # web :3000, dashboard :3001, admin :3002, print-agent :3010
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e               # Playwright; sobe os apps sozinho (ou reutiliza o pnpm dev)
pnpm db:migrate:new "nome"  # depois de editar packages/db/prisma/schema.prisma
pnpm db:migrate             # aplica migrações (script próprio, ver D3)
```

E2E em modo produção (como o CI): `pnpm build` e depois `E2E_PROD=1 CI=1 AUTH_SECRET=... PIN_PEPPER=... pnpm test:e2e` (segredos com 32+ caracteres).

## Onde está cada coisa

- `packages/core` — regras puras e testadas: dinheiro, preço do carrinho (`priceCart`), conta (`computeTotals`, `groupByGuest`), tokens, **permissões** (`DEFAULT_PERMISSIONS`, `hasPermission`).
- `packages/auth` — senhas, **PIN** (`hashPin`/`pinLookup`, HMAC com `PIN_PEPPER` + restaurante, D6), TOTP, sessões em cookie (jose), `createRateLimiter` (Upstash ou memória).
- `packages/db` — schema, migrações, seed (idempotente), `withTenant`, serviços:
  - `services/table.ts` — mesa/QR, comanda, pessoas, conta, pedido do cliente (`createGuestOrder`)
  - `services/print.ts` — fila de impressão, KDS, estados do pedido, impressoras
- `packages/realtime` — `publish(tx, evento)` com `pg_notify` **dentro da transação**; `sseResponse()`; `useLiveEvents()` no navegador. Eventos são avisos com ids: quem recebe volta a pedir o estado.
- `packages/print` — ticket em texto, ESC/POS (PC860), CloudPRNT, Epson.
- `apps/web` — site + app da mesa (`/r/[slug]/m/[qrToken]`) e API pública (`/api/t/*`, `/api/sessions/*`).
- `apps/dashboard` — painel do restaurante (sessão do dono em cookie), KDS em `/cozinha`, impressoras em `/configuracoes`, rotas das impressoras em `/api/print/*`.
- `apps/admin` — painel SaaS (2FA obrigatório).
- `e2e/tests` — helpers úteis: `enterTable`, `addItem`, `sendOrder`, `loginOwner`, `resetTable`.

## Armadilhas já encontradas

- Dentro de `withTenant`/`$transaction` **não use `Promise.all`** com várias consultas: é uma só ligação e o `pg` avisa (aparece como "1 Issue" no Next em dev). Faça em série.
- Erros de regra de negócio: lance `ServiceError(code, status)` (`packages/db/src/services/errors.ts`) com um código de `ServiceErrorCode`; as rotas traduzem para HTTP e o cliente para texto.
- Novos campos no schema → `pnpm db:migrate:new`; índices parciais ou SQL especial são escritos à mão na migração (ex.: `TableSession_one_open_per_table`).
- Ao apagar dados em testes, apague `PrintJob` antes de `Order`/`OrderItem` (chaves estrangeiras).
- Em `pnpm dev` cada rota compila no primeiro acesso: nos E2E com limite de tempo (< 2 s, < 3 s), espere o servidor gravar (poll no banco) antes de começar a contar, ou aqueça a rota.
- `pkill -f "next dev"` mata a própria shell que o executa; use `pkill -f "[n]ext dev"`.
- Painel do restaurante: hoje as ações usam a sessão do dono **sem PIN** (D17, D25). A Fase 4 introduz o PIN.

## Contas de demonstração (seed)

- Painel: `dono@demo.mesapay.com.br` / `mesapay123` (Boteco da Esquina, 10 mesas, 30 pratos)
- PINs: João (garçom) `1111`, Marina (caixa) `2222`, Carla (dona) `9999`
- Admin: `admin@mesapay.com.br` / `mesapay-admin-123` (2FA no primeiro acesso)
- Segundo restaurante: Café Aurora (`dono@aurora.mesapay.com.br` / `mesapay123`, tema escuro)

## Commits

Mensagens em português, uma por fase/tarefa, descrevendo o que mudou e os testes. Fazer commit só quando lint, typecheck, testes unitários e E2E passarem.
