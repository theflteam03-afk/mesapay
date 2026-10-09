/**
 * Seed de desenvolvimento: 1 restaurante demo completo (10 mesas, 30 pratos, 3 funcionários),
 * 1 restaurante pequeno em modo escuro (para ver o tema e testar o isolamento entre clientes),
 * a conta do dono e a conta de super admin SaaS.
 *
 * Idempotente: se o restaurante demo já existir, não duplica nada. Para recomeçar: pnpm db:reset
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const { DEFAULT_PERMISSIONS, generateQrToken, randomToken, toCents } = await import("@mesapay/core");
const { hashPassword, hashPin, pinLookup } = await import("@mesapay/auth");
const { prisma } = await import("./index");
const { DEMO } = await import("./demo");
type StaffRole = "WAITER" | "CASHIER" | "BARTENDER" | "KITCHEN" | "ADMIN" | "OWNER";



type OptionSeed = { name: string; min: number; max: number; options: [string, string?][] };
type ItemSeed = [name: string, description: string, price: string, extra?: { soldOut?: boolean; options?: OptionSeed[] }];
type CategorySeed = { name: string; en: string; es: string; station: "KITCHEN" | "BAR"; items: ItemSeed[] };

const MENU: CategorySeed[] = [
  {
    name: "Entradas",
    en: "Starters",
    es: "Entrantes",
    station: "KITCHEN",
    items: [
      ["Pão de alho", "Baguete com manteiga de alho e ervas, gratinada.", "18,00"],
      ["Bolinho de bacalhau", "6 unidades, com maionese de limão.", "39,00"],
      ["Pastel de feira", "4 unidades: carne, queijo, palmito e pizza.", "32,00"],
      ["Mandioca frita", "Porção com molho de alho.", "28,00"],
      ["Provoleta", "Provolone grelhado com orégano e tomate confit.", "36,00"],
    ],
  },
  {
    name: "Pratos principais",
    en: "Main courses",
    es: "Platos principales",
    station: "KITCHEN",
    items: [
      [
        "Picanha na chapa",
        "400 g, com arroz, farofa, vinagrete e batata frita. Serve 2.",
        "129,00",
        {
          options: [
            {
              name: "Ponto da carne",
              min: 1,
              max: 1,
              options: [["Mal passada"], ["Ao ponto"], ["Bem passada"]],
            },
          ],
        },
      ],
      ["Feijoada completa", "Com arroz, couve, farofa, torresmo e laranja.", "64,00"],
      ["Moqueca de peixe", "Peixe branco no leite de coco e dendê, com pirão e arroz.", "89,00"],
      ["Parmegiana de frango", "Com arroz e fritas.", "54,00"],
      ["Risoto de cogumelos", "Arroz arbóreo, shiitake, parmesão. Vegetariano.", "58,00"],
      ["Salmão grelhado", "Com legumes salteados e purê de mandioquinha.", "84,00"],
    ],
  },
  {
    name: "Lanches",
    en: "Burgers & sandwiches",
    es: "Bocadillos",
    station: "KITCHEN",
    items: [
      [
        "Hambúrguer da casa",
        "Blend 180 g, queijo prato, alface, tomate e molho especial. Com fritas.",
        "46,00",
        {
          options: [
            {
              name: "Adicionais",
              min: 0,
              max: 3,
              options: [["Bacon", "6,00"], ["Cheddar", "5,00"], ["Ovo", "4,00"]],
            },
          ],
        },
      ],
      ["Beirute de filé", "Pão sírio, filé mignon, queijo, presunto, ovo e salada.", "52,00"],
      ["Sanduíche de pernil", "Pernil desfiado, vinagrete e pão francês.", "34,00"],
      ["Batata frita grande", "Porção para compartilhar.", "29,00"],
    ],
  },
  {
    name: "Sobremesas",
    en: "Desserts",
    es: "Postres",
    station: "KITCHEN",
    items: [
      ["Pudim de leite", "Receita da casa.", "16,00", { soldOut: true }],
      ["Petit gâteau", "Com sorvete de creme.", "28,00"],
      ["Brigadeiro de colher", "Com granulado belga.", "14,00"],
      ["Salada de frutas", "Frutas da estação.", "15,00"],
    ],
  },
  {
    name: "Bebidas sem álcool",
    en: "Soft drinks",
    es: "Bebidas sin alcohol",
    station: "BAR",
    items: [
      ["Água mineral", "500 ml, com ou sem gás.", "6,00"],
      ["Refrigerante lata", "Coca-Cola, Guaraná ou Sprite.", "8,00"],
      ["Suco natural", "Laranja, limão, abacaxi com hortelã ou maracujá.", "12,00"],
      ["Limonada suíça", "Limão batido com leite condensado.", "14,00"],
      ["Café espresso", "", "7,00"],
    ],
  },
  {
    name: "Drinks e cervejas",
    en: "Cocktails & beer",
    es: "Cócteles y cervezas",
    station: "BAR",
    items: [
      [
        "Caipirinha",
        "Cachaça artesanal.",
        "22,00",
        {
          options: [
            {
              name: "Fruta",
              min: 1,
              max: 1,
              options: [["Limão"], ["Morango", "2,00"], ["Maracujá", "2,00"]],
            },
          ],
        },
      ],
      ["Chopp pilsen", "300 ml.", "13,00"],
      ["Cerveja long neck", "Heineken ou Stella Artois.", "14,00"],
      ["Gin tônica", "Gin, tônica, limão siciliano e especiarias.", "34,00"],
      ["Aperol spritz", "", "36,00"],
      ["Taça de vinho", "Tinto ou branco da casa.", "29,00"],
    ],
  },
];

async function seedSaasAdmin() {
  const existing = await prisma.saasUser.findUnique({ where: { email: DEMO.adminEmail } });
  if (existing) return;
  await prisma.saasUser.create({
    data: {
      email: DEMO.adminEmail,
      name: "Admin MesaPay",
      passwordHash: await hashPassword(DEMO.adminPassword),
      role: "SUPER_ADMIN",
      // totpSecret vazio: o 2FA é configurado (obrigatoriamente) no primeiro login.
    },
  });
  console.log(`✓ super admin SaaS: ${DEMO.adminEmail}`);
}

async function seedRestaurant(input: {
  organizationName: string;
  slug: string;
  name: string;
  theme: "LIGHT" | "DARK";
  primaryColor: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  plan: "START" | "PRO" | "BUSINESS";
  tables: number;
  menu: CategorySeed[];
  staff: readonly { name: string; role: StaffRole; pin: string }[];
  owner?: { email: string; password: string; name: string };
}) {
  if (await prisma.restaurant.findUnique({ where: { slug: input.slug } })) {
    console.log(`• restaurante "${input.slug}" já existe — mantido`);
    return;
  }

  const org = await prisma.organization.create({ data: { name: input.organizationName } });
  const restaurant = await prisma.restaurant.create({
    data: {
      organizationId: org.id,
      slug: input.slug,
      name: input.name,
      theme: input.theme,
      primaryColor: input.primaryColor,
      address: input.address,
      city: input.city,
      state: input.state,
      lat: input.lat,
      lng: input.lng,
      phone: "(11) 3000-0000",
      email: `contato@${input.slug}.mesapay.com.br`,
      instagram: `@${input.slug}`,
      openingHours: { seg: "11:30-23:00", ter: "11:30-23:00", qua: "11:30-23:00", qui: "11:30-00:00", sex: "11:30-01:00", sab: "11:30-01:00", dom: "11:30-18:00" },
      plan: input.plan,
      status: "ACTIVE",
      locales: ["pt-BR", "en", "es"],
    },
  });
  const rid = restaurant.id;

  await prisma.subscription.create({
    data: {
      restaurantId: rid,
      plan: input.plan,
      status: "TRIALING",
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
  });

  // Mesas em grelha para o mapa do salão.
  await prisma.table.createMany({
    data: Array.from({ length: input.tables }, (_, i) => ({
      restaurantId: rid,
      number: i + 1,
      label: i < Math.ceil(input.tables * 0.6) ? "Salão" : "Varanda",
      qrToken: generateQrToken(),
      seats: i % 3 === 0 ? 6 : i % 2 === 0 ? 2 : 4,
      mapX: (i % 5) * 160 + 40,
      mapY: Math.floor(i / 5) * 160 + 40,
    })),
  });

  // Menu
  for (const [cIdx, cat] of input.menu.entries()) {
    const category = await prisma.category.create({
      data: { restaurantId: rid, name: cat.name, nameI18n: { en: cat.en, es: cat.es }, position: cIdx },
    });
    for (const [iIdx, [name, description, price, extra]] of cat.items.entries()) {
      const item = await prisma.menuItem.create({
        data: {
          restaurantId: rid,
          categoryId: category.id,
          name,
          description: description || null,
          priceCents: toCents(price),
          station: cat.station,
          soldOut: extra?.soldOut ?? false,
          position: iIdx,
        },
      });
      for (const [gIdx, group] of (extra?.options ?? []).entries()) {
        await prisma.menuOptionGroup.create({
          data: {
            restaurantId: rid,
            menuItemId: item.id,
            name: group.name,
            minSelect: group.min,
            maxSelect: group.max,
            position: gIdx,
            options: {
              create: group.options.map(([optName, optPrice], oIdx) => ({
                restaurantId: rid,
                name: optName,
                priceCents: optPrice ? toCents(optPrice) : 0,
                position: oIdx,
              })),
            },
          },
        });
      }
    }
  }

  // Funcionários com PIN
  for (const s of input.staff) {
    await prisma.staff.create({
      data: {
        restaurantId: rid,
        name: s.name,
        role: s.role,
        pinHash: await hashPin(s.pin),
        pinLookup: pinLookup(s.pin, rid),
        permissions: [...DEFAULT_PERMISSIONS[s.role]],
      },
    });
  }

  if (input.owner) {
    await prisma.ownerUser.create({
      data: {
        restaurantId: rid,
        email: input.owner.email,
        name: input.owner.name,
        passwordHash: await hashPassword(input.owner.password),
      },
    });
  }

  const itemCount = input.menu.reduce((n, c) => n + c.items.length, 0);
  console.log(`✓ restaurante "${input.name}" (${input.slug}): ${input.tables} mesas, ${itemCount} pratos, ${input.staff.length} funcionários`);
}

/**
 * Impressoras de demonstração (idempotente: também corre em bancos já semeados).
 * Tipo "navegador": a tela Cozinha do painel imprime nelas sem instalar nada.
 */
