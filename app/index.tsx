
import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type * as ExpoMediaLibraryType from 'expo-media-library';
import { StatusBar } from 'expo-status-bar';
import * as SQLite from 'expo-sqlite';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import {
  BANKS,
  ReceiptStatus,
  getBankAdapter,
  getBankDefinition,
  bankNeedsReceiptUrl,
  buildReceiptUrl,
  getReceiptPageUrl,
  inspectInputForBankAndExtra,
  checkReceipt,
  getReferenceForVerification,
  normalizeBank,
  parseReceiptFromImage,
  VERIFICATION_ENABLED_BANK_IDS,
} from '../lib/adapters';
import type { ScrollViewInstance } from 'react-native';
import { BackgroundSvg } from '../src/components/BackgroundSvg';
import {
  VerificationLoadingOverlay,
  ViewfinderLaserBeam,
} from '../src/components/LoadingAnimation';

type ReceiptResult = {
  status: ReceiptStatus;
  title: string;
  detail: string;
  bank?: string;
  reference?: string;
  amount?: string;
  receiptText?: string;
  url?: string;
  photoUri?: string;
  savedToGallery?: 'saved' | 'denied' | 'failed';
};

type HistoryItem = {
  id: number;
  bank: string;
  reference: string;
  amount: string;
  status: string;
  title: string;
  detail: string;
  photo_uri: string;
  created_at: string;
};

/** Busy is a stage, so loading text and button labels match what runs. */
type Busy = 'idle' | 'reading' | 'verifying';

const dbPromise = SQLite.openDatabaseAsync('receiptverify.db');

async function initializeDatabase() {
  const db = await dbPromise;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank TEXT NOT NULL,
      reference TEXT NOT NULL,
      amount TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      title TEXT DEFAULT '',
      detail TEXT DEFAULT '',
      photo_uri TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Older installs created the table before title/detail/photo_uri existed.
  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(receipts)'
  );
  const present = new Set(columns.map((column) => column.name));
  for (const [name, ddl] of [
    ['title', 'TEXT DEFAULT \'\''],
    ['detail', 'TEXT DEFAULT \'\''],
    ['photo_uri', 'TEXT DEFAULT \'\''],
  ] as const) {
    if (!present.has(name)) {
      await db.execAsync(`ALTER TABLE receipts ADD COLUMN ${name} ${ddl};`);
    }
  }
}

