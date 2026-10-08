import { createTranslator } from "@mesapay/i18n";

const t = createTranslator("pt-BR");

export default function TableNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("table.notFound")}</h1>
      <p className="text-muted">{t("table.notFoundHint")}</p>
    </main>
  );
}
