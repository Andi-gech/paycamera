export type ReceiptStatus = 'verified' | 'not_verified' | 'unable';

export type CheckOutcome = {
  status: ReceiptStatus;
  title: string;
  detail: string;
  httpStatus?: number;
  referenceFound?: string;
  amount: number | null;
  url?: string;
};

export type VerificationArgs = {
  bank: string;
  reference: string;
  expectedAmount: number;
  receiptUrl: string;
  receiverAccountLast8?: string;
  receiptText?: string;
};

export interface ExtraAccountConfig {
  label: string;
  hint: string;
  placeholder: string;
  maxLength: number;
}

export interface BankDefinition {
  id: string;
  label: string;
  referencePattern: RegExp;
  referenceHint: string;
  needsReceiptUrl?: boolean;
}

export interface BankAdapter extends BankDefinition {
  aliases: string[];
  allowedHosts?: string[];
  isReadOnlyAmount?: boolean;
  allowsEmptyReferenceIfUrl?: boolean;
  extraAccount?: ExtraAccountConfig;
  buildReceiptUrl?: (reference: string, receiverAccountLast8?: string) => string;
  openReceiptUrl?: (reference: string, receiverAccountLast8?: string, receiptUrl?: string) => string;
  extractReference?: (text: string, url: string, barcodes?: string[]) => string;
  extractAmount?: (text: string, url?: string) => number | string | null;
  extractExtraAccount?: (textOrUrl: string) => string;
  getReferenceForVerification?: (reference: string, receiptUrl: string) => string;
  verify: (args: VerificationArgs) => Promise<CheckOutcome>;
}