export async function getStoredSetting(key: string, defaultValue = ''): Promise<string> {
  try {
    const db = await dbPromise;
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key]
    );
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setStoredSetting(key: string, value: string): Promise<void> {
  try {
    const db = await dbPromise;
    await db.runAsync(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  } catch (err) {
    console.error(`Failed to save setting ${key}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Bank Visual Identity & Brand Logos
// ---------------------------------------------------------------------------

export const POPULAR_BANKS = [
  'Telebirr',
  'CBE',
  'CBE Legacy',
  'Awash',
  'BOA',
  'Dashen',
  'CBE Birr',
  'M-Pesa',
];

export const BANK_BRANDING: Record<
  string,
  {
    bg: string;
    fg: string;
    border: string;
    short: string;
    name: string;
  }
> = {
  telebirr: {
    bg: '#0085CA',
    fg: '#FFFFFF',
    border: '#0072B0',
    short: 'TB',
    name: 'Telebirr',
  },
  cbe: {
    bg: '#6A1B78',
    fg: '#FFD700',
    border: '#53135F',
    short: 'CBE',
    name: 'Commercial Bank of Ethiopia',
  },
  'cbe legacy': {
    bg: '#541560',
    fg: '#FFD700',
    border: '#41104B',
    short: 'CBE',
    name: 'CBE Legacy',
  },
  'cbe-legacy': {
    bg: '#541560',
    fg: '#FFD700',
    border: '#41104B',
    short: 'CBE',
    name: 'CBE Legacy',
  },
  cbebirr: {
    bg: '#6A1B78',
    fg: '#4ADE80',
    border: '#53135F',
    short: 'CBB',
    name: 'CBE Birr',
  },
  'cbe birr': {
    bg: '#6A1B78',
    fg: '#4ADE80',
    border: '#53135F',
    short: 'CBB',
    name: 'CBE Birr',
  },
  boa: {
    bg: '#D97706',
    fg: '#FFFFFF',
    border: '#B45309',
    short: 'BOA',
    name: 'Bank of Abyssinia',
  },
  'bank of abyssinia': {
    bg: '#D97706',
    fg: '#FFFFFF',
    border: '#B45309',
    short: 'BOA',
    name: 'Bank of Abyssinia',
  },
  awash: {
    bg: '#0F2847',
    fg: '#F97316',
    border: '#1B3B66',
    short: 'AWB',
    name: 'Awash Bank',
  },
  'awash bank': {
    bg: '#0F2847',
    fg: '#F97316',
    border: '#1B3B66',
    short: 'AWB',
    name: 'Awash Bank',
  },
  dashen: {
    bg: '#1E3A8A',
    fg: '#FBBF24',
    border: '#172554',
    short: 'DB',
    name: 'Dashen Bank',
  },
  'dashen bank': {
    bg: '#1E3A8A',
    fg: '#FBBF24',
    border: '#172554',
    short: 'DB',
    name: 'Dashen Bank',
  },
  mpesa: {
    bg: '#008542',
    fg: '#FFFFFF',
    border: '#006B35',
    short: 'M-P',
    name: 'M-Pesa',
  },
  'm-pesa': {
    bg: '#008542',
    fg: '#FFFFFF',
    border: '#006B35',
    short: 'M-P',
    name: 'M-Pesa',
  },
  amole: {
    bg: '#DC2626',
    fg: '#FFFFFF',
    border: '#B91C1C',
    short: 'AML',
    name: 'Amole',
  },
  bunna: {
    bg: '#78350F',
    fg: '#FDE68A',
    border: '#582407',
    short: 'BN',
    name: 'Bunna Bank',
  },
  zamzam: {
    bg: '#047857',
    fg: '#FCD34D',
    border: '#065F46',
    short: 'ZZ',
    name: 'ZamZam Bank',
  },
  other: {
    bg: '#475569',
    fg: '#FFFFFF',
    border: '#334155',
    short: 'GEN',
    name: 'Other',
  },
};

function BankLogo({
  bankName,
  size = 24,
}: {
  bankName?: string;
  size?: number;
}) {
  const normalized = (bankName ?? '').toLowerCase().trim();
  const branding =
    BANK_BRANDING[normalized] ||
    Object.entries(BANK_BRANDING).find(([k]) => normalized.includes(k))?.[1] ||
    BANK_BRANDING.other;

  const borderRadius = Math.round(size * 0.3);
  const fontSize = size <= 20 ? 8.5 : size <= 26 ? 10 : 12.5;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius,
        backgroundColor: branding.bg,
        borderWidth: 1,
        borderColor: branding.border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Text
        style={{
          color: branding.fg,
          fontSize,
          fontWeight: '900',
          letterSpacing: -0.3,
          textTransform: 'uppercase',
        }}
        numberOfLines={1}
      >
        {branding.short}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Design Tokens & Theming
// ---------------------------------------------------------------------------

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceSubtle: string;
  border: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentSubtle: string;
  headerBg: string;
  headerBorder: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  buttonSecondaryBorder: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  viewfinderBg: string;
  viewfinderBorder: string;
  overlayBg: string;
  modalBg: string;
  modalBorder: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  chipSelectedBg: string;
  chipSelectedBorder: string;
  chipSelectedText: string;
  cardBg: string;
  cardBorder: string;
}

export const LIGHT_THEME: ThemeColors = {
  isDark: false,
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',
  border: '#E2E8F0',
  borderSubtle: '#EDF2F7',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  accent: '#2563EB',
  accentSubtle: '#EFF6FF',
  headerBg: 'transparent',
  headerBorder: '#E2E8F0',
  buttonPrimaryBg: '#0F172A',
  buttonPrimaryText: '#FFFFFF',
  buttonSecondaryBg: '#FFFFFF',
  buttonSecondaryText: '#0F172A',
  buttonSecondaryBorder: '#CBD5E1',
  inputBg: '#F8FAFC',
  inputBorder: '#CBD5E1',
  inputText: '#0F172A',
  inputPlaceholder: '#94A3B8',
  viewfinderBg: '#FFFFFF',
  viewfinderBorder: '#E2E8F0',
  overlayBg: 'rgba(15, 23, 42, 0.6)',
  modalBg: '#FFFFFF',
  modalBorder: '#E2E8F0',
  chipBg: '#FFFFFF',
  chipBorder: '#E2E8F0',
  chipText: '#475569',
  chipSelectedBg: '#EFF6FF',
  chipSelectedBorder: '#2563EB',
  chipSelectedText: '#1D4ED8',
  cardBg: '#FFFFFF',
  cardBorder: '#E2E8F0',
};

export const DARK_THEME: ThemeColors = {
  isDark: true,
  background: '#0C0C0E',
  surface: '#141417',
  surfaceSubtle: '#1C1C20',
  border: '#27272A',
  borderSubtle: '#202024',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  accent: '#3B82F6',
  accentSubtle: '#1E293B',
  headerBg: 'transparent',
  headerBorder: '#27272A',
  buttonPrimaryBg: '#FFFFFF',
  buttonPrimaryText: '#09090B',
  buttonSecondaryBg: '#27272A',
  buttonSecondaryText: '#E4E4E7',
  buttonSecondaryBorder: '#3F3F46',
  inputBg: '#18181B',
  inputBorder: '#333338',
  inputText: '#FFFFFF',
  inputPlaceholder: '#71717A',
  viewfinderBg: '#131316',
  viewfinderBorder: '#232328',
  overlayBg: 'rgba(0, 0, 0, 0.8)',
  modalBg: '#18181B',
  modalBorder: '#2E2E33',
  chipBg: '#18181B',
  chipBorder: '#27272A',
  chipText: '#A1A1AA',
  chipSelectedBg: '#1D3B72',
  chipSelectedBorder: '#3B82F6',
  chipSelectedText: '#FFFFFF',
  cardBg: '#18181B',
  cardBorder: '#2E2E33',
};

export function getStatusTones(status: ReceiptStatus | string, isDark: boolean) {
  if (isDark) {
    switch (status) {
      case 'verified':
        return { bg: '#14291C', ink: '#4EC98A', border: '#1B4D2E' };
      case 'not_verified':
        return { bg: '#2C1A20', ink: '#E5566F', border: '#5C1D24' };
      default:
        return { bg: '#2B2410', ink: '#E8C167', border: '#573D15' };
    }
  } else {
    switch (status) {
      case 'verified':
        return { bg: '#DCFCE7', ink: '#15803D', border: '#86EFAC' };
      case 'not_verified':
        return { bg: '#FEE2E2', ink: '#B91C1C', border: '#FCA5A5' };
      default:
        return { bg: '#FEF3C7', ink: '#B45309', border: '#FCD34D' };
    }
  }
}

export default function Home() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const theme = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [imageUri, setImageUri] = useState('');
  const [savedUri, setSavedUri] = useState(''); // persistent copy shown in history
  const [gallerySaved, setGallerySaved] = useState<null | 'saved' | 'denied' | 'failed'>(null);
  const galleryStatusRef = useRef<ReceiptResult['savedToGallery']>(undefined);
  const [busy, setBusy] = useState<Busy>('idle');
  const [bank, setBank] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiverAccountLast8, setReceiverAccountLast8] = useState('');
  const [receiptText, setReceiptText] = useState('');
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showOcr, setShowOcr] = useState(false);
  const [viewingUri, setViewingUri] = useState('');
  const [dbReady, setDbReady] = useState(false);
  const [savedReceiverAccount, setSavedReceiverAccount] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configInputAccount, setConfigInputAccount] = useState('');
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const resultAnchorY = useRef(0);
  const insets = useSafeAreaInsets();
  const headerTopMargin = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0
  ) + 8;
  const currentAdapter = getBankAdapter(bank);

  useEffect(() => {
    initializeDatabase()
      .then(async () => {
        setDbReady(true);
        try {
          const [storedAccount, storedTheme] = await Promise.all([
            getStoredSetting('cbe_receiver_account', ''),
            getStoredSetting('theme_mode', ''),
          ]);
          if (storedAccount) {
            setSavedReceiverAccount(storedAccount);
            setConfigInputAccount(storedAccount);
          }
          if (storedTheme === 'dark' || storedTheme === 'light') {
            setThemeMode(storedTheme);
          }
        } catch (e) {
          console.warn('Could not load preferences:', e);
        }
        return loadHistory();
      })
      .catch((error) => {
        console.error('Database initialization failed:', error);
        Alert.alert(
          'Database error',
          'Receipt history could not be initialized.'
        );
      });
  }, []);

  async function toggleTheme() {
    const nextTheme = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(nextTheme);
    await setStoredSetting('theme_mode', nextTheme);
  }

  async function saveReceiverAccountConfig(account: string) {
    const clean = account.replace(/\D/g, '').trim();
    if (!clean) {
      Alert.alert('Invalid Account', 'Please enter a valid numeric account number.');
      return;
    }
    setSavedReceiverAccount(clean);
    await setStoredSetting('cbe_receiver_account', clean);
    setConfigSaveSuccess(true);
    setTimeout(() => setConfigSaveSuccess(false), 2000);
  }

  async function clearReceiverAccountConfig() {
    setSavedReceiverAccount('');
    setConfigInputAccount('');
    await setStoredSetting('cbe_receiver_account', '');
  }

  async function loadHistory() {
    try {
      const db = await dbPromise;

      const rows = await db.getAllAsync<HistoryItem>(
        'SELECT * FROM receipts ORDER BY id DESC LIMIT 50'
      );

      setHistory(rows);
    } catch (error) {
      console.error('Could not load history:', error);
    }
  }

  async function saveHistory(item: ReceiptResult) {
    try {
      const db = await dbPromise;

      await db.runAsync(
        `INSERT INTO receipts
         (bank, reference, amount, status, title, detail, photo_uri, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        item.bank ?? '',
        item.reference ?? '',
        item.amount ?? '',
        item.status,
        item.title ?? '',
        item.detail ?? '',
        item.photoUri ?? '',
        new Date().toISOString()
      );

      await loadHistory();
    } catch (error) {
      console.error('Could not save history:', error);
    }
  }

  async function getMediaLibrary(): Promise<typeof ExpoMediaLibraryType | null> {
    try {
      return await import('expo-media-library');
    } catch {
      return null;
    }
  }

  /**
   * Store a camera capture in the device gallery, in its own "Cheki" album.
   * Returns the persistent gallery asset uri when the save succeeded.
   */
  async function saveToGallery(
    localUri: string
  ): Promise<string | 'denied' | 'failed'> {
    try {
      const MediaLibrary = await getMediaLibrary();
      if (!MediaLibrary) return 'failed';

      // Check existing permission safely without showing an aggressive prompt during camera resume
      const permission = await MediaLibrary.getPermissionsAsync();
      if (!permission.granted) return 'denied';

      const asset = await MediaLibrary.createAssetAsync(localUri);
      if (!asset) return 'failed';
      await MediaLibrary.createAlbumAsync('Cheki', asset, false).catch(() => {});
      return asset.uri;
    } catch (error) {
      console.warn('Gallery save failed:', error);
      return 'failed';
    }
  }

  /**
   * Library picks already live in the gallery; resolve their stable local uri
   * from the asset id so the thumbnail and stored record outlive the cache.
   */
  async function resolveLibraryPhoto(assetId: string | null, uri: string): Promise<string> {
    if (!assetId) return uri;
    try {
      const MediaLibrary = await getMediaLibrary();
      if (!MediaLibrary) return uri;

      const info = await MediaLibrary.getAssetInfoAsync(assetId);
      return info?.localUri ?? info?.uri ?? uri;
    } catch {
      return uri;
    }
  }

  async function processImage(
    uri: string,
    fromCamera: boolean,
    assetId: string | null = null,
  ) {
    setBusy('reading');
    setImageUri(uri);
    setSavedUri(uri);
    setResult(null);
    setReceiptText('');
    setReceiptUrl('');
    setReference('');
    setAmount('');
    setGallerySaved(null);

    // Save to gallery in background without blocking OCR or crashing Android activity lifecycle
    if (fromCamera) {
      saveToGallery(uri)
        .then((galleryOutcome) => {
          if (typeof galleryOutcome === 'string' && galleryOutcome !== 'denied' && galleryOutcome !== 'failed') {
            setSavedUri(galleryOutcome);
            setGallerySaved('saved');
          }
        })
        .catch(() => {});
    } else if (assetId) {
      resolveLibraryPhoto(assetId, uri)
        .then((stored) => {
          setSavedUri(stored);
        })
        .catch(() => {});
    }

    try {
      // Run sequentially and safely to prevent Android native Out-Of-Memory process termination
      let ocr = '';
      try {
        const recognized = await TextRecognition.recognize(uri);
        ocr = recognized?.text ?? '';
      } catch (ocrErr) {
        console.warn('Text recognition error:', ocrErr);
      }

      let barcodeValues: string[] = [];
      try {
        const barcodes = await BarcodeScanning.scan(uri);
        barcodeValues = (barcodes as Array<{ value?: string }>)
          .map((item) => item.value ?? '')
          .filter(Boolean);
      } catch (barcodeErr) {
        console.warn('Barcode scan error:', barcodeErr);
      }

      const parsed = parseReceiptFromImage(ocr, barcodeValues);

      console.log('\n================== OCR SCAN RESULT ==================');
      console.log('[OCR] Raw Text Length:', ocr.length);
      console.log('[OCR] Bank:           ', parsed.bank || '(none)');
      console.log('[OCR] Reference:      ', parsed.reference || '(none)');
      console.log('[OCR] Amount:         ', parsed.amount || '(none)');
      console.log('[OCR] Extra Account:  ', parsed.extraAccount || '(none)');
      console.log('[OCR] URL:            ', parsed.url || '(none)');
      console.log('====================================================\n');

      const bankLabel = parsed.bank
        ? getBankAdapter(parsed.bank)?.label || parsed.bank
        : '';

      setReceiptText(ocr);
      setReceiptUrl(parsed.url);
      setBank(bankLabel);
      setReference(parsed.reference);
      setAmount(parsed.amount);
      if (parsed.extraAccount) {
        setReceiverAccountLast8(parsed.extraAccount);
      } else if (savedReceiverAccount) {
        setReceiverAccountLast8(savedReceiverAccount.replace(/\D/g, '').slice(-8));
      }

      if (!ocr.trim() && barcodeValues.length === 0) {
        Alert.alert(
          'No text or QR code found',
          'Try a clearer photo, or point the camera straight at the receipt.'
        );
      } else if (parsed.bank && !parsed.reference) {
        Alert.alert(
          'Transaction number not found',
          'Try a clearer photo, or enter the transaction number manually.'
        );
      }

      /*
       * Photos and screenshots verify the same way: as soon as the bank is
       * a supported one and both the reference and the amount were read,
       * run the check without asking for another tap.
       */
      const detectedAdapter = parsed.bank ? getBankAdapter(parsed.bank) : undefined;
      const parsedAmt = Number(parsed.amount);
      const amountReady =
        parsed.amount !== '' && Number.isFinite(parsedAmt) && parsedAmt > 0;
      if (
        detectedAdapter &&
        VERIFICATION_ENABLED_BANK_IDS.includes(detectedAdapter.id) &&
        parsed.reference &&
        amountReady
      ) {
        await runVerification({
          bankLabel,
          reference: parsed.reference,
          amount: parsed.amount,
          receiptUrl: parsed.url,
          receiverAccount: parsed.extraAccount || (savedReceiverAccount ? savedReceiverAccount.replace(/\D/g, '').slice(-8) : ''),
          receiptText: ocr,
          photoUri: uri,
        });
      }
    } catch (error) {
      console.error('Image processing failed:', error);

      Alert.alert(
        'Processing failed',
        'Cheki could not read this image. Please try another photo.'
      );
    } finally {
      setBusy('idle');
    }
  }

  async function chooseImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission required',
          'Allow photo library access to select a receipt.'
        );
        return;
      }

      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!selected.canceled && selected.assets?.[0]?.uri) {
        await processImage(selected.assets[0].uri, false, selected.assets[0].assetId ?? null);
      }
    } catch (err) {
      console.error('Image library error:', err);
      Alert.alert('Gallery error', 'Could not open photo gallery. Please try again.');
    }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission required',
          'Allow camera access to photograph a receipt.'
        );
        return;
      }

      const captured = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7, // 0.7 prevents Android Camera Out-Of-Memory process crashes while preserving sharp OCR
      });

      if (!captured.canceled && captured.assets?.[0]?.uri) {
        await processImage(captured.assets[0].uri, true, captured.assets[0].assetId ?? null);
      }
    } catch (err) {
      console.error('Camera launch error:', err);
      Alert.alert('Camera error', 'Could not open camera. Please try again.');
    }
  }

  async function runVerification(input: {
    bankLabel: string;
    reference: string;
    amount: string;
    receiptUrl: string;
    receiverAccount: string;
    receiptText: string;
    photoUri: string;
  }): Promise<void> {
    const selectedBank = normalizeBank(input.bankLabel);
    const adapter = getBankAdapter(selectedBank);
    const definition = getBankDefinition(selectedBank);

    const cleanedReference = getReferenceForVerification(
      selectedBank,
      input.reference,
      input.receiptUrl
    );

    let expectedAmount = input.amount.trim()
      ? Number(input.amount.replace(/,/g, ''))
      : null;

    if (expectedAmount !== null && expectedAmount <= 0) {
      expectedAmount = null;
    }

    if (
      adapter?.extractAmount &&
      (expectedAmount === null || !Number.isFinite(expectedAmount)) &&
      input.receiptText
    ) {
      const extracted = adapter.extractAmount(
        input.receiptText,
        input.receiptUrl
      );
      if (extracted !== null && extracted !== undefined && extracted !== '') {
        const num = Number(extracted);
        if (Number.isFinite(num) && num > 0) {
          expectedAmount = num;
          setAmount(String(expectedAmount));
        }
      }
    }

    if (!selectedBank) {
      Alert.alert('Select a bank', 'Choose the bank shown on the receipt.');
      return;
    }

    if (
      !cleanedReference &&
      !(adapter?.allowsEmptyReferenceIfUrl && input.receiptUrl.trim())
    ) {
      Alert.alert(
        'Missing reference',
        `Enter the transaction number${
          adapter?.needsReceiptUrl ? ' or paste the receipt link' : ''
        }.`
      );
      return;
    }

    if (adapter?.extraAccount) {
      const rec = (input.receiverAccount || savedReceiverAccount)
        .replace(/\D/g, '')
        .slice(-adapter.extraAccount.maxLength);
      const urlHasRec = adapter.extractExtraAccount
        ? adapter.extractExtraAccount(input.receiptUrl)
        : '';
      const refHasRec = adapter.extractExtraAccount
        ? adapter.extractExtraAccount(input.reference)
        : '';
      if (!rec && !urlHasRec && !refHasRec) {
        Alert.alert(
          `${adapter.extraAccount.label} required`,
          `${adapter.extraAccount.hint}\n\nTip: You can set your default receiver account in Settings so it is automatically used for every verification.`
        );
        return;
      }
    }

    if (!definition) {
      Alert.alert(
        'Unknown bank',
        'Pick the bank from the list, or choose Other.'
      );
      return;
    }

    if (!definition.referencePattern.test(cleanedReference)) {
      Alert.alert(
        'Check the reference',
        definition.referenceHint
      );
      return;
    }

    if (
      expectedAmount === null ||
      !Number.isFinite(expectedAmount) ||
      expectedAmount < 0
    ) {
      Alert.alert(
        'Amount required',
        adapter?.isReadOnlyAmount
          ? 'The paid amount could not be read from the photo. Capture a clearer receipt.'
          : 'Enter the expected amount from the receipt so it can be compared with the official record.'
      );
      return;
    }

    setBusy('verifying');
    setResult(null);

    console.log('\n========== DIRECT RECEIPT CHECK ==========');
    console.log('[LOCAL] Bank:', definition.id);
    console.log('[LOCAL] Reference:', cleanedReference);
    console.log('[LOCAL] Expected amount:', expectedAmount);
    console.log('[LOCAL] Receipt URL:', input.receiptUrl.trim() || '(none provided)');

    try {
      const effectiveReceiver = (
        input.receiverAccount.trim() ||
        savedReceiverAccount.trim()
      ).replace(/\D/g, '').slice(-8);

      const outcome = await checkReceipt({
        bank: selectedBank,
        reference: cleanedReference,
        expectedAmount,
        receiptUrl: input.receiptUrl,
        receiverAccountLast8: effectiveReceiver,
        receiptText: input.receiptText,
      });

      console.log('[RESULT] Status:', outcome.status);
      console.log('[RESULT] Title:', outcome.title);
      console.log('[RESULT] Detail:', outcome.detail);
      console.log('[RESULT] HTTP:', (outcome as { httpStatus?: number }).httpStatus ?? 'n/a');
      console.log('[RESULT] Reference found:', (outcome as { referenceFound?: string }).referenceFound);
      console.log('[RESULT] Amount read:', outcome.amount);
      console.log('========== END RECEIPT CHECK ==========\n');

      const finalAmount =
        outcome.amount !== null && outcome.amount > 0
          ? String(outcome.amount)
          : input.amount && Number(input.amount) > 0
            ? input.amount
            : '';

      const nextResult: ReceiptResult = {
        status: outcome.status,
        title: outcome.title,
        detail: outcome.detail,
        bank: definition.label,
        reference: cleanedReference,
        amount: finalAmount,
        receiptText: input.receiptText,
        url: outcome.url,
        photoUri: input.photoUri,
        savedToGallery: gallerySaved ?? undefined,
      };

      setResult(nextResult);
      setShowResultModal(true);
      await saveHistory(nextResult);
    } catch (error) {
      console.error('[PHONE] Direct verification failed:', error);

      const nextResult: ReceiptResult = {
        status: 'unable',
        title: 'Receipt could not be checked',
        detail:
          error instanceof Error
            ? error.message
            : 'The official receipt could not be retrieved. Check your internet connection.',
        bank: definition.label,
        reference: cleanedReference,
        amount: input.amount,
        receiptText: input.receiptText,
        photoUri: input.photoUri,
        savedToGallery: gallerySaved ?? undefined,
      };

      setResult(nextResult);
      setShowResultModal(true);
      await saveHistory(nextResult);
    } finally {
      setBusy('idle');
      // Bring the answer into view instead of leaving it below the fold.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: resultAnchorY.current, animated: true });
      });
    }
  }

  /** Manual check re-runs verification from what is currently on the form. */
  async function verifyReceipt() {
    await runVerification({
      bankLabel: bank,
      reference,
      amount,
      receiptUrl,
      receiverAccount: receiverAccountLast8,
      receiptText,
      photoUri: savedUri || imageUri,
    });
  }

  async function clearHistory() {
    Alert.alert(
      'Delete all receipt history?',
      'The 50 most recent checks are kept on this device only. This deletes them permanently.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await dbPromise;
              await db.runAsync('DELETE FROM receipts');
              setHistory([]);
            } catch (error) {
              console.error('Could not delete history:', error);
              Alert.alert('Error', 'Could not delete receipt history.');
            }
          },
        },
      ]
    );
  }

  function selectBank(value: string) {
    setBank(value);
    setResult(null);
    const adapter = getBankAdapter(value);
    if (adapter && receiptText) {
      if (adapter.extractAmount) {
        const amt = adapter.extractAmount(receiptText, receiptUrl);
        if (amt !== null && amt !== undefined && amt !== '') {
          setAmount(String(amt));
        }
      }
      if (adapter.extractReference && !reference) {
        const ref = adapter.extractReference(receiptText, receiptUrl);
        if (ref) setReference(ref);
      }
      if (adapter.extractExtraAccount && !receiverAccountLast8) {
        const extra = adapter.extractExtraAccount(receiptUrl || receiptText);
        if (extra) setReceiverAccountLast8(extra);
      }
      if (adapter.extraAccount) {
        if (!receiverAccountLast8 && savedReceiverAccount) {
          setReceiverAccountLast8(
            savedReceiverAccount.replace(/\D/g, '').slice(-adapter.extraAccount.maxLength)
          );
        } else if (receiverAccountLast8) {
          setReceiverAccountLast8(
            receiverAccountLast8.replace(/\D/g, '').slice(-adapter.extraAccount.maxLength)
          );
        }
      }
    }
  }

  const verificationEnabled =
    currentAdapter && VERIFICATION_ENABLED_BANK_IDS.includes(currentAdapter.id);

  return (
    <View style={[styles.screen, { paddingTop: headerTopMargin, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <BackgroundSvg isDark={theme.isDark} />
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />

      {/* Status Bar Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>C</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.appName}>Cheki</Text>
            <Text style={styles.subtitle}>On-device receipt check</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={toggleTheme}
            activeOpacity={0.7}
            accessibilityLabel={`Switch to ${themeMode === 'light' ? 'Dark' : 'Light'} mode`}
          >
            <Ionicons
              name={themeMode === 'light' ? 'moon-outline' : 'sunny-outline'}
              size={18}
              color={theme.textPrimary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setShowManualEntry(true)}
            activeOpacity={0.7}
            accessibilityLabel="Enter receipt details manually"
          >
            <Ionicons name="create-outline" size={18} color={theme.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerIconButton, history.length > 0 && styles.headerIconButtonActive]}
            onPress={() => setShowHistoryModal(true)}
            activeOpacity={0.7}
            accessibilityLabel="View recent checks history"
          >
            <Ionicons name="time-outline" size={18} color={theme.textPrimary} />
            {history.length > 0 && (
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>
                  {history.length > 99 ? '99+' : history.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerIconButton, savedReceiverAccount ? styles.headerIconButtonConfigured : null]}
            onPress={() => {
              setConfigInputAccount(savedReceiverAccount);
              setShowConfigModal(true);
            }}
            activeOpacity={0.7}
            accessibilityLabel="Open configuration settings"
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color={savedReceiverAccount ? (theme.isDark ? '#38BDF8' : '#0284C7') : theme.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Compact Previous Result Strip (if available) */}
      {result && !showResultModal && (
        <TouchableOpacity
          style={styles.lastResultBanner}
          onPress={() => setShowResultModal(true)}
          activeOpacity={0.8}
          accessibilityLabel="View previous verification result"
        >
          <View style={styles.lastResultBannerLeft}>
            <View
              style={[
                styles.statusPillSmall,
                {
                  backgroundColor: getStatusTones(result.status, theme.isDark).bg,
                  borderColor: getStatusTones(result.status, theme.isDark).border,
                  borderWidth: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                },
              ]}
            >
              <Ionicons
                name={
                  result.status === 'verified'
                    ? 'checkmark-circle'
                    : result.status === 'not_verified'
                      ? 'close-circle'
                      : 'alert-circle'
                }
                size={12}
                color={getStatusTones(result.status, theme.isDark).ink}
              />
              <Text
                style={[
                  styles.statusPillSmallText,
                  { color: getStatusTones(result.status, theme.isDark).ink },
                ]}
              >
                {result.status === 'verified'
                  ? 'Verified'
                  : result.status === 'not_verified'
                    ? 'Failed'
                    : 'Unconfirmed'}
              </Text>
            </View>
            <Text style={styles.lastResultBannerText} numberOfLines={1}>
              {result.bank} {result.amount ? `· ${result.amount} ETB` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={styles.lastResultBannerAction}>View result</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.accent} />
          </View>
        </TouchableOpacity>
      )}

      {/* Hero: Viewfinder Scanner / Receipt Photo Preview (Takes remaining space) */}
      <View style={styles.viewfinderContainer}>
        {imageUri ? (
          <View style={styles.viewfinderWithImage}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.imageTouchWrapper}
              onPress={() => setViewingUri(imageUri)}
              accessibilityLabel="View image full screen"
            >
              <Image
                source={{ uri: imageUri }}
                style={styles.capturedImage}
                resizeMode="contain"
              />
            </TouchableOpacity>

            {/* Overlay Bar */}
            <View style={styles.imageOverlayTop}>
              <View style={styles.imageStatusBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={theme.isDark ? '#4ADE80' : '#15803D'}
                />
                {bank ? <BankLogo bankName={bank} size={16} /> : null}
                <Text style={styles.imageStatusBadgeText}>
                  {reference ? `${bank || 'Receipt'} scanned` : 'Receipt ready'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.clearImageBtn}
                onPress={() => {
                  setImageUri('');
                  setReference('');
                  setAmount('');
                  setReceiptUrl('');
                  setResult(null);
                }}
                accessibilityLabel="Clear photo"
              >
                <Ionicons
                  name="close-circle-outline"
                  size={14}
                  color={theme.isDark ? '#F87171' : '#DC2626'}
                />
                <Text style={styles.clearImageBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>

            {busy === 'reading' ? (
              <View style={styles.readingOverlay}>
                <ViewfinderLaserBeam active={true} />
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.readingOverlayText}>Reading receipt…</Text>
              </View>
            ) : (
              <View style={styles.imageOverlayBottom}>
                <TouchableOpacity onPress={takePhoto} style={styles.quickSwapBtn}>
                  <Ionicons name="camera-outline" size={15} color={theme.textPrimary} />
                  <Text style={styles.quickSwapText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={chooseImage} style={styles.quickSwapBtn}>
                  <Ionicons name="images-outline" size={15} color={theme.textPrimary} />
                  <Text style={styles.quickSwapText}>Pick another</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.viewfinder}>
            {/* Viewfinder corner brackets */}
            <View style={[styles.cornerReticle, styles.cornerTopLeft]} />
            <View style={[styles.cornerReticle, styles.cornerTopRight]} />
            <View style={[styles.cornerReticle, styles.cornerBottomLeft]} />
            <View style={[styles.cornerReticle, styles.cornerBottomRight]} />
            <ViewfinderLaserBeam active={busy === 'reading'} />

            {busy === 'reading' ? (
              <View style={styles.scannerBusyState}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={styles.scannerBusyText}>Scanning text & QR codes…</Text>
              </View>
            ) : (
              <View style={styles.viewfinderEmpty}>
                <View style={styles.scannerIconBox}>
                  <Ionicons name="scan-outline" size={28} color={theme.accent} />
                </View>
                <Text style={styles.viewfinderTitle}>Scan or select receipt</Text>
                <Text style={styles.viewfinderSubtitle}>
                  Telebirr, CBE & CBE Birr verified with bank
                </Text>

                <View style={styles.viewfinderActions}>
                  <TouchableOpacity
                    style={styles.captureButtonPrimary}
                    onPress={takePhoto}
                    activeOpacity={0.85}
                    accessibilityLabel="Take a photo with camera"
                  >
                    <Ionicons name="camera" size={17} color={theme.buttonPrimaryText} />
                    <Text style={styles.captureButtonPrimaryText}>Take Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.captureButtonSecondary}
                    onPress={chooseImage}
                    activeOpacity={0.85}
                    accessibilityLabel="Choose a screenshot from library"
                  >
                    <Ionicons name="image" size={17} color={theme.buttonSecondaryText} />
                    <Text style={styles.captureButtonSecondaryText}>Screenshot</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Provider Selector: Single-line horizontal chips with bank logos */}
      <View style={styles.providerSection}>
        <View style={styles.providerSectionHeader}>
          <Text style={styles.providerSectionTitle}>BANK / PROVIDER</Text>
          <Text style={styles.providerStatusText}>
            {bank ? bank : 'Auto-detected from receipt'}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.providerChipsList}
        >
          {POPULAR_BANKS.map((item) => {
            const selected = normalizeBank(item) === normalizeBank(bank);

            return (
              <TouchableOpacity
                key={item}
                style={[styles.providerChip, selected && styles.providerChipSelected]}
                onPress={() => selectBank(item)}
                accessibilityLabel={`Select ${item}`}
              >
                <BankLogo bankName={item} size={20} />
                <Text
                  style={[
                    styles.providerChipText,
                    selected && styles.providerChipTextSelected,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Bottom Fixed Verify Action */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.mainVerifyButton,
            (busy === 'verifying' || (!reference && !imageUri && !receiptUrl)) &&
              styles.mainVerifyButtonDisabled,
          ]}
          onPress={verifyReceipt}
          disabled={busy !== 'idle'}
          activeOpacity={0.85}
          accessibilityLabel="Check receipt against official bank portal"
        >
          {busy === 'verifying' ? (
            <View style={styles.verifyButtonContent}>
              <ActivityIndicator size="small" color={theme.isDark ? '#111112' : '#FFFFFF'} />
              <Text style={styles.mainVerifyButtonText}>Checking with bank…</Text>
            </View>
          ) : (
            <Text style={styles.mainVerifyButtonText}>
              {reference ? `Verify ${bank || 'Receipt'}` : 'Check against official record'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Verification Loading Overlay */}
      <VerificationLoadingOverlay
        visible={busy === 'verifying'}
        bankName={bank}
        reference={reference}
        isDark={theme.isDark}
      />

      {/* Verification Result Popup Modal */}
      <Modal
        visible={showResultModal && !!result}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResultModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {result && (
              <VerificationResultPopup
                result={result}
                styles={styles}
                isDark={theme.isDark}
                onClose={() => setShowResultModal(false)}
                onOpenPhoto={() => {
                  if (result.photoUri) {
                    setShowResultModal(false);
                    setViewingUri(result.photoUri);
                  }
                }}
                onOpenUrl={() => {
                  const targetUrl =
                    result.url ||
                    (result.bank && result.reference
                      ? getReceiptPageUrl(result.bank, result.reference)
                      : '');
                  if (targetUrl) {
                    Linking.openURL(targetUrl).catch(() =>
                      Alert.alert('Error', 'Could not open the receipt URL.')
                    );
                  } else {
                    Alert.alert('No link', 'No official link available for this receipt.');
                  }
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Recent Checks History Modal */}
      <Modal
        visible={showHistoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Receipt History</Text>
                <Text style={styles.sheetSubtitle}>
                  {history.length ? `${history.length} checks saved on device` : 'No checks saved yet'}
                </Text>
              </View>
              <View style={styles.sheetHeaderActions}>
                {history.length > 0 && (
                  <TouchableOpacity onPress={clearHistory} style={styles.clearHistoryButton}>
                    <Ionicons name="trash-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                    <Text style={styles.clearHistoryText}>Clear all</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.sheetCloseButton}
                  onPress={() => setShowHistoryModal(false)}
                  accessibilityLabel="Close history"
                >
                  <Ionicons name="close" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              {!dbReady ? (
                <Text style={styles.emptyHistory}>Loading receipt history…</Text>
              ) : history.length === 0 ? (
                <View style={styles.emptySlot}>
                  <Text style={styles.emptyHistory}>
                    No receipts checked yet. Checks you perform will be saved here.
                  </Text>
                </View>
              ) : (
                history.map((item, index) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    styles={styles}
                    isDark={theme.isDark}
                    last={index === history.length - 1}
                    onPress={() => {
                      setShowHistoryModal(false);
                      setResult({
                        status: (item.status as ReceiptStatus) || 'unable',
                        title: item.title,
                        detail: item.detail,
                        bank: item.bank,
                        reference: item.reference,
                        amount: item.amount,
                        photoUri: item.photo_uri || undefined,
                        url: getReceiptPageUrl(item.bank, item.reference),
                      });
                      setShowResultModal(true);
                    }}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Manual Entry Sheet Modal */}
      <Modal
        visible={showManualEntry}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManualEntry(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Manual Entry</Text>
                <Text style={styles.sheetSubtitle}>Type receipt details directly</Text>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseButton}
                onPress={() => setShowManualEntry(false)}
                accessibilityLabel="Close manual entry"
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Select Bank</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.providerChipsList, { marginBottom: 14 }]}
              >
                {POPULAR_BANKS.map((item) => {
                  const selected = normalizeBank(item) === normalizeBank(bank);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.providerChip, selected && styles.providerChipSelected]}
                      onPress={() => selectBank(item)}
                    >
                      <BankLogo bankName={item} size={18} />
                      <Text style={[styles.providerChipText, selected && styles.providerChipTextSelected]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Transaction reference</Text>
              <TextInput
                style={styles.input}
                value={reference}
                onChangeText={(value) => {
                  const inspected = inspectInputForBankAndExtra(value, bank);
                  if (inspected.bank && inspected.bank !== bank) {
                    setBank(inspected.bank);
                  }
                  if (inspected.extraAccount) {
                    setReceiverAccountLast8(inspected.extraAccount);
                  }
                  setReference(inspected.reference || value);
                }}
                placeholder="e.g. CI3898234"
                placeholderTextColor={theme.inputPlaceholder}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <Text style={styles.label}>
                Amount
                {currentAdapter?.isReadOnlyAmount ? ' — read from photo' : ''}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  currentAdapter?.isReadOnlyAmount && styles.readOnlyInput,
                ]}
                value={
                  currentAdapter?.isReadOnlyAmount
                    ? amount && !isNaN(Number(amount.replace(/,/g, '')))
                      ? `${Number(amount.replace(/,/g, '')).toFixed(2)} ETB`
                      : ''
                    : amount
                }
                onChangeText={
                  currentAdapter?.isReadOnlyAmount
                    ? undefined
                    : (value) => setAmount(value)
                }
                editable={!currentAdapter?.isReadOnlyAmount}
                placeholder="Amount in ETB"
                placeholderTextColor={theme.inputPlaceholder}
                keyboardType="decimal-pad"
              />

              {currentAdapter?.extraAccount && (
                <>
                  <View style={styles.labelWithAction}>
                    <Text style={styles.label}>{currentAdapter.extraAccount.label}</Text>
                    {savedReceiverAccount ? (
                      <TouchableOpacity
                        onPress={() =>
                          setReceiverAccountLast8(
                            savedReceiverAccount.replace(/\D/g, '').slice(-currentAdapter.extraAccount!.maxLength)
                          )
                        }
                        style={styles.useSavedBadge}
                        accessibilityLabel="Use saved default receiver account"
                      >
                        <Ionicons name="sparkles" size={11} color={theme.accent} />
                        <Text style={styles.useSavedBadgeText}>
                          Use saved (••••{savedReceiverAccount.slice(-4)})
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <TextInput
                    style={styles.input}
                    value={receiverAccountLast8}
                    onChangeText={(value) => {
                      setReceiverAccountLast8(
                        value
                          .replace(/\D/g, '')
                          .slice(-currentAdapter.extraAccount!.maxLength)
                      );
                    }}
                    placeholder={
                      savedReceiverAccount
                        ? `Default: ${savedReceiverAccount.slice(-8)}`
                        : currentAdapter.extraAccount.placeholder
                    }
                    placeholderTextColor={theme.inputPlaceholder}
                    keyboardType="number-pad"
                    maxLength={currentAdapter.extraAccount.maxLength}
                  />
                  <Text style={styles.helperText}>
                    {savedReceiverAccount
                      ? `Using your configured default (${savedReceiverAccount.slice(-8)}) unless entered differently here.`
                      : currentAdapter.extraAccount.hint}
                  </Text>
                </>
              )}

              <Text style={styles.label}>
                Receipt link
                {bankNeedsReceiptUrl(bank) ? '' : ' (optional)'}
              </Text>
              <TextInput
                style={styles.input}
                value={receiptUrl}
                onChangeText={(value) => {
                  setReceiptUrl(value);
                  const inspected = inspectInputForBankAndExtra(value, bank);
                  if (inspected.bank && inspected.bank !== bank) {
                    setBank(inspected.bank);
                  }
                  if (inspected.extraAccount) {
                    setReceiverAccountLast8(inspected.extraAccount);
                  }
                  if (inspected.reference && !reference) {
                    setReference(inspected.reference);
                  }
                }}
                placeholder="https://… from bank SMS or app"
                placeholderTextColor={theme.inputPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={styles.sheetActionButton}
                onPress={() => {
                  setShowManualEntry(false);
                  verifyReceipt();
                }}
              >
                <Text style={styles.sheetActionButtonText}>Verify Now</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Settings & Configuration Modal */}
      <Modal
        visible={showConfigModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfigModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Config & Preferences</Text>
                <Text style={styles.sheetSubtitle}>Receiver account & app settings</Text>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseButton}
                onPress={() => setShowConfigModal(false)}
                accessibilityLabel="Close settings"
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              {/* CBE Receiver Account Card */}
              <View style={styles.configCard}>
                <View style={styles.configCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <BankLogo bankName="CBE Legacy" size={24} />
                    <Text style={styles.configCardTitle}>CBE Receiver Account</Text>
                  </View>
                  <View
                    style={[
                      styles.configStatusBadge,
                      {
                        backgroundColor: savedReceiverAccount
                          ? (theme.isDark ? 'rgba(74, 222, 128, 0.15)' : 'rgba(21, 128, 61, 0.1)')
                          : (theme.isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(180, 83, 9, 0.1)'),
                      },
                    ]}
                  >
                    <Ionicons
                      name={savedReceiverAccount ? 'checkmark-circle' : 'alert-circle-outline'}
                      size={12}
                      color={
                        savedReceiverAccount
                          ? (theme.isDark ? '#4ADE80' : '#15803D')
                          : (theme.isDark ? '#FBBF24' : '#B45309')
                      }
                    />
                    <Text
                      style={[
                        styles.configStatusBadgeText,
                        {
                          color: savedReceiverAccount
                            ? (theme.isDark ? '#4ADE80' : '#15803D')
                            : (theme.isDark ? '#FBBF24' : '#B45309'),
                        },
                      ]}
                    >
                      {savedReceiverAccount ? `Active (••••${savedReceiverAccount.slice(-4)})` : 'Not set'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.configCardDesc}>
                  Enter your business CBE account number once. Cheki will automatically use the last 8 digits for all CBE Legacy receipt verifications without asking you every time.
                </Text>

                <Text style={styles.label}>Account Number (13-digit or last 8 digits)</Text>
                <TextInput
                  style={styles.input}
                  value={configInputAccount}
                  onChangeText={(val) => setConfigInputAccount(val.replace(/\D/g, ''))}
                  placeholder="e.g. 1000123456789 or 12345678"
                  placeholderTextColor={theme.inputPlaceholder}
                  keyboardType="number-pad"
                  maxLength={16}
                />

                {configInputAccount ? (
                  <Text style={styles.configPreviewText}>
                    Last 8 digits for verification: <Text style={{ fontWeight: '700', color: theme.accent }}>{configInputAccount.slice(-8)}</Text>
                  </Text>
                ) : null}

                <View style={styles.configActionRow}>
                  <TouchableOpacity
                    style={[styles.configSaveButton, configSaveSuccess && styles.configSaveButtonSuccess]}
                    onPress={() => saveReceiverAccountConfig(configInputAccount)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={configSaveSuccess ? 'checkmark-circle' : 'save-outline'}
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.configSaveButtonText}>
                      {configSaveSuccess ? 'Saved Successfully!' : 'Save Account'}
                    </Text>
                  </TouchableOpacity>

                  {savedReceiverAccount ? (
                    <TouchableOpacity
                      style={styles.configClearButton}
                      onPress={clearReceiverAccountConfig}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      <Text style={styles.configClearButtonText}>Clear</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Theme Preference Card */}
              <View style={styles.configCard}>
                <Text style={styles.configCardTitle}>Appearance</Text>
                <Text style={styles.configCardDesc}>Choose your preferred interface theme.</Text>
                <View style={styles.themeToggleRow}>
                  <TouchableOpacity
                    style={[styles.themeOptionBtn, themeMode === 'light' && styles.themeOptionBtnActive]}
                    onPress={async () => {
                      setThemeMode('light');
                      await setStoredSetting('theme_mode', 'light');
                    }}
                  >
                    <Ionicons
                      name="sunny-outline"
                      size={18}
                      color={themeMode === 'light' ? theme.accent : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.themeOptionText,
                        themeMode === 'light' && styles.themeOptionTextActive,
                      ]}
                    >
                      White Mode
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.themeOptionBtn, themeMode === 'dark' && styles.themeOptionBtnActive]}
                    onPress={async () => {
                      setThemeMode('dark');
                      await setStoredSetting('theme_mode', 'dark');
                    }}
                  >
                    <Ionicons
                      name="moon-outline"
                      size={18}
                      color={themeMode === 'dark' ? theme.accent : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.themeOptionText,
                        themeMode === 'dark' && styles.themeOptionTextActive,
                      ]}
                    >
                      Dark Mode
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Local Privacy Assurance */}
              <View style={styles.securityNote}>
                <Ionicons name="shield-checkmark-outline" size={16} color={theme.textTertiary} />
                <Text style={styles.securityNoteText}>
                  Your account numbers and verification records are stored privately on your device.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Photo Fullscreen Viewer */}
      <Modal
        visible={viewingUri !== ''}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingUri('')}
      >
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerTapClose}
            activeOpacity={1}
            onPress={() => setViewingUri('')}
          >
            <Image
              source={{ uri: viewingUri }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
            <Text style={styles.viewerHint}>Tap anywhere to close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );

  function openReceiptPage() {
    const cleanedReference = reference.trim().toUpperCase();
    const effectiveReceiver = (
      receiverAccountLast8.trim() ||
      savedReceiverAccount.trim()
    ).replace(/\D/g, '').slice(-8);

    const url = getReceiptPageUrl(
      bank,
      cleanedReference,
      effectiveReceiver,
      receiptUrl
    );

    if (!url) {
      const adapter = getBankAdapter(bank);
      Alert.alert(
        'A receipt link is needed',
        adapter?.extraAccount?.hint ||
          (adapter?.needsReceiptUrl
            ? 'This provider requires an official receipt URL. Paste the link from the bank SMS or app into the receipt link field, then try again.'
            : 'A valid transaction reference is required to open the receipt.')
      );
      return;
    }

    Linking.openURL(url).catch(() => {
      Alert.alert(
        'Could not open receipt',
        'The receipt website could not be opened on this device.'
      );
    });
  }
}

function VerificationResultPopup({
  result,
  onClose,
  onOpenPhoto,
  onOpenUrl,
  styles,
  isDark,
}: {
  result: ReceiptResult;
  onClose: () => void;
  onOpenPhoto: () => void;
  onOpenUrl: () => void;
  styles: ReturnType<typeof createStyles>;
  isDark: boolean;
}) {
  const tone = getStatusTones(result.status, isDark);
  const isVerified = result.status === 'verified';
  const isFailed = result.status === 'not_verified';

  const rawNum = result.amount ? Number(result.amount.replace(/,/g, '')) : NaN;
  const amountLabel =
    !isNaN(rawNum) && rawNum > 0
      ? `${rawNum.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ETB`
      : '';

  return (
    <View style={styles.popupInner} accessibilityLiveRegion="polite">
      {/* Top bar with Status Pill and Close Button */}
      <View style={styles.popupTopBar}>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: tone.bg,
              borderColor: tone.border,
              borderWidth: 1,
            },
          ]}
        >
          <Ionicons
            name={
              isVerified
                ? 'checkmark-circle'
                : isFailed
                  ? 'close-circle'
                  : 'alert-circle'
            }
            size={14}
            color={tone.ink}
          />
          <Text style={[styles.statusPillText, { color: tone.ink }]}>
            {isVerified
              ? 'Verified'
              : isFailed
                ? 'Not Verified'
                : 'Unconfirmed'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.popupCloseButton}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Close receipt details"
        >
          <Ionicons name="close" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
        </TouchableOpacity>
      </View>

      {/* Main Status Headline & Explanatory Detail */}
      <Text style={styles.popupTitle}>{result.title}</Text>
      <Text style={styles.popupDetail}>{result.detail}</Text>

      {/* Structured Details Box */}
      <View style={styles.popupSummaryBox}>
        {/* Large Amount Display */}
        <View style={styles.popupAmountBlock}>
          <Text style={styles.popupAmountLabel}>VERIFIED AMOUNT</Text>
          <Text style={styles.popupAmountValue}>
            {amountLabel || (result.amount && Number(result.amount) > 0 ? `${result.amount} ETB` : '—')}
          </Text>
        </View>

        <View style={styles.popupDivider} />

        {/* Bank & Reference Details */}
        <DetailRow label="Bank / Provider" styles={styles}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BankLogo bankName={result.bank} size={20} />
            <Text style={styles.detailValue}>{result.bank || 'Unknown'}</Text>
          </View>
        </DetailRow>

        <DetailRow label="Transaction Reference" value={result.reference || '—'} styles={styles} />

        {result.url ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Official Page</Text>
            <TouchableOpacity
              onPress={onOpenUrl}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={styles.popupLinkText}>Open portal link</Text>
              <Ionicons name="open-outline" size={14} color={styles.popupLinkText.color} />
            </TouchableOpacity>
          </View>
        ) : null}

        {result.photoUri ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Receipt photo</Text>
            <TouchableOpacity
              style={styles.popupThumbAction}
              onPress={onOpenPhoto}
              accessibilityLabel="View full photo"
            >
              <Image
                source={{ uri: result.photoUri }}
                style={styles.popupThumbImage}
                resizeMode="cover"
              />
              <Ionicons name="eye-outline" size={14} color={styles.popupThumbText.color} />
              <Text style={styles.popupThumbText}>Tap to view</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Footer Action Buttons */}
      <View style={styles.popupFooter}>
        {result.url && (
          <TouchableOpacity
            style={styles.popupPrimaryAction}
            onPress={onOpenUrl}
          >
            <Text style={styles.popupPrimaryActionText}>
              Open Official Bank Portal
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.popupDoneButton}
          onPress={onClose}
        >
          <Text style={styles.popupDoneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function HistoryRow({
  item,
  last,
  onPress,
  styles,
  isDark,
}: {
  item: HistoryItem;
  last: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  isDark: boolean;
}) {
  const tone = getStatusTones(item.status as ReceiptStatus, isDark);

  return (
    <TouchableOpacity
      style={[styles.historyItem, last && styles.historyItemLast]}
      onPress={onPress}
      accessibilityLabel={`View details for ${item.bank || 'receipt'} ${item.reference || ''}`}
    >
      <View style={styles.historyLogoWrapper}>
        <BankLogo bankName={item.bank} size={36} />
      </View>

      <View style={styles.historyItemMain}>
        <Text style={styles.historyBank} numberOfLines={1}>
          {item.bank || 'Unknown bank'}
          <Text style={styles.historyDeEmph}>
            {item.reference ? ` · ${item.reference}` : ''}
          </Text>
        </Text>
        <Text style={styles.historyDate}>
          {new Date(item.created_at).toLocaleString()}
        </Text>
      </View>

      <View style={styles.historyItemSide}>
        <Text style={styles.historyAmount}>
          {item.amount ? `${item.amount} ETB` : '—'}
        </Text>
        <View
          style={[
            styles.statusPillSmall,
            {
              backgroundColor: tone.bg,
              borderColor: tone.border,
              borderWidth: 1,
            },
          ]}
        >
          <Text style={[styles.statusPillSmallText, { color: tone.ink }]}>
            {item.status === 'verified'
              ? 'Verified'
              : item.status === 'not_verified'
                ? 'Failed'
                : 'Unconfirmed'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function DetailRow({
  label,
  value,
  children,
  styles,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {children || (
        <Text selectable style={styles.detailValue}>
          {value || '—'}
        </Text>
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingBottom: 10,
      backgroundColor: 'transparent',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    headerIconButtonActive: {
      borderColor: theme.accent,
    },
    headerIconButtonConfigured: {
      borderColor: theme.accent,
      backgroundColor: theme.accentSubtle,
    },
    headerIconText: {
      fontSize: 16,
      color: theme.textPrimary,
    },
    historyBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: theme.accent,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: theme.background,
    },
    historyBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
    logo: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoText: {
      color: '#FFFFFF',
      fontSize: 19,
      fontWeight: '800',
    },
    headerCopy: {
      marginLeft: 10,
    },
    appName: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 11,
      marginTop: 1,
    },
    viewfinderContainer: {
      flex: 1,
      marginVertical: 8,
    },
    viewfinder: {
      flex: 1,
      backgroundColor: theme.viewfinderBg,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.viewfinderBorder,
      position: 'relative',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      shadowColor: theme.isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.isDark ? 0.35 : 0.08,
      shadowRadius: 14,
      elevation: 3,
    },
    viewfinderWithImage: {
      flex: 1,
      backgroundColor: theme.viewfinderBg,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.viewfinderBorder,
      overflow: 'hidden',
      position: 'relative',
    },
    imageTouchWrapper: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 6,
    },
    capturedImage: {
      width: '100%',
      height: '100%',
      borderRadius: 12,
    },
    imageOverlayTop: {
      position: 'absolute',
      top: 10,
      left: 10,
      right: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    imageStatusBadge: {
      backgroundColor: theme.isDark
        ? 'rgba(12, 12, 14, 0.88)'
        : 'rgba(255, 255, 255, 0.94)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    imageStatusBadgeText: {
      color: theme.isDark ? '#4ADE80' : '#15803D',
      fontSize: 12,
      fontWeight: '600',
    },
    clearImageBtn: {
      backgroundColor: theme.isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
    },
    clearImageBtnText: {
      color: theme.isDark ? '#F87171' : '#DC2626',
      fontSize: 12,
      fontWeight: '600',
    },
    imageOverlayBottom: {
      position: 'absolute',
      bottom: 10,
      left: 10,
      right: 10,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
    },
    quickSwapBtn: {
      backgroundColor: theme.isDark
        ? 'rgba(24, 24, 27, 0.9)'
        : 'rgba(255, 255, 255, 0.95)',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    quickSwapText: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    readingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.overlayBg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    readingOverlayText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    cornerReticle: {
      position: 'absolute',
      width: 20,
      height: 20,
      borderColor: theme.accent,
    },
    cornerTopLeft: {
      top: 14,
      left: 14,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 6,
    },
    cornerTopRight: {
      top: 14,
      right: 14,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 6,
    },
    cornerBottomLeft: {
      bottom: 14,
      left: 14,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 6,
    },
    cornerBottomRight: {
      bottom: 14,
      right: 14,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 6,
    },
    scannerBusyState: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    scannerBusyText: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    viewfinderEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    scannerIconBox: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    scannerIcon: {
      fontSize: 26,
    },
    viewfinderTitle: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    viewfinderSubtitle: {
      color: theme.textSecondary,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 16,
      paddingHorizontal: 16,
    },
    viewfinderActions: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
      paddingHorizontal: 8,
    },
    captureButtonPrimary: {
      flex: 1,
      backgroundColor: theme.buttonPrimaryBg,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    captureButtonPrimaryText: {
      color: theme.buttonPrimaryText,
      fontSize: 14,
      fontWeight: '700',
    },
    captureButtonSecondary: {
      flex: 1,
      backgroundColor: theme.buttonSecondaryBg,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.buttonSecondaryBorder,
    },
    captureButtonSecondaryText: {
      color: theme.buttonSecondaryText,
      fontSize: 14,
      fontWeight: '600',
    },
    providerSection: {
      marginBottom: 10,
    },
    providerSectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
      paddingHorizontal: 2,
    },
    providerSectionTitle: {
      color: theme.textTertiary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    providerStatusText: {
      color: theme.accent,
      fontSize: 12,
      fontWeight: '600',
    },
    providerChipsList: {
      gap: 8,
      paddingVertical: 2,
    },
    providerChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 14,
      backgroundColor: theme.chipBg,
      borderWidth: 1,
      borderColor: theme.chipBorder,
    },
    providerChipSelected: {
      backgroundColor: theme.chipSelectedBg,
      borderColor: theme.chipSelectedBorder,
    },
    providerChipText: {
      color: theme.chipText,
      fontSize: 13,
      fontWeight: '600',
    },
    providerChipTextSelected: {
      color: theme.chipSelectedText,
      fontWeight: '700',
    },
    bottomBar: {
      width: '100%',
      paddingTop: 2,
      marginBottom: 4,
    },
    mainVerifyButton: {
      backgroundColor: theme.buttonPrimaryBg,
      borderRadius: 16,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mainVerifyButtonDisabled: {
      backgroundColor: theme.surfaceSubtle,
      opacity: 0.6,
    },
    mainVerifyButtonText: {
      color: theme.buttonPrimaryText,
      fontSize: 16,
      fontWeight: '700',
    },
    verifyButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.overlayBg,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 32,
    },
    modalCard: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: theme.modalBg,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.modalBorder,
      padding: 20,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: theme.isDark ? 0.45 : 0.15,
      shadowRadius: 28,
      elevation: 14,
    },
    popupInner: {
      width: '100%',
    },
    popupTopBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    popupCloseButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    popupCloseButtonText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    popupTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      marginTop: 14,
      letterSpacing: -0.3,
    },
    popupDetail: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
    },
    popupSummaryBox: {
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginTop: 16,
    },
    popupAmountBlock: {
      paddingBottom: 4,
    },
    popupAmountLabel: {
      color: theme.textTertiary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    popupAmountValue: {
      color: theme.textPrimary,
      fontSize: 26,
      fontWeight: '800',
      marginTop: 4,
      letterSpacing: -0.5,
    },
    popupDivider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 12,
    },
    popupLinkText: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    popupThumbAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    popupThumbImage: {
      width: 36,
      height: 36,
      borderRadius: 6,
      backgroundColor: theme.border,
    },
    popupThumbText: {
      color: theme.accent,
      fontSize: 13,
      fontWeight: '500',
    },
    popupFooter: {
      marginTop: 18,
      gap: 10,
    },
    popupPrimaryAction: {
      backgroundColor: theme.accent,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    popupPrimaryActionText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    popupDoneButton: {
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    popupDoneButtonText: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    lastResultBanner: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    lastResultBannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginRight: 10,
    },
    lastResultBannerText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
    },
    lastResultBannerAction: {
      color: theme.accent,
      fontSize: 13,
      fontWeight: '600',
    },
    sheetOverlay: {
      flex: 1,
      backgroundColor: theme.overlayBg,
      justifyContent: 'flex-end',
    },
    sheetCard: {
      backgroundColor: theme.modalBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: theme.modalBorder,
      maxHeight: '82%',
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    sheetHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    sheetTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '700',
    },
    sheetSubtitle: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    clearHistoryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    clearHistoryText: {
      color: '#EF4444',
      fontSize: 13,
      fontWeight: '600',
    },
    sheetCloseButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetCloseText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    sheetScroll: {
      marginTop: 12,
    },
    sheetActionButton: {
      backgroundColor: theme.accent,
      borderRadius: 14,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
      marginBottom: 20,
    },
    sheetActionButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-start',
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: '600',
    },
    statusPillSmall: {
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    statusPillSmallText: {
      fontSize: 11,
      fontWeight: '600',
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 7,
      gap: 14,
    },
    detailLabel: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    detailValue: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'right',
    },
    historyItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    historyItemLast: {
      borderBottomWidth: 0,
    },
    historyLogoWrapper: {
      marginRight: 10,
    },
    historyItemMain: {
      flex: 1,
    },
    historyBank: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    historyDeEmph: {
      color: theme.textSecondary,
      fontWeight: '400',
    },
    historyDate: {
      color: theme.textTertiary,
      fontSize: 12,
      marginTop: 3,
    },
    historyItemSide: {
      alignItems: 'flex-end',
      gap: 5,
    },
    historyAmount: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    emptySlot: {
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      marginTop: 14,
      paddingVertical: 18,
      paddingHorizontal: 14,
    },
    emptyHistory: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      backgroundColor: theme.inputBg,
      paddingHorizontal: 14,
      color: theme.inputText,
      fontSize: 15,
      marginBottom: 12,
    },
    readOnlyInput: {
      opacity: 0.8,
    },
    label: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
    },
    labelWithAction: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    useSavedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: theme.accentSubtle,
    },
    useSavedBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.accent,
    },
    configCard: {
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginBottom: 16,
    },
    configCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    configCardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    configCardDesc: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.textSecondary,
      marginBottom: 14,
    },
    configStatusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    configStatusBadgeText: {
      fontSize: 11,
      fontWeight: '600',
    },
    configPreviewText: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: -6,
      marginBottom: 14,
    },
    configActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
    },
    configSaveButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.accent,
      borderRadius: 12,
      paddingVertical: 12,
    },
    configSaveButtonSuccess: {
      backgroundColor: '#10B981',
    },
    configSaveButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    configClearButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    configClearButtonText: {
      color: '#EF4444',
      fontSize: 13,
      fontWeight: '600',
    },
    themeToggleRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 6,
    },
    themeOptionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    themeOptionBtnActive: {
      borderColor: theme.accent,
      backgroundColor: theme.accentSubtle,
    },
    themeOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    themeOptionTextActive: {
      color: theme.accent,
      fontWeight: '700',
    },
    securityNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 14,
      marginBottom: 20,
    },
    securityNoteText: {
      fontSize: 12,
      color: theme.textTertiary,
      flex: 1,
      lineHeight: 16,
    },
    helperText: {
      color: theme.textTertiary,
      fontSize: 12,
      marginBottom: 10,
      lineHeight: 17,
    },
    viewerBackdrop: {
      flex: 1,
      backgroundColor: '#000000',
    },
    viewerTapClose: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    viewerImage: {
      width: 430,
      height: 560,
    },
    viewerHint: {
      color: '#949494',
      fontSize: 13,
      marginTop: 14,
    },
  });
}
