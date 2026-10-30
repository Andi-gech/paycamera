// app/batch-verify.tsx — High-throughput Batch Verification for Receipts & References
import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Share,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../lib/AppContext';
import { useNetwork } from '../lib/NetworkContext';
import { identifyReceiptBankAndReference } from '../lib/adapters/autoIdentifier';
import { verifyTelebirrReceipt } from '../lib/adapters/telebirrVerifier';
import { verifyCbeReceipt, getReceiptPageUrl } from '../lib/adapters/cbeVerifier';
import { isValidTelebirrRef, getOcrReferenceVariants } from '../lib/adapters/telebirrUtils';
import { parseOfficialTelebirrHtml } from '../src/providers/telebirrOfficialScraper';
import { saveVerification, getStoredReceiverAccount } from '../lib/storage';
import { BankLogo } from '../src/components/BankLogos';
import type { BankId, VerificationRecord, VerificationStatus } from '../lib/types';

interface BatchItemResult {
  id: string;
  source: 'image' | 'reference';
  previewUri?: string;
  inputReference?: string;
  bank: BankId;
  bankName: string;
  reference: string;
  amount: string | null;
  status: VerificationStatus;
  receiverName: string | null;
  senderName: string | null;
  errorMessage: string | null;
  recordId?: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function BatchVerifyScreen() {
  const router = useRouter();
  const { colors, t, isDark } = useApp();
  const { isReliable, showNoNetworkModal, checkConnection } = useNetwork();

  const [mode, setMode] = useState<'gallery' | 'text'>('gallery');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [textInput, setTextInput] = useState('');

  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentStage, setCurrentStage] = useState('');
  const [results, setResults] = useState<BatchItemResult[]>([]);
  const abortControllerRef = useRef<boolean>(false);

  // Zoomable Image Modal State
  const [zoomModalVisible, setZoomModalVisible] = useState(false);
  const [zoomImageUri, setZoomImageUri] = useState<string | null>(null);
  const [zoomImageTitle, setZoomImageTitle] = useState('');
  const [zoomImageStatus, setZoomImageStatus] = useState<VerificationStatus | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  const handleOpenZoom = (uri: string, title: string, status?: VerificationStatus) => {
    setZoomImageUri(uri);
    setZoomImageTitle(title);
    setZoomImageStatus(status || null);
    setZoomScale(1);
    setZoomModalVisible(true);
  };