async function ensurePrinters(slug: string, printers: { name: string; station: "KITCHEN" | "BAR" }[]) {
  const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, _count: { select: { printers: true } } } });
  if (!r || r._count.printers > 0) return;
  for (const p of printers) {
    await prisma.printer.create({
      data: { restaurantId: r.id, name: p.name, station: p.station, type: "BROWSER", width: 48, printerKey: randomToken(32) },
    });
  }
  console.log(`✓ impressoras de "${slug}": ${printers.map((p) => p.name).join(", ")}`);
}

async function main() {
  await seedSaasAdmin();

  await seedRestaurant({
    organizationName: "Grupo Esquina",
    slug: DEMO.slug,
    name: "Boteco da Esquina",
    theme: "LIGHT",
    primaryColor: "#D9480F",
    address: "Rua Augusta, 1200 — Consolação",
    city: "São Paulo",
    state: "SP",
    lat: -23.5558,
    lng: -46.6596,
    plan: "PRO",
    tables: 10,
    menu: MENU,
    staff: DEMO.staff,
    owner: { email: DEMO.ownerEmail, password: DEMO.ownerPassword, name: "Carla Mendes" },
  });

  await seedRestaurant({
    organizationName: "Café Aurora Ltda.",
    slug: "aurora",
    name: "Café Aurora",
    theme: "DARK",
    primaryColor: "#E0A458",
    address: "Rua da Bahia, 900 — Centro",
    city: "Belo Horizonte",
    state: "MG",
    lat: -19.9227,
    lng: -43.9386,
    plan: "START",
    tables: 4,
    menu: [
      {
        name: "Cafés",
        en: "Coffee",
        es: "Cafés",
        station: "BAR",
        items: [
          ["Espresso", "", "7,50"],
          ["Cappuccino", "", "14,00"],
          ["Pão de queijo", "4 unidades.", "12,00"],
        ],
      },
    ],
    staff: [{ name: "Pedro Alves", role: "WAITER", pin: "1111" }],
    owner: { email: "dono@aurora.mesapay.com.br", password: "mesapay123", name: "Lúcia Ramos" },
  });

  await ensurePrinters(DEMO.slug, [
    { name: "Cozinha", station: "KITCHEN" },
    { name: "Bar", station: "BAR" },
  ]);
  await ensurePrinters("aurora", [{ name: "Balcão", station: "BAR" }]);

  const table1 = await prisma.table.findFirst({ where: { restaurant: { slug: DEMO.slug }, number: 1 } });
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";
  console.log(`
Contas de demonstração
  Painel do restaurante  ${process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3001"}
    ${DEMO.ownerEmail} / ${DEMO.ownerPassword}
    PINs: ${DEMO.staff.map((s) => `${s.name} ${s.pin}`).join(" · ")}
  Admin SaaS             ${process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002"}
    ${DEMO.adminEmail} / ${DEMO.adminPassword}  (o 2FA é configurado no primeiro login)
  App da mesa 1          ${webUrl}/r/${DEMO.slug}/m/${table1?.qrToken ?? "?"}
`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
