// lib/types.ts — Shared types for ReceiptCheck

export type BankId = 'telebirr' | 'cbe' | 'dashen' | 'awash' | 'boa' | 'other';

export interface BankOption {
  id: BankId;
  name: string;
  subtitle: string;
  color: string;
  initials: string;
  badgeBg: string;
  badgeTextColor: string;
  disabled?: boolean;
}

export const BANK_OPTIONS: BankOption[] = [
  {
    id: 'telebirr',
    name: 'Telebirr',
    subtitle: 'Mobile Money',
    color: '#0D47A1',
    initials: 'tele\nbirr',
    badgeBg: '#1976D2',
    badgeTextColor: '#FFFFFF',
    disabled: false,
  },
  {
    id: 'cbe',
    name: 'CBE',
    subtitle: 'Commercial Bank of Ethiopia',
    color: '#6A1B9A',
    initials: 'CBE',
    badgeBg: '#F59E0B',
    badgeTextColor: '#FFFFFF',
    disabled: false,
  },
  {
    id: 'boa',
    name: 'Bank of Abyssinia',
    subtitle: 'BOA / Apollo',
    color: '#D97706',
    initials: 'BOA',
    badgeBg: '#D97706',
    badgeTextColor: '#FFFFFF',
    disabled: false,
  },
  {
    id: 'dashen',
    name: 'Dashen Bank',
    subtitle: 'Bank',
    color: '#1565C0',
    initials: 'DASHEN',
    badgeBg: '#0D47A1',
    badgeTextColor: '#FFFFFF',
    disabled: true,
  },
  {
    id: 'awash',
    name: 'Awash Bank',
    subtitle: 'Bank',
    color: '#E65100',
    initials: 'AWASH',
    badgeBg: '#00695C',
    badgeTextColor: '#FFFFFF',
    disabled: true,
  },
  {
    id: 'other',
    name: 'Other Banks',
    subtitle: 'More options',
    color: '#546E7A',
    initials: 'BANK',
    badgeBg: '#78909C',
    badgeTextColor: '#FFFFFF',
    disabled: true,
  },
];

export type VerificationStatus = 'verified' | 'failed' | 'pending';

export interface VerificationRecord {
  id: string;
  bank: BankId;
  bankName: string;
  reference: string;
  amount: string | null;
  currency: string;
  status: VerificationStatus;
  senderName: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  transactionTime: string | null;
  receiptUrl: string | null;
  errorMessage: string | null;
  isLegacy: boolean;
  createdAt: string;   // ISO 8601
  imageUri?: string | null;
}
