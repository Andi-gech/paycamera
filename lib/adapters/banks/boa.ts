import { BankAdapter, CheckOutcome, VerificationArgs } from '../types';
import { fetchBinary } from '../utils/http';
import { findJsonValue, isValidReference, normalizeAmount } from '../utils/text';

export function parseBoaId(input: string): { reference: string; accountSuffix: string } {
  const clean = input.trim();
  if (!clean) return { reference: '', accountSuffix: '' };

  let candidate = clean;
  try {
    const parsed = new URL(clean);
    if (parsed.hostname.toLowerCase() === 'cs.bankofabyssinia.com') {
      candidate = parsed.searchParams.get('trx') ?? parsed.searchParams.get('id') ?? clean;
    }
  } catch {}

  const withSuffix = candidate.match(/^(FT[A-Z0-9]{10})(\d{4,6})$/i);
  if (withSuffix?.[1] && withSuffix?.[2]) {
    return { reference: withSuffix[1].toUpperCase(), accountSuffix: withSuffix[2] };
  }

  const onlyRef = candidate.match(/^(FT[A-Z0-9]{10})$/i) || candidate.match(/^(FT[A-Z0-9]{8,14})$/i);
  if (onlyRef?.[1]) {
    return { reference: onlyRef[1].toUpperCase(), accountSuffix: '' };
  }

  return { reference: '', accountSuffix: '' };
}

export function extractBoaAccountSuffix(value: string): string {
  return parseBoaId(value).accountSuffix;
}

