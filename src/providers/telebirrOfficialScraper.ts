import { load } from 'cheerio/slim';
import { isValidTelebirrRef } from '../../lib/adapters/telebirrUtils';

export type OfficialTelebirrReceipt = {
  reference: string | null;
  amount: number | null;
  settledAmount: number | null;
  totalPaidAmount: number | null;
  serviceFee: number | null;
  serviceFeeVat: number | null;
  currency: 'ETB' | 'UNKNOWN';
  status: string | null;
  paymentDate: string | null;
  payerName: string | null;
  payerPhone: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
};

export const FORBIDDEN_REFERENCES = new Set([
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
]);

export function isCloudflareChallenge(html: string): boolean {
  if (!html || typeof html !== 'string') return false;

  /*
   * If the HTML contains Telebirr receipt content, it's definitely the
   * official receipt and not a Cloudflare challenge, even if it loads
   * scripts from cdnjs.cloudflare.com.
   */
  if (/telebirr|transaction\s*information|invoice\s*details|የቴሌብር|የክፍያ\s*ዝርዝር|transaction\s*status/i.test(html)) {
    return false;
  }

  const lower = html
    .replace(/https?:\/\/[^"'\s>]*cdnjs\.cloudflare\.com[^"'\s>]*/gi, ' ')
    .toLowerCase();

  return (
    lower.includes('cf-browser-verification') ||
    lower.includes('cf_chl') ||
    lower.includes('__cf_chl') ||
    lower.includes('cdn-cgi/challenge-platform') ||
    lower.includes('cf-turnstile') ||
    lower.includes('cf_chl_') ||
    lower.includes('just a moment...') ||
    lower.includes('attention required! | cloudflare') ||
    lower.includes('checking your browser before accessing') ||
    lower.includes('enable javascript and cookies to continue')
  );
}

const FORBIDDEN_AMOUNT_LABELS = [
  'service fee',
  'service charge',
  'fee',
  'commission',
  'charge',
  'vat',
  'tax',
  'excise tax',
  'የአገልግሎት ክፍያ',
  'ኮሚሽን',
  'ተ.እ.ታ',
  'ቫት',
  'ታክስ',
  'ግብር',
  'ኤክሳይዝ ታክስ',
];

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCurrencyAmount(raw: string): { amount: number; currency: 'ETB' | 'UNKNOWN' } | null {
  if (!raw) return null;
  const clean = cleanText(raw).replace(/,/g, '');
  // Match number with optional decimals and optional currency before or after
  const match = clean.match(/(?:(?:ETB|Birr|ብር)\s*)?(\d+(?:\.\d{1,2})?)(?:\s*(?:ETB|Birr|ብር))?/i);
  if (!match || !match[1]) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;

  const hasCurrency = /(ETB|Birr|ብር)/i.test(raw);
  return {
    amount: num,
    currency: hasCurrency ? 'ETB' : 'UNKNOWN',
  };
}

function isForbiddenAmountLabel(label: string): boolean {
  const lower = cleanText(label).toLowerCase();
  return FORBIDDEN_AMOUNT_LABELS.some((forbidden) => lower.includes(forbidden.toLowerCase()));
}

type LabelValuePair = {
  label: string;
  value: string;
};

/**
 * Extract label-value pairs from raw HTML using Cheerio, preserving table relationships.
 */
function extractPairsFromHtml(html: string): LabelValuePair[] {
  const $ = load(html);

  // Remove script and style elements completely to avoid hashing artifacts or script content
  $('script, style, noscript').remove();

  const pairs: LabelValuePair[] = [];

  /**
   * Snapshot each row's cell texts once, whitespace-cleaned.
   * Filter out outer layout rows that contain nested tables so they don't corrupt pairings.
   */
  const rows: string[][] = $('tr')
    .filter((_, row) => $(row).find('table').length === 0)
    .toArray()
    .map((row) =>
      $(row)
        .children('td, th')
        .toArray()
        .map((cell) => cleanText($(cell).text()))
        .filter((text) => text.length > 0),
    )
    .filter((cells) => cells.length > 0);

  const hasDigit = (texts: string[]) => texts.some((t) => /\d/.test(t));

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r];

    if (cells.length === 2) {
      // Classic label | value row.
      pairs.push({ label: cells[0], value: cells[1] });
      continue;
    }

    if (cells.length >= 3) {
      /**
       * Telebirr's invoice-details table lays out a header row:
       *   [Invoice No.] [Payment date] [Settled Amount]
       * directly above a value row:
       *   [DJR1DSXKZH]  [27-10-2026 ...] [100 Birr]
       * Pair them column-wise. A header row contains no digits, while the
       * value row does; the next row must have the same number of cells.
       */
      const next = rows[r + 1] ?? [];
      const headerLike = !hasDigit(cells);
      const valueLike = next.length === cells.length && hasDigit(next);

      if (headerLike && valueLike) {
        for (let i = 0; i < cells.length; i++) {
          pairs.push({ label: cells[i], value: next[i] });
        }
        r++; // Consume the value row.
        continue;
      }

      // Fallback: keep the historic adjacent-cell pairing.
      for (let i = 0; i < cells.length - 1; i += 2) {
        pairs.push({ label: cells[i], value: cells[i + 1] });
      }
      continue;
    }

    if (cells.length === 1 && r + 1 < rows.length) {
      // Label in current row, value in the next single-cell row.
      const next = rows[r + 1];
      if (next.length === 1) {
        pairs.push({ label: cells[0], value: next[0] });
        r++; // Skip next row since it served as value.
      }
    }
  }

  // 2. Process Definition Lists (<dl><dt>Label</dt><dd>Value</dd></dl>)
  $('dl').each((_, dl) => {
    const children = $(dl).children('dt, dd').toArray();
    for (let i = 0; i < children.length - 1; i++) {
      if (children[i].tagName.toLowerCase() === 'dt' && children[i + 1].tagName.toLowerCase() === 'dd') {
        const label = cleanText($(children[i]).text());
        const value = cleanText($(children[i + 1]).text());
        if (label && value) {
          pairs.push({ label, value });
        }
      }
    }
  });

  // 3. Process generic container elements with label and value classes or 2 adjacent children
  $('.row, .item, .field, .detail-row, .info-row, li').each((_, el) => {
    const labelEl = $(el).find('.label, .name, .title, .key').first();
    const valueEl = $(el).find('.value, .data, .desc, .val').first();
    if (labelEl.length && valueEl.length) {
      const label = cleanText(labelEl.text());
      const value = cleanText(valueEl.text());
      if (label && value) {
        pairs.push({ label, value });
      }
    }
  });

  return pairs;
}

