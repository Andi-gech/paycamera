// lib/adapters/telebirrUtils.ts

export const FORBIDDEN_WORDS = new Set([
  'CLOUDFLARE',
  'SUCCESSFUL',
  'SUCCESS',
  'COMPLETED',
  'COMPLETE',
  'FAILED',
  'PENDING',
  'CANCELLED',
  'RECEIPT',
  'REFERENCE',
  'TRANSACTION',
  'TELEBIRR',
  'ETHIOTELECOM',
  'AMOUNT',
  'STATUS',
  'TRANSFER',
  'FINISHED',
  'COMMERCIAL',
  'DOWNLOAD',
]);

/**
 * Strict validator for Telebirr transaction reference.
 * Rule: Telebirr references are 10-character alphanumeric codes (e.g. DJQ8BX9KE6, DJU1GOXQQV).
 * Must contain BOTH digits and letters.
 * - Never count full numbers (e.g. 1000123456 or phone numbers).
 * - Never count full alphabet (e.g. SUCCESSFUL, TRANSFERSB).
 * - Never match CBE references (starting with FT).
 */
export function isValidTelebirrRef(ref: string | null | undefined): boolean {
  if (!ref || typeof ref !== 'string') return false;
  const clean = ref.trim().toUpperCase();

  // Standard length is 10 chars (allow 9 to 12 for OCR spacing/variations)
  if (clean.length < 9 || clean.length > 12) return false;

  // Must only contain alphanumeric characters
  if (!/^[A-Z0-9]+$/.test(clean)) return false;

  // Do NOT count full number (all digits)
  if (/^\d+$/.test(clean)) return false;

  // Must not be forbidden keywords
  if (FORBIDDEN_WORDS.has(clean)) return false;

  // CBE transaction references start with FT
  if (clean.startsWith('FT')) return false;

  // If candidate is all-letters, check if an 'O' was mistakenly read for '0'
  // (e.g. OCR read DJU1GOXQQV or DJU0... where 0 became O)
  if (/^[A-Z]+$/.test(clean)) {
    if (clean.includes('O')) {
      const swapped = clean.replace(/O/g, '0');
      return /[A-Z]/.test(swapped) && /\d/.test(swapped);
    }
    return false;
  }

  // Must contain at least one letter AND at least one digit
  if (!(/[A-Z]/.test(clean) && /\d/.test(clean))) return false;

  return true;
}

/**
 * Generates permutation variants for common OCR letter/digit confusions,
 * specifically 'O' (letter) vs '0' (digit).
 * When OCR scans 'O' instead of '0' (e.g. DJU1GOXQQV vs DJU1G0XQQV),
 * this returns candidate references in prioritized order.
 */
export function getOcrReferenceVariants(ref: string | null | undefined): string[] {
  if (!ref || typeof ref !== 'string') return [];
  const clean = ref.trim().toUpperCase();
  if (!clean) return [];

  const variants: string[] = [clean];

  // If clean contains 'O', generate variant with all 'O' replaced by '0'
  if (clean.includes('O')) {
    const oToZero = clean.replace(/O/g, '0');
    if (!variants.includes(oToZero)) {
      variants.push(oToZero);
    }
  }

  // If clean contains '0', generate variant with all '0' replaced by 'O'
  if (clean.includes('0')) {
    const zeroToO = clean.replace(/0/g, 'O');
    if (!variants.includes(zeroToO)) {
      variants.push(zeroToO);
    }
  }

  // Positional toggling for references containing both or multiple 'O'/'0'
  const indices: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === 'O' || clean[i] === '0') {
      indices.push(i);
    }
  }

  if (indices.length > 1 && indices.length <= 3) {
    for (const idx of indices) {
      const chars = clean.split('');
      chars[idx] = chars[idx] === 'O' ? '0' : 'O';
      const toggled = chars.join('');
      if (!variants.includes(toggled)) {
        variants.push(toggled);
      }
    }
  }

  return variants.slice(0, 4);
}

function scanCandidateText(sourceText: string): string | null {
  // 1. Direct Ethio Telecom URL check
  const urlMatch = sourceText.match(/transactioninfo\.ethiotelecom\.et\/receipt\/([A-Za-z0-9]+)/i);
  if (urlMatch && isValidTelebirrRef(urlMatch[1])) {
    return urlMatch[1].toUpperCase();
  }

  // 2. Labeled transaction reference (e.g. "Transaction No: DGJ121DEVT")
  const labeledRegex = /(?:transaction\s*(?:number|no|id)|txnid|ref(?:erence)?\s*(?:no|number)?|የግብይት\s*ቁጥር|የክፍያ\s*ቁጥር)[:\s]+([A-Za-z0-9]{9,12})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = labeledRegex.exec(sourceText)) !== null) {
    if (isValidTelebirrRef(match[1])) {
      return match[1].toUpperCase();
    }
  }

  // 3. Telebirr pattern starting with 'D' (e.g. DJU1GOXQQV, DGJ121DEVT)
  const prefixRegex = /\b(D[A-Za-z0-9]{9,11})\b/gi;
  while ((match = prefixRegex.exec(sourceText)) !== null) {
    if (isValidTelebirrRef(match[1])) {
      return match[1].toUpperCase();
    }
  }

  // 4. Any 9-12 character token with mixed letters and numbers
  const tokenRegex = /\b([A-Za-z0-9]{9,12})\b/gi;
  while ((match = tokenRegex.exec(sourceText)) !== null) {
    if (isValidTelebirrRef(match[1])) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

/**
 * Extracts a valid Telebirr reference from raw text / OCR string.
 * Discards any candidates that are purely numeric or purely alphabetical.
 */
export function extractTelebirrRefFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  // Pass 1: Try raw text FIRST (intact tokens like DJU1GOXQQV)
  const fromRaw = scanCandidateText(text);
  if (fromRaw) return fromRaw;

  // Pass 2: Fallback for spaced-out OCR references on the SAME line (e.g. "DGJ121 DEVT")
  // Only match horizontal whitespace [ \t]+, NEVER newlines (\r or \n) to avoid merging across lines!
  const collapsedSameLine = text.replace(/([A-Z0-9]{3,6})[ \t]+([A-Z0-9]{4,7})/gi, '$1$2');
  return scanCandidateText(collapsedSameLine);
}