  const handleCloseZoom = () => {
    setZoomModalVisible(false);
    setZoomImageUri(null);
    setZoomScale(1);
  };

  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setZoomScale((prev) => Math.max(prev - 0.5, 1));
  };

  const handleResetZoom = () => {
    setZoomScale(1);
  };

  // Extract reference tokens from bulk multiline text
  const extractTokensFromText = (raw: string): string[] => {
    if (!raw.trim()) return [];
    const tokens = raw
      .split(/[\s,;|\n\r]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 8 && t.length <= 40);
    return Array.from(new Set(tokens));
  };

  const detectedTokens = extractTokensFromText(textInput);

  // Pick multiple images from gallery
  const handleSelectImages = async () => {
    console.log('[PAGE: BatchVerify] Launching multiple image picker...');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Media library access is required to select receipt photos.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
        selectionLimit: 25,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const uris = pickerResult.assets.map((a) => a.uri).filter(Boolean);
        console.log(`[PAGE: BatchVerify] Selected ${uris.length} images from gallery`);
        setSelectedImages((prev) => Array.from(new Set([...prev, ...uris])));
      }
    } catch (err) {
      console.error('[PAGE: BatchVerify] Gallery picker error:', err);
      Alert.alert('Picker Error', 'Could not open image library.');
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setSelectedImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleClearAll = () => {
    setSelectedImages([]);
    setTextInput('');
    setResults([]);
  };

  const handleStopProcessing = () => {
    abortControllerRef.current = true;
    setCurrentStage('Aborting remaining items...');
  };

  // Helper to verify a single text reference
  const verifyReferenceToken = async (token: string): Promise<BatchItemResult> => {
    const isTelebirr = isValidTelebirrRef(token) || /^D[A-Za-z0-9]{9}/i.test(token);
    const isCbe = /^FT/i.test(token) || /^(v\d{1,2}-|fHCx)/i.test(token);

    if (isTelebirr) {
      const candidates = getOcrReferenceVariants(token);
      for (const currentToken of candidates) {
        const receiptUrl = `https://transactioninfo.ethiotelecom.et/receipt/${currentToken}`;
        const batchCtrl = new AbortController();
        const batchTimer = setTimeout(() => batchCtrl.abort(), 25000);
        try {
          const resp = await fetch(receiptUrl, {
            signal: batchCtrl.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml',
            },
          });
          clearTimeout(batchTimer);
          if (resp.ok) {
            const html = await resp.text();
            const parsed = parseOfficialTelebirrHtml(html);
            const amountMatch = html.match(/([\d,]+(?:\.\d+)?)\s*Birr/i);
            const isCompleted = /Completed|Successful/i.test(html) || (parsed.status ? /completed|successful/i.test(parsed.status) : false);
            const isExplicitlyFailed = parsed.status ? /fail|cancel/i.test(parsed.status) : /transaction not found|invalid transaction/i.test(html);

            const hasAmount = parsed.amount !== null || !!amountMatch;
            const hasReceiptDetails = !!parsed.receiverName || !!parsed.payerName || !!parsed.paymentDate || !!parsed.reference;
            const isSuccess = hasAmount && !isExplicitlyFailed && (isCompleted || hasReceiptDetails);

            if (isSuccess) {
              const amountStr = parsed.amount !== null ? `${parsed.amount} ETB` : (amountMatch ? `${amountMatch[1]} ETB` : null);
              const record = await saveVerification({
                bank: 'telebirr',
                bankName: 'Telebirr',
                reference: parsed.reference || currentToken,
                amount: amountStr,
                currency: 'ETB',
                status: 'verified',
                senderName: parsed.payerName || null,
                receiverName: parsed.receiverName || null,
                receiverAccount: null,
                transactionTime: parsed.paymentDate || null,
                receiptUrl,
                errorMessage: null,
                isLegacy: false,
              });

              return {
                id: token,
                source: 'reference',
                inputReference: token,
                bank: 'telebirr',
                bankName: 'Telebirr',
                reference: parsed.reference || currentToken,
                amount: amountStr,
                status: 'verified',
                receiverName: parsed.receiverName || null,
                senderName: parsed.payerName || null,
                errorMessage: null,
                recordId: record.id,
              };
            }
          }
        } catch (err) {
          console.warn(`[BatchVerify] Network error verifying Telebirr token ${currentToken}:`, err);
        }
      }

      const failedRecord = await saveVerification({
        bank: 'telebirr',
        bankName: 'Telebirr',
        reference: token,
        amount: null,
        currency: 'ETB',
        status: 'failed',
        senderName: null,
        receiverName: null,
        receiverAccount: null,
        transactionTime: null,
        receiptUrl: `https://transactioninfo.ethiotelecom.et/receipt/${token}`,
        errorMessage: 'Telebirr server did not return a valid receipt for this reference.',
        isLegacy: false,
      });

      return {
        id: token,
        source: 'reference',
        inputReference: token,
        bank: 'telebirr',
        bankName: 'Telebirr',
        reference: token,
        amount: null,
        status: 'failed',
        receiverName: null,
        senderName: null,
        errorMessage: 'Receipt not found on official server.',
        recordId: failedRecord.id,
      };
    }

    if (isCbe) {
      let cleanRef = token;
      const urlMatch = token.match(/mbreciept\.cbe\.com\.et\/([^\s?#]+)/i);
      if (urlMatch) cleanRef = urlMatch[1];

      const apiUrl = `https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/${cleanRef}`;
      const cbeBatchCtrl = new AbortController();
      const cbeBatchTimer = setTimeout(() => cbeBatchCtrl.abort(), 25000);
      try {
        const resp = await fetch(apiUrl, {
          signal: cbeBatchCtrl.signal,
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'X-App-ID': 'd1292e42-7400-49de-a2d3-9731caa4c819',
            'X-App-Version': '0a01980b-9859-1369-8198-59f403820000',
            'Origin': 'https://mbreciept.cbe.com.et',
            'Referer': 'https://mbreciept.cbe.com.et/',
          },
        });
        clearTimeout(cbeBatchTimer);

        if (resp.ok) {
          const json = await resp.json();
          const amountStr = json.amountCredited ? `${json.amountCredited} ETB` : null;
          const record = await saveVerification({
            bank: 'cbe',
            bankName: 'CBE',
            reference: json.id || cleanRef,
            amount: amountStr,
            currency: 'ETB',
            status: 'verified',
            senderName: json.debitAccountHolder || null,
            receiverName: json.creditAccountHolder || null,
            receiverAccount: json.creditAccountNo || null,
            transactionTime: json.dateTimes?.[0] || null,
            receiptUrl: json.encodedReceipt || getReceiptPageUrl(cleanRef),
            errorMessage: null,
            isLegacy: false,
          });

          return {
            id: token,
            source: 'reference',
            inputReference: token,
            bank: 'cbe',
            bankName: 'CBE',
            reference: json.id || cleanRef,
            amount: amountStr,
            status: 'verified',
            receiverName: json.creditAccountHolder || null,
            senderName: json.debitAccountHolder || null,
            errorMessage: null,
            recordId: record.id,
          };
        }
      } catch (err) {
        console.warn(`[BatchVerify] Network error verifying CBE token ${token}:`, err);
      }

      const failedRecord = await saveVerification({
        bank: 'cbe',
        bankName: 'CBE',
        reference: cleanRef,
        amount: null,
        currency: 'ETB',
        status: 'failed',
        senderName: null,
        receiverName: null,
        receiverAccount: null,
        transactionTime: null,
        receiptUrl: null,
        errorMessage: 'CBE official API did not confirm this reference.',
        isLegacy: false,
      });

      return {
        id: token,
        source: 'reference',
        inputReference: token,
        bank: 'cbe',
        bankName: 'CBE',
        reference: cleanRef,
        amount: null,
        status: 'failed',
        receiverName: null,
        senderName: null,
        errorMessage: 'Receipt record not found in bank portal.',
        recordId: failedRecord.id,
      };
    }

    // Default unknown
    return {
      id: token,
      source: 'reference',
      inputReference: token,
      bank: 'telebirr',
      bankName: 'Unknown',
      reference: token,
      amount: null,
      status: 'failed',
      receiverName: null,
      senderName: null,
      errorMessage: 'Unrecognized reference format (not Telebirr or CBE).',
    };
  };

  // Helper to verify a single image
  const verifyImageItem = async (uri: string, index: number): Promise<BatchItemResult> => {
    console.log(`[PAGE: BatchVerify] Processing image #${index + 1}: ${uri}`);
    const detection = await identifyReceiptBankAndReference(uri);
    const effectiveBank: BankId = detection.detectedBank || 'telebirr';

    if (effectiveBank === 'telebirr') {
      const data = await verifyTelebirrReceipt(uri, {
        preExtractedRef: detection.extractedReference,
        preExtractedText: detection.rawText,
      });

      const status: VerificationStatus = data.success ? 'verified' : 'failed';
      const record = await saveVerification({
        bank: 'telebirr',
        bankName: 'Telebirr',
        reference: data.transactionNumber || detection.extractedReference || `Item #${index + 1}`,
        amount: data.amount || null,
        currency: 'ETB',
        status,
        senderName: data.senderName || null,
        receiverName: data.receiverName || null,
        receiverAccount: null,
        transactionTime: data.transactionTime || null,
        receiptUrl: data.receiptUrl || null,
        errorMessage: data.error || null,
        isLegacy: false,
      });

      return {
        id: `img-${index}-${Date.now()}`,
        source: 'image',
        previewUri: uri,
        bank: 'telebirr',
        bankName: 'Telebirr',
        reference: data.transactionNumber || detection.extractedReference || 'Unknown',
        amount: data.amount || null,
        status,
        receiverName: data.receiverName || null,
        senderName: data.senderName || null,
        errorMessage: data.error || null,
        recordId: record.id,
      };
    }

    // CBE flow
    const savedAccount = await getStoredReceiverAccount();
    const data = await verifyCbeReceipt(
      uri,
      savedAccount || undefined,
      detection.extractedReference,
      detection.rawText
    );

    const status: VerificationStatus = data.success ? 'verified' : 'failed';
    const record = await saveVerification({
      bank: 'cbe',
      bankName: 'CBE',
      reference: data.transactionNumber || detection.extractedReference || `Item #${index + 1}`,
      amount: data.amount || null,
      currency: 'ETB',
      status,
      senderName: data.senderName || null,
      receiverName: data.receiverName || null,
      receiverAccount: null,
      transactionTime: data.transactionTime || null,
      receiptUrl: data.receiptUrl || null,
      errorMessage: data.error || null,
      isLegacy: data.isLegacy || false,
    });

    return {
      id: `img-${index}-${Date.now()}`,
      source: 'image',
      previewUri: uri,
      bank: 'cbe',
      bankName: 'CBE',
      reference: data.transactionNumber || detection.extractedReference || 'Unknown',
      amount: data.amount || null,
      status,
      receiverName: data.receiverName || null,
      senderName: data.senderName || null,
      errorMessage: data.error || null,
      recordId: record.id,
    };
  };

  // Main Batch Runner
  const handleStartBatch = async () => {
    const totalItems = mode === 'gallery' ? selectedImages.length : detectedTokens.length;
    if (totalItems === 0) {
      Alert.alert('No Items', mode === 'gallery' ? 'Please select at least one receipt image.' : 'Please enter at least one transaction reference.');
      return;
    }

    if (!isReliable) {
      const isOnline = await checkConnection();
      if (!isOnline) {
        showNoNetworkModal();
        return;
      }
    }

    console.log(`[PAGE: BatchVerify] Starting batch verification of ${totalItems} items in ${mode} mode...`);
    setProcessing(true);
    abortControllerRef.current = false;
    setResults([]);
    setCurrentIndex(0);

    const batchResults: BatchItemResult[] = [];

    try {
      if (mode === 'gallery') {
        for (let i = 0; i < selectedImages.length; i++) {
          if (abortControllerRef.current) break;
          setCurrentIndex(i + 1);
          setCurrentStage(`Analyzing & verifying image ${i + 1} of ${selectedImages.length}...`);
          try {
            const res = await verifyImageItem(selectedImages[i], i);
            batchResults.push(res);
            setResults([...batchResults]);
          } catch (itemErr) {
            console.error(`[PAGE: BatchVerify] Error on image #${i + 1}:`, itemErr);
            const fallback: BatchItemResult = {
              id: `img-${i}-${Date.now()}`,
              source: 'image',
              previewUri: selectedImages[i],
              bank: 'telebirr',
              bankName: 'Telebirr',
              reference: `Receipt #${i + 1}`,
              amount: null,
              status: 'failed',
              receiverName: null,
              senderName: null,
              errorMessage: 'Failed to process image.',
            };
            batchResults.push(fallback);
            setResults([...batchResults]);
          }
        }
      } else {
        // Mode === 'text'
        for (let i = 0; i < detectedTokens.length; i++) {
          if (abortControllerRef.current) break;
          setCurrentIndex(i + 1);
          setCurrentStage(`Verifying reference ${i + 1} of ${detectedTokens.length} (${detectedTokens[i]})...`);
          try {
            const res = await verifyReferenceToken(detectedTokens[i]);
            batchResults.push(res);
            setResults([...batchResults]);
          } catch (itemErr) {
            console.error(`[PAGE: BatchVerify] Error on token ${detectedTokens[i]}:`, itemErr);
            const fallback: BatchItemResult = {
              id: detectedTokens[i],
              source: 'reference',
              inputReference: detectedTokens[i],
              bank: 'telebirr',
              bankName: 'Telebirr',
              reference: detectedTokens[i],
              amount: null,
              status: 'failed',
              receiverName: null,
              senderName: null,
              errorMessage: 'Error during network check.',
            };
            batchResults.push(fallback);
            setResults([...batchResults]);
          }
        }
      }
    } finally {
      setProcessing(false);
      setCurrentStage('');
      console.log(`[PAGE: BatchVerify] Batch finished. Total processed: ${batchResults.length}`);
    }
  };

  // Export Summary to Share
  const handleShareSummary = async () => {
    const verifiedCount = results.filter((r) => r.status === 'verified').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    let totalAmount = 0;
    results.forEach((r) => {
      if (r.status === 'verified' && r.amount) {
        const num = parseFloat(r.amount.replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) totalAmount += num;
      }
    });

    const lines = [
      `📊 Cheki Batch Verification Report`,
      `Verified: ${verifiedCount} / ${results.length}`,
      `Total Verified Amount: ${totalAmount.toLocaleString()} ETB`,
      `----------------------------------------`,
      ...results.map((r, i) => {
        const mark = r.status === 'verified' ? '✅' : '❌';
        return `${i + 1}. ${mark} ${r.bankName}: ${r.reference} — ${r.amount || 'Failed'}`;
      }),
      `----------------------------------------`,
      `Verified via Cheki Mobile`,
    ];

    try {
      await Share.share({ message: lines.join('\n') });
    } catch (err) {
      console.error('[PAGE: BatchVerify] Share error:', err);
    }
  };

  const totalInputCount = mode === 'gallery' ? selectedImages.length : detectedTokens.length;
  const verifiedCount = results.filter((r) => r.status === 'verified').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  let totalVerifiedETB = 0;
  results.forEach((r) => {
    if (r.status === 'verified' && r.amount) {
      const num = parseFloat(r.amount.replace(/[^0-9.]/g, ''));
      if (!isNaN(num)) totalVerifiedETB += num;
    }
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top Navbar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Batch Verification</Text>
        {results.length > 0 ? (
          <TouchableOpacity onPress={handleShareSummary} activeOpacity={0.7} style={styles.shareBtn}>
            <Ionicons name="share-social-outline" size={22} color={colors.primaryBlue} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Mode Selector Tabs */}
        <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <TouchableOpacity
            style={[
              styles.tabItem,
              mode === 'gallery' && [styles.activeTab, { backgroundColor: colors.primaryBlue }],
            ]}
            onPress={() => !processing && setMode('gallery')}
            activeOpacity={0.8}
            disabled={processing}
          >
            <Ionicons
              name="images-outline"
              size={18}
              color={mode === 'gallery' ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                { color: mode === 'gallery' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              Screenshots
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabItem,
              mode === 'text' && [styles.activeTab, { backgroundColor: colors.primaryBlue }],
            ]}
            onPress={() => !processing && setMode('text')}
            activeOpacity={0.8}
            disabled={processing}
          >
            <Ionicons
              name="document-text-outline"
              size={18}
              color={mode === 'text' ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                { color: mode === 'text' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              Bulk References
            </Text>
          </TouchableOpacity>
        </View>

        {/* Input Configuration Card */}
        {results.length === 0 && (
          <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            {mode === 'gallery' ? (
              <View>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                      Receipt Screenshots
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                      Pick multiple receipt images from your photo library
                    </Text>
                  </View>
                  {selectedImages.length > 0 && (
                    <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
                      <Text style={[styles.clearBtnText, { color: colors.error }]}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Selected Images Grid */}
                {selectedImages.length > 0 ? (
                  <View style={styles.thumbnailGrid}>
                    {selectedImages.map((uri, idx) => (
                      <View key={idx} style={styles.thumbnailWrap}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => handleOpenZoom(uri, `Screenshot #${idx + 1}`)}
                        >
                          <Image source={{ uri }} style={styles.thumbnailImage} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.thumbnailRemoveBtn}
                          onPress={() => handleRemoveImage(idx)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="close" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                        <View style={styles.thumbnailBadge}>
                          <Text style={styles.thumbnailBadgeText}>#{idx + 1}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.emptyPickerBox, { borderColor: colors.primaryBlue + '60' }]}
                    onPress={handleSelectImages}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.pickerIconWrap, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="images" size={32} color={colors.primaryBlue} />
                    </View>
                    <Text style={[styles.pickerBoxTitle, { color: colors.textPrimary }]}>
                      Select Multiple Receipts
                    </Text>
                    <Text style={[styles.pickerBoxSub, { color: colors.textTertiary }]}>
                      Tap here to choose up to 25 screenshots
                    </Text>
                  </TouchableOpacity>
                )}

                {selectedImages.length > 0 && (
                  <TouchableOpacity
                    style={[styles.addMoreBtn, { borderColor: colors.primaryBlue }]}
                    onPress={handleSelectImages}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add" size={18} color={colors.primaryBlue} />
                    <Text style={[styles.addMoreBtnText, { color: colors.primaryBlue }]}>
                      Add More Screenshots ({selectedImages.length} selected)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                      Bulk Reference Numbers
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                      Paste references separated by line, comma, or spaces
                    </Text>
                  </View>
                  {textInput.length > 0 && (
                    <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
                      <Text style={[styles.clearBtnText, { color: colors.error }]}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput
                  style={[
                    styles.bulkTextInput,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.surfaceBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  multiline
                  numberOfLines={6}
                  value={textInput}
                  onChangeText={setTextInput}
                  placeholder={`e.g.\nDJU1GOXQQV\nDJR1DSXKZH\nFT241030999\nv2-a8f4c2...`}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />

                <View style={styles.tokenCountRow}>
                  <Ionicons name="checkmark-done" size={16} color={colors.primaryBlue} />
                  <Text style={[styles.tokenCountText, { color: colors.textSecondary }]}>
                    {detectedTokens.length} valid reference tokens detected
                  </Text>
                </View>
              </View>
            )}

            {/* Launch CTA Button */}
            <TouchableOpacity
              style={[
                styles.startBatchBtn,
                { backgroundColor: colors.primaryBlue },
                totalInputCount === 0 && styles.disabledBtn,
              ]}
              onPress={handleStartBatch}
              disabled={totalInputCount === 0 || processing}
              activeOpacity={0.88}
            >
              <Ionicons name="flash" size={18} color="#FFFFFF" />
              <Text style={styles.startBatchBtnText}>
                Verify Batch ({totalInputCount} items)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Processing Progress Indicator */}
        {processing && (
          <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <View style={styles.progressHeaderRow}>
              <View style={styles.progressLabelWrap}>
                <ActivityIndicator size="small" color={colors.primaryBlue} />
                <Text style={[styles.progressTitle, { color: colors.textPrimary }]}>
                  Processing {currentIndex} of {totalInputCount}...
                </Text>
              </View>
              <TouchableOpacity onPress={handleStopProcessing} activeOpacity={0.7}>
                <Text style={[styles.stopBtnText, { color: colors.error }]}>Stop</Text>
              </TouchableOpacity>
            </View>

            {/* Progress Bar Track */}
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primaryBlue,
                    width: `${Math.min(100, (currentIndex / (totalInputCount || 1)) * 100)}%`,
                  },
                ]}
              />
            </View>

            <Text style={[styles.progressStageSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {currentStage}
            </Text>
          </View>
        )}

        {/* Results Summary Box */}
        {results.length > 0 && (
          <View style={styles.summarySection}>
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
                <Text style={[styles.statNum, { color: colors.textPrimary }]}>{results.length}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
              </View>

              <View style={[styles.statBox, { backgroundColor: colors.successSurface, borderColor: '#10B98144' }]}>
                <Text style={[styles.statNum, { color: '#10B981' }]}>{verifiedCount}</Text>
                <Text style={[styles.statLabel, { color: '#10B981' }]}>Verified</Text>
              </View>

              <View style={[styles.statBox, { backgroundColor: colors.errorSurface, borderColor: '#EF444444' }]}>
                <Text style={[styles.statNum, { color: colors.error }]}>{failedCount}</Text>
                <Text style={[styles.statLabel, { color: colors.error }]}>Failed</Text>
              </View>

              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, flex: 1.4 }]}>
                <Text style={[styles.statNum, { color: colors.primaryBlue }]} numberOfLines={1}>
                  {totalVerifiedETB > 0 ? `${totalVerifiedETB.toLocaleString()}` : '0.00'}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total ETB</Text>
              </View>
            </View>

            {/* Realtime Results List */}
            <Text style={[styles.listHeaderTitle, { color: colors.textPrimary }]}>Verification Items</Text>

            {results.map((item, idx) => {
              const isItemVerified = item.status === 'verified';
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.resultCard,
                    { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                  ]}
                  onPress={() => {
                    if (item.recordId) {
                      router.push({
                        pathname: '/receipt-details',
                        params: { recordId: item.recordId },
                      });
                    }
                  }}
                  activeOpacity={0.75}
                >
                  {/* Actual Image Thumbnail beside verification result (Zoomable by click) */}
                  {item.previewUri ? (
                    <TouchableOpacity
                      style={[styles.resultThumbnailWrap, { borderColor: colors.surfaceBorder }]}
                      onPress={() => {
                        handleOpenZoom(item.previewUri!, item.reference || `Receipt #${idx + 1}`, item.status);
                      }}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: item.previewUri }} style={styles.resultThumbnailImage} resizeMode="cover" />
                      <View style={styles.thumbnailZoomBadge}>
                        <Ionicons name="search" size={9} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <BankLogo bankId={item.bank} size={36} />
                  )}

                  <View style={styles.resultMetaColumn}>
                    <View style={styles.resultTitleRow}>
                      <View style={styles.resultTitleLeft}>
                        {item.previewUri ? (
                          <BankLogo bankId={item.bank} size={18} />
                        ) : null}
                        <Text style={[styles.resultRefText, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.reference}
                        </Text>
                      </View>
                      {item.amount && (
                        <Text style={[styles.resultAmountText, { color: colors.textPrimary }]}>
                          {item.amount}
                        </Text>
                      )}
                    </View>

                    <Text style={[styles.resultSubText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.receiverName || item.senderName || item.bankName}
                      {item.errorMessage ? ` • ${item.errorMessage}` : ''}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: isItemVerified ? colors.successSurface : colors.errorSurface },
                    ]}
                  >
                    <Ionicons
                      name={isItemVerified ? 'checkmark-circle' : 'alert-circle'}
                      size={14}
                      color={isItemVerified ? '#10B981' : colors.error}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: isItemVerified ? '#10B981' : colors.error },
                      ]}
                    >
                      {isItemVerified ? 'Verified' : 'Failed'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Post-Batch Action Buttons */}
            {!processing && (
              <View style={styles.resultsActionRow}>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.primaryBlue, backgroundColor: colors.surface }]}
                  onPress={handleClearAll}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={18} color={colors.primaryBlue} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.primaryBlue }]}>
                    New Batch
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: colors.primaryBlue }]}
                  onPress={handleShareSummary}
                  activeOpacity={0.88}
                >
                  <Ionicons name="share-social" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>Share Report</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Zoomable Image Modal */}
      <Modal
        visible={zoomModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseZoom}
      >
        <SafeAreaView style={styles.modalBackdrop} edges={['top', 'bottom']}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {zoomImageTitle || 'Receipt Image'}
              </Text>
              {zoomImageStatus && (
                <View
                  style={[
                    styles.modalStatusPill,
                    {
                      backgroundColor:
                        zoomImageStatus === 'verified' ? '#10B98122' : '#EF444422',
                    },
                  ]}
                >
                  <Ionicons
                    name={zoomImageStatus === 'verified' ? 'checkmark-circle' : 'alert-circle'}
                    size={13}
                    color={zoomImageStatus === 'verified' ? '#10B981' : '#EF4444'}
                  />
                  <Text
                    style={[
                      styles.modalStatusText,
                      {
                        color: zoomImageStatus === 'verified' ? '#10B981' : '#EF4444',
                      },
                    ]}
                  >
                    {zoomImageStatus === 'verified' ? 'Verified' : 'Failed'}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={handleCloseZoom}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Interactive Zoomable View */}
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            maximumZoomScale={5}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent={true}
          >
            {zoomImageUri && (
              <Image
                source={{ uri: zoomImageUri }}
                style={[
                  styles.modalZoomImage,
                  {
                    transform: [{ scale: zoomScale }],
                  },
                ]}
                resizeMode="contain"
              />
            )}
          </ScrollView>

          {/* Floating Zoom Controls Bar */}
          <View style={styles.zoomControlBar}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={handleZoomOut}
              disabled={zoomScale <= 1}
              activeOpacity={0.7}
            >
              <Ionicons
                name="remove"
                size={22}
                color={zoomScale <= 1 ? '#666666' : '#FFFFFF'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.zoomResetBtn}
              onPress={handleResetZoom}
              activeOpacity={0.7}
            >
              <Text style={styles.zoomResetText}>{Math.round(zoomScale * 100)}% (Reset)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={handleZoomIn}
              disabled={zoomScale >= 4}
              activeOpacity={0.7}
            >
              <Ionicons
                name="add"
                size={22}
                color={zoomScale >= 4 ? '#666666' : '#FFFFFF'}
              />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 6,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  shareBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 36,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeTab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '600',
    padding: 4,
  },
  emptyPickerBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pickerIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pickerBoxTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  pickerBoxSub: {
    fontSize: 12,
    marginTop: 4,
  },
  thumbnailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  thumbnailWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailRemoveBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  thumbnailBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 14,
  },
  addMoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bulkTextInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  tokenCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  tokenCountText: {
    fontSize: 12,
    fontWeight: '500',
  },
  startBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  startBatchBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  progressCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  stopBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressStageSub: {
    fontSize: 12,
  },
  summarySection: {
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 16,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  listHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  resultThumbnailWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
  },
  resultThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailZoomBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 9,
    width: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  resultMetaColumn: {
    flex: 1,
  },
  resultTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultRefText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultAmountText: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  resultsActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryActionBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  modalTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 12,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  modalStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  modalStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 20,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  modalZoomImage: {
    width: SCREEN_WIDTH - 20,
    height: SCREEN_HEIGHT * 0.72,
  },
  zoomControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(20, 20, 20, 0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomResetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  zoomResetText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
