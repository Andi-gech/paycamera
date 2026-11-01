
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';
import CryptoJS from 'crypto-js';

export type BoaVerificationStatus =
    | 'verified'
    | 'decoded_only'
    | 'failed'
    | 'needs_input';

export interface BoaVerificationResult {
    success: boolean;
    verified: boolean;
    decoded: boolean;
    decodedOnly: boolean;
    status: BoaVerificationStatus;
    transactionNumber: string | null;
    senderName: string | null;
    receiverName: string | null;
    senderAccount: string | null;
    receiverAccount: string | null;
    amount: number | null;
    currency: string | null;
    transactionTime: string | null;
    transactionType: string | null;
    serviceFee: number | null;
    totalPaid: number | null;
    reason: string | null;
    receiptUrl: string | null;
    error: string | null;
    rawResponse?: unknown;
}

interface BoaQrData {
    senderAccount: string;
    senderName: string;
    amount: number | null;
    reference: string;
    date: string;
    receiverAccount: string;
    receiverName: string;
}

interface BoaReceiptData {
    senderName: string | null;
    receiverName: string | null;
    senderAccount: string | null;
    receiverAccount: string | null;
    amount: number | null;
    currency: string;
    date: string | null;
    reference: string | null;
    transactionType: string | null;
    serviceFee: number | null;
    totalPaid: number | null;
    reason: string | null;
}

const BOA_API =
    'https://cs.bankofabyssinia.com/api/onlineSlip/getDetails/';

const BOA_SLIP_HOST = 'cs.bankofabyssinia.com';

const REQUEST_TIMEOUT = 20000;

const QR_PASSWORD =
    'ELqVy2g4pGWLUIKSa+1ijwpPy6eDxBFBLBPrJ24v/IA=';

const QR_SALT = 'salt';

const QR_IV = '1234567890123456';

const QR_ITERATIONS = 10000;

const QR_KEY_SIZE = 256 / 32;

function cleanText(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    const result = String(value).trim();

    if (
        !result ||
        result.toLowerCase() === 'null' ||
        result.toLowerCase() === 'undefined' ||
        result === '-'
    ) {
        return null;
    }

    return result;
}

function parseMoney(value: unknown): number | null {
    const text = cleanText(value);

    if (!text) return null;

    const normalized = text.replace(/,/g, '').replace(/[^\d.-]/g, '');

    if (!normalized) return null;

    const amount = Number(normalized);

    return Number.isFinite(amount) ? amount : null;
}

function getLastFiveDigits(value?: string | null): string | null {
    if (!value) return null;

    const digits = value.replace(/\D/g, '');

    return digits.length >= 5 ? digits.slice(-5) : null;
}

function isFullAccountNumber(value?: string | null): boolean {
    if (!value) return false;

    const digits = value.replace(/\D/g, '');

    return digits.length >= 8 && !/[*xX]/.test(value);
}

function normalizeReference(value: string): string {
    return value.trim().toUpperCase().replace(/[\s-]/g, '');
}

function isBoaSlipUrl(value: string): boolean {
    try {
        const url = new URL(value);

        return (
            url.hostname.toLowerCase() === BOA_SLIP_HOST &&
            url.pathname.toLowerCase().includes('/slip/')
        );
    } catch {
        return false;
    }
}

function extractSlipData(value: string): {
    reference: string | null;
    accountSuffix: string | null;
    receiptUrl: string | null;
} {
    try {
        const url = new URL(value.trim());

        if (
            url.hostname.toLowerCase() !== BOA_SLIP_HOST ||
            !url.pathname.toLowerCase().includes('/slip/')
        ) {
            return {
                reference: null,
                accountSuffix: null,
                receiptUrl: null,
            };
        }

        const trx = url.searchParams.get('trx');

        if (!trx || trx.length <= 5) {
            return {
                reference: null,
                accountSuffix: null,
                receiptUrl: null,
            };
        }

        const normalized = trx.replace(/[^a-zA-Z0-9]/g, '');

        return {
            reference: normalized.slice(0, -5).toUpperCase(),
            accountSuffix: normalized.slice(-5),
            receiptUrl: url.toString(),
        };
    } catch {
        return {
            reference: null,
            accountSuffix: null,
            receiptUrl: null,
        };
    }
}

