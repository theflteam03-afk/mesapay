/**
 * Epson TM-m30III / TM-m30II (ePOS-Print "Server Direct Print").
 * A impressora faz POST periódico ao nosso URL:
 *   ConnectionType=GetRequest  → respondemos com o XML do ticket (ou vazio se não há nada)
 *   ConnectionType=SetResponse → ResponseFile traz o resultado (success="true|false") por printjobid
 */

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

export function eposPrintRequestXml(ticketText: string, jobId: string): string {
  const lines = ticketText.replace(/\n$/, "").split("\n");
  const [rule = "", header = "", ...rest] = lines;
  const text = (t: string, attrs = "") => `<text${attrs}>${escapeXml(t)}&#10;</text>`;
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<PrintRequestInfo Version="2.00">`,
    `<ePOSPrint>`,
    `<Parameter><devid>local_printer</devid><timeout>10000</timeout><printjobid>${escapeXml(jobId)}</printjobid></Parameter>`,
    `<PrintData>`,
    `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">`,
    `<text lang="pt"/>`,
    text(rule),
    text(header, ` dh="true" em="true"`),
    `<text dh="false" em="false"/>`,
    ...rest.map((l) => text(l)),
    `<feed line="3"/>`,
    `<cut type="feed"/>`,
    `</epos-print>`,
    `</PrintData>`,
    `</ePOSPrint>`,
    `</PrintRequestInfo>`,
  ].join("");
}

export interface EpsonJobResult {
  jobId: string;
  success: boolean;
  code: string;
}

/** Lê o ResponseFile (XML) enviado pela impressora no SetResponse. Pode trazer vários jobs. */
export function parseEpsonResponse(xml: string): EpsonJobResult[] {
  const results: EpsonJobResult[] = [];
  const blocks = xml.split(/<ePOSPrint>/i).slice(1);
  for (const b of blocks) {
    const jobId = /<printjobid>([^<]*)<\/printjobid>/i.exec(b)?.[1]?.trim();
    const resp = /<response\b([^>]*)\/?>/i.exec(b)?.[1] ?? "";
    const success = /success\s*=\s*"true"/i.test(resp);
    const code = /code\s*=\s*"([^"]*)"/i.exec(resp)?.[1] ?? "";
    if (jobId) results.push({ jobId, success, code });
  }
  return results;
}
