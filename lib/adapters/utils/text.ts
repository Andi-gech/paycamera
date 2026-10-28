export const REFERENCE_STOP_WORDS = new Set([
  'ACCOUNT', 'TRANSFER', 'PAYMENT', 'DONATION', 'CUSTOMER', 'RECEIPT',
  'TRANSACTION', 'NARRATIVE', 'REASON', 'MOBILE', 'BANKING', 'BRANCH',
  'SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', 'FAILED', 'PENDING', 'CANCELLED',
  'DEPOSIT', 'WITHDRAWAL', 'SERVICE', 'CHARGE', 'COMMISSION', 'TOTAL', 'AMOUNT',
  'SAVING', 'CURRENT', 'CHECKING', 'DETAILS', 'DETAIL', 'NUMBER', 'REFERENCE',
  'ABYSSINIA', 'COMMERCIAL', 'ETHIOPIA', 'TELEBIRR', 'DASHEN', 'AWASH', 'ZAMZAM',
  'STATUS', 'CREDIT', 'DEBIT', 'INVOICE', 'TELECOM', 'METHOD', 'DATE',
  'TIME', 'TYPE', 'PAID', 'PAYER', 'RECEIVER', 'BENEFICIARY', 'SENDER',
  'AGENT', 'SYSTEM', 'CONFIRMATION', 'VERIFY', 'VERIFICATION', 'GETDETAILS', 'SLIP',
  'DEPOSITOR', 'DISCLAIMER', 'DEPARTMENT', 'DELIVERIES', 'COMPANY', 'INFORMATION',
  'FINISHED', 'DOWNLOAD', '0000030100', '0000006966'
]);

export function normalizeBank(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === 'telebirr') return 'telebirr';
  if (v === 'cbe legacy' || v === 'cbe-legacy' || v === 'legacy cbe') return 'cbe-legacy';
  if (v === 'cbe' || v === 'commercial bank of ethiopia') return 'cbe';
  if (v.includes('abyssinia') || v === 'boa') return 'boa';
  if (v.includes('dashen')) return 'dashen';
  if (v.includes('awash')) return 'awash';
  if (v.includes('m-pesa') || v === 'mpesa') return 'mpesa';
  if (v.includes('amole')) return 'amole';
  if (v.includes('zamzam')) return 'zamzam';
  if (v.includes('ebirr') && !v.includes('cbe')) return 'ebirr';
  if (v.includes('cbe birr')) return 'cbebirr';
  if (v.includes('bunna')) return 'bunna';
  if (v === 'other') return 'other';
  return v;
}

export function isValidReference(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/[^A-Za-z0-9-]/g, '').trim().toUpperCase();
  if (clean.length < 6 || clean.length > 40) return false;
  if (REFERENCE_STOP_WORDS.has(clean)) return false;
  if (!/\d/.test(clean)) return false;
  return true;
}

export function normalizeAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,\s]/g, '').replace(/^(ETB|BIRR)/i, '');
    const match = cleaned.match(/-?\d+(?:\.\d{1,2})?/);
    if (match) {
      const n = Number(match[0]);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

export function findJsonValue(root: unknown, keys: string[]): unknown {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const seen = new Set<object>();
  function walk(value: unknown): unknown {
    if (!value || typeof value !== 'object') return undefined;
    if (seen.has(value as object)) return undefined;
    seen.add(value as object);
    const obj = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(obj)) {
      if (wanted.has(key.toLowerCase()) && child !== null && child !== undefined && child !== '') return child;
    }
    for (const child of Object.values(obj)) {
      const found = walk(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return walk(root);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractUrl(text: string): string {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0]?.replace(/[),.;]+$/, '') ?? '';
}

export function extractAmount(text: string): string {
  const labeledPatterns = [
    /(?:total\s*paid\s*amount|total\s*amount\s*paid|ጠቅላላ\s*የተከፈለ)[^0-9]{0,25}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:settled\s*amount|የተከፈለው\s*መጠን)[^0-9]{0,25}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:transferred\s*amount|transfer\s*amount|amount\s*transferred)[^0-9]{0,25}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:total\s*debited\s*amount|total\s*debited|total\s*amount)[^0-9]{0,25}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:transaction\s*amount|amount\s*paid|paid\s*amount)[^0-9]{0,25}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:credited\s*amount)[^0-9]{0,25}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?<!service\s*|fee\s*|charge\s*|vat\s*|discount\s*)\bamount\b[^0-9]{0,25}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const val = match[1].replace(/,/g, '');
      const num = Number(val);
      if (Number.isFinite(num) && num > 0) {
        return val;
      }
    }
  }

  const currencyRegex =
    /(?:(?:\(\s*)?(?:ETB|ETE|ET8|ETP|Birr|B1rr|ብር)(?:\s*\))?)\s*[-+]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|[-+]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\(\s*)?(?:ETB|ETE|ET8|ETP|Birr|B1rr|ብር)(?:\s*\))?/gi;
  let currMatch: RegExpExecArray | null;
  const nonZeroCandidates: string[] = [];
  while ((currMatch = currencyRegex.exec(text)) !== null) {
    const rawVal = currMatch[1] ?? currMatch[2];
    if (rawVal) {
      const cleanVal = rawVal.replace(/,/g, '');
      const num = Number(cleanVal);
      const matchIndex = currMatch.index;
      const preceding = text.slice(Math.max(0, matchIndex - 30), matchIndex).toLowerCase();
      const isFee = /(?:fee|charge|vat|tax|discount|ኮሚሽን)/.test(preceding);
      if (!isFee && Number.isFinite(num) && num > 0) {
        return cleanVal;
      }
      if (Number.isFinite(num) && num > 0) {
        nonZeroCandidates.push(cleanVal);
      }
    }
  }

  if (nonZeroCandidates.length > 0) {
    return nonZeroCandidates[0];
  }

  return '';
}

