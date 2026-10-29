// lib/adapters/cbeVerifier.ts
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';
import * as pakoModule from 'pako';

export interface CbeVerificationResult {
    success: boolean;
    isLegacy?: boolean;
    needsReceiverAccount?: boolean;
    receiptUrl?: string;
    transactionNumber?: string;
    detectedSuffix?: string;
    senderName?: string;
    receiverName?: string;
    amount?: string;
    transactionTime?: string;
    status?: string;
    error?: string;
}

/**
 * Official CBE Headers for mb.cbe.com.et JSON API
 */
const CBE_API_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'X-App-ID': 'd1292e42-7400-49de-a2d3-9731caa4c819',
    'X-App-Version': '0a01980b-9859-1369-8198-59f403820000',
    'Origin': 'https://mbreciept.cbe.com.et',
    'Referer': 'https://mbreciept.cbe.com.et/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 10000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Dynamically switches between:
 * - Legacy CBE portal (apps.cbe.com.et:100/?id={FT}{last8}) when receiver account digits are present for FT receipts
 * - Modern CBE portal (mbreciept.cbe.com.et/{ref}) when digits are absent or for modern receipt IDs (fHCx..., v2-...)
 *
 * Supports signatures:
 * - getReceiptPageUrl(reference, receiverAccountDigits)
 * - getReceiptPageUrl('cbe' | 'cbe-legacy', reference, receiverAccountDigits)
 */
export function getReceiptPageUrl(
    arg1: string,
    arg2?: string,
    arg3?: string
): string {
    let reference = '';
    let receiverAccountDigits = '';

    if (arg1 && (arg1.toLowerCase() === 'cbe' || arg1.toLowerCase() === 'cbe-legacy')) {
        reference = (arg2 || '').trim();
        receiverAccountDigits = (arg3 || '').trim();
    } else {
        reference = (arg1 || '').trim();
        receiverAccountDigits = (arg2 || '').trim();
    }

    if (!reference) return '';
    if (/^https?:\/\//i.test(reference)) return reference;

    const cleanRef = reference.replace(/\s+/g, '');

    // 1. Dashed format: FT...-12345678 (carries FT reference and 8-digit suffix)
    const dashedMatch = cleanRef.match(/^(FT[A-Za-z0-9]{8,14})[-_](\d{8})$/i);
    if (dashedMatch) {
        return `https://apps.cbe.com.et:100/?id=${encodeURIComponent(dashedMatch[1].toUpperCase())}${encodeURIComponent(dashedMatch[2])}`;
    }

    // 2. Combined format: FT...12345678
    const combinedMatch = cleanRef.match(/^(FT[A-Za-z0-9]{8,14}?)(\d{8})$/i);
    if (combinedMatch) {
        return `https://apps.cbe.com.et:100/?id=${encodeURIComponent(combinedMatch[1].toUpperCase())}${encodeURIComponent(combinedMatch[2])}`;
    }

    // 3. FT reference + separate 8 receiver digits
    const clean8 = receiverAccountDigits.replace(/\D/g, '').slice(-8);
    if (clean8.length === 8 && /^FT[A-Za-z0-9]{8,14}$/i.test(cleanRef)) {
        return `https://apps.cbe.com.et:100/?id=${encodeURIComponent(cleanRef.toUpperCase())}${encodeURIComponent(clean8)}`;
    }

    // 4. Modern CBE portal (Receipt ID or FT without receiver digits)
    return `https://mbreciept.cbe.com.et/${encodeURIComponent(cleanRef)}`;
}

// Helper to decompress Flate/Deflate streams from PDF
function decompressStream(slice: Uint8Array): Uint8Array {
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
                } catch { }
            }
        }
    }
    return slice;
}

