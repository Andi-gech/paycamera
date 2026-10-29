// lib/adapters/telebirrVerifier.ts
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';
import { parseOfficialTelebirrHtml } from '../../src/providers/telebirrOfficialScraper';

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
}

export async function verifyTelebirrReceipt(imageUri: string): Promise<VerificationResult> {
    try {
        // 1. Optimize image quality for low-res or blurry photos
        const manipulatedImage = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ resize: { width: 1000 } }],
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );

        // 2. Scan barcode / QR code FIRST if present in the screenshot
        let transactionNumber: string | undefined;

        try {
            const barcodes = await BarcodeScanning.scan(manipulatedImage.uri);
            if (barcodes && barcodes.length > 0) {
                for (const bc of barcodes) {
                    const rawVal = bc.value?.trim() || '';
                    if (!rawVal) continue;

                    // Match Ethio Telecom receipt URL
                    const urlMatch = rawVal.match(/transactioninfo\.ethiotelecom\.et\/receipt\/([A-Za-z0-9]+)/i);
                    if (urlMatch) {
                        transactionNumber = urlMatch[1].toUpperCase();
                        break;
                    }

                    // Match standard Telebirr 10-character reference
                    const refMatch = rawVal.match(/\b([A-Z0-9]{10})\b/);
                    if (refMatch && /\d/.test(refMatch[1])) {
                        transactionNumber = refMatch[1].toUpperCase();
                        break;
                    }
                }
            }
        } catch (barcodeErr) {
            console.log('[Telebirr] Barcode scanning skipped or not found:', barcodeErr);
        }

        // 3. Fallback to Google ML Kit OCR text recognition
        if (!transactionNumber) {
            const result = await TextRecognition.recognize(manipulatedImage.uri);
            const fullText = result.text || '';

            // Check for Ethio Telecom URL in OCR
            const ocrUrlMatch = fullText.match(/transactioninfo\.ethiotelecom\.et\/receipt\/([A-Za-z0-9]+)/i);
            if (ocrUrlMatch) {
                transactionNumber = ocrUrlMatch[1].toUpperCase();
            } else {
                // Match Telebirr transaction reference pattern (e.g., DJQ8BX9KE6 or 10-char alphanumeric)
                const refMatch = fullText.match(/\b([A-Z0-9]{10})\b/);
                if (refMatch && /\d/.test(refMatch[1])) {
                    transactionNumber = refMatch[1].toUpperCase();
                }
            }
        }

        if (!transactionNumber) {
            return { success: false, error: 'Could not find Telebirr transaction number in barcode or image text.' };
        }

        // 4. Fetch official Ethio telecom HTML receipt page
        const receiptUrl = `https://transactioninfo.ethiotelecom.et/receipt/${transactionNumber}`;
        let htmlText = '';

        try {
            console.log(`[Telebirr] Fetching official receipt: ${receiptUrl}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            let response: Response | null = null;
            try {
                response = await fetch(receiptUrl, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                });
            } catch (httpsErr: any) {
                // If HTTPS failed due to SSL or DNS, try HTTP fallback
                try {
                    const httpUrl = `http://transactioninfo.ethiotelecom.et/receipt/${transactionNumber}`;
                    response = await fetch(httpUrl, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        },
                    });
                } catch {
                    throw httpsErr;
                }
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response || !response.ok) {
                return { success: false, receiptUrl, transactionNumber, error: `Failed to fetch Telebirr receipt (Status: ${response?.status || 'Unknown'})` };
            }

            htmlText = await response.text();
        } catch (fetchErr: any) {
            console.warn('[Telebirr] Network fetch warning:', fetchErr?.message || fetchErr);
            const errString = String(fetchErr?.message || fetchErr);
            const isDnsError = errString.includes('UnknownHostException') || errString.includes('Unable to resolve host');

            return {
                success: false,
                receiptUrl,
                transactionNumber,
                error: isDnsError
                    ? 'Cannot connect to Ethio Telecom (transactioninfo.ethiotelecom.et). Please verify your device has an active internet connection (Ethio Telecom network or Wi-Fi).'
                    : `Could not reach Telebirr verification server (${errString}).`,
            };
        }

        // 5. High-fidelity parsing with official scraper + regex fallback
        const parsed = parseOfficialTelebirrHtml(htmlText);
        console.log('[Telebirr] Parsed receipt:', parsed);

        const amountMatch = htmlText.match(/([\d,]+(?:\.\d+)?)\s*Birr/i);
        const timeMatch = htmlText.match(/(\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/);
        const payerNameMatch = htmlText.match(/Payer Name\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/i);
        const isCompleted = /Completed|Successful/i.test(htmlText);

        const amountStr = parsed.amount !== null
            ? `${parsed.amount} Birr`
            : (amountMatch ? `${amountMatch[1]} Birr` : 'N/A');

        const senderStr = parsed.payerName || (payerNameMatch ? payerNameMatch[1].trim() : 'Unknown');
        const receiverStr = parsed.receiverName || 'Unknown';
        const timeStr = parsed.paymentDate || (timeMatch ? timeMatch[1] : 'N/A');
        const statusStr = parsed.status || (isCompleted ? 'Completed (Verified)' : 'Pending/Failed');

        return {
            success: true,
            receiptUrl,
            transactionNumber: parsed.reference || transactionNumber,
            senderName: senderStr,
            receiverName: receiverStr,
            amount: amountStr,
            transactionTime: timeStr,
            status: statusStr,
        };

    } catch (error) {
        console.error('Telebirr Verification Error:', error);
        return { success: false, error: 'Network or processing error occurred during Telebirr verification.' };
    }
}
