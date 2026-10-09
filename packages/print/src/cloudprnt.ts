/**
 * Star Micronics CloudPRNT (mC-Print3, TSP100IV…). Protocolo em 3 passos sobre o mesmo URL:
 *   POST   → a impressora pergunta "há trabalho?"; respondemos { jobReady, mediaTypes, jobToken }
 *   GET    → descarrega o ticket (?type=text/plain&token=...)
 *   DELETE → confirma o resultado (?code=200%20OK&token=...); códigos 2xx = impresso
 */

export const CLOUDPRNT_MEDIA_TYPE = "text/plain";

export interface CloudPrntPollResponse {
  jobReady: boolean;
  mediaTypes?: string[];
  jobToken?: string;
}

export function cloudPrntPoll(jobId: string | null): CloudPrntPollResponse {
  return jobId ? { jobReady: true, mediaTypes: [CLOUDPRNT_MEDIA_TYPE], jobToken: jobId } : { jobReady: false };
}

/** "200 OK", "200", "211 ..." → impresso; "5xx"/"4xx" → falhou. */
export function cloudPrntSucceeded(code: string | null | undefined): boolean {
  return !!code && /^2\d\d/.test(code.trim());
}