function findStream(arr: Uint8Array, fromIndex: number): number {
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

function findEndstream(arr: Uint8Array, fromIndex: number): number {
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

        if (slice.length > 100000) continue;

        const uncompressed = decompressStream(slice);
        if (uncompressed.length > 120000) continue;

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

        // 2. Process standalone Tj
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

function extractAmountFromText(text: string): string | null {
    const transMatch =
        text.match(/(?:Transferred\s*Amount|Transfer\s*Amount|Amount\s*Transferred)[\s\S]{0,40}?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ||
        text.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*ETB[\s\S]{0,40}?(?:Transferred|Transfer)/i);
    if (transMatch && transMatch[1]) {
        return transMatch[1];
    }

    const totalMatch =
        text.match(/(?:Total\s*amount\s*debited|Total\s*debited|Total\s*Amount)[\s\S]{0,50}?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    if (totalMatch && totalMatch[1]) {
        return totalMatch[1];
    }

    const genericMatch = text.match(/([\d,]+(?:\.\d+)?)\s*(?:ETB|Birr|ብር)/i);
    return genericMatch ? genericMatch[1] : null;
}

/**
 * Parses CBE reference from barcode or URL or text.
 */
function parseCbeBarcodeOrText(val: string): {
    ref?: string;
    isModern?: boolean;
    receiver8?: string;
} {
    const raw = (val || '').trim();
    if (!raw) return {};

    // 1. Check for legacy URL: id=FT...(8digits)
    const legacyUrlMatch = raw.match(/[?&]id=(FT[A-Za-z0-9]{8,14}?)(\d{8})(?:[&#]|$)/i);
    if (legacyUrlMatch) {
        return {
            ref: legacyUrlMatch[1].toUpperCase(),
            isModern: false,
            receiver8: legacyUrlMatch[2],
        };
    }

    // 2. Check for dashed mbreciept link: mbreciept.cbe.com.et/FT...-12345678
    const dashedUrlMatch = raw.match(/mbreciept\.cbe\.com\.et\/(FT[A-Za-z0-9]{8,14})[-_](\d{8})(?:[&#/?]|$)/i);
    if (dashedUrlMatch) {
        return {
            ref: dashedUrlMatch[1].toUpperCase(),
            isModern: false,
            receiver8: dashedUrlMatch[2],
        };
    }

    // 3. Check for modern mbreciept URL: mbreciept.cbe.com.et/{ref}
    const modernUrlMatch = raw.match(/mbreciept\.cbe\.com\.et\/([A-Za-z0-9_\-]+)/i);
    if (modernUrlMatch) {
        const token = modernUrlMatch[1];
        const isFT = /^FT[A-Za-z0-9]{8,14}$/i.test(token);
        return {
            ref: isFT ? token.toUpperCase() : token,
            isModern: !isFT,
        };
    }

    // 4. Check for mb.cbe.com.et API URL: mb.cbe.com.et/.../transaction-detail/{ref}
    const mbApiMatch = raw.match(/transaction-detail\/([A-Za-z0-9_\-]+)/i);
    if (mbApiMatch) {
        const token = mbApiMatch[1];
        const isFT = /^FT[A-Za-z0-9]{8,14}$/i.test(token);
        return {
            ref: isFT ? token.toUpperCase() : token,
            isModern: !isFT,
        };
    }

    // 5. Raw combined: FT...-12345678 or FT...12345678
    const rawDashed = raw.match(/^(FT[A-Za-z0-9]{8,14})[-_](\d{8})$/i);
    if (rawDashed) {
        return {
            ref: rawDashed[1].toUpperCase(),
            isModern: false,
            receiver8: rawDashed[2],
        };
    }

    const rawCombined = raw.match(/^(FT[A-Za-z0-9]{8,14}?)(\d{8})$/i);
    if (rawCombined) {
        return {
            ref: rawCombined[1].toUpperCase(),
            isModern: false,
            receiver8: rawCombined[2],
        };
    }

    // 6. Modern token formats: v2-... or fHCx...
    const vMatch = raw.match(/\b(v\d{1,2}-[A-Za-z0-9_-]{6,64})\b/i);
    if (vMatch) {
        return {
            ref: vMatch[1],
            isModern: true,
        };
    }

    const fhcxMatch = raw.match(/\b(fHCx[A-Za-z0-9]{6,64})\b/);
    if (fhcxMatch) {
        return {
            ref: fhcxMatch[1],
            isModern: true,
        };
    }

    // 7. Plain FT reference
    const ftMatch = raw.match(/\b(FT[A-Za-z0-9]{8,14})\b/i);
    if (ftMatch) {
        return {
            ref: ftMatch[1].toUpperCase(),
            isModern: false,
        };
    }

    // 8. General modern Receipt ID pattern from catalog:
    // ^(?![Ff][Tt][A-Za-z0-9]{8,12}$)(?:v\d{1,2}-)?[A-Za-z0-9]{10,64}$
    if (/^(?![Ff][Tt][A-Za-z0-9]{8,12}$)(?:v\d{1,2}-)?[A-Za-z0-9]{10,64}$/.test(raw)) {
        return {
            ref: raw,
            isModern: true,
        };
    }

    return {};
}

/**
 * Formats CBE timestamps (ISO 8601 string or 8-digit date) into readable text.
 */
function formatCbeDateTime(val: any): string {
    if (!val) return 'N/A';
    const str = String(val).trim();
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });
    }
    if (/^\d{8}$/.test(str)) {
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
    }
    return str;
}

/**
 * Searches an object recursively for given key names, respecting priority order.
 * Supports strings, numbers, and arrays of primitives (e.g. dateTimes: ["..."]).
 */
function findJsonValue(value: any, keys: string[]): any {
    if (!value || typeof value !== 'object') return undefined;

    // 1. Check each key in order of priority on the current level
    for (const targetKey of keys) {
        for (const [key, item] of Object.entries(value)) {
            if (key.toLowerCase() === targetKey.toLowerCase() && item !== null && item !== undefined) {
                if (Array.isArray(item) && item.length > 0) {
                    if (typeof item[0] !== 'object') return item[0];
                } else if (typeof item !== 'object') {
                    return item;
                }
            }
        }
    }

    // 2. Recurse into child objects/arrays
    for (const item of Object.values(value)) {
        if (item && typeof item === 'object') {
            const found = findJsonValue(item, keys);
            if (found !== undefined) return found;
        }
    }

    return undefined;
}

export async function verifyCbeReceipt(
    imageUri: string,
    receiverAccountDigits?: string
): Promise<CbeVerificationResult> {
    try {
        console.log(`[CBE Verifier] Processing image: ${imageUri}`);

        // 1. Optimize image quality for low-res or blurry photos
        const manipulatedImage = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ resize: { width: 1000 } }],
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );

        // 2. Scan barcode / QR code FIRST if present in the screenshot
        let detectedReference: string | undefined;
        let isModernRef = false;
        let barcodeReceiver8: string | undefined;

        try {
            const barcodes = await BarcodeScanning.scan(manipulatedImage.uri);
            console.log(`[CBE Verifier] Barcodes detected: ${barcodes?.length || 0}`);
            if (barcodes && barcodes.length > 0) {
                for (const bc of barcodes) {
                    const rawVal = bc.value?.trim() || '';
                    if (!rawVal) continue;
                    console.log(`[CBE Verifier] Barcode scanned: "${rawVal}"`);

                    const parsed = parseCbeBarcodeOrText(rawVal);
                    if (parsed.ref) {
                        detectedReference = parsed.ref;
                        isModernRef = !!parsed.isModern;
                        if (parsed.receiver8) barcodeReceiver8 = parsed.receiver8;
                        break;
                    }
                }
            }
        } catch (barcodeErr) {
            console.log('[CBE Verifier] Barcode scanning skipped or not found:', barcodeErr);
        }

        // 3. Extract text locally via Google ML Kit OCR if barcode did not yield reference
        let fullText = '';
        try {
            const result = await TextRecognition.recognize(manipulatedImage.uri);
            fullText = result.text || '';
        } catch (ocrErr) {
            console.log('[CBE Verifier] OCR text recognition error:', ocrErr);
        }

        if (!detectedReference && fullText) {
            console.log(`[CBE Verifier] Scanning OCR text (length: ${fullText.length})`);
            // First check OCR for URLs or modern tokens or labeled receipt ID
            const parsedOcr = parseCbeBarcodeOrText(fullText);
            if (parsedOcr.ref) {
                detectedReference = parsedOcr.ref;
                isModernRef = !!parsedOcr.isModern;
                if (parsedOcr.receiver8) barcodeReceiver8 = parsedOcr.receiver8;
            } else {
                // Check labeled Receipt ID / Transaction ID
                const labeledMatch = fullText.match(
                    /(?:Receipt\s*ID|Receipt\s*No|Transaction\s*ID|Transaction\s*No|Trans\.\s*ID|Reference|Ref\s*No)[:\s]+((?:v\d{1,2}-)?[A-Za-z0-9_-]{8,64})/i
                );
                if (labeledMatch) {
                    const token = labeledMatch[1].trim();
                    const isFT = /^FT[A-Za-z0-9]{8,14}$/i.test(token);
                    detectedReference = isFT ? token.toUpperCase() : token;
                    isModernRef = !isFT;
                }
            }
        }

        console.log(`[CBE Verifier] Final detected reference: "${detectedReference || 'NONE'}" (isModern: ${isModernRef})`);

        if (!detectedReference) {
            return {
                success: false,
                error: 'Could not find CBE transaction ID or Receipt ID (FT..., fHCx..., v2-...) in barcode or image text.',
            };
        }

        // Extract any visible account suffix from the screenshot for user guidance if legacy
        const suffixMatch = fullText.match(/(?:[-–]\s*ETB[-–]\s*(\d{4,8}))|(?:ETB[-–]\s*(\d{4,8}))/i);
        const maskedAccountMatch = fullText.match(/\b1000\d{0,4}[*xX]{2,}(\d{2,4})\b/i);
        const detectedSuffix = suffixMatch?.[1] || suffixMatch?.[2] || maskedAccountMatch?.[1] || undefined;

        // Use receiverAccountDigits if provided, or from barcode if encoded in legacy barcode
        const rawDigits = receiverAccountDigits || barcodeReceiver8 || '';
        const cleanDigits = rawDigits.replace(/\D/g, '');
        const receiver8 = cleanDigits.length >= 8 ? cleanDigits.slice(-8) : '';

        const modernPublicUrl = `https://mbreciept.cbe.com.et/${encodeURIComponent(detectedReference)}`;

        // 4. ALWAYS ATTEMPT MODERN CBE VERIFICATION FIRST
        // Modern receipts and many recent FT receipts can be resolved via mb.cbe.com.et JSON API
        // without requiring an account number.
        if (!receiver8) {
            const jsonApiUrl = `https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/${encodeURIComponent(detectedReference)}`;
            console.log(`[Modern CBE API] Requesting: ${jsonApiUrl}`);

            try {
                const response = await fetchWithTimeout(jsonApiUrl, {
                    headers: CBE_API_HEADERS,
                }, 10000);

                const body = await response.text();
                console.log(`[Modern CBE API] HTTP Status: ${response.status}`);
                console.log(`[Modern CBE API] Content-Type: ${response.headers.get('content-type')}`);
                console.log(`[Modern CBE API] Response Body:\n${body}`);

                if (response.ok) {
                    const isProblemJson = /invalid or tampered legacy token|tampered token|record not found|not found/i.test(body);

                    if (!isProblemJson && /^[\s]*[\[{]/.test(body)) {
                        try {
                            const data = JSON.parse(body);
                            console.log('[Modern CBE API] Parsed JSON Data:', JSON.stringify(data, null, 2));

                            const amountVal = findJsonValue(data, [
                                'amountCredited',
                                'amountCreditedWithCurrency',
                                'debitAmount',
                                'amount',
                                'transferredAmount',
                                'transactionAmount',
                                'amountDebited',
                                'totalAmount',
                                'paidAmount',
                            ]);

                            const refVal = findJsonValue(data, [
                                'id',
                                'receiptId',
                                'transactionId',
                                'transactionReference',
                                'reference',
                                'referenceNumber',
                                'ftNumber',
                                'transactionNo',
                            ]);

                            const statusVal = findJsonValue(data, [
                                'status',
                                'transactionStatus',
                                'paymentStatus',
                                'state',
                            ]);

                            const senderVal = findJsonValue(data, [
                                'debitAccountHolder',
                                'debitedParty',
                                'senderName',
                                'payerName',
                                'debitedAccountName',
                                'sender',
                            ]);

                            const senderAcc = findJsonValue(data, ['debitAccountNo']);

                            const receiverVal = findJsonValue(data, [
                                'creditAccountHolder',
                                'creditedParty',
                                'receiverName',
                                'beneficiaryName',
                                'creditedAccountName',
                                'receiver',
                            ]);

                            const receiverAcc = findJsonValue(data, ['creditAccountNo']);

                            const timeVal = findJsonValue(data, [
                                'dateTimes',
                                'transactionDate',
                                'paymentDate',
                                'processingDate',
                                'debitValueDate',
                                'creditValueDate',
                                'authDate',
                                'dateTime',
                                'date',
                                'createdAt',
                                'timestamp',
                            ]);

                            const urlVal = findJsonValue(data, ['encodedReceipt', 'receiptUrl', 'url']);

                            console.log('[Modern CBE API] Extracted Fields:', {
                                ref: refVal,
                                amount: amountVal,
                                status: statusVal,
                                sender: senderVal,
                                senderAccount: senderAcc,
                                receiver: receiverVal,
                                receiverAccount: receiverAcc,
                                time: timeVal,
                                receiptUrl: urlVal,
                            });

                            let amount: string | null = null;
                            if (amountVal !== undefined && amountVal !== null) {
                                const parsedAmt = String(amountVal).replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/);
                                if (parsedAmt) amount = parsedAmt[0];
                            }

                            const statusStr = statusVal ? String(statusVal).trim() : 'Completed';
                            const completed =
                                /completed|successful|success|paid|settled|debited/i.test(statusStr) &&
                                !/pending|failed|reversed|unsuccessful/i.test(statusStr);

                            if (amount && completed) {
                                const formattedTime = formatCbeDateTime(timeVal);
                                const senderDisplay = senderVal
                                    ? (senderAcc ? `${String(senderVal).trim()} (${String(senderAcc).trim()})` : String(senderVal).trim())
                                    : 'Unknown';
                                const receiverDisplay = receiverVal
                                    ? (receiverAcc ? `${String(receiverVal).trim()} (${String(receiverAcc).trim()})` : String(receiverVal).trim())
                                    : 'Unknown';
                                const resolvedUrl = urlVal ? String(urlVal).trim() : modernPublicUrl;
                                const resolvedRef = refVal ? String(refVal).trim().toUpperCase() : detectedReference;

                                return {
                                    success: true,
                                    isLegacy: false,
                                    receiptUrl: resolvedUrl,
                                    transactionNumber: resolvedRef,
                                    senderName: senderDisplay,
                                    receiverName: receiverDisplay,
                                    amount: `${amount} ETB`,
                                    transactionTime: formattedTime,
                                    status: 'Completed (CBE official record verified)',
                                };
                            }
                        } catch (parseErr) {
                            console.log('Error parsing JSON from mb.cbe.com.et:', parseErr);
                        }
                    }
                }
            } catch (apiErr) {
                console.log('mb.cbe.com.et API fetch failed, trying mbreciept HTML fallback:', apiErr);
            }

            // Fallback: check modern public HTML receipt page
            try {
                console.log(`[Modern CBE HTML] Fetching fallback: ${modernPublicUrl}`);
                const htmlResponse = await fetchWithTimeout(modernPublicUrl, {
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'User-Agent': CBE_API_HEADERS['User-Agent'],
                    },
                }, 10000);
                console.log(`[Modern CBE HTML] Status: ${htmlResponse.status}`);

                if (htmlResponse.ok) {
                    const body = await htmlResponse.text();
                    const isNotFound = /not\s*found|invalid\s*transaction|record\s*not\s*found|no transaction|unsuccessful/i.test(body);

                    if (!isNotFound) {
                        const cleanHtml = body
                            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/&nbsp;|&#160;/gi, ' ')
                            .replace(/&amp;/gi, '&')
                            .replace(/\s+/g, ' ');

                        const amount = extractAmountFromText(cleanHtml);
                        const statusMatch = cleanHtml.match(/\b(completed|successful|success|paid|settled)\b/i);
                        const senderMatch = cleanHtml.match(/(?:debited from|payer name)[:\s]+([A-Za-z][A-Za-z .'-]{1,80}?)(?:\s+for|\s+account|[,|])/i);
                        const receiverMatch = cleanHtml.match(/(?:credited party|receiver name|beneficiary name)[:\s]+([A-Za-z][A-Za-z .'-]{1,80}?)(?:\s+on|\s+account|[,|])/i);
                        const timeMatch = cleanHtml.match(/(\d{2}-[A-Za-z]{3}-\d{4}\s\d{1,2}:\d{2}\s?[AP]M|\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/i);

                        if (amount && statusMatch) {
                            return {
                                success: true,
                                isLegacy: false,
                                receiptUrl: modernPublicUrl,
                                transactionNumber: detectedReference,
                                senderName: senderMatch ? senderMatch[1].trim() : 'Unknown',
                                receiverName: receiverMatch ? receiverMatch[1].trim() : 'Unknown',
                                amount: `${amount} ETB`,
                                transactionTime: timeMatch ? timeMatch[1] : 'N/A',
                                status: 'Completed (CBE official record verified)',
                            };
                        }
                    }
                }
            } catch (htmlErr) {
                console.log('mbreciept.cbe.com.et HTML fetch failed:', htmlErr);
            }

            // If modern verification failed:
            // Check if this is an older FT reference that needs the receiver account's last 8 digits
            const isFtRef = /^FT[A-Za-z0-9]{8,14}$/i.test(detectedReference);
            if (isFtRef) {
                return {
                    success: false,
                    isLegacy: true,
                    needsReceiverAccount: true,
                    receiptUrl: modernPublicUrl,
                    transactionNumber: detectedReference,
                    detectedSuffix,
                    error: 'Could not confirm transaction on CBE modern portal. If this is an older CBE FT receipt, enter the receiving account’s last 8 digits.',
                };
            }

            // Modern Receipt ID (fHCx..., v2-...) that failed
            return {
                success: false,
                isLegacy: false,
                needsReceiverAccount: false,
                receiptUrl: modernPublicUrl,
                transactionNumber: detectedReference,
                error: `Could not verify CBE Receipt ID (${detectedReference}) on CBE records. Please ensure the transaction has completed.`,
            };
        }

        // 5. LEGACY CBE VERIFICATION (WHEN 8 RECEIVER DIGITS ARE PROVIDED)
        // Query the legacy CBE portal endpoint (apps.cbe.com.et:100/?id={FT}{last8})
        const legacyUrl = getReceiptPageUrl(detectedReference, receiver8);
        console.log('Fetching CBE Legacy URL with receiver digits:', legacyUrl);

        const response = await fetchWithTimeout(legacyUrl, {
            headers: {
                'Accept': 'application/pdf, text/html, */*',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
            },
        }, 12000);

        if (response.status === 404) {
            return {
                success: false,
                isLegacy: true,
                needsReceiverAccount: true,
                receiptUrl: legacyUrl,
                transactionNumber: detectedReference,
                detectedSuffix,
                error: `Receiving account digits (${receiver8}) did not match this transaction on CBE records (HTTP 404). Please double-check the receiver account number and try again.`,
            };
        }

        if (response.status === 500) {
            return {
                success: false,
                isLegacy: true,
                receiptUrl: legacyUrl,
                transactionNumber: detectedReference,
                error: `CBE Legacy receipt not found (HTTP 500). Please check that transaction ID ${detectedReference} is correct and has completed.`,
            };
        }

        if (!response.ok) {
            return {
                success: false,
                isLegacy: true,
                receiptUrl: legacyUrl,
                transactionNumber: detectedReference,
                error: `Failed to fetch CBE Legacy service (Status: ${response.status})`,
            };
        }

        // 6. Handle Legacy CBE response (PDF or HTML)
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        const isPdf =
            contentType.includes('pdf') ||
            (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);

        if (isPdf) {
            const pdfText = extractTextFromPdf(bytes);
            const amount = extractAmountFromText(pdfText);
            const senderMatch =
                pdfText.match(/Payer[\s\S]{0,50}?([A-Za-z\s]+?)\s*Account/i) ||
                pdfText.match(/debited from\s+([A-Za-z\s]+?)\s+for/i);
            const receiverMatch =
                pdfText.match(/Receiver[\s\S]{0,50}?([A-Za-z\s]+?)\s*Account/i) ||
                pdfText.match(/for\s+([A-Za-z\s]+?)\s+on/i);
            const timeMatch =
                pdfText.match(/(\d{2}-[A-Za-z]{3}-\d{4}\s\d{1,2}:\d{2}\s?[AP]M|\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/i) ||
                pdfText.match(/(?:Payment\s*Date|Date)[\s\S]{0,30}?(\d{1,2}[-/][A-Za-z0-9]+[-/]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)/i);

            if (!amount) {
                return {
                    success: false,
                    isLegacy: true,
                    receiptUrl: legacyUrl,
                    transactionNumber: detectedReference,
                    error: 'CBE returned a legacy PDF, but its transaction amount could not be extracted. The receipt was not verified.',
                };
            }

            if (/pending|failed|reversed|unsuccessful/i.test(pdfText)) {
                return {
                    success: false,
                    isLegacy: true,
                    receiptUrl: legacyUrl,
                    transactionNumber: detectedReference,
                    amount: `${amount} ETB`,
                    error: 'The legacy receipt does not show a completed transaction.',
                };
            }

            return {
                success: true,
                isLegacy: true,
                receiptUrl: legacyUrl,
                transactionNumber: detectedReference,
                senderName: senderMatch ? senderMatch[1].replace(/\s+/g, ' ').trim() : 'Unknown',
                receiverName: receiverMatch ? receiverMatch[1].replace(/\s+/g, ' ').trim() : 'Unknown',
                amount: `${amount} ETB`,
                transactionTime: timeMatch ? timeMatch[1].trim() : 'N/A',
                status: 'Legacy receipt retrieved; compare the amount before accepting payment',
            };
        } else {
            const htmlText = new TextDecoder('utf-8').decode(bytes);
            const amountMatch = htmlText.match(/([\d,]+(?:\.\d+)?)\s*(?:ETB|Birr)/i);
            const timeMatch = htmlText.match(/(\d{2}-[A-Za-z]{3}-\d{4}\s\d{1,2}:\d{2}\s?[AP]M|\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/i);
            const senderMatch = htmlText.match(/debited from\s+([A-Za-z\s]+?)\s+for/i) || htmlText.match(/Payer Name[:\s]*([^<]+)/i);
            const receiverMatch = htmlText.match(/for\s+([A-Za-z\s]+?)\s+on/i) || htmlText.match(/Credited Party[:\s]*([^<]+)/i);

            if (!amountMatch || /not\s*found|invalid\s*transaction|pending|failed|reversed|unsuccessful/i.test(htmlText)) {
                return {
                    success: false,
                    isLegacy: true,
                    receiptUrl: legacyUrl,
                    transactionNumber: detectedReference,
                    error: 'The legacy CBE response did not contain a readable completed receipt. The receipt was not verified.',
                };
            }

            return {
                success: true,
                isLegacy: true,
                receiptUrl: legacyUrl,
                transactionNumber: detectedReference,
                senderName: senderMatch ? senderMatch[1].trim() : 'Unknown',
                receiverName: receiverMatch ? receiverMatch[1].trim() : 'Unknown',
                amount: `${amountMatch[1]} ETB`,
                transactionTime: timeMatch ? timeMatch[1] : 'N/A',
                status: 'Legacy receipt retrieved; compare the amount before accepting payment',
            };
        }
    } catch (error) {
        console.error('CBE Verification Error:', error);
        return { success: false, error: 'Network or processing error occurred during CBE verification.' };
    }
}
