import {
  BankAdapter,
  BankDefinition,
  CheckOutcome,
  VerificationArgs,
} from './types';
import { TelebirrAdapter, decodeTelebirrQr, extractTelebirrReference } from './banks/telebirr';
import { CbeAdapter } from './banks/cbe';
import { CbeLegacyAdapter, extractReceiverAccountLast8, parseCbeLegacyId } from './banks/cbe-legacy';
import { BoaAdapter, extractBoaAccountSuffix, parseBoaId } from './banks/boa';
import { AwashAdapter } from './banks/awash';
import {
  AmoleAdapter,
  BunnaAdapter,
  CbeBirrAdapter,
  DashenAdapter,
  EbirrAdapter,
  MpesaAdapter,
  OtherAdapter,
  ZamzamAdapter,
} from './banks/generic';
import { extractAmount, extractUrl, isValidReference, normalizeBank } from './utils/text';

export * from './types';
export * from './utils/text';
export * from './utils/http';
export * from './utils/pdf';

// ---------------------------------------------------------------------------
// Bank Adapters Registry
// ---------------------------------------------------------------------------

export const ADAPTERS: BankAdapter[] = [
  TelebirrAdapter,
  CbeAdapter,
  CbeLegacyAdapter,
  BoaAdapter,
  AwashAdapter,
  DashenAdapter,
  MpesaAdapter,
  AmoleAdapter,
  ZamzamAdapter,
  EbirrAdapter,
  CbeBirrAdapter,
  BunnaAdapter,
  OtherAdapter,
];

/**
 * Banks that currently support on-device verification. Parsing and bank
 * identification still work for every registered adapter (so photos of any
 * receipt are still read), but checkReceipt refuses to mark anything as
 * verified unless the provider is in this list.
 */
export const VERIFICATION_ENABLED_BANK_IDS: string[] = [
  'telebirr',
  'cbe',
  'cbe-legacy',
];

export const BANKS: string[] = [
  'Telebirr',
  'CBE',
  'CBE Legacy',
];

export const BANK_DEFINITIONS: Record<string, BankDefinition> = Object.fromEntries(
  ADAPTERS.map((adapter) => [
    adapter.id,
    {
      id: adapter.id,
      label: adapter.label,
      referencePattern: adapter.referencePattern,
      referenceHint: adapter.referenceHint,
      needsReceiptUrl: adapter.needsReceiptUrl,
    },
  ])
);

// ---------------------------------------------------------------------------
// Adapter Resolution Helpers
// ---------------------------------------------------------------------------

export function getBankAdapter(bank: string): BankAdapter | undefined {
  const norm = normalizeBank(bank);
  return ADAPTERS.find(
    (a) => a.id === norm || a.aliases.some((alias) => alias.toLowerCase() === norm)
  );
}

export function getBankDefinition(bank: string): BankDefinition | undefined {
  const adapter = getBankAdapter(bank);
  if (!adapter) return undefined;
  return BANK_DEFINITIONS[adapter.id];
}

export function bankNeedsReceiptUrl(bank: string): boolean {
  const adapter = getBankAdapter(bank);
  return Boolean(adapter?.needsReceiptUrl);
}

export function buildReceiptUrl(bank: string, reference: string, receiverAccountLast8?: string): string {
  const adapter = getBankAdapter(bank);
  if (adapter?.buildReceiptUrl) {
    return adapter.buildReceiptUrl(reference, receiverAccountLast8);
  }
  return '';
}

export function getReceiptPageUrl(
  bank: string,
  reference: string,
  receiverAccountLast8?: string,
  receiptUrl?: string
): string {
  const adapter = getBankAdapter(bank);
  if (adapter?.openReceiptUrl) {
    return adapter.openReceiptUrl(reference, receiverAccountLast8, receiptUrl);
  }
  const cleanUrl = receiptUrl?.trim() || '';
  if (cleanUrl) return cleanUrl;
  if (adapter?.buildReceiptUrl) {
    return adapter.buildReceiptUrl(reference, receiverAccountLast8);
  }
  return '';
}

export function getReferenceForVerification(bank: string, reference: string, receiptUrl: string): string {
  const adapter = getBankAdapter(bank);
  if (adapter?.getReferenceForVerification) {
    return adapter.getReferenceForVerification(reference, receiptUrl);
  }
  return reference.trim().toUpperCase();
}

