# Fase 4 — Painel do restaurante (briefing)

Resumo do plano de arquitetura (secções 8, 11 e 14) mais o que já existe no código, para continuar a construção.

**Critério de aceite (E2E):** um garçom com PIN lança um pedido que imprime com o nome dele; um garçom sem permissão não abre o Dashboard.

## O que já existe e deve ser reaproveitado

| Já feito | Onde |
| --- | --- |
| Login do dono no dispositivo ("dispositivo confiável" 30 dias) | `apps/dashboard/src/app/login`, `lib/session.ts` |
| Staff com `pinHash` (bcrypt) + `pinLookup` (HMAC por restaurante) e `permissions[]` | schema `Staff`, `packages/auth/src/pin.ts` |
| Permissões padrão por cargo + `hasPermission` | `packages/core/src/permissions.ts` |
| Rate limiter (Upstash/memória) | `createRateLimiter` em `packages/auth` |
| Pedido do cliente (preço no servidor, idempotência, totais) | `createGuestOrder` em `packages/db/src/services/table.ts` |
| Tickets mostram "Garçom: Nome (PIN)" quando `Order.channel = STAFF` e `staffId` | `createPrintJobs` em `services/print.ts` |
| KDS, aceitar/recusar, estados, reimprimir, impressoras | `/cozinha`, `/configuracoes` (hoje sem PIN) |
| Mesas: lista com Livre/Ocupada/A pagar e total | `/mesas` (só leitura) |
| Menu: lista + interruptor "Esgotado" ao vivo | `/menu` (sem CRUD) |
| Funcionários: lista | `/funcionarios` (só leitura) |
| Tempo real para o painel (`/api/events`) e para a mesa | `packages/realtime` |

## O que construir

### Login e PIN
- Depois do login do dono, tudo funciona por PIN de 4–6 dígitos: teclado numérico grande, sem nome. O PIN identifica o funcionário.
- `POST /api/staff/pin` valida o PIN e devolve um token de 60 s. Após cada ação, a sessão do funcionário expira em 60 s sem uso (volta ao ecrã neutro).
- 5 PINs errados seguidos bloqueiam o teclado por 2 minutos (por dispositivo).
- Registar no `AuditLog` cada ação com o funcionário.

### Matriz de permissões padrão (editável pelo dono)

| Aba / ação | Garçom | Barman | Caixa | Admin | Dono |
| --- | --- | --- | --- | --- | --- |
| Mesas: ver e lançar pedidos | Sim | Sim | Sim | Sim | Sim |
| Mesas: cancelar item | Não | Não | Sim | Sim | Sim |
| Mesas: registrar pagamento / fechar | Não | Não | Sim | Sim | Sim |
| Mesas: adicionar/remover mesas | Não | Não | Não | Sim | Sim |
| Menu | Não | Não | Não | Sim | Sim |
| Funcionários | Não | Não | Não | Sim | Sim |
| Dashboard e exportações | Não | Não | Não | Sim | Sim |
| Configurações (impressoras, taxa, pagamentos) | Não | Não | Não | Não | Sim |

Esta tabela já está em `DEFAULT_PERMISSIONS` (`packages/core/src/permissions.ts`); o seed grava-a em cada funcionário.

### Aba Mesas
- Grelha de cards: número, estado por cor (verde livre, laranja ocupada, azul a pagar, **vermelho pedido parado há mais de 20 min**), total consumido, pago e em falta. Atualiza em tempo real.
- Botão **+**: adiciona a próxima mesa (número sequencial) e gera o QR. Lixo em cada card (só mesas livres; soft delete).
- **Imprimir QR Codes**: PDF com um cartão A6 por mesa (logo, "Mesa 12", QR, "Escaneie para pedir"). **Regenerar QR** por mesa invalida o token antigo.
- Clicar numa mesa → PIN → abre a mesa:
  - o que cada pessoa pediu, pedidos do garçom, pago e em falta;
  - menu lateral com busca e categorias; o garçom toca nos itens, ajusta quantidade/observação e opcionalmente atribui a uma pessoa da mesa;
  - botão **Lançar pedido** → `Order(channel=STAFF, staffId)` que imprime na hora (reaproveitar `priceCart` e `createPrintJobs`);
  - caixa: **Registrar pagamento** (dinheiro/maquininha, total ou parcial) e **Fechar mesa**; **Transferir mesa** e **Juntar mesas**. (O pagamento online é da Fase 5; aqui é só o manual do caixa. Fechar a mesa publica `session.closed`, que o app da mesa já trata.)
- Modo **editar mapa**: arrastar as mesas para desenhar a planta (`mapX`, `mapY`).

### Aba Menu
- Lista por categoria, reordenável por arrastar. **+** categoria e **+** prato.
- Formulário do prato: foto (upload, recorte quadrado, WebP ≤ 200 KB — Supabase Storage em produção; em dev pode gravar localmente), nome, descrição, preço, categoria, estação, opções/adicionais (grupos com mínimo/máximo).
- Interruptor **Esgotado** (já existe), editar, remover (soft delete). **Pausar categoria**.

### Aba Funcionários
- Lista com nome, cargo, último acesso, ativo/inativo. **+** → nome, cargo, PIN (aleatório ou definido), permissões (checkboxes pré-preenchidas pelo cargo).
- Editar PIN, mudar cargo, dar/tirar admin, desativar. PINs únicos no restaurante e nunca mostrados depois de criados.

### Aba Configurações (só dono)
- Dados do restaurante, tema dark/light e cor, taxa de serviço (e se é opcional), impressoras (já existe), link Google (`googlePlaceId`), aprovação de pedidos QR, idiomas. Conta Mercado Pago e plano/faturas ficam para as Fases 5 e 7 (deixar o espaço).

### Endpoints do plano para esta fase
`POST /api/staff/pin`, `POST /api/tables`, `DELETE /api/tables/{id}`, `POST /api/tables/{id}/orders` (exige token de PIN), `POST /api/sessions/{id}/manual-payment`, `CRUD /api/menu/items`, `PATCH /api/menu/items/{id}/sold-out`, `CRUD /api/staff`. Server Actions também servem, desde que cada uma valide sessão do dono + token de PIN + permissão.

### Passar a exigir PIN no que já existe
Ações do KDS (aceitar, avançar, reimprimir), "Esgotado" no Menu e Configurações/Impressoras (ver D17 e D25).

## Sugestão de ordem

1. PIN (serviço + teclado + token 60 s + bloqueio 5 tentativas + auditoria) e guarda de permissões por aba e por ação.
2. Funcionários (CRUD) — precisa do PIN.
3. Mesas: abrir mesa, lançar pedido do garçom (critério de aceite), cancelar item, pagamento manual, fechar mesa.
4. Mesas: +/−, regenerar QR, PDF A6, estados por cor, transferir/juntar, editar mapa.
5. Menu (CRUD, opções, fotos, ordenar, pausar).
6. Configurações do restaurante.
7. E2E do critério de aceite + README + DECISIONS + commit.

## Perguntas a decidir com o dono antes de começar
- Pagamento manual parcial: alocar por itens (como o plano descreve para pagamentos online) ou só valor livre nesta fase?
- Fotos dos pratos em desenvolvimento: guardar em disco local ou já configurar o Supabase Storage?