function extractReference(text: string): string | null {
    const slip = extractSlipData(text);

    if (slip.reference) return slip.reference;

    const patterns = [
        /(?:transaction\s*(?:id|number|reference|no)|reference\s*(?:number|no)?|trx\s*(?:id|no)?)\s*[:#\-]?\s*([A-Z0-9]{8,25})/i,
        /\b(FT[A-Z0-9]{8,20})\b/i,
        /\b([A-Z]{2}\d[A-Z0-9]{6,20})\b/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);

        if (match?.[1]) {
            return normalizeReference(match[1]);
        }
    }

    return null;
}

function extractAccountNumber(text: string): string | null {
    const patterns = [
        /(?:account\s*(?:number|no)?|a\/c\s*(?:no)?|account)\s*[:#\-]?\s*([0-9*Xx]{5,25})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);

        if (match?.[1]) return match[1];
    }

    return null;
}

function decryptBoaQr(qrData: string): BoaQrData | null {
    try {
        const normalized = qrData.trim().replace(/\s/g, '');

        if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
            return null;
        }

        const ciphertext = CryptoJS.enc.Base64.parse(normalized);

        if (!ciphertext.sigBytes || ciphertext.sigBytes % 16 !== 0) {
            return null;
        }

        const key = CryptoJS.PBKDF2(
            QR_PASSWORD,
            CryptoJS.enc.Utf8.parse(QR_SALT),
            {
                keySize: QR_KEY_SIZE,
                iterations: QR_ITERATIONS,
                hasher: CryptoJS.algo.SHA1,
            },
        );

        const decrypted = CryptoJS.AES.decrypt(
            CryptoJS.lib.CipherParams.create({
                ciphertext,
            }),
            key,
            {
                iv: CryptoJS.enc.Utf8.parse(QR_IV),
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
            },
        );

        const plaintext = decrypted.toString(CryptoJS.enc.Utf8);

        if (!plaintext) return null;

        const parts = plaintext.split(',').map((item) => item.trim());

        if (parts.length < 7) return null;

        const [
            senderAccount,
            senderName,
            amountText,
            reference,
            date,
            receiverAccount,
            receiverName,
        ] = parts;

        const normalizedReference = normalizeReference(reference);

        if (
            !senderAccount ||
            !normalizedReference ||
            !receiverAccount ||
            !/^[A-Z0-9]{8,25}$/i.test(normalizedReference)
        ) {
            return null;
        }

        return {
            senderAccount,
            senderName,
            amount: parseMoney(amountText),
            reference: normalizedReference,
            date,
            receiverAccount,
            receiverName,
        };
    } catch {
        return null;
    }
}

function parseBoaResponse(data: unknown): {
    receipt: BoaReceiptData | null;
    notFound: boolean;
} {
    try {
        const payload = data as {
            body?: unknown[];
        };

        const row = payload?.body?.[0] as
            | Record<string, unknown>
            | undefined;

        if (!row || typeof row !== 'object') {
            return {
                receipt: null,
                notFound: false,
            };
        }

        const notFound =
            row["Payer's Name"] === 'Invalid reference number';

        if (notFound) {
            return {
                receipt: null,
                notFound: true,
            };
        }

        const receipt: BoaReceiptData = {
            senderName:
                cleanText(row['Source Account Name']) ??
                cleanText(row["Payer's Name"]),
            senderAccount: cleanText(row['Source Account']),
            receiverName: cleanText(row["Receiver's Name"]),
            receiverAccount: cleanText(row["Receiver's Account"]),
            amount: parseMoney(row['Transferred Amount']),
            currency: cleanText(row.currency) ?? 'ETB',
            date: cleanText(row['Transaction Date']),
            reference: cleanText(row['Transaction Reference']),
            transactionType: cleanText(row['Transaction Type']),
            serviceFee: parseMoney(row['Service Charge']),
            totalPaid: parseMoney(row['Total Amount including VAT']),
            reason:
                cleanText(row['Payment Reference']) ??
                cleanText(row['Narrative']),
        };

        return {
            receipt,
            notFound: false,
        };
    } catch {
        return {
            receipt: null,
            notFound: false,
        };
    }
}

