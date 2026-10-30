// lib/adapters/telebirrVerifier.ts
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';
import { parseOfficialTelebirrHtml } from '../../src/providers/telebirrOfficialScraper';
import { isValidTelebirrRef, extractTelebirrRefFromText, getOcrReferenceVariants } from './telebirrUtils';
import { triggerGlobalNoNetworkModal } from '../NetworkContext';

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

export interface TelebirrVerifyOptions {
    preExtractedRef?: string | null;
    preExtractedText?: string | null;
}

export async function verifyTelebirrReceipt(
    imageUri: string,
    options?: TelebirrVerifyOptions
): Promise<VerificationResult> {
    console.log('[TelebirrVerifier] Starting verifyTelebirrReceipt with URI:', imageUri);
    try {
        let transactionNumber: string | undefined = options?.preExtractedRef || undefined;
        let fullText: string = options?.preExtractedText || '';

        if (!transactionNumber && fullText) {
            transactionNumber = extractTelebirrRefFromText(fullText) || undefined;
        }

        if (transactionNumber && fullText) {
            console.log('[TelebirrVerifier] Reusing pre-extracted reference:', transactionNumber, 'and OCR text. Skipping duplicate image resize and OCR!');
        } else {
            // 1. Optimize image quality for low-res or blurry photos
            console.log('[TelebirrVerifier] STEP 1: Resizing image...');
            const manipulatedImage = await ImageManipulator.manipulateAsync(
                imageUri,
                [{ resize: { width: 1000 } }],
                { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
            );
            console.log('[TelebirrVerifier] Image resized, new URI:', manipulatedImage.uri);

            // 2. Scan barcode / QR code FIRST if present in the screenshot
            if (!transactionNumber) {
                console.log('[TelebirrVerifier] STEP 2: Scanning barcode/QR code...');
                try {
                    const barcodes = await BarcodeScanning.scan(manipulatedImage.uri);
                    console.log('[TelebirrVerifier] Barcodes scanned count:', barcodes ? barcodes.length : 0);
                    if (barcodes && barcodes.length > 0) {
                        for (const bc of barcodes) {
                            const rawVal = bc.value?.trim() || '';
                            if (!rawVal) continue;
                            console.log('[TelebirrVerifier] Barcode value found:', rawVal);

                            // Match Ethio Telecom receipt URL
                            const urlMatch = rawVal.match(/transactioninfo\.ethiotelecom\.et\/receipt\/([A-Za-z0-9]+)/i);
                            if (urlMatch && isValidTelebirrRef(urlMatch[1])) {
                                transactionNumber = urlMatch[1].toUpperCase();
                                console.log('[TelebirrVerifier] Matched Telebirr URL from barcode:', transactionNumber);
                                break;
                            }

                            // Match standard Telebirr 10-character reference (strictly mixed letters and digits)
                            const refMatch = rawVal.match(/\b([A-Z0-9]{10})\b/i);
                            if (refMatch && isValidTelebirrRef(refMatch[1])) {
                                transactionNumber = refMatch[1].toUpperCase();
                                console.log('[TelebirrVerifier] Matched 10-char reference from barcode:', transactionNumber);
                                break;
                            }
                        }
                    }
                } catch (barcodeErr) {
                    console.log('[TelebirrVerifier] Barcode scanning skipped or not found:', barcodeErr);
                }
            }

            // 3. Fallback to Google ML Kit OCR text recognition (also provides fallback receipt details)
            if (!transactionNumber || !fullText) {
                console.log('[TelebirrVerifier] STEP 3: Running ML Kit OCR Text Recognition...');
                try {
                    const result = await TextRecognition.recognize(manipulatedImage.uri);
                    fullText = result.text || '';
                    console.log(`[TelebirrVerifier] OCR recognized ${fullText.length} characters`);

                    if (!transactionNumber) {
                        const extracted = extractTelebirrRefFromText(fullText);
                        if (extracted) {
                            transactionNumber = extracted;
                            console.log('[TelebirrVerifier] Extracted Telebirr reference from OCR:', transactionNumber);
                        }
                    }
                } catch (ocrErr) {
                    console.error('[TelebirrVerifier] OCR recognition error:', ocrErr);
                }
            }
        }

        console.log('[TelebirrVerifier] STEP 4: Transaction reference identified =', transactionNumber || 'NONE');
        console.log('[TelebirrVerifier] STEP 4: Actual extracted OCR text:\n--- START EXTRACTED OCR TEXT ---\n' + (fullText || '(empty)') + '\n--- END EXTRACTED OCR TEXT ---');
        if (!transactionNumber) {
            console.warn('[TelebirrVerifier] No valid Telebirr reference could be extracted from barcode or OCR');
            return { success: false, error: 'Could not find Telebirr transaction number in barcode or image text.' };
        }

        // 4. Test candidate reference variants (including 0 <-> O permutations)
        const candidateRefs = getOcrReferenceVariants(transactionNumber);
        console.log('[TelebirrVerifier] STEP 4: Candidate references to test (0 <-> O variants):', candidateRefs);

        const isDnsFailure = (e: any) => {
            const s = String(e?.message || e);
            return s.includes('UnknownHostException') || s.includes('Unable to resolve host') || s.includes('No address associated');
        };

        const fetchHeaders = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        };

        let lastResult: VerificationResult = {
            success: false,
            transactionNumber,
            error: 'Could not verify official Telebirr receipt.',
        };

        for (let idx = 0; idx < candidateRefs.length; idx++) {
            const currentCandidate = candidateRefs[idx];
            const isRetry = idx > 0;
            if (isRetry) {
                console.log(`[TelebirrVerifier] Auto-retrying candidate variant #${idx + 1} (${currentCandidate}) for original ${transactionNumber}...`);
            }

            const receiptUrl = `https://transactioninfo.ethiotelecom.et/receipt/${currentCandidate}`;
            console.log(`[TelebirrVerifier] STEP 5: Fetching official Ethio Telecom receipt: ${receiptUrl}`);

            let htmlText = '';
            try {
                let response: Response | null = null;
                try {
                    const controller = new AbortController();
                    // 25s timeout accommodates high latency on Ethio Telecom mobile network
                    const timeoutId = setTimeout(() => controller.abort(), 25000);
                    try {
                        response = await fetch(receiptUrl, {
                            signal: controller.signal,
                            headers: fetchHeaders,
                        });
                    } finally {
                        clearTimeout(timeoutId);
                    }
                } catch (httpsErr: any) {
                    if (!isDnsFailure(httpsErr)) {
                        try {
                            const httpController = new AbortController();
                            // 25s fallback timeout
                            const httpTimeoutId = setTimeout(() => httpController.abort(), 25000);
                            const httpUrl = `http://transactioninfo.ethiotelecom.et/receipt/${currentCandidate}`;
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
                    lastResult = {
                        success: false,
                        receiptUrl,
                        transactionNumber: currentCandidate,
                        error: `Failed to fetch Telebirr receipt (Status: ${response?.status || 'Unknown'})`,
                    };
                    continue;
                }

                htmlText = await response.text();
            } catch (fetchErr: any) {
                console.warn('[Telebirr] Network fetch warning for candidate:', currentCandidate, fetchErr?.message || fetchErr);
                triggerGlobalNoNetworkModal();
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

                lastResult = {
                    success: false,
                    receiptUrl,
                    transactionNumber: currentCandidate,
                    amount: ocrDetails.amount,
                    senderName: ocrDetails.senderName,
                    receiverName: ocrDetails.receiverName,
                    transactionTime: ocrDetails.transactionTime,
                    error: friendlyMessage,
                };
                continue;
            }

            // 5. High-fidelity parsing with official scraper + regex fallback
            console.log(`[TelebirrVerifier] STEP 6: Parsing HTML response for ${currentCandidate} (length: ${htmlText.length})...`);
            const parsed = parseOfficialTelebirrHtml(htmlText);
            console.log('[TelebirrVerifier] Scraper parsed receipt:', parsed);

            const amountMatch = htmlText.match(/([\d,]+(?:\.\d+)?)\s*Birr/i);
            const timeMatch = htmlText.match(/(\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/);
            const payerNameMatch = htmlText.match(/Payer Name\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/i);
            const isCompleted = /Completed|Successful/i.test(htmlText);

            const hasAmount = parsed.amount !== null || !!amountMatch;
            const hasReceiptDetails = !!parsed.receiverName || !!parsed.payerName || !!parsed.paymentDate || !!parsed.reference;
            const isCompletedOrSuccess = isCompleted || (parsed.status ? /completed|successful|success/i.test(parsed.status) : false);
            const isExplicitlyFailed = parsed.status ? /fail|cancel/i.test(parsed.status) : /transaction not found|invalid transaction/i.test(htmlText);

            // A valid Telebirr verification MUST have an extracted amount and either completed status or receipt details
            const isSuccess = hasAmount && !isExplicitlyFailed && (isCompletedOrSuccess || hasReceiptDetails);

            if (isSuccess) {
                const amountStr = parsed.amount !== null
                    ? `${parsed.amount} Birr`
                    : (amountMatch ? `${amountMatch[1]} Birr` : 'N/A');

                const senderStr = parsed.payerName || (payerNameMatch ? payerNameMatch[1].trim() : 'Unknown');
                const receiverStr = parsed.receiverName || 'Unknown';
                const timeStr = parsed.paymentDate || (timeMatch ? timeMatch[1] : 'N/A');
                const statusStr = parsed.status || (isCompleted ? 'Completed (Verified)' : 'Completed');

                const finalResult: VerificationResult = {
                    success: true,
                    receiptUrl,
                    transactionNumber: parsed.reference || currentCandidate,
                    senderName: senderStr,
                    receiverName: receiverStr,
                    amount: amountStr,
                    transactionTime: timeStr,
                    status: statusStr,
                };

                if (isRetry) {
                    console.log(`[TelebirrVerifier] STEP 7: Auto-retry SUCCEEDED with 0 <-> O variant: ${currentCandidate}! (Original was ${transactionNumber})`);
                } else {
                    console.log('[TelebirrVerifier] STEP 7: Verification succeeded! Result:', finalResult);
                }
                return finalResult;
            }

            console.warn(`[TelebirrVerifier] Candidate ${currentCandidate} did not match a valid official receipt. Trying remaining variants...`);
            lastResult = {
                success: false,
                receiptUrl,
                transactionNumber: parsed.reference || currentCandidate,
                senderName: parsed.payerName || (payerNameMatch ? payerNameMatch[1].trim() : undefined),
                receiverName: parsed.receiverName || undefined,
                amount: parsed.amount !== null ? `${parsed.amount} Birr` : (amountMatch ? `${amountMatch[1]} Birr` : undefined),
                transactionTime: parsed.paymentDate || (timeMatch ? timeMatch[1] : undefined),
                status: parsed.status || (isExplicitlyFailed ? 'Failed' : 'Failed (Not Found)'),
                error: isExplicitlyFailed
                    ? 'Transaction was cancelled or failed.'
                    : 'The official receipt details could not be found or verified on the Ethio Telecom server.',
            };
        }

        console.warn('[TelebirrVerifier] All candidate reference variants were tested and none matched.');
        return lastResult;

    } catch (error) {
        console.error('[TelebirrVerifier] Fatal Verification Error:', error);
        return { success: false, error: 'Network or processing error occurred during Telebirr verification.' };
    }
}
