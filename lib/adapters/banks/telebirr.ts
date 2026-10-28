/*
 * telebirr.ts
 *
 * Strict Telebirr receipt verification and adapter for React Native / Expo.
 *
 * Security rule:
 * The app NEVER accepts a user-entered amount as proof.
 *
 * It compares:
 *   screenshot/QR reference  === official reference
 *   screenshot/OCR amount    === official amount
 *   official status           === successful/completed/settled
 *
 * OCR-only results are never "confirmed".
 */

import { decode as decodeBase64 } from 'base-64';
import { BankAdapter, CheckOutcome, VerificationArgs } from '../types';
import { extractAmount as extractAmountFromUtil } from '../utils/text';
import {
  OfficialTelebirrReceipt,
  parseOfficialTelebirrHtml,
  isCloudflareChallenge,
} from '../../../src/providers/telebirrOfficialScraper';

export {
  OfficialTelebirrReceipt,
  parseOfficialTelebirrHtml,
};

export type VerificationState =
  | 'extracted'
  | 'confirmed'
  | 'mismatch'
  | 'issuer_unavailable'
  | 'needs_review';

export type TelebirrState = VerificationState;

export type ReceiptSource =
  | 'local-ocr'
  | 'local-qr'
  | 'official-issuer-response';

export type TelebirrReceipt = {
  provider: 'telebirr';
  reference: string | null;
  amount: number | null;
  currency: 'ETB' | 'UNKNOWN';
  status: string | null;
  paymentDate: string | null;
  payerName: string | null;
  payerPhone: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  serviceFee: number | null;
  totalPaidAmount: number | null;
  source: ReceiptSource;
};

export type TelebirrResult = {
  state: VerificationState;
  title: string;
  detail: string;
  screenshotReceipt: TelebirrReceipt | null;
  officialReceipt: OfficialTelebirrReceipt | null;
  receipt: TelebirrReceipt | null;
  matchedFields: string[];
  failedFields: string[];
  url?: string;
};

export type TelebirrExpected = {
  reference?: string;
  amount?: number;
  receiverName?: string;
  receiverAccount?: string;
  requireCompletedStatus?: boolean;
};

const OFFICIAL_HOST = 'transactioninfo.ethiotelecom.et';
const DEFAULT_TIMEOUT_MS = 20_000;

/*
 * Telebirr references are commonly 10 alphanumeric characters.
 * We additionally require at least one digit and reject ordinary labels.
 */
const REFERENCE_TOKEN_RE = /\b[A-Z0-9]{10}\b/gi;
// Telebirr reference codes start predominantly with C or D, followed by alphanumeric characters.
const TELEBIRR_REFERENCE_RE = /^[CD][A-Z0-9]{9}$/i;
export const REFERENCE_STOP_WORDS = new Set([
  'CLOUDFLARE',
  'SUCCESSFUL',
  'SUCCESS',
  'COMPLETED',
  'COMPLETE',
  'FAILED',
  'PENDING',
  'CANCELLED',
  'RECEIPT',
  'REFERENCE',
  'TRANSACTION',
  'TELEBIRR',
  'AMOUNT',
  'STATUS',
  'TRANSFER',
  'FINISHED',
  'DOWNLOAD',
  'CUSTOMER',
  'SETTLED',
]);

export const TELEBIRR_STOP_WORDS = REFERENCE_STOP_WORDS;

const SUCCESS_STATUS_RE =
  /\b(successful|success|completed|complete|settled|successful payment)\b/i;

const CURRENCY_AMOUNT_RE =
  /(?:([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:ETB|Birr|ብር)|(?:ETB|Birr|ብር)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?))/gi;

function clean(value: unknown): string {
  return String(value ?? '').replace(/[ \t]+/g, ' ').trim();
}

function upper(value: unknown): string {
  return clean(value).toUpperCase();
}

export function normalizeReference(value: unknown): string {
  return upper(value).replace(/[^A-Z0-9]/g, '');
}