function createFailure(
    error: string,
    status: BoaVerificationStatus = 'failed',
): BoaVerificationResult {
    return {
        success: false,
        verified: false,
        decoded: false,
        decodedOnly: false,
        status,
        transactionNumber: null,
        senderName: null,
        receiverName: null,
        senderAccount: null,
        receiverAccount: null,
        amount: null,
        currency: null,
        transactionTime: null,
        transactionType: null,
        serviceFee: null,
        totalPaid: null,
        reason: null,
        receiptUrl: null,
        error,
    };
}

function createDecodedOnly(
    qr: BoaQrData,
    error: string,
): BoaVerificationResult {
    return {
        success: false,
        verified: false,
        decoded: true,
        decodedOnly: true,
        status: 'decoded_only',
        transactionNumber: qr.reference,
        senderName: qr.senderName,
        receiverName: qr.receiverName,
        senderAccount: qr.senderAccount,
        receiverAccount: qr.receiverAccount,
        amount: qr.amount,
        currency: 'ETB',
        transactionTime: qr.date,
        transactionType: null,
        serviceFee: null,
        totalPaid: null,
        reason: null,
        receiptUrl: null,
        error,
    };
}

function createVerified(
    receipt: BoaReceiptData,
    receiptUrl: string,
    rawResponse: unknown,
): BoaVerificationResult {
    return {
        success: true,
        verified: true,
        decoded: true,
        decodedOnly: false,
        status: 'verified',
        transactionNumber: receipt.reference,
        senderName: receipt.senderName,
        receiverName: receipt.receiverName,
        senderAccount: receipt.senderAccount,
        receiverAccount: receipt.receiverAccount,
        amount: receipt.amount,
        currency: receipt.currency,
        transactionTime: receipt.date,
        transactionType: receipt.transactionType,
        serviceFee: receipt.serviceFee,
        totalPaid: receipt.totalPaid,
        reason: receipt.reason,
        receiptUrl,
        error: null,
        rawResponse,
    };
}