export function inspectInputForBankAndExtra(
  input: string,
  currentBank?: string
): {
  bank?: string;
  reference?: string;
  extraAccount?: string;
} {
  const clean = input.trim();
  if (!clean) return { bank: currentBank, reference: '', extraAccount: '' };

  let detectedBankId = identifyBank(clean, clean);
  if (!detectedBankId) {
    for (const a of ADAPTERS) {
      if (a.extractExtraAccount && a.extractExtraAccount(clean)) {
        detectedBankId = a.id;
        break;
      }
    }
  }

  const targetAdapter = detectedBankId ? getBankAdapter(detectedBankId) : getBankAdapter(currentBank || '');
  const bankLabel = targetAdapter?.label || currentBank;
  const extraAccount = targetAdapter?.extractExtraAccount ? targetAdapter.extractExtraAccount(clean) : '';
  const reference = targetAdapter?.getReferenceForVerification
    ? targetAdapter.getReferenceForVerification(clean, clean)
    : targetAdapter?.extractReference
      ? targetAdapter.extractReference(clean, clean)
      : clean;

  return {
    bank: bankLabel,
    reference,
    extraAccount,
  };
}

// ---------------------------------------------------------------------------
// Bank Identification & Receipt Extraction
// ---------------------------------------------------------------------------

export function identifyBank(text: string, url: string): string {
  const value = `${text}\n${url}`.toLowerCase();

  // 1. Match against known allowed hosts
  for (const adapter of ADAPTERS) {
    if (adapter.allowedHosts) {
      for (const host of adapter.allowedHosts) {
        if (value.includes(host.toLowerCase())) return adapter.id;
      }
    }
  }

  // 2. Specific bank keyword detection
  if (value.includes('telebirr')) return 'telebirr';
  if (value.includes('dashen') || value.includes('amole')) {
    return value.includes('amole') ? 'amole' : 'dashen';
  }
  if (value.includes('awash')) return 'awash';
  if (value.includes('abyssinia') || value.includes('boa')) return 'boa';
  if (value.includes('zamzam')) return 'zamzam';
  if (value.includes('mpesa') || value.includes('m-pesa')) return 'mpesa';
  if (value.includes('ebirr')) return 'ebirr';
  if (value.includes('cbe birr') || value.includes('cbebirr')) return 'cbe birr';
  if (
    value.includes('commercial bank of ethiopia') ||
    value.includes('combank') ||
    value.includes('cbe')
  ) {
    if (/\bFT[A-Z0-9]{8,14}\b/i.test(text)) {
      return 'cbe-legacy';
    }
    return 'cbe';
  }

  return '';
}

export function getReference(text: string, url: string, bank: string): string {
  const adapter = getBankAdapter(bank);
  if (adapter?.extractReference) {
    const extracted = adapter.extractReference(text, url);
    if (extracted) return extracted;
  }

  // Try common reference labels in OCR text, verifying candidates are not stop words.
  const labelPatterns = [
    /(?:transaction\s*(?:reference|ref|id|number|no)|የግብይት\s*(?:መለያ|ቁጥር)|trans(?:action)?\s*(?:id|no|ref)|reference\s*(?:number|no|id)?|receipt\s*(?:number|no|id))\s*[:#\-]?\s*([A-Za-z0-9-]{6,40})/gi,
    /\b(?:DET|CHQ|DAB|DJA|DEL|ADQ|DEP|CHG)[0-9A-Z]{7,8}\b/i,
    /\bB22[A-Z0-9]{7,}\b/i,
  ];

  for (const pattern of labelPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && isValidReference(match[1])) {
        return match[1].trim().toUpperCase();
      }
    }
  }

  const generalFtMatch = text.match(/\b(FT[A-Z0-9]{10})\b/i);
  if (generalFtMatch?.[1] && isValidReference(generalFtMatch[1])) {
    return generalFtMatch[1].toUpperCase();
  }

  if (url) {
    try {
      const parsed = new URL(url);
      const queryKeys = [
        'trx',
        'transactionno',
        'transactionNo',
        'transactionId',
        'transaction_id',
        'reference',
        'ref',
        'id',
      ];

      for (const key of queryKeys) {
        const value = parsed.searchParams.get(key);
        if (value && isValidReference(value)) {
          return value.toUpperCase();
        }
      }

      const segments = parsed.pathname.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1] ?? '';
      if (isValidReference(lastSegment)) return lastSegment.toUpperCase();
    } catch {}
  }

  return '';
}

export type ParsedReceiptData = {
  bank: string;
  reference: string;
  amount: string;
  url: string;
  extraAccount: string;
};

/**
 * High-level image parser that delegates to individual adapters.
 */
