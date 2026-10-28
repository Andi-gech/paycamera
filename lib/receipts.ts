import * as pakoModule from 'pako';

/**
 * Receipt verification engine.
 *
 * Runs entirely on the device. A receipt can only be checked when we know the
 * provider's public receipt URL, either from a URL template (Telebirr) or from
 * a link the user pasted / that was decoded from a QR code.
 */

export type ReceiptStatus = 'verified' | 'not_verified' | 'unable';

export type ReceiptKind = 'html' | 'pdf' | 'unknown';

export type BankDefinition = {
  id: string;
  label: string;
  aliases: string[];
  /** How the provider serves its receipt. */
  kind: 'html' | 'pdf' | 'portal';
  /** Format the reference is expected to have. */
  referencePattern: RegExp;
  referenceHint: string;
  /** Build a public receipt URL from the reference, when the bank supports it. */
  buildUrl?: (reference: string) => string;
};

const GENERIC_REFERENCE = /^[A-Z0-9][A-Z0-9-]{5,39}$/;
const GENERIC_HINT =
  'Enter the transaction number shown on the receipt (6–40 letters, numbers or dashes).';

function bank(definition: Omit<BankDefinition, 'referencePattern' | 'referenceHint'> &
  Partial<Pick<BankDefinition, 'referencePattern' | 'referenceHint'>>): BankDefinition {
  return {
    ...definition,
    referencePattern: definition.referencePattern ?? GENERIC_REFERENCE,
    referenceHint: definition.referenceHint ?? GENERIC_HINT,
  };
}

/**
 * Order matters for the UI, not for matching (matching uses the longest alias).
 * Only Telebirr publishes a receipt URL that can be built from the reference
 * alone. Every other bank is checked through a receipt link, because their
 * receipt URLs contain account numbers, document ids, or PDF ids we do not
 * have until the user provides the link.
 */
