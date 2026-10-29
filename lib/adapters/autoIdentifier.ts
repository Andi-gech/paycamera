// lib/adapters/autoIdentifier.ts — Automatically identifies receipt bank via Barcode/QR or OCR
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';
import type { BankId } from '../types';
import { isValidTelebirrRef, extractTelebirrRefFromText } from './telebirrUtils';

export interface IdentificationResult {
  detectedBank: BankId | null;
  extractedReference: string | null;
  confidence: 'high' | 'medium' | 'low';
  rawBarcode?: string;
  rawTextPreview?: string;
}

/**
 * Automatically inspects the image via:
 * 1. Barcode/QR Scanning FIRST
 * 2. Full OCR Text Recognition SECOND
 * Detects whether the receipt belongs to Telebirr, CBE (Modern or Legacy), Dashen, Awash, etc.
 */
export async function identifyReceiptBankAndReference(imageUri: string): Promise<IdentificationResult> {
  let preprocessedUri = imageUri;

  try {
    const manip = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 1200 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    preprocessedUri = manip.uri;
  } catch (err) {
    console.log('[AutoIdentifier] Preprocessing skipped:', err);
  }

  // ── Step 1: Priority Scan Barcode / QR ─────────────────────────
  try {
    const barcodes = await BarcodeScanning.scan(preprocessedUri);
    if (barcodes && barcodes.length > 0) {
      for (const bc of barcodes) {
        const val = bc.value?.trim() || '';
        if (!val) continue;

        // Check for CBE URLs or Tokens
        if (
          val.includes('mbreciept.cbe.com.et') ||
          val.includes('mb.cbe.com.et') ||
          val.includes('apps.cbe.com.et') ||
          /^https:\/\/mbreciept\.cbe\.com\.et\//i.test(val)
        ) {
          const match = val.match(/mbreciept\.cbe\.com\.et\/([^\s/?#]+)/i);
          return {
            detectedBank: 'cbe',
            extractedReference: match ? match[1] : val,
            confidence: 'high',
            rawBarcode: val,
          };
        }

        // CBE Modern Token prefix (v2-..., fHCx...)
        if (/^(v\d{1,2}-[A-Za-z0-9_-]+|fHCx[A-Za-z0-9]+)/.test(val)) {
          return {
            detectedBank: 'cbe',
            extractedReference: val,
            confidence: 'high',
            rawBarcode: val,
          };
        }

        // CBE Legacy FT reference
        if (/^FT[A-Z0-9]{10,12}/i.test(val)) {
          return {
            detectedBank: 'cbe',
            extractedReference: val,
            confidence: 'high',
            rawBarcode: val,
          };
        }

        // Check for Telebirr URL
        if (val.includes('transactioninfo.ethiotelecom.et/receipt/')) {
          const match = val.match(/receipt\/([A-Za-z0-9]+)/i);
          const candidate = match ? match[1].toUpperCase() : val.toUpperCase();
          return {
            detectedBank: 'telebirr',
            extractedReference: isValidTelebirrRef(candidate) ? candidate : null,
            confidence: 'high',
            rawBarcode: val,
          };
        }

        // Telebirr 10-char alphanumeric reference in QR (strictly mixed letters and numbers; never full numbers or full alphabet)
        if (isValidTelebirrRef(val)) {
          return {
            detectedBank: 'telebirr',
            extractedReference: val.toUpperCase(),
            confidence: 'high',
            rawBarcode: val,
          };
        }
      }
    }
  } catch (err) {
    console.log('[AutoIdentifier] Barcode scan error/skipped:', err);
  }

  // ── Step 2: Fallback to ML Kit OCR Text Recognition ──────────────
  try {
    const ocrResult = await TextRecognition.recognize(preprocessedUri);
    const text = ocrResult.text || '';
    const lower = text.toLowerCase();

    // ── Priority 1: Telebirr Checks ──
    // Many Telebirr receipts (like "Transfer to Bank") mention other banks (e.g. CBE, Dashen, Awash)
    // as the destination receiving bank. If Telebirr branding or indicators are present,
    // this transaction was processed via Telebirr and MUST be identified as Telebirr!
    const hasTelebirrExplicit =
      lower.includes('telebirr') ||
      lower.includes('ቴሌብር') ||
      lower.includes('ethio telecom') ||
      lower.includes('ethiotelecom') ||
      lower.includes('ኢትዮ ቴሌኮም') ||
      lower.includes('transactioninfo.ethiotelecom.et');

    const hasTelebirrTransferToBank =
      lower.includes('transfer to bank') ||
      lower.includes('ወደ ባንክ') ||
      lower.includes('send money to bank');

    const extractedTelebirrRef = extractTelebirrRefFromText(text);

    if (hasTelebirrExplicit || (hasTelebirrTransferToBank && extractedTelebirrRef)) {
      return {
        detectedBank: 'telebirr',
        extractedReference: extractedTelebirrRef,
        confidence: 'high',
        rawTextPreview: text.slice(0, 150),
      };
    }

    // ── Priority 2: CBE Checks (Only when NOT a Telebirr receipt) ──
    const cbeUrlMatch = text.match(/mbreciept\.cbe\.com\.et\/([^\s/?#]+)/i);
    const cbeTokenMatch = text.match(/\b(v\d{1,2}-[A-Za-z0-9_-]{10,40})\b/);
    const cbeFtMatch = text.match(/\b(FT[A-Z0-9]{10,12})\b/i);

    const hasCbeText =
      lower.includes('commercial bank of ethiopia') ||
      lower.includes('cbe mobile') ||
      lower.includes('cbe birr') ||
      lower.includes('mbreciept.cbe.com.et') ||
      lower.includes('combanketh') ||
      lower.includes('የኢትዮጵያ ንግድ ባንክ');

    if (cbeUrlMatch || cbeTokenMatch || cbeFtMatch || hasCbeText) {
      let ref: string | null = null;
      if (cbeTokenMatch) ref = cbeTokenMatch[1];
      else if (cbeUrlMatch) ref = cbeUrlMatch[1];
      else if (cbeFtMatch) ref = cbeFtMatch[1].toUpperCase();

      return {
        detectedBank: 'cbe',
        extractedReference: ref,
        confidence: (hasCbeText && ref) || cbeUrlMatch || cbeTokenMatch ? 'high' : 'medium',
        rawTextPreview: text.slice(0, 150),
      };
    }

    // ── Priority 3: Dashen Bank ──
    if (lower.includes('dashen') || lower.includes('ዳሽን')) {
      return {
        detectedBank: 'dashen',
        extractedReference: null,
        confidence: 'medium',
        rawTextPreview: text.slice(0, 150),
      };
    }

    // ── Priority 4: Awash Bank ──
    if (lower.includes('awash') || lower.includes('አዋሽ')) {
      return {
        detectedBank: 'awash',
        extractedReference: null,
        confidence: 'medium',
        rawTextPreview: text.slice(0, 150),
      };
    }

    // ── Priority 5: Fallbacks based on Telebirr reference pattern (never full numbers or full alphabet) ──
    if (extractedTelebirrRef) {
      return {
        detectedBank: 'telebirr',
        extractedReference: extractedTelebirrRef,
        confidence: 'medium',
        rawTextPreview: text.slice(0, 150),
      };
    }

  } catch (err) {
    console.log('[AutoIdentifier] OCR text recognition error:', err);
  }

  return {
    detectedBank: null,
    extractedReference: null,
    confidence: 'low',
  };
}
