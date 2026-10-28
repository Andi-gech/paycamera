import * as pakoModule from 'pako';
import { normalizeAmount } from './text';

export function extractAmountsFromCbePdf(text: string): {
  transferredAmount: number | null;
  totalDebitedAmount: number | null;
  commission: number | null;
  allAmounts: number[];
} {
  let transferredAmount: number | null = null;
  let totalDebitedAmount: number | null = null;
  let commission: number | null = null;
  const allAmounts: number[] = [];

  const etbRegex = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:ETB|Birr|ብር)/gi;
  let etbMatch: RegExpExecArray | null;
  while ((etbMatch = etbRegex.exec(text)) !== null) {
    const parsed = normalizeAmount(etbMatch[1]);
    if (parsed !== null && !allAmounts.includes(parsed)) {
      allAmounts.push(parsed);
    }
  }

  const transMatch =
    text.match(/(?:Transferred\s*Amount|Transfer\s*Amount|Amount\s*Transferred)[\s\S]{0,40}?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ||
    text.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*ETB[\s\S]{0,40}?(?:Transferred|Transfer)/i);
  if (transMatch?.[1]) {
    transferredAmount = normalizeAmount(transMatch[1]);
  }

  const totalMatch =
    text.match(/(?:Total\s*amount\s*debited|Total\s*debited|Total\s*Amount)[\s\S]{0,50}?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (totalMatch?.[1]) {
    totalDebitedAmount = normalizeAmount(totalMatch[1]);
  }

  const commMatch =
    text.match(/(?:Commission|Service\s*Charge)[\s\S]{0,40}?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (commMatch?.[1]) {
    commission = normalizeAmount(commMatch[1]);
  }

  return {
    transferredAmount,
    totalDebitedAmount,
    commission,
    allAmounts,
  };
}

export function decompressStream(slice: Uint8Array): Uint8Array {
  const pako = pakoModule as any;
  const inflateFn = pako.inflate || pako.default?.inflate;
  if (typeof inflateFn === 'function') {
    try {
      return inflateFn(slice);
    } catch {
      const inflateRawFn = pako.inflateRaw || pako.default?.inflateRaw;
      if (typeof inflateRawFn === 'function') {
        try {
          return inflateRawFn(slice);
        } catch {}
      }
    }
  }
  return slice;
}

export function findStream(arr: Uint8Array, fromIndex: number): number {
  let idx = fromIndex;
  while ((idx = arr.indexOf(115, idx)) !== -1) {
    if (
      idx + 5 < arr.length &&
      arr[idx + 1] === 116 && // 't'
      arr[idx + 2] === 114 && // 'r'
      arr[idx + 3] === 101 && // 'e'
      arr[idx + 4] === 97 &&  // 'a'
      arr[idx + 5] === 109    // 'm'
    ) {
      return idx;
    }
    idx++;
  }
  return -1;
}

export function findEndstream(arr: Uint8Array, fromIndex: number): number {
  let idx = fromIndex;
  while ((idx = arr.indexOf(101, idx)) !== -1) {
    if (
      idx + 8 < arr.length &&
      arr[idx + 1] === 110 && // 'n'
      arr[idx + 2] === 100 && // 'd'
      arr[idx + 3] === 115 && // 's'
      arr[idx + 4] === 116 && // 't'
      arr[idx + 5] === 114 && // 'r'
      arr[idx + 6] === 101 && // 'e'
      arr[idx + 7] === 97 &&  // 'a'
      arr[idx + 8] === 109    // 'm'
    ) {
      return idx;
    }
    idx++;
  }
  return -1;
}

export function extractTextFromPdf(bytes: Uint8Array): string {
  let fullText = '';
  let pos = 0;

  while (pos < bytes.length) {
    const streamStart = findStream(bytes, pos);
    if (streamStart === -1) break;

    let dataStart = streamStart + 6;
    while (dataStart < bytes.length && (bytes[dataStart] === 10 || bytes[dataStart] === 13)) {
      dataStart++;
    }

    const streamEnd = findEndstream(bytes, dataStart);
    if (streamEnd === -1) break;

    let actualEnd = streamEnd;
    while (actualEnd > dataStart && (bytes[actualEnd - 1] === 10 || bytes[actualEnd - 1] === 13)) {
      actualEnd--;
    }

    const slice = bytes.subarray(dataStart, actualEnd);
    pos = streamEnd + 9;

    // Skip large raster image streams to save memory and CPU on mobile
    if (slice.length > 100000) {
      continue;
    }

    const uncompressed = decompressStream(slice);
    if (uncompressed.length > 120000) {
      continue;
    }

    let str = '';
    const chunkSize = 2048;
    for (let c = 0; c < uncompressed.length; c += chunkSize) {
      const sub = uncompressed.subarray(c, c + chunkSize);
      let chunkStr = '';
      for (let i = 0; i < sub.length; i++) {
        chunkStr += String.fromCharCode(sub[i]);
      }
      str += chunkStr;
    }

    // 1. Process [ ... ] TJ blocks
    const tjRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let tjMatch: RegExpExecArray | null;
    let hasTj = false;
    while ((tjMatch = tjRegex.exec(str)) !== null) {
      hasTj = true;
      const content = tjMatch[1];
      let decodedTj = '';

      const tokenRegex = /<([0-9a-fA-F]+)>|\(([^)]*)\)/g;
      let tokenMatch: RegExpExecArray | null;
      while ((tokenMatch = tokenRegex.exec(content)) !== null) {
        if (tokenMatch[1]) {
          const hex = tokenMatch[1];
          for (let i = 0; i < hex.length; i += 2) {
            decodedTj += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
          }
        } else if (tokenMatch[2] !== undefined) {
          decodedTj += tokenMatch[2];
        }
      }

      if (decodedTj.trim()) {
        fullText += '\n' + decodedTj.trim();
      }
    }

    // 2. Process standalone (text) Tj or <hex> Tj
    const tjStandaloneRegex = /(?:<([0-9a-fA-F]+)>|\(([^)]*)\))\s*Tj/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = tjStandaloneRegex.exec(str)) !== null) {
      hasTj = true;
      if (sMatch[1]) {
        const hex = sMatch[1];
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          decoded += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
        }
        if (decoded.trim()) fullText += '\n' + decoded.trim();
      } else if (sMatch[2] && sMatch[2].trim()) {
        fullText += '\n' + sMatch[2].trim();
      }
    }

    // 3. Fallback: match any ASCII hex strings inside stream if TJ/Tj yielded nothing
    if (!hasTj) {
      const hexRegex = /<([0-9a-fA-F]{4,})>/g;
      let hMatch: RegExpExecArray | null;
      while ((hMatch = hexRegex.exec(str)) !== null) {
        const hex = hMatch[1];
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substring(i, i + 2), 16);
          if (code >= 32 && code <= 126) decoded += String.fromCharCode(code);
        }
        if (decoded.trim()) fullText += '\n' + decoded.trim();
      }
    }
  }

  return fullText;
}