export function normalizeName(value: unknown): string {
  return clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9\u1200-\u137F ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeOcrText(text: string): string {
  return String(text ?? '')
    .replace(/\bpaod\b/gi, 'paid')
    .replace(/\bpa1d\b/gi, 'paid')
    .replace(/\bpald\b/gi, 'paid')
    .replace(/\bsett1ed\b/gi, 'settled')
    .replace(/\bam0unt\b/gi, 'amount')
    .replace(/\bt0tal\b/gi, 'total')
    .replace(/\bETE\b/gi, 'ETB')
    .replace(/\bET8\b/gi, 'ETB')
    .replace(/\bETP\b/gi, 'ETB')
    .replace(/\bETR\b/gi, 'ETB')
    .replace(/\bEIB\b/gi, 'ETB')
    .replace(/\bELB\b/gi, 'ETB')
    .replace(/\bFTB\b/gi, 'ETB')
    .replace(/\bBTB\b/gi, 'ETB')
    .replace(/\bB1rr\b/gi, 'Birr');
}

export function isValidTelebirrReference(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  const reference = normalizeReference(value);
  if (reference.length !== 10) return false;
  if (!/\d/.test(reference)) return false;
  if (REFERENCE_STOP_WORDS.has(reference)) return false;

  return /^[A-Z0-9]{10}$/.test(reference);
}

export const isValidCandidate = isValidTelebirrReference;

export function normalizeAmountText(value: unknown): number | null {
  const text = clean(value)
    .replace(/[Oo]/g, '0')
    .replace(/,/g, '');
  const match = text.match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Allowed difference between the screenshot amount and the official amount,
 * in ETB. Screenshots usually show "Total Paid Amount" (settled amount +
 * service fee + VAT), while the comparison may read "Settled Amount", so
 * small fee differences (commonly 1–2 Birr) must not fail an otherwise
 * matching receipt. Set to 0 for strict equality.
 */
export const TELEBIRR_AMOUNT_TOLERANCE_ETB = 2;

export function sameAmount(
  screenshotAmount: number | null,
  officialAmount: number | null,
): boolean {
  if (screenshotAmount === null || officialAmount === null) {
    return false;
  }

  const difference =
    Math.round(Math.abs(screenshotAmount - officialAmount) * 100) / 100;

  return difference <= TELEBIRR_AMOUNT_TOLERANCE_ETB;
}


export function sameReference(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;

  const normalize = (value: string) =>
    value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  return normalize(a) === normalize(b);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineValueAfterLabel(text: string, labels: string[]): string | null {
  const lines = String(text ?? '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(clean)
    .filter(Boolean);

  for (const line of lines) {
    for (const label of labels) {
      const pattern = new RegExp(
        `${escapeRegExp(label)}\\s*[:#\\-]?\\s*(.*)$`,
        'i',
      );
      const match = line.match(pattern);
      if (match?.[1]) {
        const value = clean(match[1]);
        if (value) return value;
      }
    }
  }

  // OCR extraction sometimes puts the label and value on adjacent lines.
  for (let index = 0; index < lines.length; index += 1) {
    for (const label of labels) {
      if (new RegExp(`^${escapeRegExp(label)}$`, 'i').test(lines[index])) {
        return lines[index + 1] ?? null;
      }
    }
  }

  return null;
}

function extractReference(text: string): string | null {
  const labels = [
    'Transaction Number',
    'Transaction No',
    'Transaction Reference',
    'Receipt Number',
    'Receipt No',
    'Reference',
    'የደረሰኝ ቁጥር',
    'የግብይት ቁጥር',
  ];

  const lines = String(text ?? '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(clean)
    .filter(Boolean);

  // Strategy 1: Check inline label-value pairs
  for (const line of lines) {
    for (const label of labels) {
      const regex = new RegExp(`${escapeRegExp(label)}[\\s:#\\-]*([A-Z0-9]{10})\\b`, 'i');
      const match = line.match(regex);
      if (match?.[1] && isValidTelebirrReference(match[1])) {
        return upper(match[1]);
      }
    }
  }

  // Strategy 2: Check adjacent lines below label (handles columnar OCR)
  for (let i = 0; i < lines.length; i++) {
    const isLabel = labels.some((l) => new RegExp(`^${escapeRegExp(l)}[\\s:#\\-]*$`, 'i').test(lines[i]));
    if (isLabel) {
      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
        const tokenMatch = lines[j].match(/\b([A-Z0-9]{10})\b/i);
        if (tokenMatch?.[1] && isValidTelebirrReference(tokenMatch[1])) {
          return upper(tokenMatch[1]);
        }
      }
    }
  }

  // Strategy 3: Search whole text prioritizing Telebirr starting formats (C... or D...)
  const allTokens = (text.match(REFERENCE_TOKEN_RE) ?? []).map(upper);
  for (const token of allTokens) {
    if (isValidTelebirrReference(token) && TELEBIRR_REFERENCE_RE.test(token)) {
      return token;
    }
  }

  // Strategy 4: Fallback to any valid 10-char reference
  for (const token of allTokens) {
    if (isValidTelebirrReference(token)) {
      return token;
    }
  }

  return null;
}

export const firstReference = extractReference;

function isFeeOrVatText(value: string): boolean {
  return /(service\s*fee|transfer\s*fee|fee|commission|charge|vat|tax|excise|discount|ኮሚሽን|ቫት|ተ\.እ\.ታ|ታክስ|ግብር)/i.test(value);
}

function amountFromLine(line: string): number | null {
  // Normalize dashes (hyphen, en-dash, em-dash, minus sign)
  const normalized = String(line ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/,/g, '')
    .trim();

  // Pattern matching: optional minus, digits with optional decimals, optional spaces/parens, currency
  const CURRENCY_PATTERN = '(?:ETB|ETE|ET8|ETP|ETR|ETD|EIB|ELB|E1B|FTB|BTB|Birr|B1rr|ብር|ብ|ET)';

  // Case 1: -302.00 (ETB) or 8008.00 ETB
  const afterMatch = normalized.match(
    new RegExp(`[-+]?\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:\\(\\s*)?${CURRENCY_PATTERN}(?:\\s*\\))?`, 'i')
  );
  if (afterMatch?.[1]) {
    const val = parseFloat(afterMatch[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }

  // Case 2: (ETB) -302.00 or ETB 8008.00
  const beforeMatch = normalized.match(
    new RegExp(`(?:\\(\\s*)?${CURRENCY_PATTERN}(?:\\s*\\))?\\s*[-+]?\\s*([0-9]+(?:\\.[0-9]{1,2})?)`, 'i')
  );
  if (beforeMatch?.[1]) {
    const val = parseFloat(beforeMatch[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }

  return null;
}

function extractAmount(text: string): number | null {
  const lines = String(text ?? '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(clean)
    .filter(Boolean);

  // 1. Primary path: look directly for the main prominent amount (e.g. "-302.00 (ETB)")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFeeOrVatText(line)) continue;

    // Direct match on line
    const directAmount = amountFromLine(line);
    if (directAmount !== null) return directAmount;

    // Split line OCR: Line i is "-8,008.00" and line i+1 is "(ETB)"
    if (i < lines.length - 1) {
      const combined = `${line} ${lines[i + 1]}`;
      if (!isFeeOrVatText(combined)) {
        const combinedAmount = amountFromLine(combined);
        if (combinedAmount !== null) return combinedAmount;
      }
    }
  }

  // 2. Secondary path: line with explicit "Paid Amount" / "Settled Amount" labels
  const paidLabels = [
    'Settled Amount',
    'Amount Settled',
    'Total Paid Amount',
    'Total Paid',
    'Paid Amount',
    'Amount Paid',
    'የተከፈለው መጠን',
    'ጠቅላላ የተከፈለ',
  ];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    if (isFeeOrVatText(current)) continue;

    const hasLabel = paidLabels.some((lbl) => new RegExp(escapeRegExp(lbl), 'i').test(current));
    if (hasLabel) {
      const inlineAmt = amountFromLine(current);
      if (inlineAmt !== null) return inlineAmt;

      for (const next of lines.slice(i + 1, i + 3)) {
        if (isFeeOrVatText(next)) break;
        const nextAmt = amountFromLine(next);
        if (nextAmt !== null) return nextAmt;
      }
    }
  }

  // 3. Fallback: isolated decimal number near "Successful" status
  for (const line of lines) {
    if (isFeeOrVatText(line) || /^\d{1,2}[:/]\d{1,2}/.test(line)) continue; // skip time/dates
    const cleanNum = line.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/,/g, '');
    const match = cleanNum.match(/^[+-]?\s*(\d+\.\d{2})\b/);
    if (match?.[1]) {
      const val = parseFloat(match[1]);
      if (Number.isFinite(val) && val > 0) return val;
    }
  }

  return null;
}
function extractDate(text: string): string | null {
  const labelled = lineValueAfterLabel(text, [
    'Payment Date',
    'Transaction Date',
    'Date',
    'የክፍያ ቀን',
  ]);
  const candidate = labelled ?? text;
  const match = candidate.match(
    /\d{1,2}[-/]\d{1,2}[-/]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/,
  );
  return match?.[0] ?? null;
}

function extractStatus(text: string): string | null {
  return lineValueAfterLabel(text, [
    'Transaction Status',
    'Payment Status',
    'Status',
    'የክፍያው ሁኔታ',
  ]);
}

function extractTelebirrFields(text: string, source: ReceiptSource): TelebirrReceipt {
  const receiverName = lineValueAfterLabel(text, [
    'Credited Party Name',
    'Receiver Name',
    'Receiver',
    'የገንዘብ ተቀባይ ስም',
    'ተከፋይ',
  ]);

  const receiverAccount = lineValueAfterLabel(text, [
    'Credited Party Account No',
    'Receiver Account',
    'Receiver Telebirr No',
    'የገንዘብ ተቀባይ ቴሌብር ቁ.',
  ]);

  const payerName = lineValueAfterLabel(text, [
    'Payer Name',
    'Payer',
    'የከፋይ ስም',
  ]);

  const payerPhone = lineValueAfterLabel(text, [
    'Payer Telebirr No',
    'Payer Phone',
    'የከፋይ ቴሌብር ቁ.',
  ]);

  const totalPaidText = lineValueAfterLabel(text, [
    'Total Paid Amount',
    'Total Paid',
    'ጠቅላላ የተከፈለ',
  ]);

  const feeText = lineValueAfterLabel(text, [
    'Service Fee',
    'Service fee',
    'የአገልግሎት ክፍያ',
  ]);

  const amount = extractAmount(text);

  return {
    provider: 'telebirr',
    reference: extractReference(text),
    amount,
    currency: amount === null ? 'UNKNOWN' : 'ETB',
    status: extractStatus(text),
    paymentDate: extractDate(text),
    payerName,
    payerPhone,
    receiverName,
    receiverAccount,
    serviceFee: feeText ? normalizeAmountText(feeText) : null,
    totalPaidAmount: totalPaidText ? normalizeAmountText(totalPaidText) : null,
    source,
  };
}

/**
 * Extract the screenshot/QR receipt locally.
 * This result is not proof of payment.
 */
export function extractTelebirrReceipt(
  rawText: string,
  source: 'local-ocr' | 'local-qr' = 'local-ocr',
): TelebirrResult {
  console.log(rawText)
  const normalized = source === 'local-ocr' ? normalizeOcrText(rawText) : rawText;
  const text = String(normalized ?? '').trim();
  if (!text) {
    return {
      state: 'needs_review',
      title: 'No receipt text found',
      detail: 'Capture a clearer receipt or scan the Telebirr QR code.',
      screenshotReceipt: null,
      officialReceipt: null,
      receipt: null,
      matchedFields: [],
      failedFields: ['reference', 'amount'],
    };
  }

  const screenshotReceipt = extractTelebirrFields(text, source);
  const failedFields: string[] = [];
  if (!screenshotReceipt.reference) failedFields.push('reference');
  if (screenshotReceipt.amount === null) failedFields.push('amount');

  console.log('[TELEBIRR OCR] Source:', source);
  console.log('[TELEBIRR OCR] Extracted Reference:', screenshotReceipt.reference ?? '(not found)');
  console.log('[TELEBIRR OCR] Extracted Amount:   ', screenshotReceipt.amount !== null ? `${screenshotReceipt.amount} ETB` : '(not found)');
  console.log('[TELEBIRR OCR] Status:             ', screenshotReceipt.status ?? '(none)');
  console.log('[TELEBIRR OCR] Payer:              ', screenshotReceipt.payerName ?? '(none)');
  console.log('[TELEBIRR OCR] Receiver:           ', screenshotReceipt.receiverName ?? '(none)');

  if (failedFields.length > 0) {
    return {
      state: 'needs_review',
      title: 'Screenshot needs review',
      detail: `The screenshot does not contain a confidently readable ${failedFields.join(' and ')}. No verification decision was made.`,
      screenshotReceipt,
      officialReceipt: null,
      receipt: screenshotReceipt,
      matchedFields: [],
      failedFields,
    };
  }

  return {
    state: 'extracted',
    title: 'Receipt read from screenshot',
    detail: 'The reference and paid amount were extracted locally. The payment is not confirmed until they match the official Telebirr receipt.',
    screenshotReceipt,
    officialReceipt: null,
    receipt: screenshotReceipt,
    matchedFields: [],
    failedFields: [],
  };
}

export function buildOfficialTelebirrUrl(reference: string): string {
  return `https://${OFFICIAL_HOST}/receipt/${encodeURIComponent(reference)}`;
}

/**
 * Compare the screenshot against Telebirr's official public receipt page.
 * Uses Cheerio to parse raw HTML independently.
 * No user-entered amount is accepted.
 */
export async function verifyTelebirrReceipt(
  screenshotReceipt: TelebirrReceipt,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TelebirrResult> {
  if (screenshotReceipt.source === 'official-issuer-response') {
    return {
      state: 'needs_review',
      title: 'Invalid verification input',
      detail: 'Verification requires a receipt extracted from the screenshot or QR code.',
      screenshotReceipt,
      officialReceipt: null,
      receipt: screenshotReceipt,
      matchedFields: [],
      failedFields: [],
    };
  }

  // Security checks: OCR amount and reference must both be present
  if (!screenshotReceipt.reference || screenshotReceipt.amount === null) {
    return {
      state: 'needs_review',
      title: 'Screenshot amount or reference is unreadable',
      detail: 'The app cannot verify this receipt until both the screenshot reference and screenshot paid amount are readable.',
      screenshotReceipt,
      officialReceipt: null,
      receipt: screenshotReceipt,
      matchedFields: [],
      failedFields: [
        ...(!screenshotReceipt.reference ? ['reference'] : []),
        ...(screenshotReceipt.amount === null ? ['amount'] : []),
      ],
    };
  }

  const reference = normalizeReference(screenshotReceipt.reference);
  if (!isValidTelebirrReference(reference)) {
    return {
      state: 'needs_review',
      title: 'Invalid Telebirr reference',
      detail: 'The screenshot reference is not a valid 10-character Telebirr reference.',
      screenshotReceipt,
      officialReceipt: null,
      receipt: screenshotReceipt,
      matchedFields: [],
      failedFields: ['reference'],
    };
  }

  const url = buildOfficialTelebirrUrl(reference);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/122 Mobile Safari/537.36',
      },
      signal: controller.signal,
    });
  } catch (error) {
    console.error('[Telebirr Network Error]:', error);
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /abort|timeout/i.test(message);
    return {
      state: 'issuer_unavailable',
      title: 'Telebirr check unavailable',
      detail: timedOut
        ? 'The official Telebirr endpoint timed out. Try again later.'
        : 'The phone could not contact the official Telebirr endpoint. This is not proof that the screenshot is fake.',
      screenshotReceipt,
      officialReceipt: null,
      receipt: screenshotReceipt,
      matchedFields: [],
      failedFields: [],
      url,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      state: 'issuer_unavailable',
      title: 'Telebirr issuer unavailable',
      detail: `The official Telebirr endpoint returned HTTP ${response.status}. This is not proof that the screenshot is fake.`,
      screenshotReceipt,
      officialReceipt: null,
      receipt: screenshotReceipt,
      matchedFields: [],
      failedFields: [],
      url,
    };
  }

  let html: string;
  try {
    html = await response.text();
  } catch (error) {
    console.error('[Telebirr Body Read Error]:', error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      state: 'issuer_unavailable',
      title: 'Telebirr check unavailable',
      detail: `Failed to read response body: ${message}`,
      screenshotReceipt,
      officialReceipt: null,
      receipt: screenshotReceipt,
      matchedFields: [],
      failedFields: [],
      url,
    };
  }

  try {
    /*
     * Detect Cloudflare challenge / block pages (e.g. "Just a moment...").
     * Those responses contain no receipt, so treat the issuer as
     * unavailable instead of trying to parse the challenge markup.
     */
    if (isCloudflareChallenge(html)) {
      return {
        state: 'issuer_unavailable',
        title: 'Telebirr issuer unavailable',
        detail:
          'The official Telebirr page is currently showing an anti-bot challenge instead of the receipt. Wait a minute and try again.',
        screenshotReceipt,
        officialReceipt: null,
        receipt: screenshotReceipt,
        matchedFields: [],
        failedFields: [],
        url,
      };
    }

    // Parse raw HTML with Cheerio (never stripHtml!)
    const officialReceipt = parseOfficialTelebirrHtml(html);

    if (officialReceipt.amount === null) {
      return {
        state: 'issuer_unavailable',
        title: 'Official receipt could not be read',
        detail: 'Telebirr responded, but the official paid amount could not be safely extracted from the receipt table.',
        screenshotReceipt,
        officialReceipt,
        receipt: screenshotReceipt,
        matchedFields: [],
        failedFields: ['amount'],
        url,
      };
    }

    const matchedFields: string[] = [];
    const failedFields: string[] = [];

    const refMatched = sameReference(screenshotReceipt.reference, officialReceipt.reference ?? reference);
    if (refMatched) matchedFields.push('reference');
    else failedFields.push('reference');

    const matchesChosenAmount = sameAmount(screenshotReceipt.amount, officialReceipt.amount);
    const matchesSettledAmount = sameAmount(screenshotReceipt.amount, officialReceipt.settledAmount);
    const matchesTotalPaid = sameAmount(screenshotReceipt.amount, officialReceipt.totalPaidAmount);

    const amountMatched = matchesChosenAmount || matchesSettledAmount || matchesTotalPaid;

    if (amountMatched) {
      matchedFields.push('amount');
      if (matchesTotalPaid && officialReceipt.totalPaidAmount !== null) {
        officialReceipt.amount = officialReceipt.totalPaidAmount;
      } else if (matchesSettledAmount && officialReceipt.settledAmount !== null) {
        officialReceipt.amount = officialReceipt.settledAmount;
      }
    } else {
      failedFields.push('amount');
    }

    const amountToleranceUsed =
      amountMatched &&
      Math.round(Math.abs((screenshotReceipt.amount ?? 0) - (officialReceipt.amount ?? 0)) * 100) / 100 > 0;

    const statusValid = SUCCESS_STATUS_RE.test(officialReceipt.status ?? '');
    if (statusValid) matchedFields.push('status');
    else failedFields.push('status');

    const screenshotAmountStr = `${(screenshotReceipt.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;
    const officialAmountStr = `${(officialReceipt.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

    if (!refMatched || !amountMatched || !statusValid) {
      const resultLabel = 'Screenshot does not match Telebirr';
      const detail = `Screenshot amount: ${screenshotAmountStr}\nOfficial amount: ${officialAmountStr}\nResult: ${resultLabel}`;

      return {
        state: 'mismatch',
        title: resultLabel,
        detail,
        screenshotReceipt,
        officialReceipt,
        receipt: screenshotReceipt,
        matchedFields,
        failedFields,
        url,
      };
    }

    return {
      state: 'confirmed',
      title: 'Confirmed by Telebirr',
      detail: `Screenshot amount: ${screenshotAmountStr}\nOfficial amount: ${officialAmountStr}\nReference: matched\nStatus: ${officialReceipt.status ?? 'completed'}\nResult: Confirmed by Telebirr${amountToleranceUsed ? `\nAmount difference: ${Math.abs((screenshotReceipt.amount ?? 0) - (officialReceipt.amount ?? 0)).toFixed(2)} ETB (within the ${TELEBIRR_AMOUNT_TOLERANCE_ETB.toFixed(2)} ETB fee tolerance)` : ''}`,
      screenshotReceipt,
      officialReceipt,
      receipt: screenshotReceipt,
      matchedFields,
      failedFields: [],
      url,
    };
  } catch (parseError) {
    console.error('[Telebirr Verify Parsing Error]:', parseError);
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    return {
      state: 'needs_review',
      title: 'Receipt parsing error',
      detail: `Telebirr endpoint responded, but parsing the receipt failed: ${message}`,
      screenshotReceipt,
      officialReceipt: null,
      receipt: screenshotReceipt,
      matchedFields: [],
      failedFields: [],
      url,
    };
  }
}

/**
 * Confirm a locally extracted receipt against the official Telebirr receipt page.
 */
export async function confirmTelebirrReceipt(args: {
  extracted: TelebirrReceipt;
  expected?: TelebirrExpected;
  timeoutMs?: number;
}): Promise<TelebirrResult> {
  return verifyTelebirrReceipt(args.extracted, args.timeoutMs);
}

/**
 * One-call helper for an OCR or QR string.
 * Set verifyOnline=false for offline extraction only.
 */
export async function readTelebirrReceipt(
  rawText: string,
  options: {
    source?: 'local-ocr' | 'local-qr';
    verifyOnline?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<TelebirrResult> {
  const extracted = extractTelebirrReceipt(
    rawText,
    options.source ?? 'local-ocr',
  );

  if (!options.verifyOnline) return extracted;
  if (!extracted.screenshotReceipt) return extracted;

  return verifyTelebirrReceipt(
    extracted.screenshotReceipt,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
}

export async function readAndOptionallyConfirmTelebirr(args: {
  text: string;
  source?: 'local-ocr' | 'local-qr';
  expected?: TelebirrExpected;
  confirmOnline?: boolean;
}): Promise<TelebirrResult> {
  const local = extractTelebirrReceipt(args.text, args.source ?? 'local-ocr');
  if (!args.confirmOnline || !local.screenshotReceipt?.reference) return local;
  return confirmTelebirrReceipt({ extracted: local.screenshotReceipt, expected: args.expected });
}

// ---------------------------------------------------------------------------
// QR & Reference Extractors
// ---------------------------------------------------------------------------

export function extractTelebirrReference(text: string): string {
  return extractReference(text) ?? '';
}

export function crc16CcittFalse(text: string): number {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function decodeTelebirrQr(qrText: string): string {
  try {
    const input = qrText.trim();
    if (!input || input.length > 4096) return '';

    const directReference = extractReference(input);
    if (directReference) return directReference;

    try {
      const parsedUrl = new URL(input);
      const urlReference = extractReference(decodeURIComponent(parsedUrl.pathname));
      if (urlReference) return urlReference;

      const queryReference = extractReference(
        `${parsedUrl.searchParams.get('transactionno') ?? ''} ${parsedUrl.searchParams.get('transactionNo') ?? ''
        } ${parsedUrl.searchParams.get('reference') ?? ''}`
      );
      if (queryReference) return queryReference;
    } catch { }

    let decodedHex = '';
    if (/^(?:[0-9a-fA-F]{4})+$/.test(input)) {
      decodedHex = input;
    } else {
      let normalized = input
        .replace(/\s/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .replace(/=+$/, '');

      if (!/^[A-Za-z0-9+/]*$/.test(normalized)) return '';
      if (normalized.length % 4 === 1) return '';

      normalized += '='.repeat((4 - (normalized.length % 4)) % 4);
      const decoded = decodeBase64(normalized);
      if (!/^[0-9a-fA-F]+$/.test(decoded)) return '';
      decodedHex = decoded;
    }

    if (
      decodedHex.length > 1024 ||
      decodedHex.length % 2 !== 0 ||
      !/^[0-9a-fA-F]+$/.test(decodedHex)
    ) {
      return '';
    }

    const entries: Array<{ tag: string; value: string; start: number }> = [];
    let position = 0;

    while (position < decodedHex.length) {
      if (position + 4 > decodedHex.length) return '';
      const tag = decodedHex.slice(position, position + 2).toUpperCase();
      const lengthText = decodedHex.slice(position + 2, position + 4);
      if (!/^\d{2}$/.test(lengthText)) return '';

      const length = Number(lengthText);
      const valueStart = position + 4;
      const valueEnd = valueStart + length;
      if (length === 0 || valueEnd > decodedHex.length) return '';

      entries.push({ tag, value: decodedHex.slice(valueStart, valueEnd), start: position });
      if (entries.length > 32) return '';
      position = valueEnd;
    }

    const checksum = entries[entries.length - 1];
    if (!checksum || checksum.tag !== '63' || checksum.value.length !== 4) return '';

    const crcInput = decodedHex.slice(0, checksum.start + 4);
    const expectedCrc = parseInt(checksum.value, 16);
    const actualCrc = crc16CcittFalse(crcInput);
    if (actualCrc !== expectedCrc) return '';

    const containers = entries.filter((entry) => entry.tag === '81');
    if (containers.length !== 1) return '';

    const innerHex = containers[0].value;
    if (innerHex.length < 4 || innerHex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(innerHex)) return '';

    const bytes: number[] = [];
    for (let i = 0; i < innerHex.length; i += 2) {
      bytes.push(parseInt(innerHex.slice(i, i + 2), 16));
    }

    let offset = 0;
    let reference = '';
    while (offset < bytes.length) {
      if (offset + 2 > bytes.length) return '';
      const tag = bytes[offset];
      const length = bytes[offset + 1];
      const end = offset + 2 + length;
      if (end > bytes.length) return '';

      if (tag === 0) {
        if (reference) return '';
        reference = String.fromCharCode(...bytes.slice(offset + 2, end));
      }
      offset = end;
    }

    return reference.length === 10 && isValidTelebirrReference(reference)
      ? reference
      : '';
  } catch (error) {
    console.warn('Telebirr QR decoding error:', error);
    return '';
  }
}

// ---------------------------------------------------------------------------
// BankAdapter Registration
// ---------------------------------------------------------------------------

export const TelebirrAdapter: BankAdapter = {
  id: 'telebirr',
  label: 'Telebirr',
  aliases: ['telebirr', 'tele birr', 'tele-birr', 'ethio telecom', 'ethiotelecom'],
  referencePattern: /^[A-Z0-9]{10}$/,
  referenceHint: 'Telebirr references are usually 10 characters.',
  allowedHosts: [OFFICIAL_HOST],
  isReadOnlyAmount: true,

  buildReceiptUrl: (reference: string) => {
    const cleanRef = normalizeReference(reference);
    if (cleanRef && isValidTelebirrReference(cleanRef)) return buildOfficialTelebirrUrl(cleanRef);
    return '';
  },

  extractAmount: (text: string) => {
    const res = extractTelebirrReceipt(text, 'local-ocr');
    const amt = res.screenshotReceipt?.amount;
    if (amt !== null && amt !== undefined && Number.isFinite(amt) && amt > 0) {
      return amt;
    }
    const utilAmount = extractAmountFromUtil(text);
    if (utilAmount) {
      const parsed = Number(utilAmount.replace(/,/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return null;
  },

  extractReference: (text: string, url: string, barcodes: string[] = []) => {
    if (barcodes && barcodes.length > 0) {
      for (const bc of barcodes) {
        const qrRef = decodeTelebirrQr(bc);
        if (qrRef) return qrRef;
      }
    }
    const fromText = extractReference(text);
    if (fromText) return fromText;
    if (url) {
      const fromUrl = extractReference(url);
      if (fromUrl) return fromUrl;
    }
    return '';
  },

  verify: async (args: VerificationArgs): Promise<CheckOutcome> => {
    let screenshotAmount: number | null = null;
    let screenshotRef: string | null = null;

    if (args.receiptText) {
      const extracted = extractTelebirrReceipt(args.receiptText);
      const extAmt = extracted.screenshotReceipt?.amount;
      if (extAmt !== null && extAmt !== undefined && Number.isFinite(extAmt) && extAmt > 0) {
        screenshotAmount = extAmt;
      }
      screenshotRef = extracted.screenshotReceipt?.reference ?? null;
    }

    if (screenshotRef === null && args.reference) {
      screenshotRef = normalizeReference(args.reference);
    }

    // Accept expectedAmount if screenshot amount was not extracted or was <= 0
    if (
      (screenshotAmount === null || screenshotAmount <= 0) &&
      args.expectedAmount !== null &&
      args.expectedAmount !== undefined &&
      Number.isFinite(args.expectedAmount) &&
      args.expectedAmount > 0
    ) {
      screenshotAmount = args.expectedAmount;
    }

    const screenshotReceipt: TelebirrReceipt = {
      provider: 'telebirr',
      reference: screenshotRef,
      amount: screenshotAmount,
      currency: 'ETB',
      status: null,
      paymentDate: null,
      payerName: null,
      payerPhone: null,
      receiverName: null,
      receiverAccount: null,
      serviceFee: null,
      totalPaidAmount: null,
      source: 'local-ocr',
    };

    const result = await verifyTelebirrReceipt(screenshotReceipt);

    let status: CheckOutcome['status'] = 'unable';
    if (result.state === 'confirmed') status = 'verified';
    else if (result.state === 'mismatch') status = 'not_verified';
    else status = 'unable';

    return {
      status,
      title: result.title,
      detail: result.detail,
      amount: result.officialReceipt?.amount ?? result.screenshotReceipt?.amount ?? null,
      referenceFound: (result.officialReceipt?.reference && isValidTelebirrReference(result.officialReceipt.reference))
        ? result.officialReceipt.reference
        : (result.screenshotReceipt?.reference ?? args.reference),
      url: result.url,
    };
  },
};