/**
 * Parses raw official Telebirr receipt HTML using Cheerio.
 * Enforces strict label-to-value association and priority-based amount resolution.
 */
export function parseOfficialTelebirrHtml(rawHtml: string): OfficialTelebirrReceipt {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return {
      reference: null,
      amount: null,
      settledAmount: null,
      totalPaidAmount: null,
      serviceFee: null,
      serviceFeeVat: null,
      currency: 'UNKNOWN',
      status: null,
      paymentDate: null,
      payerName: null,
      payerPhone: null,
      receiverName: null,
      receiverAccount: null,
    };
  }

  const pairs = extractPairsFromHtml(rawHtml);

  // Helper to find value matching any of the given label patterns
  function findValue(labelPatterns: (string | RegExp)[]): string | null {
    for (const pattern of labelPatterns) {
      for (const pair of pairs) {
        const cleanLabel = pair.label.toLowerCase();
        if (typeof pattern === 'string') {
          if (cleanLabel.includes(pattern.toLowerCase())) {
            return pair.value;
          }
        } else {
          if (pattern.test(pair.label)) {
            return pair.value;
          }
        }
      }
    }
    return null;
  }

  // Parse reference
  let reference = findValue([
    'transaction number',
    'transaction no',
    'transaction reference',
    'receipt number',
    'receipt no',
    'invoice number',
    'invoice no',
    'reference',
    'የደረሰኝ ቁጥር',
    'የግብይት ቁጥር',
    'የክፍያ ቁጥር',
  ]);

  if (reference) {
    const refMatch = reference.match(/[A-Z0-9]{9,12}/i);
    if (refMatch && isValidTelebirrRef(refMatch[0])) {
      reference = refMatch[0].toUpperCase();
    } else {
      reference = null;
    }
  }

  if (!reference) {
    // If not found in table pairs, search clean body text for 10-char reference (avoids script/style tags)
    // Never count full number or full alphabet as Telebirr reference
    const $ = load(rawHtml);
    $('script, style, noscript').remove();
    const cleanBody = cleanText($('body').text());
    const matches = cleanBody.match(/\b([A-Z0-9]{10})\b/gi) ?? [];
    for (const m of matches) {
      const cand = m.toUpperCase();
      if (isValidTelebirrRef(cand)) {
        reference = cand;
        break;
      }
    }
  }

  // Parse status
  const status = findValue([
    'transaction status',
    'payment status',
    'status',
    'የክፍያው ሁኔታ',
    'የክፍያ ሁኔታ',
    'የግብይት ሁኔታ',
    'ሁኔታ',
  ]);

  // Parse date: do NOT include bare 'date' which matches 'VAT Reg. Date'
  const paymentDate = findValue([
    'payment date',
    'transaction date',
    'የክፍያ ቀን',
  ]);

  // Parse payer & receiver
  const payerName = findValue(['payer name', 'payer', 'የከፋይ ስም']);
  const payerPhone = findValue(['payer telebirr no', 'payer phone', 'payer mobile', 'የከፋይ ቴሌብር ቁ.']);
  const receiverName = findValue(['credited party name', 'receiver name', 'receiver', 'የገንዘብ ተቀባይ ስም', 'ተከፋይ']);
  const receiverAccount = findValue(['credited party account no', 'receiver account', 'receiver telebirr no', 'የገንዘብ ተቀባይ ቴሌብር ቁ.']);

  // Parse fees
  let serviceFee: number | null = null;
  let serviceFeeVat: number | null = null;

  for (const pair of pairs) {
    const lower = pair.label.toLowerCase();
    // Check VAT/tax FIRST: the VAT row's label (".../Service fee VAT",
    // "የአገልግሎት ክፍያ ተ.እ.ታ") also contains the words "service fee", so the
    // fee branch would otherwise overwrite serviceFee with the VAT amount.
    if (lower.includes('vat') || lower.includes('tax') || lower.includes('ተ.እ.ታ') || lower.includes('ቫት')) {
      const parsed = parseCurrencyAmount(pair.value);
      if (parsed) serviceFeeVat = parsed.amount;
    } else if (lower.includes('service fee') || lower.includes('service charge') || lower.includes('የአገልግሎት ክፍያ')) {
      const parsed = parseCurrencyAmount(pair.value);
      if (parsed) serviceFee = parsed.amount;
    }
  }

  // Parse candidate amounts according to priority:
  // 1. Settled Amount
  // 2. Amount Settled
  // 3. Total Paid Amount
  // 4. Total Paid
  // 5. Paid Amount
  // 6. Amount Paid
  // 7. Amharic equivalent of settled/paid amount
  const priorityPatterns: { priority: number; patterns: string[]; isAmharic?: boolean }[] = [
    { priority: 1, patterns: ['settled amount'] },
    { priority: 2, patterns: ['amount settled'] },
    { priority: 3, patterns: ['total paid amount'] },
    { priority: 4, patterns: ['total paid'] },
    { priority: 5, patterns: ['paid amount'] },
    { priority: 6, patterns: ['amount paid'] },
    {
      priority: 7,
      patterns: ['የተከፈለው መጠን', 'ጠቅላላ የተከፈለ', 'የተከፈለ መጠን', 'የተከፈለው ገንዘብ'],
      isAmharic: true,
    },
  ];

  let settledAmount: number | null = null;
  let totalPaidAmount: number | null = null;
  let chosenAmount: number | null = null;
  let chosenCurrency: 'ETB' | 'UNKNOWN' = 'UNKNOWN';
  let bestPriority = 999;

  for (const pair of pairs) {
    if (isForbiddenAmountLabel(pair.label)) {
      continue;
    }

    const lowerLabel = pair.label.toLowerCase();
    const parsed = parseCurrencyAmount(pair.value);
    if (!parsed) continue;

    // Track settledAmount
    if (lowerLabel.includes('settled') || lowerLabel.includes('የተከፈለው መጠን')) {
      if (settledAmount === null) settledAmount = parsed.amount;
    }

    // Track totalPaidAmount
    if (lowerLabel.includes('total paid') || lowerLabel.includes('ጠቅላላ የተከፈለ')) {
      if (totalPaidAmount === null) totalPaidAmount = parsed.amount;
    }

    // Check priority
    for (const group of priorityPatterns) {
      if (group.priority >= bestPriority) continue;

      const matches = group.patterns.some((pattern) => {
        return lowerLabel.includes(pattern.toLowerCase()) || pair.label.includes(pattern);
      });

      if (matches) {
        bestPriority = group.priority;
        chosenAmount = parsed.amount;
        if (parsed.currency === 'ETB' || /(ETB|Birr|ብር)/i.test(rawHtml)) {
          chosenCurrency = 'ETB';
        }
        break;
      }
    }
  }

  // Currency resolution: if amount was found, verify ETB/Birr/ብር is present
  if (chosenAmount !== null && chosenCurrency === 'UNKNOWN') {
    if (/(ETB|Birr|ብር)/i.test(rawHtml)) {
      chosenCurrency = 'ETB';
    }
  }

  return {
    reference,
    amount: chosenAmount,
    settledAmount,
    totalPaidAmount,
    serviceFee,
    serviceFeeVat,
    currency: chosenCurrency,
    status,
    paymentDate,
    payerName,
    payerPhone,
    receiverName,
    receiverAccount,
  };
}