async function fetchBoa(
    reference: string,
    accountSuffix: string,
): Promise<{
    receipt: BoaReceiptData | null;
    notFound: boolean;
    rawResponse: unknown;
    error: string | null;
}> {
    const url = `${BOA_API}?id=${encodeURIComponent(
        `${reference}${accountSuffix}`,
    )}`;

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT,
    );

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json, text/plain, */*',
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            return {
                receipt: null,
                notFound: false,
                rawResponse: null,
                error: `BOA returned HTTP ${response.status}.`,
            };
        }

        const rawResponse = await response.json();

        const parsed = parseBoaResponse(rawResponse);

        return {
            ...parsed,
            rawResponse,
            error: null,
        };
    } catch (error) {
        return {
            receipt: null,
            notFound: false,
            rawResponse: null,
            error:
                error instanceof Error
                    ? error.name === 'AbortError'
                        ? 'BOA verification timed out.'
                        : error.message
                    : 'Unable to connect to BOA.',
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function verifyWithAccount(
    reference: string,
    accountSuffix: string,
): Promise<{
    receipt: BoaReceiptData | null;
    notFound: boolean;
    rawResponse: unknown;
    error: string | null;
}> {
    return fetchBoa(reference, accountSuffix);
}

export async function verifyBoaTransaction(
    reference: string,
    accountDigits?: string,
): Promise<BoaVerificationResult> {
    const slip = extractSlipData(reference);

    const normalizedReference = normalizeReference(
        slip.reference ?? reference,
    );

    const accountSuffix =
        slip.accountSuffix ?? getLastFiveDigits(accountDigits);

    if (!normalizedReference || normalizedReference.length < 8) {
        return createFailure('Invalid BOA transaction reference.');
    }

    if (!accountSuffix) {
        return createFailure(
            'The last five digits of an account on the receipt are required.',
            'needs_input',
        );
    }

    const receiptUrl = `${BOA_API}?id=${encodeURIComponent(
        `${normalizedReference}${accountSuffix}`,
    )}`;

    const result = await verifyWithAccount(
        normalizedReference,
        accountSuffix,
    );

    if (result.receipt) {
        return createVerified(
            result.receipt,
            receiptUrl,
            result.rawResponse,
        );
    }

    return {
        ...createFailure(
            result.error ??
            (result.notFound
                ? 'BOA could not find this transaction.'
                : 'BOA returned an unrecognized receipt response.'),
        ),
        transactionNumber: normalizedReference,
        receiptUrl,
        rawResponse: result.rawResponse,
    };
}

export async function verifyBoaQr(
    qrData: string,
): Promise<BoaVerificationResult> {
    const qr = decryptBoaQr(qrData);

    if (!qr) {
        return createFailure(
            'Could not decrypt or parse the BOA QR code.',
        );
    }

    const receiverSuffix = getLastFiveDigits(
        qr.receiverAccount,
    );

    if (!receiverSuffix) {
        return createDecodedOnly(
            qr,
            'QR decoded, but the receiving account does not contain five usable digits.',
        );
    }

    const receiverResult = await verifyWithAccount(
        qr.reference,
        receiverSuffix,
    );

    if (receiverResult.receipt) {
        return createVerified(
            receiverResult.receipt,
            `${BOA_API}?id=${encodeURIComponent(
                `${qr.reference}${receiverSuffix}`,
            )}`,
            receiverResult.rawResponse,
        );
    }

    if (receiverResult.error) {
        return createDecodedOnly(
            qr,
            `QR decoded, but BOA could not be reached: ${receiverResult.error}`,
        );
    }

    if (!receiverResult.notFound) {
        return createDecodedOnly(
            qr,
            'QR decoded, but BOA returned an unrecognized response.',
        );
    }

    if (!isFullAccountNumber(qr.senderAccount)) {
        return createFailure(
            'BOA did not find the transaction using the receiving account.',
        );
    }

    const senderSuffix = getLastFiveDigits(qr.senderAccount);

    if (!senderSuffix || senderSuffix === receiverSuffix) {
        return createFailure(
            'BOA did not find the transaction using either account.',
        );
    }

    const senderResult = await verifyWithAccount(
        qr.reference,
        senderSuffix,
    );

    if (senderResult.receipt) {
        return createVerified(
            senderResult.receipt,
            `${BOA_API}?id=${encodeURIComponent(
                `${qr.reference}${senderSuffix}`,
            )}`,
            senderResult.rawResponse,
        );
    }

    if (senderResult.error) {
        return createDecodedOnly(
            qr,
            `QR decoded, but BOA could not be reached: ${senderResult.error}`,
        );
    }

    return createFailure(
        'BOA could not find the transaction using the receiver or sender account.',
    );
}

export async function verifyBoaReceipt(
    imageUri: string,
    accountDigits?: string,
    preExtractedRef?: string,
    preExtractedText?: string,
): Promise<BoaVerificationResult> {
    let preprocessedUri = imageUri;
    let rawText = preExtractedText ?? '';

    try {
        const manipulated = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ resize: { width: 1200 } }],
            {
                compress: 0.9,
                format: ImageManipulator.SaveFormat.JPEG,
            },
        );

        preprocessedUri = manipulated.uri;
    } catch (error) {
        console.log('[BOA] Image preprocessing failed:', error);
    }

    try {
        const barcodes = await BarcodeScanning.scan(preprocessedUri);

        for (const barcode of barcodes ?? []) {
            const value = barcode.value?.trim();

            if (!value) continue;

            if (isBoaSlipUrl(value)) {
                return verifyBoaTransaction(value);
            }

            const slip = extractSlipData(value);

            if (slip.reference && slip.accountSuffix) {
                return verifyBoaTransaction(value);
            }

            const qrResult = await verifyBoaQr(value);

            if (qrResult.decoded || qrResult.verified) {
                return qrResult;
            }
        }
    } catch (error) {
        console.log('[BOA] Barcode scanning failed:', error);
    }

    if (!rawText) {
        try {
            const ocr = await TextRecognition.recognize(
                preprocessedUri,
            );

            rawText = ocr.text || '';
        } catch (error) {
            console.log('[BOA] OCR failed:', error);
        }
    }

    const slip = extractSlipData(rawText);

    if (slip.reference && slip.accountSuffix) {
        return verifyBoaTransaction(rawText);
    }

    const reference =
        preExtractedRef?.trim() ||
        extractReference(rawText);

    if (!reference) {
        return createFailure(
            'Could not identify a BOA transaction reference.',
        );
    }

    const account =
        getLastFiveDigits(accountDigits) ??
        getLastFiveDigits(extractAccountNumber(rawText));

    if (!account) {
        return {
            ...createFailure(
                'BOA reference detected. The last five digits of an account on the receipt are required.',
                'needs_input',
            ),
            transactionNumber: normalizeReference(reference),
        };
    }

    return verifyBoaTransaction(reference, account);
}