export const BANK_DEFINITIONS: BankDefinition[] = [
  bank({
    id: 'telebirr',
    label: 'Telebirr',
    aliases: ['telebirr', 'tele birr', 'tele-birr', 'ethio telecom', 'ethiotelecom'],
    kind: 'html',
    referencePattern: /^[A-Z0-9]{10}$/,
    referenceHint: 'Telebirr transaction numbers are 10 letters or numbers.',
    buildUrl: (reference) =>
      `https://transactioninfo.ethiotelecom.et/receipt/${encodeURIComponent(reference)}`,
  }),
  bank({
    id: 'cbe',
    label: 'CBE',
    aliases: ['cbe', 'commercial bank of ethiopia', 'combank'],
    kind: 'pdf',
  }),
  bank({
    id: 'cbe-legacy',
    label: 'CBE Legacy',
    aliases: ['cbe legacy', 'cbe-legacy', 'legacy cbe'],
    kind: 'pdf',
    referencePattern: /^FT[A-Z0-9]{8,14}(?:\d{8})?$/i,
    referenceHint: 'CBE Legacy FT transaction number (e.g. FT26148KCQXG or reference + last 8 digits of receiving account).',
    buildUrl: (reference) => {
      const clean = reference.trim().toUpperCase();
      if (/^FT[A-Z0-9]{8,14}\d{8}$/i.test(clean)) {
        return `https://apps.cbe.com.et:100/?id=${encodeURIComponent(clean)}`;
      }
      return '';
    },
  }),
  bank({ id: 'cbe birr', label: 'CBE Birr', aliases: ['cbe birr', 'cbebirr'], kind: 'portal' }),
  bank({ id: 'dashen', label: 'Dashen', aliases: ['dashen'], kind: 'pdf' }),
  bank({
    id: 'awash',
    label: 'Awash Bank',
    aliases: ['awash', 'awash bank', 'awash pay', 'awashbirr'],
    kind: 'html',
    referencePattern: /^[A-Za-z0-9-]{6,40}$/i,
    referenceHint: 'Enter the Awash transaction ID or paste the receipt link (awashpay.awashbank.com).',
    buildUrl: (reference) => {
      const clean = reference.trim();
      if (/^https?:\/\//i.test(clean)) return clean;
      if (clean.startsWith('-')) {
        return `https://awashpay.awashbank.com:8225/${encodeURIComponent(clean)}`;
      }
      return '';
    },
  }),
  bank({
    id: 'boa',
    label: 'Bank of Abyssinia',
    aliases: ['boa', 'abyssinia', 'bank of abyssinia'],
    kind: 'html',
    referencePattern: /^(FT[A-Z0-9]{8,14}|[A-Z0-9-]{6,40})$/i,
    referenceHint: 'Enter the BOA FT reference (e.g. FT26091B1X51) or paste the receipt link.',
    buildUrl: (reference) => {
      const clean = reference.trim().toUpperCase();
      if (/^FT[A-Z0-9]{10}\d{5}$/i.test(clean)) {
        return `https://cs.bankofabyssinia.com/api/onlineSlip/getDetails/?id=${encodeURIComponent(clean)}`;
      }
      if (/^FT[A-Z0-9]{10}$/i.test(clean)) {
        return `https://cs.bankofabyssinia.com/api/onlineSlip/getDetails/?id=${encodeURIComponent(clean)}`;
      }
      return '';
    },
  }),
  bank({ id: 'amole', label: 'Amole', aliases: ['amole'], kind: 'portal' }),
  bank({ id: 'mpesa', label: 'M-Pesa', aliases: ['m-pesa', 'mpesa'], kind: 'portal' }),
  bank({ id: 'ebirr', label: 'eBirr', aliases: ['ebirr', 'e-birr'], kind: 'portal' }),
  bank({ id: 'zamzam', label: 'ZamZam', aliases: ['zamzam', 'zam zam'], kind: 'portal' }),
  bank({ id: 'zemen', label: 'Zemen', aliases: ['zemen'], kind: 'pdf' }),
  bank({ id: 'abay', label: 'Abay', aliases: ['abay'], kind: 'portal' }),
  bank({ id: 'berhan', label: 'Berhan', aliases: ['berhan'], kind: 'portal' }),
  bank({ id: 'wegagen', label: 'Wegagen', aliases: ['wegagen'], kind: 'portal' }),
  bank({ id: 'united', label: 'United Bank', aliases: ['united bank', 'united'], kind: 'portal' }),
  bank({ id: 'nib', label: 'Nib', aliases: ['nib'], kind: 'portal' }),
  bank({ id: 'coop', label: 'Cooperative Bank of Oromia', aliases: ['cooperative bank of oromia', 'coop'], kind: 'portal' }),
  bank({ id: 'oromia', label: 'Oromia Bank', aliases: ['oromia bank'], kind: 'portal' }),
  bank({ id: 'hibret', label: 'Hibret', aliases: ['hibret'], kind: 'portal' }),
  bank({ id: 'enat', label: 'Enat', aliases: ['enat'], kind: 'portal' }),
  bank({ id: 'addis', label: 'Addis', aliases: ['addis'], kind: 'portal' }),
  bank({ id: 'tsehay', label: 'Tsehay', aliases: ['tsehay'], kind: 'portal' }),
  bank({ id: 'hijra', label: 'Hijra', aliases: ['hijra'], kind: 'portal' }),
  bank({ id: 'amhara', label: 'Amhara Bank', aliases: ['amhara bank', 'amhara'], kind: 'portal' }),
  bank({ id: 'bunna', label: 'Bunna', aliases: ['bunna'], kind: 'portal' }),
  bank({ id: 'global', label: 'Global', aliases: ['global'], kind: 'portal' }),
  bank({ id: 'vision', label: 'Vision', aliases: ['vision'], kind: 'portal' }),
  bank({ id: 'rammis', label: 'Rammis', aliases: ['rammis'], kind: 'portal' }),
  bank({ id: 'shabelle', label: 'Shabelle', aliases: ['shabelle'], kind: 'portal' }),
  bank({ id: 'lider', label: 'Lider', aliases: ['lider'], kind: 'portal' }),
  bank({ id: 'ahadu', label: 'Ahadu', aliases: ['ahadu'], kind: 'portal' }),
  bank({ id: 'siinqee', label: 'Siinqee', aliases: ['siinqee'], kind: 'portal' }),
  bank({ id: 'gadaa', label: 'Gadaa', aliases: ['gadaa'], kind: 'portal' }),
  bank({ id: 'other', label: 'Other', aliases: ['other'], kind: 'portal' }),
];

export const BANK_LABELS = BANK_DEFINITIONS.map((definition) => definition.label);

export function getBankDefinition(input: string): BankDefinition | undefined {
  const value = input.toLowerCase().trim();

  if (!value) return undefined;

  const exact = BANK_DEFINITIONS.find(
    (definition) =>
      value === definition.id || value === definition.label.toLowerCase()
  );

  if (exact) return exact;

  // Longest alias wins so "cbe birr" does not resolve to "cbe".
  const match = BANK_DEFINITIONS.flatMap((definition) =>
    definition.aliases.map((alias) => ({ definition, alias }))
  )
    .filter((entry) => value.includes(entry.alias))
    .sort((a, b) => b.alias.length - a.alias.length)[0];

  return match?.definition;
}

export function normalizeBank(input: string): string {
  return getBankDefinition(input)?.id ?? input.toLowerCase().trim();
}

export function buildReceiptUrl(bankInput: string, reference: string): string {
  const definition = getBankDefinition(bankInput);
  const cleanedReference = reference.trim().toUpperCase();

  if (!definition?.buildUrl || !cleanedReference) return '';

  try {
    return definition.buildUrl(cleanedReference);
  } catch {
    return '';
  }
}

export function bankNeedsReceiptUrl(bankInput: string): boolean {
  const definition = getBankDefinition(bankInput);

  return Boolean(definition && !definition.buildUrl);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/** Desktop/mobile browser headers. Some provider gateways reject bare fetches. */
const BROWSER_HEADERS: Record<string, string> = {
  Accept: 'text/html,application/xhtml+xml,application/pdf,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,am;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
};

/** Gateway and rate-limit statuses where another attempt is worthwhile. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const RETRY_DELAYS_MS = [1200, 2500, 4000];

export class ReceiptFetchError extends Error {
  readonly status?: number;
  readonly url: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { status?: number; url: string; retryable: boolean }
  ) {
    super(message);
    this.name = 'ReceiptFetchError';
    this.status = options.status;
    this.url = options.url;
    this.retryable = options.retryable;
  }
}

export type ReceiptPage = {
  status: number;
  contentType: string;
  body: string;
  bytes?: Uint8Array;
  url: string;
  attempts: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'the receipt service';
  }
}

function describeHttpError(status: number, url: string): string {
  const host = hostOf(url);

  if (status === 404 || status === 410) {
    return `No receipt was found for this reference on ${host} (HTTP ${status}). Check the transaction number, or the receipt may not be published yet.`;
  }

  if (status === 429) {
    return `${host} is limiting requests (HTTP 429). Wait about a minute before trying again.`;
  }

  if (status === 502 || status === 503 || status === 504) {
    return `${host} returned HTTP ${status} (gateway timeout). The provider's receipt service is temporarily unavailable — this is usually not caused by the reference. Wait a short while and try again, or open the receipt page directly.`;
  }

  return `${host} returned HTTP ${status}.`;
}

export async function fetchReceiptPage(
  url: string,
  options: { attempts?: number; timeoutMs?: number } = {}
): Promise<ReceiptPage> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 20000;
  let lastError: ReceiptFetchError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: BROWSER_HEADERS,
        redirect: 'follow',
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';

      if (response.ok) {
        const isPdf =
          contentType.toLowerCase().includes('pdf') ||
          url.includes('apps.cbe.com.et');
        let body = '';
        let bytes: Uint8Array | undefined;

        if (isPdf && typeof XMLHttpRequest !== 'undefined') {
          // Use XHR for reliable binary arraybuffer in React Native
          try {
            bytes = await new Promise<Uint8Array>((resXhr, rejXhr) => {
              const xhr = new XMLHttpRequest();
              xhr.open('GET', url, true);
              xhr.responseType = 'arraybuffer';
              xhr.timeout = timeoutMs;
              for (const [k, v] of Object.entries(BROWSER_HEADERS)) {
                xhr.setRequestHeader(k, v);
              }
              xhr.onload = () => {
                const ab = xhr.response as ArrayBuffer;
                resXhr(ab ? new Uint8Array(ab) : new Uint8Array(0));
              };
              xhr.onerror = () => rejXhr(new Error(`Failed to load ${url}`));
              xhr.ontimeout = () => rejXhr(new Error(`Timeout loading ${url}`));
              xhr.send();
            });
          } catch {
            // fallback
          }
        }

        if (isPdf && (!bytes || bytes.length === 0)) {
          try {
            const ab = await response.arrayBuffer();
            bytes = new Uint8Array(ab);
          } catch {
            // fallback
          }
        }

        if (!isPdf) {
          body = await response.text();
        }

        return {
          status: response.status,
          contentType,
          body,
          bytes,
          url: response.url || url,
          attempts: attempt,
        };
      }

      const retryable = RETRYABLE_STATUS.has(response.status);
      const error = new ReceiptFetchError(
        describeHttpError(response.status, url),
        { status: response.status, url, retryable }
      );

      if (!retryable || attempt === attempts) throw error;

      lastError = error;
    } catch (caught) {
      if (caught instanceof ReceiptFetchError) {
        if (!caught.retryable || attempt === attempts) throw caught;
        lastError = caught;
      } else {
        const message = controller.signal.aborted
          ? `${hostOf(url)} did not answer within ${Math.round(
              timeoutMs / 1000
            )} seconds. The connection or the provider's receipt service is slow — try again.`
          : `Could not reach ${hostOf(
              url
            )}. Check the internet connection and try again.`;

        const error = new ReceiptFetchError(message, {
          url,
          retryable: true,
        });

        if (attempt === attempts) throw error;

        lastError = error;
      }
    } finally {
      clearTimeout(timer);
    }

    await delay(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
  }

  throw (
    lastError ??
    new ReceiptFetchError(`Could not retrieve ${hostOf(url)}.`, {
      url,
      retryable: false,
    })
  );
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : ' ';
    });
}

function flattenJson(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || out.length > 400) return out;

  if (value === null || value === undefined) return out;

  if (typeof value === 'string' || typeof value === 'number') {
    out.push(String(value));
    return out;
  }

  if (typeof value === 'boolean') {
    out.push(value ? 'true' : 'false');
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) flattenJson(item, out, depth + 1);
    return out;
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      flattenJson(item, out, depth + 1);
    }
  }

  return out;
}

/** Turn an HTML, JSON or plain-text response into searchable text. */
export function bodyToText(body: string): string {
  const trimmed = body.trim();

  if (!trimmed) return '';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return flattenJson(parsed).join(' ').replace(/\s+/g, ' ').trim();
    } catch {
      // Not valid JSON; fall through to HTML/text handling.
    }
  }

  return decodeHtmlEntities(
    trimmed
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForSearch(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Labels ordered from "total" down to the least trustworthy. */
const AMOUNT_LABELS = [
  'total paid amount',
  'total amount paid',
  'total amount',
  'transferred amount',
  'transaction amount',
  'settled amount',
  'credited amount',
  'amount paid',
  'paid amount',
  'amount',
  'ጠቅላላ የተከፈለ',
  'የተከፈለው መጠን',
  'ጠቅላላ',
];

function parseAmount(raw: string): number | null {
  const parsed = Number(raw.replace(/,/g, ''));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function extractAmountFromText(text: string): number | null {
  const normalized = text.replace(/\s+/g, ' ');

  for (const label of AMOUNT_LABELS) {
    const pattern = new RegExp(
      `${escapeRegExp(label)}[^0-9]{0,24}([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`,
      'i'
    );
    const match = normalized.match(pattern);

    if (match?.[1]) {
      const amount = parseAmount(match[1]);
      if (amount !== null) return amount;
    }
  }

  const currency =
    normalized.match(/(?:ETB|Birr|ብር)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ??
    normalized.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:ETB|Birr|ብር)/i);

  return currency?.[1] ? parseAmount(currency[1]) : null;
}

const FAILED_STATUS = /\b(failed|failure|declined|reversed|cancelled|canceled|pending|rejected)\b|አልተሳካ|ተሰርዟል/i;

export type ParsedReceipt = {
  text: string;
  referenceFound: boolean;
  amount: number | null;
  statusHint: 'success' | 'failed' | 'unknown';
};

export function parseReceiptDocument(
  body: string,
  reference: string
): ParsedReceipt {
  const text = bodyToText(body);
  const referenceFound = normalizeForSearch(text).includes(
    normalizeForSearch(reference)
  );

  let statusHint: ParsedReceipt['statusHint'] = 'unknown';

  if (referenceFound) {
    statusHint = FAILED_STATUS.test(text) ? 'failed' : 'success';
  }

  return {
    text,
    referenceFound,
    amount: extractAmountFromText(text),
    statusHint,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type CheckReceiptInput = {
  bank: string;
  reference: string;
  expectedAmount: number | null;
  receiptUrl?: string;
};

export type CheckReceiptOutcome = {
  status: ReceiptStatus;
  title: string;
  detail: string;
  url?: string;
  amount: number | null;
  referenceFound: boolean;
  httpStatus?: number;
  kind: ReceiptKind;
};

function normalizeReceiptUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) return '';

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function buildCandidates(
  definition: BankDefinition | undefined,
  reference: string,
  receiptUrl: string | undefined
): string[] {
  const candidates: string[] = [];
  const provided = normalizeReceiptUrl(receiptUrl ?? '');

  if (provided) candidates.push(provided);

  const built = buildReceiptUrl(definition?.id ?? '', reference);

  if (built) {
    candidates.push(built);

    // Telebirr's gateway occasionally answers on the trailing-slash variant.
    if (definition?.id === 'telebirr' && !built.endsWith('/')) {
      candidates.push(`${built}/`);
    }
  }

  return candidates.filter((url, index) => candidates.indexOf(url) === index);
}

function looksLikePdf(contentType: string, body: string, bytes?: Uint8Array): boolean {
  return (
    contentType.toLowerCase().includes('pdf') ||
    body.slice(0, 5) === '%PDF-' ||
    body.slice(0, 1024).includes('%PDF-') ||
    Boolean(bytes && bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
  );
}

function decompressStream(slice: Uint8Array): Uint8Array {
  const pako = pakoModule as any;
  const inflateFn = pako.inflate || pako.default?.inflate;
  if (typeof inflateFn === 'function') {
    try {
      return inflateFn(slice);
    } catch {
      const inflateRawFn = pako.inflateRaw || pako.default?.inflateRaw;
      if (typeof inflateRawFn === 'function') {
        try {
          return inflateRawFn(slice);
        } catch {}
      }
    }
  }
  return slice;
}

function findStream(arr: Uint8Array, fromIndex: number): number {
  let idx = fromIndex;
  while ((idx = arr.indexOf(115, idx)) !== -1) {
    if (
      idx + 5 < arr.length &&
      arr[idx + 1] === 116 && // 't'
      arr[idx + 2] === 114 && // 'r'
      arr[idx + 3] === 101 && // 'e'
      arr[idx + 4] === 97 &&  // 'a'
      arr[idx + 5] === 109    // 'm'
    ) {
      return idx;
    }
    idx++;
  }
  return -1;
}

function findEndstream(arr: Uint8Array, fromIndex: number): number {
  let idx = fromIndex;
  while ((idx = arr.indexOf(101, idx)) !== -1) {
    if (
      idx + 8 < arr.length &&
      arr[idx + 1] === 110 && // 'n'
      arr[idx + 2] === 100 && // 'd'
      arr[idx + 3] === 115 && // 's'
      arr[idx + 4] === 116 && // 't'
      arr[idx + 5] === 114 && // 'r'
      arr[idx + 6] === 101 && // 'e'
      arr[idx + 7] === 97 &&  // 'a'
      arr[idx + 8] === 109    // 'm'
    ) {
      return idx;
    }
    idx++;
  }
  return -1;
}

export function extractTextFromPdf(bytes: Uint8Array): string {
  let fullText = '';
  let pos = 0;

  while (pos < bytes.length) {
    const streamStart = findStream(bytes, pos);
    if (streamStart === -1) break;

    let dataStart = streamStart + 6;
    while (dataStart < bytes.length && (bytes[dataStart] === 10 || bytes[dataStart] === 13)) {
      dataStart++;
    }

    const streamEnd = findEndstream(bytes, dataStart);
    if (streamEnd === -1) break;

    let actualEnd = streamEnd;
    while (actualEnd > dataStart && (bytes[actualEnd - 1] === 10 || bytes[actualEnd - 1] === 13)) {
      actualEnd--;
    }

    const slice = bytes.subarray(dataStart, actualEnd);
    pos = streamEnd + 9;

    // Skip large raster image streams to save memory and CPU on mobile
    if (slice.length > 100000) {
      continue;
    }

    const uncompressed = decompressStream(slice);
    if (uncompressed.length > 120000) {
      continue;
    }

    let str = '';
    const chunkSize = 2048;
    for (let c = 0; c < uncompressed.length; c += chunkSize) {
      const sub = uncompressed.subarray(c, c + chunkSize);
      let chunkStr = '';
      for (let i = 0; i < sub.length; i++) {
        chunkStr += String.fromCharCode(sub[i]);
      }
      str += chunkStr;
    }

    const tjRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let tjMatch: RegExpExecArray | null;
    let hasTj = false;
    while ((tjMatch = tjRegex.exec(str)) !== null) {
      hasTj = true;
      const content = tjMatch[1];
      let decodedTj = '';

      const tokenRegex = /<([0-9a-fA-F]+)>|\(([^)]*)\)/g;
      let tokenMatch: RegExpExecArray | null;
      while ((tokenMatch = tokenRegex.exec(content)) !== null) {
        if (tokenMatch[1]) {
          const hex = tokenMatch[1];
          for (let i = 0; i < hex.length; i += 2) {
            decodedTj += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
          }
        } else if (tokenMatch[2] !== undefined) {
          decodedTj += tokenMatch[2];
        }
      }

      if (decodedTj.trim()) {
        fullText += '\n' + decodedTj.trim();
      }
    }

    const tjStandaloneRegex = /(?:<([0-9a-fA-F]+)>|\(([^)]*)\))\s*Tj/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = tjStandaloneRegex.exec(str)) !== null) {
      hasTj = true;
      if (sMatch[1]) {
        const hex = sMatch[1];
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          decoded += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
        }
        if (decoded.trim()) fullText += '\n' + decoded.trim();
      } else if (sMatch[2] && sMatch[2].trim()) {
        fullText += '\n' + sMatch[2].trim();
      }
    }

    if (!hasTj) {
      const hexRegex = /<([0-9a-fA-F]{4,})>/g;
      let hMatch: RegExpExecArray | null;
      while ((hMatch = hexRegex.exec(str)) !== null) {
        const hex = hMatch[1];
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substring(i, i + 2), 16);
          if (code >= 32 && code <= 126) decoded += String.fromCharCode(code);
        }
        if (decoded.trim()) fullText += '\n' + decoded.trim();
      }
    }
  }

  return fullText;
}

