// lib/adapters/autoIdentifier.ts — Automatically identifies receipt bank via Barcode/QR or OCR
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';
import type { BankId } from '../types';
import { isValidTelebirrRef, extractTelebirrRefFromText } from './telebirrUtils';

export const extractBoaReferenceFromText = (text: string): string | null => {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/[|]/g, 'I')
    .trim();

  const patterns = [
    /(?:transaction\s*(?:ref(?:erence)?|id|no|number)|txn\s*(?:ref|id|no)|reference\s*(?:no|number)?|trn\s*(?:id|no))\s*[:#-]?\s*([A-Z0-9]{10,30})/i,
    /\b(FT[A-Z0-9]{10,28})\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
};
export interface IdentificationResult {
  detectedBank: BankId | null;
  extractedReference: string | null;
  confidence: 'high' | 'medium' | 'low';
  rawBarcode?: string;
  rawTextPreview?: string;
  rawText?: string;
}

/**
 * Automatically inspects the image via:
 * 1. Barcode/QR Scanning FIRST
 * 2. Full OCR Text Recognition SECOND
 * Detects whether the receipt belongs to Telebirr, CBE (Modern or Legacy), Dashen, Awash, etc.
 */
export async function identifyReceiptBankAndReference(imageUri: string): Promise<IdentificationResult> {
  console.log('[AutoIdentifier] STEP 1: Preprocessing image uri:', imageUri);
  let preprocessedUri = imageUri;

  try {
    const manip = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 1200 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    preprocessedUri = manip.uri;
    console.log('[AutoIdentifier] Image resized to width 1200, preprocessed URI:', preprocessedUri);
  } catch (err) {
    console.log('[AutoIdentifier] Preprocessing skipped or failed:', err);
  }

  // ── Step 2: Priority Scan Barcode / QR ─────────────────────────
  console.log('[AutoIdentifier] STEP 2: Scanning barcode/QR code with ML Kit...');
  try {
    const barcodes = await BarcodeScanning.scan(preprocessedUri);
    console.log('[AutoIdentifier] Barcodes found count:', barcodes ? barcodes.length : 0);
    if (barcodes && barcodes.length > 0) {
      for (const bc of barcodes) {
        const val = bc.value?.trim() || '';
        console.log('[AutoIdentifier] Barcode candidate value:', val);
        if (!val) continue;

        // Check for Telebirr URL
        if (val.includes('transactioninfo.ethiotelecom.et/receipt/')) {
          const match = val.match(/receipt\/([A-Za-z0-9]+)/i);
          const candidate = match ? match[1].toUpperCase() : val.toUpperCase();
          const result: IdentificationResult = {
            detectedBank: 'telebirr',
            extractedReference: isValidTelebirrRef(candidate) ? candidate : null,
            confidence: 'high',
            rawBarcode: val,
          };
          console.log('[AutoIdentifier] Matched Telebirr URL from QR:', result);
          return result;
        }

        // Check for BOA Slip URL in QR
        if (val.includes('cs.bankofabyssinia.com/slip/')) {
          const match = val.match(/trx=([A-Za-z0-9]+)/i);
          const candidate = match ? match[1].slice(0, -5).toUpperCase() : val;
          const result: IdentificationResult = {
            detectedBank: 'boa',
            extractedReference: candidate,
            confidence: 'high',
            rawBarcode: val,
          };
          console.log('[AutoIdentifier] Matched BOA Slip URL from QR:', result);
          return result;
        }

        // Telebirr 10-char alphanumeric reference in QR
        if (isValidTelebirrRef(val)) {
          const result: IdentificationResult = {
            detectedBank: 'telebirr',
            extractedReference: val.toUpperCase(),
            confidence: 'high',
            rawBarcode: val,
          };
          console.log('[AutoIdentifier] Matched Telebirr 10-char reference from QR:', result);
          return result;
        }
      }
    }
  } catch (err) {
    console.log('[AutoIdentifier] Barcode scan error/skipped:', err);
  }

  // ── Step 3: Fallback to ML Kit OCR Text Recognition ──────────────
  console.log('[AutoIdentifier] STEP 3: Running ML Kit Text Recognition (OCR)...');
  try {
    const ocrResult = await TextRecognition.recognize(preprocessedUri);
    const text = ocrResult.text || '';
    const lower = text.toLowerCase();
    console.log(`[AutoIdentifier] OCR recognized ${text.length} characters`);
    console.log('[AutoIdentifier] STEP 4: Actual extracted text:\n--- START EXTRACTED OCR TEXT ---\n' + (text || '(empty)') + '\n--- END EXTRACTED OCR TEXT ---');

    const extractedTelebirrRef = extractTelebirrRefFromText(text);
    console.log('[AutoIdentifier] STEP 4: Extracted Telebirr reference candidate:', extractedTelebirrRef);

    // ── Priority 1: Telebirr Checks (Structure & Layout First) ──
    const hasTelebirrExplicit =
      lower.includes('telebirr') ||
      lower.includes('ቴሌብር') ||
      lower.includes('ethio telecom') ||
      lower.includes('ethiotelecom') ||
      lower.includes('ኢትዮ ቴሌኮም') ||
      lower.includes('transactioninfo.ethiotelecom.et');

    const hasTelebirrStructure =
      (/[-−]\s*\d+[.,]\d{2}\s*\(?\s*ETB\s*\)?/i.test(text) &&
        /transaction\s*(?:number|type|time)/i.test(text) &&
        /bank\s*(?:account\s*number|name)/i.test(text)) ||
      (extractedTelebirrRef && /transfer\s*to\s*bank/i.test(text));

    if (hasTelebirrExplicit || hasTelebirrStructure || extractedTelebirrRef) {
      console.log('[AutoIdentifier] Telebirr structure/reference detected — classifying as Telebirr');
      return {
        detectedBank: 'telebirr',
        extractedReference: extractedTelebirrRef,
        confidence: extractedTelebirrRef ? 'high' : 'medium',
        rawTextPreview: text.slice(0, 150),
        rawText: text,
      };
    }

    // ── Priority 2: CBE Checks (Only true native CBE receipts) ──
    console.log('[AutoIdentifier] Checking for CBE patterns in OCR text...');
    const cbeUrlMatch = text.match(/mbreciept\.cbe\.com\.et\/([^\s/?#]+)/i);
    const cbeTokenMatch = text.match(/\b(v\d{1,2}-[A-Za-z0-9_-]{10,40})\b/);
    const cbeFtMatch = text.match(/\b(FT[A-Z0-9]{10,12})\b/i);

    const hasCbeText =
      lower.includes('mbreciept.cbe.com.et') ||
      lower.includes('combanketh');

    if (cbeUrlMatch || cbeTokenMatch || cbeFtMatch || hasCbeText) {
      let ref: string | null = null;
      if (cbeTokenMatch) ref = cbeTokenMatch[1];
      else if (cbeUrlMatch) ref = cbeUrlMatch[1];
      else if (cbeFtMatch) ref = cbeFtMatch[1].toUpperCase();

      console.log('[AutoIdentifier] CBE match detected, reference:', ref);
      return {
        detectedBank: 'cbe',
        extractedReference: ref,
        confidence: (hasCbeText && ref) || cbeUrlMatch || cbeTokenMatch ? 'high' : 'medium',
        rawTextPreview: text.slice(0, 150),
        rawText: text,
      };
    }
    const boaSlipMatch = text.match(
      /cs\.bankofabyssinia\.com\/slip\/\?trx=([A-Za-z0-9]+)/i
    );

    const hasBoaText =
      lower.includes('bank of abyssinia') ||
      lower.includes('bankofabyssinia') ||
      lower.includes('abyssinia bank');
    if (boaSlipMatch || hasBoaText) {
      const extractedReference = boaSlipMatch
        ? boaSlipMatch[1].slice(0, -5).toUpperCase()
        : extractBoaReferenceFromText(text);

      return {
        detectedBank: 'boa',
        extractedReference,
        confidence: boaSlipMatch
          ? 'high'
          : extractedReference
            ? 'medium'
            : 'low',
        rawTextPreview: text.slice(0, 150),
        rawText: text,
      };
    }
  } catch (err) {
    console.error('[AutoIdentifier] OCR text recognition error:', err);
  }

  console.log('[AutoIdentifier] STEP 4: Identification ended with no specific bank match');

  return {
    detectedBank: null,
    extractedReference: null,
    confidence: 'low',
  };
}