export function parseReceiptFromImage(ocrText: string, barcodeValues: string[] = []): ParsedReceiptData {
  const combinedText = `${ocrText}\n${barcodeValues.join('\n')}`;
  const foundUrl = extractUrl(combinedText);

  // 1. Identify bank
  let detectedBank = identifyBank(combinedText, foundUrl);
  if (!detectedBank) {
    for (const adapter of ADAPTERS) {
      if (adapter.extractReference) {
        const ref = adapter.extractReference(ocrText, foundUrl, barcodeValues);
        if (ref) {
          detectedBank = adapter.id;
          break;
        }
      }
    }
  }

  const adapter = getBankAdapter(detectedBank);

  // 2. Extract reference via adapter
  let reference = '';
  if (adapter?.extractReference) {
    reference = adapter.extractReference(ocrText, foundUrl, barcodeValues);
  }
  if (!reference) {
    reference = getReference(combinedText, foundUrl, detectedBank);
  }

  // 3. Extract amount via adapter
  let amount = '';
  if (adapter?.extractAmount) {
    const amt = adapter.extractAmount(ocrText, foundUrl);
    if (amt !== null && amt !== undefined && amt !== '' && Number(amt) > 0) {
      amount = String(amt);
    }
  }
  if (!amount || Number(amount) <= 0) {
    const globalAmt = extractAmount(ocrText);
    if (globalAmt && Number(globalAmt) > 0) {
      amount = globalAmt;
    }
  }

  // 4. Extract extra account details (e.g. CBE last 8, BOA last 5) via adapter
  let extraAccount = '';
  if (adapter?.extractExtraAccount) {
    extraAccount = adapter.extractExtraAccount(foundUrl || combinedText);
  }

  return {
    bank: detectedBank,
    reference,
    amount,
    url: foundUrl,
    extraAccount,
  };
}

// ---------------------------------------------------------------------------
// Receipt Verification Orchestrator
// ---------------------------------------------------------------------------

export async function checkReceipt(args: VerificationArgs): Promise<CheckOutcome> {
  const adapter = getBankAdapter(args.bank);

  if (adapter && !VERIFICATION_ENABLED_BANK_IDS.includes(adapter.id)) {
    return {
      status: 'unable',
      title: `${adapter.label} verification is coming soon`,
      detail: `For now, Cheki can verify receipts from Telebirr, CBE and CBE Legacy only. The receipt was identified as ${adapter.label}, but it was NOT verified against an official record.`,
      amount: null,
      url: args.receiptUrl,
    };
  }

  if (!adapter) {
    return {
      status: 'unable',
      title: 'Unknown provider',
      detail: `Verification is not configured for ${args.bank}.`,
      amount: null,
      url: args.receiptUrl,
    };
  }

  // Pre-validate target URL domain if allowedHosts is set on adapter
  const reference = getReferenceForVerification(args.bank, args.reference, args.receiptUrl);
  const targetUrl = args.receiptUrl.trim() || (adapter.buildReceiptUrl ? adapter.buildReceiptUrl(reference, args.receiverAccountLast8) : '');

  if (targetUrl && adapter.allowedHosts && adapter.allowedHosts.length > 0) {
    try {
      const parsed = new URL(targetUrl);
      if (!adapter.allowedHosts.includes(parsed.hostname.toLowerCase())) {
        return {
          status: 'unable',
          title: 'Unexpected receipt domain',
          detail: 'For safety, use the official bank receipt website.',
          amount: null,
          url: targetUrl,
        };
      }
    } catch {
      return {
        status: 'unable',
        title: 'Invalid receipt URL',
        detail: 'Enter a valid official receipt URL.',
        amount: null,
        url: targetUrl,
      };
    }
  }

  return adapter.verify(args);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export {
  TelebirrState,
  TelebirrReceipt,
  TelebirrResult,
  TelebirrExpected,
  OfficialTelebirrReceipt,
  parseOfficialTelebirrHtml,
  extractTelebirrReceipt,
  confirmTelebirrReceipt,
  readAndOptionallyConfirmTelebirr,
  TelebirrAdapter,
  decodeTelebirrQr,
  extractTelebirrReference,
  crc16CcittFalse,
  isValidTelebirrReference,
  TELEBIRR_STOP_WORDS,
} from './banks/telebirr';

export { CbeAdapter } from './banks/cbe';
export { CbeLegacyAdapter, extractReceiverAccountLast8, parseCbeLegacyId } from './banks/cbe-legacy';
export { BoaAdapter, extractBoaAccountSuffix, parseBoaId } from './banks/boa';
export { AwashAdapter } from './banks/awash';