export async function checkReceipt(
  input: CheckReceiptInput
): Promise<CheckReceiptOutcome> {
  const definition = getBankDefinition(input.bank);
  const reference = input.reference.trim().toUpperCase();
  const expectedAmount = input.expectedAmount;
  const label = definition?.label ?? input.bank;

  const candidates = buildCandidates(definition, reference, input.receiptUrl);

  if (candidates.length === 0) {
    return {
      status: 'unable',
      title: 'A receipt link is needed',
      detail: `${label} does not publish a receipt URL that can be built from the transaction number alone. Open the receipt from the bank's SMS or app, copy its link, and paste it into “Receipt URL”, then check again.`,
      amount: null,
      referenceFound: false,
      kind: 'unknown',
    };
  }

  let lastOutcome: CheckReceiptOutcome | null = null;

  for (const [index, url] of candidates.entries()) {
    try {
      // Retry the primary URL, but never spend a long time on fallback URLs:
      // a dead connection would otherwise keep the spinner up for a minute.
      const page = await fetchReceiptPage(url, {
        attempts: index === 0 ? 2 : 1,
        timeoutMs: index === 0 ? 12000 : 10000,
      });

      const isPdfDoc = looksLikePdf(page.contentType, page.body, page.bytes);
      let pageText = page.body;

      if (isPdfDoc && page.bytes) {
        const extracted = extractTextFromPdf(page.bytes);
        if (extracted) {
          pageText = extracted;
        }
      }

      if (isPdfDoc && !page.bytes) {
        return {
          status: 'unable',
          title: 'Receipt is a PDF document',
          detail: `${label} returned a PDF receipt. The link is valid, but Cheki could not read the PDF bytes on this device. Open the link and compare the reference and amount yourself.`,
          url: page.url,
          amount: null,
          referenceFound: false,
          httpStatus: page.status,
          kind: 'pdf',
        };
      }

      const parsed = parseReceiptDocument(pageText, reference);

      if (
        parsed.referenceFound &&
        parsed.amount !== null &&
        parsed.statusHint !== 'failed'
      ) {
        if (
          expectedAmount !== null &&
          Math.abs(parsed.amount - expectedAmount) >= 0.01
        ) {
          return {
            status: 'not_verified',
            title: 'Amount mismatch',
            detail: `You entered ${expectedAmount} ETB, but the official ${label} page shows ${parsed.amount} ETB for this reference. Do not treat this transaction as confirmed.`,
            url: page.url,
            amount: parsed.amount,
            referenceFound: true,
            httpStatus: page.status,
            kind: 'html',
          };
        }

        return {
          status: 'verified',
          title: 'Reference and amount matched',
          detail: `The official ${label} receipt page shows this reference and ${parsed.amount} ETB. Confirm the recipient and transaction date before releasing goods or funds.`,
          url: page.url,
          amount: parsed.amount,
          referenceFound: true,
          httpStatus: page.status,
          kind: 'html',
        };
      }

      if (parsed.referenceFound && parsed.statusHint === 'failed') {
        return {
          status: 'not_verified',
          title: 'Transaction is not successful',
          detail: `The reference was found, but the ${label} page reports a failed, reversed or pending status. Do not treat this transaction as confirmed.`,
          url: page.url,
          amount: parsed.amount,
          referenceFound: true,
          httpStatus: page.status,
          kind: 'html',
        };
      }

      lastOutcome = {
        status: 'unable',
        title: 'Receipt page could not be read',
        detail: parsed.referenceFound
          ? `The reference appears on the ${label} page, but the amount could not be read reliably. The receipt was not marked verified.`
          : `The ${label} page was reached (HTTP ${page.status}), but it did not contain this transaction reference. The receipt was not marked verified. The page may require the bank's app or a browser.`,
        url: page.url,
        amount: parsed.amount,
        referenceFound: parsed.referenceFound,
        httpStatus: page.status,
        kind: 'html',
      };
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'The receipt could not be retrieved.';

      lastOutcome = {
        status: 'unable',
        title:
          caught instanceof ReceiptFetchError && caught.status
            ? `Receipt service returned HTTP ${caught.status}`
            : `Could not reach ${label}`,
        detail: message,
        url,
        amount: null,
        referenceFound: false,
        httpStatus:
          caught instanceof ReceiptFetchError ? caught.status : undefined,
        kind: 'unknown',
      };
    }
  }

  return (
    lastOutcome ?? {
      status: 'unable',
      title: 'Receipt could not be checked',
      detail: `No usable receipt page was returned by ${label}.`,
      amount: null,
      referenceFound: false,
      kind: 'unknown',
    }
  );
}
