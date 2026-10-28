import { BankAdapter, CheckOutcome, VerificationArgs } from '../types';

function createGenericAdapter(
  id: string,
  label: string,
  aliases: string[],
  pattern: RegExp = /^[A-Z0-9-]{6,40}$/i,
  hint: string = 'Enter the receipt reference.'
): BankAdapter {
  return {
    id,
    label,
    aliases,
    referencePattern: pattern,
    referenceHint: hint,
    needsReceiptUrl: true,
    verify: async (args: VerificationArgs): Promise<CheckOutcome> => {
      return {
        status: 'unable',
        title: 'Direct verification not configured',
        detail: `OCR can read this ${label} receipt, but a direct official lookup method is not configured for this provider yet. Inspect the receipt manually.`,
        amount: null,
        url: args.receiptUrl || undefined,
      };
    },
  };
}

export const DashenAdapter = createGenericAdapter('dashen', 'Dashen Bank', ['dashen', 'dashen bank']);
export const AmoleAdapter = createGenericAdapter('amole', 'Amole', ['amole']);
export const MpesaAdapter = createGenericAdapter('mpesa', 'M-Pesa', ['mpesa', 'm-pesa']);
export const ZamzamAdapter = createGenericAdapter('zamzam', 'ZamZam Bank', ['zamzam', 'zam zam', 'zamzam bank']);
export const EbirrAdapter = createGenericAdapter('ebirr', 'eBirr', ['ebirr', 'e-birr']);
export const CbeBirrAdapter = createGenericAdapter('cbebirr', 'CBE Birr', ['cbe birr', 'cbebirr']);
export const BunnaAdapter = createGenericAdapter('bunna', 'Bunna Bank', ['bunna', 'bunna bank']);
export const OtherAdapter = createGenericAdapter(
  'other',
  'Other',
  ['other'],
  /^[A-Z0-9-]{4,80}$/i,
  'Enter the reference shown on the receipt.'
);

