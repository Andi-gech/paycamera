import { BankAdapter, CheckOutcome, VerificationArgs } from '../types';
import { fetchBinary } from '../utils/http';
import { isValidReference, normalizeAmount, stripHtml } from '../utils/text';

export const AwashAdapter: BankAdapter = {
  id: 'awash',
  label: 'Awash Bank',
  aliases: ['awash', 'awash bank', 'awash pay', 'awashbirr'],
  referencePattern: /^[A-Za-z0-9-]{6,40}$/i,
  referenceHint: 'Enter the Awash transaction ID or paste the receipt link (awashpay.awashbank.com).',
  allowedHosts: ['awashpay.awashbank.com'],
  needsReceiptUrl: true,

  buildReceiptUrl: (reference: string) => {
    const clean = reference.trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;
    if (clean.startsWith('-')) return `https://awashpay.awashbank.com:8225/${encodeURIComponent(clean)}`;
    return '';
  },

  getReferenceForVerification: (reference: string, receiptUrl: string) => {
    const raw = reference.trim();
    if (raw && raw !== '0000030100' && isValidReference(raw)) {
      return raw;
    }
    if (receiptUrl) {
      try {
        const parsed = new URL(receiptUrl);
        if (parsed.hostname.toLowerCase().includes('awashbank.com')) {
          const token = parsed.pathname.replace(/^\//, '').trim();
          if (token) return token;
        }
      } catch {}
    }
    return raw;
  },

  extractReference: (text: string, url: string) => {
    const txnIdMatch = text.match(/(?:transaction\s*id)[\s\S]{0,25}?[:\-]?\s*([0-9A-Za-z-]{10,40})/i);
    if (txnIdMatch?.[1] && isValidReference(txnIdMatch[1])) {
      return txnIdMatch[1].trim().toUpperCase();
    }
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.hostname.toLowerCase().includes('awashbank.com')) {
          const token = parsed.pathname.replace(/^\//, '').trim();
          if (token && token.length >= 6) return token.toUpperCase();
        }
      } catch {}
    }
    return '';
  },

  verify: async (args: VerificationArgs): Promise<CheckOutcome> => {
    let reference = args.reference.trim();
    const supplied = args.receiptUrl.trim();

    if (supplied) {
      const fromUrlRef = AwashAdapter.getReferenceForVerification!(reference, supplied);
      if (fromUrlRef && (reference === '0000030100' || !reference)) {
        reference = fromUrlRef;
      }
    }

    const targetUrl = supplied || AwashAdapter.buildReceiptUrl!(reference);

    if (!targetUrl) {
      return { status: 'unable', title: 'Receipt URL required', detail: 'Paste the Awash receipt link copied from the bank app or SMS.', amount: null };
    }

    try {
      const { status, bytes } = await fetchBinary(targetUrl, {
        Accept: 'text/html,application/json,*/*',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      });

      if (status !== 200) {
        return {
          status: 'unable',
          title: 'Official receipt could not be retrieved',
          detail: `Awash Bank returned HTTP ${status}. This is not proof that the receipt is fake or genuine.`,
          httpStatus: status,
          amount: null,
          url: targetUrl,
        };
      }

      const body = new TextDecoder('utf-8').decode(bytes);
      const officialText = stripHtml(body);

      const transMatch = officialText.match(/(?:transferred\s*amount|amount)[\s\S]{0,25}?[:\-]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:ETB|Birr)?/i);
      const officialAmount = transMatch ? normalizeAmount(transMatch[1]) : null;
      const idMatch = officialText.match(/(?:transaction\s*id)[\s\S]{0,25}?[:\-]?\s*([0-9A-Za-z-]{6,40})/i);
      const officialReference = idMatch ? idMatch[1].trim() : '';
      const senderMatch = officialText.match(/(?:sender\s*name)[\s\S]{0,30}?[:\-]?\s*([A-Za-z\s]+?)(?=(?:sender\s*account|beneficiary|$))/i);
      const senderName = senderMatch ? senderMatch[1].trim() : '';
      const benMatch = officialText.match(/(?:beneficiary\s*name)[\s\S]{0,30}?[:\-]?\s*([A-Za-z\s]+?)(?=(?:beneficiary\s*account|beneficiary\s*bank|$))/i);
      const beneficiaryName = benMatch ? benMatch[1].trim() : '';
      const bankMatch = officialText.match(/(?:beneficiary\s*bank)[\s\S]{0,30}?[:\-]?\s*([A-Za-z\s]+?)(?=(?:reason|transaction|$))/i);
      const beneficiaryBank = bankMatch ? bankMatch[1].trim() : '';

      if (officialAmount !== null) {
        const amountMatches = Math.abs(officialAmount - args.expectedAmount) < 0.01;
        const refMatches =
          !reference ||
          reference === '0000030100' ||
          reference === officialReference ||
          officialReference.includes(reference) ||
          reference.includes(officialReference) ||
          targetUrl.includes(reference);

        if (amountMatches && refMatches) {
          const detailParts = [`Verified official Awash Bank receipt.`];
          detailParts.push(`Amount: ${officialAmount} ETB.`);
          if (beneficiaryName) detailParts.push(`Beneficiary: ${beneficiaryName}${beneficiaryBank ? ` (${beneficiaryBank})` : ''}.`);
          if (senderName) detailParts.push(`Sender: ${senderName}.`);
          if (officialReference) detailParts.push(`Txn ID: ${officialReference}.`);
          return {
            status: 'verified',
            title: 'Official Awash Bank receipt matched',
            detail: detailParts.join(' '),
            httpStatus: status,
            referenceFound: officialReference || reference,
            amount: officialAmount,
            url: targetUrl,
          };
        }

        return {
          status: 'not_verified',
          title: 'Receipt details do not match',
          detail: `Official Awash Bank receipt shows ${officialAmount} ETB${officialReference ? ` (Txn ID: ${officialReference})` : ''}. Expected ${args.expectedAmount} ETB.${!refMatches ? ' Transaction reference does not match.' : ''}`,
          httpStatus: status,
          referenceFound: officialReference || reference,
          amount: officialAmount,
          url: targetUrl,
        };
      }

      return {
        status: 'unable',
        title: 'Receipt details could not be read',
        detail: 'Awash Bank responded, but transaction details could not be found on the receipt page.',
        httpStatus: status,
        referenceFound: officialReference || reference,
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

