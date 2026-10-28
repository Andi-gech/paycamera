import { BankAdapter, CheckOutcome, VerificationArgs } from '../types';
import { fetchBinary } from '../utils/http';
import { extractAmountsFromCbePdf, extractTextFromPdf } from '../utils/pdf';
import { extractAmount, normalizeAmount } from '../utils/text';

export function parseCbeLegacyId(input: string): { reference: string; receiverLast8: string } {
  const clean = input.trim();
  if (!clean) return { reference: '', receiverLast8: '' };

  let candidate = clean;
  try {
    const parsed = new URL(clean);
    if (parsed.hostname.toLowerCase() === 'apps.cbe.com.et') {
      candidate = parsed.searchParams.get('id') ?? clean;
    }
  } catch {}

  const withRec = candidate.match(/^(FT[A-Z0-9]{8,14}?)(\d{8})$/i);
  if (withRec?.[1] && withRec?.[2]) {
    return { reference: withRec[1].toUpperCase(), receiverLast8: withRec[2] };
  }

  const onlyRef = candidate.match(/^(FT[A-Z0-9]{8,14})$/i);
  if (onlyRef?.[1]) {
    return { reference: onlyRef[1].toUpperCase(), receiverLast8: '' };
  }

  return { reference: '', receiverLast8: '' };
}

export function extractReceiverAccountLast8(value: string): string {
  return parseCbeLegacyId(value).receiverLast8;
}

