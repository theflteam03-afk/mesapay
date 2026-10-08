# Deploy em produção

Passo a passo para pôr o MesaPay no ar com Supabase (banco) e Vercel (apps). Os passos marcados com **(Fase N)** só são precisos quando essa fase estiver implementada.

## 1. Contas a criar

| Serviço | Para quê | Quando |
| --- | --- | --- |
| [GitHub](https://github.com) | código (já tem: `theflteam03-afk/mesapay`) | já |
| [Supabase](https://supabase.com) | PostgreSQL, Realtime, Storage | agora |
| [Vercel](https://vercel.com) | hospedar os 3 apps Next | agora |
| [Registro.br](https://registro.br) | domínio `.com.br` | agora |
| [Mercado Pago Developers](https://www.mercadopago.com.br/developers) | Pix, cartão, wallets, OAuth dos restaurantes | Fase 5 |
| [Upstash](https://upstash.com) | rate limiting (Redis) | Fase 2 |
| [Resend](https://resend.com) | e-mails (convites, senha) | Fase 7 |
| [Google Cloud](https://console.cloud.google.com) | Places API (morada e link de avaliação) | Fase 5/7 |
| [Sentry](https://sentry.io) | erros | opcional |

## 2. Banco (Supabase)

1. Crie um projeto (região **South America (São Paulo)**). Guarde a senha do banco.
2. Em **Project Settings → Database → Connection string**:
   - `DATABASE_URL` = **Transaction pooler** (porta 6543), usada pelos apps.
   - `DIRECT_URL` = **Direct connection** (porta 5432). É usada nas migrações.
3. No seu computador, com essas duas variáveis no `.env`:
   ```bash
   pnpm db:migrate
   ```
   Não rode `pnpm db:seed` em produção: o seed cria contas de demonstração com senhas conhecidas.
4. Crie o primeiro super admin real (a senha é pedida no terminal):
   ```bash
   pnpm db:create-admin voce@suaempresa.com.br "Seu Nome" SUPER_ADMIN
   ```
   O 2FA é configurado (obrigatoriamente) no primeiro login.
5. Backups: no plano Pro do Supabase ative **Point in Time Recovery** (o plano pede retenção de 30 dias).

## 3. Apps (Vercel)

Crie **3 projetos** na Vercel apontando para o mesmo repositório:

| Projeto | Root Directory | Domínio |
| --- | --- | --- |
| mesapay-web | `apps/web` | `mesapay.com.br` |
| mesapay-dashboard | `apps/dashboard` | `app.mesapay.com.br` |
| mesapay-admin | `apps/admin` | `admin.mesapay.com.br` |

Em cada um: Framework **Next.js**, Install Command `pnpm install`, e ative **"Include files outside the root directory"** (vem ligado por padrão em monorepos).

Variáveis de ambiente (iguais nos três, em Production):

```
DATABASE_URL, DIRECT_URL
AUTH_SECRET          # openssl rand -base64 32
PIN_PEPPER           # openssl rand -base64 32  — NUNCA mudar depois de criar funcionários
NEXT_PUBLIC_WEB_URL=https://mesapay.com.br
NEXT_PUBLIC_DASHBOARD_URL=https://app.mesapay.com.br
NEXT_PUBLIC_ADMIN_URL=https://admin.mesapay.com.br
```

`AUTH_SECRET` e `PIN_PEPPER` são obrigatórios em produção (sem eles o login falha com um erro explícito; não há valor padrão). Trocar `AUTH_SECRET` desliga todas as sessões; trocar `PIN_PEPPER` invalida todos os PINs.

## 4. Ambiente de staging

Repita os passos 2 e 3 com outro projeto Supabase e domínios `staging.mesapay.com.br` etc. É aí que o Mercado Pago fica em modo sandbox.

## 5. Mercado Pago (Fase 5)

1. Crie uma aplicação em *Suas integrações* (tipo marketplace, para o dinheiro ir direto ao restaurante).
2. Copie `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET` (credenciais de teste para staging, de produção para produção).
3. Configure o webhook para `https://mesapay.com.br/api/webhooks/mercadopago` e guarde a assinatura em `MP_WEBHOOK_SECRET`.
4. `PAYMENT_PROVIDER=mercadopago`.

## 6. Checklist antes de abrir para clientes

- [ ] `pnpm test` e `pnpm test:e2e` passam contra staging
- [ ] Super admin real criado e contas de demonstração ausentes
- [ ] 2FA ativo em todas as contas admin
- [ ] Backups/PITR ligados
- [ ] Políticas de privacidade e termos publicados (LGPD)
