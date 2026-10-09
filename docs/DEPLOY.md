# Deploy em produção

Passo a passo para pôr o MesaPay no ar com Supabase (banco) e Vercel (apps). Os passos marcados com **(Fase N)** só são precisos quando essa fase estiver implementada.

## 1. Contas a criar

| Serviço | Para quê | Quando |
| --- | --- | --- |
| [GitHub](https://github.com) | código (já tem: `theflteam03-afk/mesapay`) | já |
| [Supabase](https://supabase.com) | PostgreSQL (e Storage para fotos, Fase 4) | agora |
| [Vercel](https://vercel.com) | hospedar os 3 apps Next | agora |
| [Registro.br](https://registro.br) | domínio `.com.br` | agora |
| [Mercado Pago Developers](https://www.mercadopago.com.br/developers) | Pix, cartão, wallets, OAuth dos restaurantes | Fase 5 |
| [Upstash](https://upstash.com) | anti-spam / limite de tentativas (Redis) | agora (Fase 2) |
| [Resend](https://resend.com) | e-mails (convites, senha) | Fase 7 |
| [Google Cloud](https://console.cloud.google.com) | Places API (morada e link de avaliação) | Fase 5/7 |
| [Sentry](https://sentry.io) | erros | opcional |

## 2. Banco (Supabase)

1. Crie um projeto (região **South America (São Paulo)**). Guarde a senha do banco.
2. Em **Project Settings → Database → Connection string**:
   - `DATABASE_URL` = **Transaction pooler** (porta 6543), usada pelos apps.
   - `DIRECT_URL` = **Session pooler** (porta 5432 no host `pooler.supabase.com`). É usada nas migrações e no **tempo real**: o app da mesa faz `LISTEN` no Postgres, o que não funciona no Transaction pooler. Prefira o Session pooler à "Direct connection" porque esta só tem IPv6 nos planos sem o add-on de IPv4, e a Vercel liga por IPv4 (confirme no painel do Supabase, que mostra o aviso de IPv4 em cada opção).
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
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN   # Upstash → Redis → REST API
```

`UPSTASH_*` liga o anti-spam partilhado entre as instâncias da Vercel (1 pedido a cada 10 s por celular, tentativas de login). Sem estas variáveis o limite fica na memória de cada instância, o que só serve em desenvolvimento.

**Tempo real (app da mesa):** a rota `/api/t/{qrToken}/events` mantém uma ligação aberta (SSE) até 5 min (`maxDuration = 300`) e o celular religa sozinho. Nos planos em que a Vercel corta antes, o celular religa mais vezes; nada se perde, porque a cada religação ele volta a pedir a conta completa. Cada instância do app web abre 1 ligação extra ao Postgres (`LISTEN`).

`AUTH_SECRET` e `PIN_PEPPER` são obrigatórios em produção (sem eles o login falha com um erro explícito; não há valor padrão). Trocar `AUTH_SECRET` desliga todas as sessões; trocar `PIN_PEPPER` invalida todos os PINs.

## 4. Ambiente de staging

Repita os passos 2 e 3 com outro projeto Supabase e domínios `staging.mesapay.com.br` etc. É aí que o Mercado Pago fica em modo sandbox.

## 5. Mercado Pago (Fase 5)

1. Crie uma aplicação em *Suas integrações* (tipo marketplace, para o dinheiro ir direto ao restaurante).
2. Copie `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET` (credenciais de teste para staging, de produção para produção).
3. Configure o webhook para `https://mesapay.com.br/api/webhooks/mercadopago` e guarde a assinatura em `MP_WEBHOOK_SECRET`.
4. `PAYMENT_PROVIDER=mercadopago`.

## 6. Impressoras

Cada impressora é cadastrada em **Painel → Configurações → Impressoras**. O cartão de cada uma mostra o que configurar (a chave secreta fica escondida até clicar em "Mostrar").

| Tipo | Hardware | O que fazer |
| --- | --- | --- |
| Navegador | qualquer impressora instalada no PC do painel | Abrir **Cozinha** nesse PC e escolher a impressora em "Imprimir neste computador". Para não abrir a janela de impressão: atalho do Chrome com `--kiosk-printing` e a térmica como impressora padrão. |
| Agente local | térmica ESC/POS em rede (porta 9100) ou USB | Num PC ou Raspberry Pi sempre ligado na rede do restaurante, com Node 20+: clonar o repositório, `pnpm install`, e rodar `MESAPAY_API_URL=https://app.mesapay.com.br MESAPAY_PRINTERS=<chave> pnpm --filter @mesapay/print-agent start`. Várias térmicas: chaves separadas por vírgula. Estado em `http://127.0.0.1:3010/health`. Para arrancar com o PC, use o Agendador de Tarefas (Windows) ou um serviço systemd (Linux). |
| Star CloudPRNT | Star mC-Print3, TSP100IV | Na página web da impressora: CloudPRNT → ativar, Server URL = URL do cartão, intervalo 3 s. |
| Epson SDP | Epson TM-m30III / TM-m30II | Na configuração web (EpsonNet Config): Server Direct Print → ativar, URL do cartão, intervalo 3 s. |

USB no Linux: o utilizador que corre o agente precisa de acesso a `/dev/usb/lp0` (grupo `lp`). Windows: partilhe a térmica com o driver "Genérico / Somente texto" e use `\\localhost\NomeDaPartilha` como endereço.

## 7. Checklist antes de abrir para clientes

- [ ] `pnpm test` e `pnpm test:e2e` passam contra staging
- [ ] Super admin real criado e contas de demonstração ausentes
- [ ] 2FA ativo em todas as contas admin
- [ ] Backups/PITR ligados
- [ ] Políticas de privacidade e termos publicados (LGPD)
- [ ] Impressoras de cada restaurante testadas (pedido de teste sai em < 3 s; desligar a impressora faz aparecer o alerta)
- [ ] Star/Epson validadas com hardware real (ver DECISIONS D24)