export const BoaAdapter: BankAdapter = {
  id: 'boa',
  label: 'Bank of Abyssinia (BOA)',
  aliases: ['boa', 'abyssinia', 'bank of abyssinia'],
  referencePattern: /^(FT[A-Z0-9]{8,14}|[A-Z0-9-]{6,40})$/i,
  referenceHint: 'Enter the BOA FT reference (e.g. FT26091B1X51) or paste the receipt link.',
  allowedHosts: ['cs.bankofabyssinia.com'],
  extraAccount: {
    label: 'Account number suffix (last 5 digits)',
    hint: 'Used by Bank of Abyssinia online verification. Automatically extracted if you paste or scan the receipt link.',
    placeholder: 'Last 5 digits of account (if known)',
    maxLength: 5,
  },
  extractExtraAccount: (textOrUrl: string) => extractBoaAccountSuffix(textOrUrl),

  buildReceiptUrl: (reference: string, receiverAccountLast8?: string) => {
    const clean = reference.trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;

    const parsed = parseBoaId(clean);
    const suffix = parsed.accountSuffix || (receiverAccountLast8 ?? '').replace(/\D/g, '').slice(-5);
    const ref = parsed.reference || clean.toUpperCase();
    if (ref) {
      return `https://cs.bankofabyssinia.com/api/onlineSlip/getDetails/?id=${encodeURIComponent(ref)}${encodeURIComponent(suffix)}`;
    }
    return '';
  },

  openReceiptUrl: (reference: string, receiverAccountLast8?: string, receiptUrl?: string) => {
    let url = receiptUrl?.trim() || '';
    if (url && url.includes('cs.bankofabyssinia.com/api/onlineSlip/getDetails/')) {
      try {
        const p = new URL(url);
        const idParam = p.searchParams.get('id');
        if (idParam) {
          return `https://cs.bankofabyssinia.com/slip/?trx=${encodeURIComponent(idParam)}`;
        }
      } catch {}
    }
    if (url) return url;
    const clean = reference.trim();
    if (!clean) return '';
    const parsed = parseBoaId(clean);
    const suffix = parsed.accountSuffix || (receiverAccountLast8 ?? '').replace(/\D/g, '').slice(-5);
    const ref = parsed.reference || clean.toUpperCase();
    if (ref) {
      return `https://cs.bankofabyssinia.com/slip/?trx=${encodeURIComponent(ref)}${encodeURIComponent(suffix)}`;
    }
    return '';
  },

  getReferenceForVerification: (reference: string, receiptUrl: string) => {
    const fromCandidate = parseBoaId(reference || receiptUrl);
    if (fromCandidate.reference) {
      return fromCandidate.reference;
    }
    const ftMatch = (reference || receiptUrl).match(/\b(FT[A-Z0-9]{10})\b/i);
    if (ftMatch?.[1]) {
      return ftMatch[1].toUpperCase();
    }
    return reference.trim().toUpperCase();
  },

  extractReference: (text: string, url: string) => {
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.hostname.toLowerCase() === 'cs.bankofabyssinia.com') {
          const param = parsed.searchParams.get('trx') ?? parsed.searchParams.get('id') ?? '';
          const matchWith5 = param.match(/^(FT[A-Z0-9]{10})(\d{5})$/i);
          if (matchWith5?.[1]) return matchWith5[1].toUpperCase();
          const matchBare = param.match(/^(FT[A-Z0-9]{10})/i);
          if (matchBare?.[1]) return matchBare[1].toUpperCase();
          if (isValidReference(param)) return param.toUpperCase();
        }
      } catch {}
    }
    const ftMatch = text.match(/\b(FT[A-Z0-9]{10})\b/i);
    if (ftMatch?.[1] && isValidReference(ftMatch[1])) {
      return ftMatch[1].toUpperCase();
    }
    return '';
  },

  verify: async (args: VerificationArgs): Promise<CheckOutcome> => {
    const supplied = args.receiptUrl.trim();
    let reference = args.reference.trim();
    let receiver8 = (args.receiverAccountLast8 ?? '').replace(/\D/g, '').slice(-8);

    if (supplied) {
      const fromUrlRef = BoaAdapter.getReferenceForVerification!(reference, supplied);
      if (fromUrlRef) reference = fromUrlRef;
    }

    let targetUrl = supplied || BoaAdapter.buildReceiptUrl!(reference, receiver8);

    if (!/^FT[A-Z0-9]{8,14}$/i.test(reference) && !isValidReference(reference)) {
      return { status: 'unable', title: 'Bank of Abyssinia reference needed', detail: 'Enter the BOA FT transaction reference (e.g. FT26091B1X51) or paste the receipt link.', amount: null, url: targetUrl };
    }

    try {
      const parsedUrl = new URL(targetUrl);
      const trxParam = parsedUrl.searchParams.get('trx') ?? parsedUrl.searchParams.get('id');
      if (trxParam && !parsedUrl.pathname.includes('/api/')) {
        targetUrl = `https://cs.bankofabyssinia.com/api/onlineSlip/getDetails/?id=${encodeURIComponent(trxParam)}`;
      }
    } catch {}

    try {
      const { status, bytes } = await fetchBinary(targetUrl, {
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      });

      if (status !== 200) {
        return {
          status: 'unable',
          title: 'Official receipt could not be retrieved',
          detail: `Bank of Abyssinia returned HTTP ${status}. This is not proof that the receipt is fake or genuine.`,
          httpStatus: status,
          amount: null,
          url: targetUrl,
        };
      }

      let bodyStr = new TextDecoder('utf-8').decode(bytes);

      if (bodyStr.includes('Invalid reference number')) {
        const boaParsed = parseBoaId(supplied || reference || targetUrl);
        const ref = boaParsed.reference || reference.toUpperCase();
        const suffix = boaParsed.accountSuffix || receiver8;

        // If suffix is 4 digits (e.g. 0726 instead of 90726), try 0..9 prefix permutations in parallel
        if (ref && suffix && suffix.length === 4) {
          try {
            const promises = [];
            for (let i = 0; i <= 9; i++) {
              const candId = `${ref}${i}${suffix}`;
              const candUrl = `https://cs.bankofabyssinia.com/api/onlineSlip/getDetails/?id=${encodeURIComponent(candId)}`;
              promises.push(
                fetchBinary(candUrl, undefined, 10000).then((res) => ({
                  candId,
                  candUrl,
                  body: new TextDecoder('utf-8').decode(res.bytes),
                  status: res.status,
                })).catch(() => null)
              );
            }
            const results = await Promise.all(promises);
            const found = results.find((r) => r && r.body && !r.body.includes('Invalid reference number'));
            if (found) {
              bodyStr = found.body;
              targetUrl = found.candUrl;
            }
          } catch {}
        }
      }

      if (bodyStr.includes('Invalid reference number')) {
        const hasSuffix = receiver8.length >= 4 || reference.match(/^FT[A-Z0-9]{10}\d{4,6}$/i);
        return {
          status: 'not_verified',
          title: 'Transaction not found on Bank of Abyssinia',
          detail: hasSuffix
            ? 'Bank of Abyssinia reported "Invalid reference number" for this transaction. Check that the reference and account number are correct.'
            : 'Bank of Abyssinia reported "Invalid reference number". BOA lookups require the reference plus the account suffix (last 4 or 5 digits). Enter them in the account field or scan the receipt QR code.',
          httpStatus: status,
          amount: null,
          url: targetUrl,
        };
      }

      let data: unknown;
      try { data = JSON.parse(bodyStr); } catch { data = null; }
      if (data && typeof data === 'object') {
        const amountValue = findJsonValue(data, [
          'Transferred Amount',
          'transferred amount',
          'transferredamount',
          'Total Amount including VAT',
          'total amount including vat',
          'amount',
          'transactionAmount',
        ]);
        const officialAmount = normalizeAmount(amountValue);
        const refValue = findJsonValue(data, [
          'Transaction Reference',
          'transaction reference',
          'transactionreference',
          'id',
          'reference',
        ]);
        const officialReference = refValue ? String(refValue).trim() : reference;
        const payerName = String(findJsonValue(data, ['Source Account Name', "Payer's Name", 'payerName', 'sourceAccountName']) || '').trim();
        const receiverName = String(findJsonValue(data, ["Receiver's Name", 'receiverName']) || '').trim();

        if (officialAmount !== null) {
          const amountMatches = Math.abs(officialAmount - args.expectedAmount) < 0.01;
          const refMatches =
            !reference ||
            !officialReference ||
            officialReference.toUpperCase().includes(reference.toUpperCase()) ||
            reference.toUpperCase().includes(officialReference.toUpperCase());

          let webSlipUrl = targetUrl;
          try {
            const p = new URL(targetUrl);
            const idParam = p.searchParams.get('id');
            if (idParam) {
              webSlipUrl = `https://cs.bankofabyssinia.com/slip/?trx=${encodeURIComponent(idParam)}`;
            }
          } catch {}

          if (amountMatches && refMatches) {
            const detailParts = [`Verified official Bank of Abyssinia receipt.`];
            detailParts.push(`Amount: ${officialAmount} ETB.`);
            if (receiverName) detailParts.push(`Receiver: ${receiverName}.`);
            if (payerName) detailParts.push(`Payer: ${payerName}.`);
            return {
              status: 'verified',
              title: 'Official Bank of Abyssinia receipt matched',
              detail: detailParts.join(' '),
              httpStatus: status,
              referenceFound: officialReference || reference,
              amount: officialAmount,
              url: webSlipUrl,
            };
          }

          return {
            status: 'not_verified',
            title: 'Receipt details do not match',
            detail: `Official Bank of Abyssinia receipt shows ${officialAmount} ETB${officialReference ? ` (${officialReference})` : ''}. Expected ${args.expectedAmount} ETB.`,
            httpStatus: status,
            referenceFound: officialReference || reference,
            amount: officialAmount,
            url: webSlipUrl,
          };
        }
      }

      return {
        status: 'unable',
        title: 'Receipt details could not be read',
        detail: 'Bank of Abyssinia responded, but transaction details could not be parsed.',
        httpStatus: status,
        referenceFound: reference,
        amount: null,
        url: targetUrl,
      };
    } catch (error) {
      return {
        status: 'unable',
        title: 'Receipt could not be checked',
        detail: error instanceof Error ? error.message : 'Network request failed. Check your connection and retry.',
        amount: null,
        url: targetUrl,
      };
    }
  },
};

