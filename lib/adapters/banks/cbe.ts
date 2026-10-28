import { BankAdapter, CheckOutcome, VerificationArgs } from '../types';
import { fetchBinary } from '../utils/http';
import { extractAmount, findJsonValue, normalizeAmount, stripHtml } from '../utils/text';

export const CbeAdapter: BankAdapter = {
  id: 'cbe',
  label: 'CBE',
  aliases: ['cbe', 'commercial bank of ethiopia', 'combank'],
  referencePattern: /^[A-Z0-9-]{6,80}$/i,
  referenceHint: 'Enter the CBE receipt ID or paste its receipt link.',
  allowsEmptyReferenceIfUrl: true,
  allowedHosts: ['mbreciept.cbe.com.et'],

  buildReceiptUrl: (reference: string) => {
    const clean = reference.trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;
    return `https://mbreciept.cbe.com.et/${encodeURIComponent(clean)}`;
  },

  getReferenceForVerification: (reference: string, receiptUrl: string) => {
    const candidate = reference.trim() || receiptUrl.trim();
    try {
      const parsed = new URL(candidate);
      if (parsed.hostname.toLowerCase() === 'mbreciept.cbe.com.et') {
        return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
      }
    } catch {}
    return reference.trim();
  },

  verify: async (args: VerificationArgs): Promise<CheckOutcome> => {
    let reference = args.reference.trim();
    const supplied = args.receiptUrl.trim();
    if (supplied) {
      const fromUrlRef = CbeAdapter.getReferenceForVerification!(reference, supplied);
      if (fromUrlRef) reference = fromUrlRef;
    }

    const targetUrl = supplied || CbeAdapter.buildReceiptUrl!(reference);
    if (!targetUrl) {
      return { status: 'unable', title: 'Receipt URL required', detail: 'Paste the CBE receipt link or enter the receipt ID.', amount: null };
    }

    try {
      const { status, contentType, bytes } = await fetchBinary(targetUrl, {
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      });

      if (status !== 200) {
        return {
          status: 'unable',
          title: 'Official receipt could not be retrieved',
          detail: `CBE returned HTTP ${status}. This is not proof that the receipt is fake or genuine.`,
          httpStatus: status,
          amount: null,
          url: targetUrl,
        };
      }

      const body = new TextDecoder('utf-8').decode(bytes);
      let officialAmount: number | null = null;
      let officialReference = '';

      if (contentType.toLowerCase().includes('json') || /^[\s]*[\[{]/.test(body)) {
        let data: unknown;
        try { data = JSON.parse(body); } catch { data = null; }
        if (data) {
          const amountValue = findJsonValue(data, ['amountCredited', 'transactionAmount', 'amount', 'totalAmount', 'paidAmount', 'creditAmount', 'amountDebited']);
          officialAmount = normalizeAmount(amountValue);
          const refValue = findJsonValue(data, ['receiptId', 'transactionId', 'transactionReference', 'reference', 'referenceNumber', 'ftNumber', 'id']);
          officialReference = refValue == null ? '' : String(refValue).trim();
        }
      } else {
        const officialText = stripHtml(body);
        officialAmount = extractAmount(officialText) ? normalizeAmount(extractAmount(officialText)) : null;
        if (reference && officialText.toUpperCase().includes(reference.toUpperCase())) {
          officialReference = reference;
        } else {
          const refMatch = officialText.match(/\b(?:FT[A-Z0-9]{8,14}|[A-Z0-9-]{8,40})\b/i);
          officialReference = refMatch?.[0] ?? '';
        }
      }

      if (officialAmount === null) {
        return {
          status: 'unable',
          title: 'Receipt details could not be read',
          detail: 'CBE responded, but transaction details could not be confidently identified.',
          httpStatus: status,
          referenceFound: officialReference,
          amount: null,
          url: targetUrl,
        };
      }

      let parsedUrl: URL | null = null;
      try { parsedUrl = new URL(targetUrl); } catch {}
      const urlSegment = parsedUrl ? parsedUrl.pathname.split('/').filter(Boolean).pop() : '';

      const amountMatches = Math.abs(officialAmount - args.expectedAmount) < 0.005;
      const referenceMatches = Boolean(
        officialReference ||
        urlSegment ||
        (reference && officialReference.toUpperCase().includes(reference.toUpperCase()))
      );

      if (amountMatches && referenceMatches) {
        return {
          status: 'verified',
          title: 'Official CBE receipt details match',
          detail: `The official receipt response contains an amount of ${officialAmount} ETB and receipt ID ${officialReference || urlSegment || reference}. Compare details in your bank app before relying on this result.`,
          httpStatus: status,
          referenceFound: officialReference || reference,
          amount: officialAmount,
          url: targetUrl,
        };
      }

      return {
        status: 'not_verified',
        title: 'Receipt details do not match',
        detail: `Official CBE amount is ${officialAmount} ETB. Expected ${args.expectedAmount} ETB.${!referenceMatches ? ' Transaction reference could not be matched.' : ''}`,
        httpStatus: status,
        referenceFound: officialReference || reference,
        amount: officialAmount,
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

