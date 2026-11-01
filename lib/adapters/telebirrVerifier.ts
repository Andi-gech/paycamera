// lib/adapters/telebirrVerifier.ts
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';
import { parseOfficialTelebirrHtml } from '../../src/providers/telebirrOfficialScraper';
import {
    isValidTelebirrRef,
    extractTelebirrRefFromText,
    getOcrReferenceVariants,
} from './telebirrUtils';

const TAG = '[TelebirrVerifier]';
const RECEIPT_BASE_URL = 'https://transactioninfo.ethiotelecom.et/receipt';
const REQUEST_TIMEOUT_MS = 25000;
const MAX_RETRIES = 2; // 1 initial attempt + 2 retries on 504 / network failure

const FETCH_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export const ERROR_FAKE_RECEIPT = 'This receipt is fake. The transaction was not found on Ethio Telecom.';
export const ERROR_NETWORK =
    'Could not reach Ethio Telecom. Please fix your network. If you are using Safari, switch your network to Ethio Telecom.';

export type VerificationErrorKind = 'network' | 'fake' | 'not_found';

export interface VerificationResult {
    success: boolean;
    receiptUrl?: string;
    transactionNumber?: string;
    senderName?: string;
    receiverName?: string;
    amount?: string;
    transactionTime?: string;
    status?: string;
    error?: string;
    /** Why verification failed: only 'network' failures are worth retrying. */
    errorKind?: VerificationErrorKind;
}

export interface TelebirrVerifyOptions {
    preExtractedRef?: string | null;
    preExtractedText?: string | null;
}

type FetchOutcome =
    | { kind: 'ok'; html: string }
    | { kind: 'fake' }
    | { kind: 'network' }
    | { kind: 'http'; status: number };

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

async function runOcr(imageUri: string): Promise<string> {
    const resized = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1000 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    const result = await TextRecognition.recognize(resized.uri);
    return result.text || '';
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Single request. Never throws. */
async function fetchOnce(url: string): Promise<FetchOutcome> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
        const body = await response.text();

        if (/This request is not correct/i.test(body)) {
            return { kind: 'fake' };
        }
        // nginx "504 Gateway Time-out"
        if (response.status === 504 || /504 Gateway Time-?out/i.test(body)) {
            return { kind: 'http', status: 504 };
        }
        if (!response.ok) {
            return { kind: 'http', status: response.status };
        }
        return { kind: 'ok', html: body };
    } catch (err: any) {
        console.warn(`${TAG} Fetch error:`, err?.message || err);
        return { kind: 'network' };
    } finally {
        clearTimeout(timeoutId);
    }
}

/** Retries twice on 504 or network failure. */
async function fetchReceiptHtml(url: string): Promise<FetchOutcome> {
    let outcome: FetchOutcome = { kind: 'network' };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            console.log(`${TAG} Retry ${attempt}/${MAX_RETRIES} for ${url}`);
            await sleep(1000 * attempt);
        }
        outcome = await fetchOnce(url);

        const retryable = outcome.kind === 'network' || (outcome.kind === 'http' && outcome.status === 504);
        if (!retryable) return outcome;
    }
    return outcome;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseReceipt(html: string, url: string, fallbackRef: string): VerificationResult | null {
    const parsed = parseOfficialTelebirrHtml(html);

    const amountMatch = html.match(/([\d,]+(?:\.\d+)?)\s*Birr/i);
    const timeMatch = html.match(/(\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/);
    const payerMatch = html.match(/Payer Name\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/i);

    const hasAmount = parsed.amount !== null || !!amountMatch;
    const hasDetails = !!(parsed.receiverName || parsed.payerName || parsed.paymentDate || parsed.reference);
    const isCompleted =
        /Completed|Successful/i.test(html) ||
        (parsed.status ? /completed|successful|success/i.test(parsed.status) : false);
    const isFailed = parsed.status
        ? /fail|cancel/i.test(parsed.status)
        : /transaction not found|invalid transaction/i.test(html);

    if (!hasAmount || isFailed || !(isCompleted || hasDetails)) return null;

    return {
        success: true,
        receiptUrl: url,
        transactionNumber: parsed.reference || fallbackRef,
        senderName: parsed.payerName || payerMatch?.[1].trim() || 'Unknown',
        receiverName: parsed.receiverName || 'Unknown',
        amount: parsed.amount !== null ? `${parsed.amount} Birr` : amountMatch ? `${amountMatch[1]} Birr` : 'N/A',
        transactionTime: parsed.paymentDate || timeMatch?.[1] || 'N/A',
        status: parsed.status || 'Completed',
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Verifies a Telebirr reference number directly (no image / OCR needed). */
export async function verifyTelebirrReference(reference: string): Promise<VerificationResult> {
    try {
        if (!reference || !isValidTelebirrRef(reference)) {
            return {
                success: false,
                errorKind: 'not_found',
                error: 'Could not find a Telebirr transaction number in the image.',
            };
        }

        // 0 <-> O variants cover common OCR mistakes
        const candidates = getOcrReferenceVariants(reference);
        let sawFake = false;

        for (const candidate of candidates) {
            const receiptUrl = `${RECEIPT_BASE_URL}/${candidate}`;
            const outcome = await fetchReceiptHtml(receiptUrl);

            switch (outcome.kind) {
                case 'network':
                    return {
                        success: false,
                        receiptUrl,
                        transactionNumber: candidate,
                        errorKind: 'network',
                        error: ERROR_NETWORK,
                    };

                case 'http':
                    if (outcome.status === 504) {
                        return {
                            success: false,
                            receiptUrl,
                            transactionNumber: candidate,
                            errorKind: 'network',
                            error: ERROR_NETWORK,
                        };
                    }
                    continue;

                case 'fake':
                    sawFake = true;
                    continue; // may just be an OCR 0/O mix-up, try next variant

                case 'ok': {
                    const result = parseReceipt(outcome.html, receiptUrl, candidate);
                    if (result) return result;
                    continue;
                }
            }
        }

        return {
            success: false,
            transactionNumber: reference,
            errorKind: sawFake ? 'fake' : 'not_found',
            error: sawFake
                ? ERROR_FAKE_RECEIPT
                : 'The receipt could not be verified on the Ethio Telecom server.',
        };
    } catch (error) {
        console.error(`${TAG} Fatal error:`, error);
        return { success: false, errorKind: 'network', error: 'An error occurred while processing the receipt.' };
    }
}

/** Verifies a Telebirr receipt screenshot: OCR -> reference -> verifyTelebirrReference. */
export async function verifyTelebirrReceipt(
    imageUri: string,
    options?: TelebirrVerifyOptions
): Promise<VerificationResult> {
    try {
        let fullText = options?.preExtractedText || '';
        if (!fullText && !options?.preExtractedRef) {
            fullText = await runOcr(imageUri);
            console.log(`${TAG} OCR recognized ${fullText.length} characters`);
        }

        const reference =
            options?.preExtractedRef || (fullText ? extractTelebirrRefFromText(fullText) : null);

        if (!reference) {
            return {
                success: false,
                errorKind: 'not_found',
                error: 'Could not find a Telebirr transaction number in the image.',
            };
        }
        return verifyTelebirrReference(reference);
    } catch (error) {
        console.error(`${TAG} Fatal error:`, error);
        return { success: false, errorKind: 'not_found', error: 'An error occurred while processing the receipt.' };
    }
}