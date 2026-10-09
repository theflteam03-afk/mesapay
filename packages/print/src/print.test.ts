import { describe, expect, it } from "vitest";
import {
  cloudPrntPoll,
  cloudPrntSucceeded,
  encodeCp860,
  eposPrintRequestXml,
  parseEpsonResponse,
  renderTicket,
  toEscPos,
  wrap,
  type TicketData,
} from "./index";

const ticket: TicketData = {
  station: "KITCHEN",
  tableNumber: 12,
  by: { kind: "guest", name: "Ana" },
  // 23:41 UTC = 20:41 em São Paulo
  createdAt: new Date("2026-10-08T23:41:00Z"),
  timezone: "America/Sao_Paulo",
  orderNumber: 187,
  items: [
    { quantity: 2, name: "Picanha na chapa", options: [{ group: "Ponto da carne", name: "Mal passada" }], note: "sem cebola" },
    { quantity: 1, name: "Batata frita grande", options: [], note: null },
  ],
  orderNote: "trazer junto",
};

describe("ticket", () => {
  it("segue o modelo do plano (80 mm = 48 colunas)", () => {
    const text = renderTicket(ticket, 48);
    const lines = text.trimEnd().split("\n");
    expect(lines.every((l) => l.length <= 48)).toBe(true);
    expect(lines[0]).toBe("=".repeat(48));
    expect(lines[1]?.trim()).toBe("COZINHA  ·  MESA 12");
    expect(lines[3]).toMatch(/^Cliente: Ana\s+\(QR\)$/);
    expect(lines[3]).toHaveLength(48);
    expect(lines[4]).toMatch(/^08\/10\/2026 {2}20:41\s+Pedido #0187$/);
    expect(text).toContain("2x  Picanha na chapa\n    > Ponto da carne: Mal passada\n    > obs: sem cebola\n1x  Batata frita grande\n");
    expect(text).toContain("Obs do pedido: trazer junto\n");
    expect(lines.at(-1)).toBe("=".repeat(48));
  });

  it("pedido do garçom, reimpressão e papel de 58 mm", () => {
    const text = renderTicket({ ...ticket, station: "BAR", by: { kind: "staff", name: "João" }, reprint: true }, 32);
    const lines = text.trimEnd().split("\n");
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines[1]?.trim()).toBe("BAR  ·  MESA 12");
    expect(text).toContain("*** REIMPRESSÃO ***");
    expect(text).toMatch(/Garçom: João\s+\(PIN\)/);
  });

  it("quebra nomes longos com recuo", () => {
    expect(wrap("Parmegiana de frango com arroz e fritas extra crocantes", 24, "1x  ", "    ")).toEqual([
      "1x  Parmegiana de frango",
      "    com arroz e fritas",
      "    extra crocantes",
    ]);
  });
});

describe("ESC/POS", () => {
  it("acentos em PC860", () => {
    expect([...encodeCp860("Ação é çã")]).toEqual([0x41, 0x87, 0x84, 0x6f, 0x20, 0x82, 0x20, 0x87, 0x84]);
    expect([...encodeCp860("Crème brûlée ő")].at(-1)).toBe(0x6f); // sem equivalente → sem acento
    expect(new TextDecoder().decode(encodeCp860("“x” — 2×"))).toBe('"x" - 2x');
  });

  it("inicializa, escolhe PC860, cabeçalho em altura dupla, avança e corta", () => {
    const bytes = [...toEscPos(renderTicket(ticket))];
    expect(bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 3]);
    const headerStart = bytes.indexOf(0x21, 5);
    expect(bytes.slice(headerStart - 1, headerStart + 2)).toEqual([0x1b, 0x21, 0x18]);
    expect(bytes.slice(-7)).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
    const asText = String.fromCharCode(...bytes);
    expect(asText).toContain("Cliente: Ana");
    expect(asText).toContain("Picanha na chapa");
  });
});

describe("Epson Server Direct Print", () => {
  it("gera o XML do pedido com o id do job e escapa o texto", () => {
    const xml = eposPrintRequestXml(renderTicket({ ...ticket, orderNote: "sem <sal> & pimenta" }), "job_1");
    expect(xml).toContain("<printjobid>job_1</printjobid>");
    expect(xml).toContain('<text dh="true" em="true">');
    expect(xml).toContain("sem &lt;sal&gt; &amp; pimenta");
    expect(xml).toContain('<cut type="feed"/>');
  });

  it("lê o resultado enviado pela impressora", () => {
    const xml = `<?xml version="1.0"?><PrintResponseInfo Version="2.00">
      <ePOSPrint><Parameter><devid>local_printer</devid><printjobid>job_1</printjobid></Parameter>
      <PrintResponse><response success="true" code="" status="251658262" battery="0"/></PrintResponse></ePOSPrint>
      <ePOSPrint><Parameter><devid>local_printer</devid><printjobid>job_2</printjobid></Parameter>
      <PrintResponse><response success="false" code="EPTR_REC_EMPTY" status="0"/></PrintResponse></ePOSPrint>
    </PrintResponseInfo>`;
    expect(parseEpsonResponse(xml)).toEqual([
      { jobId: "job_1", success: true, code: "" },
      { jobId: "job_2", success: false, code: "EPTR_REC_EMPTY" },
    ]);
  });
});

describe("Star CloudPRNT", () => {
  it("resposta ao polling e códigos de resultado", () => {
    expect(cloudPrntPoll(null)).toEqual({ jobReady: false });
    expect(cloudPrntPoll("j1")).toEqual({ jobReady: true, mediaTypes: ["text/plain"], jobToken: "j1" });
    expect(cloudPrntSucceeded("200 OK")).toBe(true);
    expect(cloudPrntSucceeded("211 Partial")).toBe(true);
    expect(cloudPrntSucceeded("520 Paper empty")).toBe(false);
    expect(cloudPrntSucceeded(null)).toBe(false);
  });
});
