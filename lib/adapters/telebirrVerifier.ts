// lib/adapters/telebirrVerifier.ts
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';
import { parseOfficialTelebirrHtml } from '../../src/providers/telebirrOfficialScraper';
import { isValidTelebirrRef, extractTelebirrRefFromText } from './telebirrUtils';

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

function extractOcrReceiptDetails(text: string) {
    if (!text) return {};

    const amountMatch = text.match(/(?:amount|ብር|የተከፈለው\s*መጠን)[:\s]*([\d,]+(?:\.\d+)?)\s*(?:birr|etb|ብር)?/i) ||
                        text.match(/([\d,]+(?:\.\d+)?)\s*(?:birr|etb|ብር)/i);

    const payerMatch = text.match(/(?:payer\s*name|payer|from|ከፋይ|የከፋይ\s*ስም)[:\s]+([^\n\r]+)/i);
    const receiverMatch = text.match(/(?:receiver\s*name|receiver|to|ተቀባይ|የተቀባይ\s*ስም|credited\s*party)[:\s]+([^\n\r]+)/i);
    const timeMatch = text.match(/(\d{2}[-/]\d{2}[-/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/) ||
                      text.match(/(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/);

    return {
        amount: amountMatch ? `${amountMatch[1]} Birr` : undefined,
        senderName: payerMatch ? payerMatch[1].trim() : undefined,
        receiverName: receiverMatch ? receiverMatch[1].trim() : undefined,
        transactionTime: timeMatch ? timeMatch[1].trim() : undefined,
    };
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
        let fullText = '';

        try {
            const barcodes = await BarcodeScanning.scan(manipulatedImage.uri);
            if (barcodes && barcodes.length > 0) {
                for (const bc of barcodes) {
                    const rawVal = bc.value?.trim() || '';
                    if (!rawVal) continue;

                    // Match Ethio Telecom receipt URL
                    const urlMatch = rawVal.match(/transactioninfo\.ethiotelecom\.et\/receipt\/([A-Za-z0-9]+)/i);
                    if (urlMatch && isValidTelebirrRef(urlMatch[1])) {
                        transactionNumber = urlMatch[1].toUpperCase();
                        break;
                    }

                    // Match standard Telebirr 10-character reference (strictly mixed letters and digits)
                    const refMatch = rawVal.match(/\b([A-Z0-9]{10})\b/i);
                    if (refMatch && isValidTelebirrRef(refMatch[1])) {
                        transactionNumber = refMatch[1].toUpperCase();
                        break;
                    }
                }
            }
        } catch (barcodeErr) {
            console.log('[Telebirr] Barcode scanning skipped or not found:', barcodeErr);
        }

        // 3. Fallback to Google ML Kit OCR text recognition (also provides fallback receipt details)
        try {
            const result = await TextRecognition.recognize(manipulatedImage.uri);
            fullText = result.text || '';

            if (!transactionNumber) {
                const extracted = extractTelebirrRefFromText(fullText);
                if (extracted) {
                    transactionNumber = extracted;
                }
            }
        } catch (ocrErr) {
            console.log('[Telebirr] OCR recognition error:', ocrErr);
        }

        if (!transactionNumber) {
            return { success: false, error: 'Could not find Telebirr transaction number in barcode or image text.' };
        }

        // 4. Fetch official Ethio telecom HTML receipt page
        const receiptUrl = `https://transactioninfo.ethiotelecom.et/receipt/${transactionNumber}`;
        let htmlText = '';

        const isDnsFailure = (e: any) => {
            const s = String(e?.message || e);
            return s.includes('UnknownHostException') || s.includes('Unable to resolve host') || s.includes('No address associated');
        };

        try {
            console.log(`[Telebirr] Fetching official receipt: ${receiptUrl}`);
            const fetchHeaders = {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            };

            let response: Response | null = null;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                try {
                    response = await fetch(receiptUrl, {
                        signal: controller.signal,
                        headers: fetchHeaders,
                    });
                } finally {
                    clearTimeout(timeoutId);
                }
            } catch (httpsErr: any) {
                // If it's NOT a DNS error (e.g. SSL certificate mismatch), try HTTP fallback
                if (!isDnsFailure(httpsErr)) {
                    try {
                        const httpController = new AbortController();
                        const httpTimeoutId = setTimeout(() => httpController.abort(), 8000);
                        const httpUrl = `http://transactioninfo.ethiotelecom.et/receipt/${transactionNumber}`;
                        try {
                            response = await fetch(httpUrl, {
                                signal: httpController.signal,
                                headers: fetchHeaders,
                            });
                        } finally {
                            clearTimeout(httpTimeoutId);
                        }
                    } catch {
                        throw httpsErr;
                    }
                } else {
                    throw httpsErr;
                }
            }

            if (!response || !response.ok) {
                return { success: false, receiptUrl, transactionNumber, error: `Failed to fetch Telebirr receipt (Status: ${response?.status || 'Unknown'})` };
            }

            htmlText = await response.text();
        } catch (fetchErr: any) {
            console.warn('[Telebirr] Network fetch warning:', fetchErr?.message || fetchErr);
            const errString = String(fetchErr?.message || fetchErr);
            const isDns = isDnsFailure(fetchErr);
            const isTimeout = errString.includes('canceled') || errString.includes('aborted') || errString.includes('timeout');

            const ocrDetails = extractOcrReceiptDetails(fullText);

            let friendlyMessage = `Could not reach Telebirr verification server (${errString}).`;
            if (isDns) {
                friendlyMessage = 'Cannot connect to Ethio Telecom (transactioninfo.ethiotelecom.et). DNS resolution failed — verify your internet connection (works best on Ethio Telecom network without VPN/custom DNS).';
            } else if (isTimeout) {
                friendlyMessage = 'Telebirr verification request timed out. Ethio Telecom receipt server is slow or unreachable from this network.';
            }

            return {
                success: false,
                receiptUrl,
                transactionNumber,
                amount: ocrDetails.amount,
                senderName: ocrDetails.senderName,
                receiverName: ocrDetails.receiverName,
                transactionTime: ocrDetails.transactionTime,
                error: friendlyMessage,
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
