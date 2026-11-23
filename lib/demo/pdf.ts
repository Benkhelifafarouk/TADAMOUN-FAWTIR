/**
 * Minimal generator for a synthetic, clearly fictional utility bill PDF with a
 * real text layer. Used by the demo seed and the end-to-end test so that the
 * PDF extraction path is exercised for real (no external OCR required).
 */

export interface DemoSampleBill {
  providerLabel: string;
  reference: string;
  account: string;
  amountDzd: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  consumption: string;
  unit?: string;
}

const encoder = new TextEncoder();

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function buildBillPdf(sample: DemoSampleBill): Buffer {
  const lines = [
    `FACTURE ${sample.providerLabel}`,
    `N° Facture: ${sample.reference}`,
    `N° Client: ${sample.account}`,
    `Date de facture: ${sample.issueDate}`,
    `Date limite: ${sample.dueDate}`,
    `Periode du ${sample.periodStart} au ${sample.periodEnd}`,
    `Montant total: ${sample.amountDzd} DA`,
    `Consommation: ${sample.consumption} ${sample.unit ?? 'kWh'}`,
    'Document de demonstration - aucune valeur reelle',
  ];

  const text = lines
    .map((line, index) => `${index === 0 ? '' : '0 -24 Td\n'}${index === 0 ? 'BT\n/F1 16 Tf\n50 780 Td\n' : ''}(${escapePdfText(line)}) Tj\n`)
    .join('');

  const content = `${text}ET\n`;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

export function demoSamples(): DemoSampleBill[] {
  return [
    {
      providerLabel: 'SONELGAZ',
      reference: 'SN2026A12345',
      account: '0123456789',
      amountDzd: '8 450,00',
      issueDate: '15/10/2026',
      dueDate: '05/11/2026',
      periodStart: '01/09/2026',
      periodEnd: '30/09/2026',
      consumption: '320',
    },
    {
      providerLabel: 'ADE',
      reference: 'ADE2026W778',
      account: '0987654321',
      amountDzd: '2 300,00',
      issueDate: '18/10/2026',
      dueDate: '08/11/2026',
      periodStart: '01/09/2026',
      periodEnd: '30/09/2026',
      consumption: '14',
      unit: 'm3',
    },
    {
      providerLabel: 'ALGERIE TELECOM',
      reference: 'AT2026I556',
      account: '0551122334',
      amountDzd: '1 800,00',
      issueDate: '20/10/2026',
      dueDate: '10/11/2026',
      periodStart: '01/10/2026',
      periodEnd: '31/10/2026',
      consumption: '1',
      unit: 'mois',
    },
  ];
}