export const CbeLegacyAdapter: BankAdapter = {
  id: 'cbe-legacy',
  label: 'CBE Legacy',
  aliases: ['cbe legacy', 'cbe-legacy', 'legacy cbe'],
  referencePattern: /^FT[A-Z0-9]{8,14}$/i,
  referenceHint: 'Enter the old CBE FT reference.',
  allowedHosts: ['apps.cbe.com.et', 'mbreciept.cbe.com.et'],
  extraAccount: {
    label: 'Receiving account (last 8 digits)',
    hint: 'Required for CBE Legacy lookups (apps.cbe.com.et:100/?id={FT ref}{last8}). Automatically extracted if you paste the link.',
    placeholder: 'Last 8 digits of receiving account',
    maxLength: 8,
  },
  extractExtraAccount: (textOrUrl: string) => extractReceiverAccountLast8(textOrUrl),

  buildReceiptUrl: (reference: string, receiverAccountLast8?: string) => {
    const clean = reference.trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;

    const rec8 = (receiverAccountLast8 ?? '').replace(/\D/g, '').slice(-8);
    const combinedMatch = clean.match(/^(FT[A-Z0-9]{8,14})(\d{8})$/i);
    if (combinedMatch) {
      return `https://apps.cbe.com.et:100/?id=${encodeURIComponent(combinedMatch[1].toUpperCase())}${encodeURIComponent(combinedMatch[2])}`;
    }
    if (clean && rec8.length === 8) {
      return `https://apps.cbe.com.et:100/?id=${encodeURIComponent(clean.toUpperCase())}${encodeURIComponent(rec8)}`;
    }
    return '';
  },

  getReferenceForVerification: (reference: string, receiptUrl: string) => {
    const fromCandidate = parseCbeLegacyId(reference || receiptUrl);
    if (fromCandidate.reference) {
      return fromCandidate.reference;
    }
    return reference.trim().toUpperCase();
  },

  extractReference: (text: string, url: string) => {
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.hostname.toLowerCase() === 'apps.cbe.com.et') {
          const idParam = parsed.searchParams.get('id') ?? '';
          const matchWith8 = idParam.match(/^(FT[A-Z0-9]{10})(\d{8})$/i);
          if (matchWith8?.[1]) return matchWith8[1].toUpperCase();
          const matchBare = idParam.match(/^(FT[A-Z0-9]{10})/i);
          if (matchBare?.[1]) return matchBare[1].toUpperCase();
        }
      } catch {}
    }
    const ftMatch = text.match(/\b(FT[A-Z0-9]{10})\b/i);
    if (ftMatch?.[1]) {
      return ftMatch[1].toUpperCase();
    }
    return '';
  },

  verify: async (args: VerificationArgs): Promise<CheckOutcome> => {
    let reference = args.reference.trim();
    let receiver8 = (args.receiverAccountLast8 ?? '').replace(/\D/g, '').slice(-8);
    const supplied = args.receiptUrl.trim();

    if (supplied) {
      const fromUrlRec = extractReceiverAccountLast8(supplied);
      if (fromUrlRec && !receiver8) receiver8 = fromUrlRec;
      const fromUrlRef = CbeLegacyAdapter.getReferenceForVerification!(reference, supplied);
      if (fromUrlRef) reference = fromUrlRef;
    }

    const combinedMatch = reference.match(/^(FT[A-Z0-9]{8,14})(\d{8})$/i);
    if (combinedMatch) {
      reference = combinedMatch[1].toUpperCase();
      if (!receiver8) receiver8 = combinedMatch[2];
    }

    const targetUrl = supplied || CbeLegacyAdapter.buildReceiptUrl!(reference, receiver8);

    if (!/^FT[A-Z0-9]{8,14}$/i.test(reference)) {
      return { status: 'unable', title: 'CBE Legacy reference needed', detail: 'Enter the CBE Legacy FT reference (e.g. FT26148KCQXG).', amount: null, url: targetUrl };
    }
    if (!receiver8 || receiver8.length !== 8) {
      return { status: 'unable', title: 'Receiving account details needed', detail: 'CBE Legacy lookups require the last 8 digits of the receiving account (apps.cbe.com.et:100/?id={reference}{last8}). Enter them in the field provided.', amount: null, url: targetUrl };
    }

    try {
      const { status, contentType, contentDisposition, bytes } = await fetchBinary(targetUrl, {
        Accept: 'application/pdf, text/html;q=0.9, */*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      });

      if (status === 404) {
        return {
          status: 'unable',
          title: 'Receiving account digits did not match',
          detail: 'CBE Legacy returned HTTP 404 (Not Allowed). Check that the last 8 digits of the receiving account match this FT transaction reference.',
          httpStatus: status,
          amount: null,
          url: targetUrl,
        };
      }
      if (status === 500) {
        return {
          status: 'unable',
          title: 'CBE receipt not found',
          detail: 'CBE Legacy returned HTTP 500 (Invalid link). Verify that the FT reference number is correct and already processed by the bank.',
          httpStatus: status,
          amount: null,
          url: targetUrl,
        };
      }
      if (status !== 200) {
        return {
          status: 'unable',
          title: 'Official receipt could not be retrieved',
          detail: `CBE Legacy returned HTTP ${status}. This is not proof that the receipt is fake or genuine.`,
          httpStatus: status,
          amount: null,
          url: targetUrl,
        };
      }

      const isPdf =
        contentType.toLowerCase().includes('pdf') ||
        (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);

      if (!isPdf) {
        return {
          status: 'unable',
          title: 'Receipt response was not a PDF',
          detail: 'CBE Legacy responded, but did not return a valid PDF document.',
          httpStatus: status,
          amount: null,
          url: targetUrl,
        };
      }

      const pdfText = extractTextFromPdf(bytes);
      const refInHeader = contentDisposition.toUpperCase().includes(reference.toUpperCase());
      const refInText = pdfText.toUpperCase().includes(reference.toUpperCase());
      const referenceFound = refInText || refInHeader;

      const amounts = extractAmountsFromCbePdf(pdfText);
      const transferredAmount = amounts.transferredAmount;
      const totalAmount = amounts.totalDebitedAmount;
      const genericAmount = normalizeAmount(extractAmount(pdfText));

      let officialAmount =
        transferredAmount ??
        totalAmount ??
        (amounts.allAmounts.length > 0 ? amounts.allAmounts[0] : null) ??
        genericAmount;

      const rawExpected = args.expectedAmount;
      const expectedInText =
        pdfText.includes(String(rawExpected)) ||
        pdfText.includes(rawExpected.toLocaleString('en-US')) ||
        pdfText.includes(rawExpected.toFixed(2)) ||
        pdfText.includes(rawExpected.toLocaleString('en-US', { minimumFractionDigits: 2 }));

      if (expectedInText && !amounts.allAmounts.includes(rawExpected)) {
        amounts.allAmounts.push(rawExpected);
        if (officialAmount === null) {
          officialAmount = rawExpected;
        }
      }

      const receiverMatch = pdfText.match(/Receiver[\s\S]{0,50}?([A-Za-z\s]+?)\s*Account/i);
      const receiverName = receiverMatch ? receiverMatch[1].replace(/\s+/g, ' ').trim() : '';
      const receiverAccMatch = pdfText.match(/Receiver[\s\S]{0,50}?Account[\s\S]{0,30}?([0-9*]+)/i);
      const receiverMaskedAcc = receiverAccMatch ? receiverAccMatch[1].trim() : '';

      const payerMatch = pdfText.match(/Payer[\s\S]{0,50}?([A-Za-z\s]+?)\s*Account/i);
      const payerName = payerMatch ? payerMatch[1].replace(/\s+/g, ' ').trim() : '';

      if (officialAmount === null) {
        return {
          status: 'unable',
          title: 'Amount could not be read from PDF',
          detail: 'The official CBE Legacy PDF receipt was downloaded, but the transaction amount could not be read automatically. Tap "Open receipt page" to inspect the document manually.',
          httpStatus: status,
          referenceFound: referenceFound ? reference : undefined,
          amount: null,
          url: targetUrl,
        };
      }

      const matchesTransferred = transferredAmount !== null && Math.abs(transferredAmount - args.expectedAmount) < 0.005;
      const matchesTotal = totalAmount !== null && Math.abs(totalAmount - args.expectedAmount) < 0.005;
      const matchesAny = amounts.allAmounts.some((a) => Math.abs(a - args.expectedAmount) < 0.005);
      const matchesGeneric = Math.abs(officialAmount - args.expectedAmount) < 0.005;
      const amountMatches = matchesTransferred || matchesTotal || matchesAny || matchesGeneric || expectedInText;

      if (amountMatches) {
        if (matchesTransferred && transferredAmount !== null) {
          officialAmount = transferredAmount;
        } else if (matchesTotal && totalAmount !== null) {
          officialAmount = totalAmount;
        } else {
          const matched = amounts.allAmounts.find((a) => Math.abs(a - args.expectedAmount) < 0.005);
          if (matched !== undefined) {
            officialAmount = matched;
          } else if (expectedInText) {
            officialAmount = args.expectedAmount;
          }
        }
      }

      if (amountMatches && referenceFound) {
        const detailParts: string[] = [
          `Verified official CBE Legacy receipt.`,
          transferredAmount !== null ? `Transferred: ${transferredAmount} ETB` : `Amount: ${officialAmount} ETB`,
        ];
        if (totalAmount !== null && totalAmount !== transferredAmount) {
          detailParts.push(`(Total debited: ${totalAmount} ETB).`);
        }
        if (receiverName) {
          detailParts.push(`\nReceiver: ${receiverName}${receiverMaskedAcc ? ` (${receiverMaskedAcc})` : ''}.`);
        }
        if (payerName) {
          detailParts.push(`\nPayer: ${payerName}.`);
        }
        return {
          status: 'verified',
          title: 'Official CBE Legacy receipt matched',
          detail: detailParts.join(' '),
          httpStatus: status,
          referenceFound: reference,
          amount: officialAmount,
          url: targetUrl,
        };
      }

      return {
        status: 'not_verified',
        title: 'Receipt details do not match',
        detail: `Official CBE amount is ${transferredAmount ?? officialAmount} ETB${totalAmount ? ` (total debited: ${totalAmount} ETB)` : ''}. Expected ${args.expectedAmount} ETB. ${!referenceFound ? 'The returned transaction reference could not be matched.' : 'The amount differs from the expected amount.'}`,
        httpStatus: status,
        referenceFound: referenceFound ? reference : undefined,
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

