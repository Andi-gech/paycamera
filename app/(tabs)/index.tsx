// app/(tabs)/index.tsx — Impeccable verification interface with micro-interactions
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../lib/AppContext';
import { useNetwork } from '../../lib/NetworkContext';
import { saveVerification, getStoredReceiverAccount, setStoredReceiverAccount } from '../../lib/storage';
import { BANK_OPTIONS, type BankId } from '../../lib/types';
import { BankLogo } from '../../src/components/BankLogos';
import { AdPlaceholder } from '../../src/components/AdPlaceholder';

const BANNER_IMAGE = require('../../assets/banner.webp');
const APP_LOGO = require('../../assets/LikPay_Fast_Payment_Logo-removebg-preview.webp');

export default function HomeScreen() {
  const router = useRouter();
  const { colors, t, isDark } = useApp();
  const { isReliable, showNoNetworkModal, checkConnection } = useNetwork();
  const [selectedBank, setSelectedBank] = useState<BankId | null>(null);
  const [reference, setReference] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  // Receiver digits prompt state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [inputDigits, setInputDigits] = useState('');
  const [rememberAccount, setRememberAccount] = useState(true);
  const [savedReceiverAccount, setSavedReceiverAccount] = useState('');

  useEffect(() => {
    console.log('[PAGE: Tabs/Home (app/(tabs)/index.tsx)] Mounted');
    getStoredReceiverAccount().then((acc) => {
      if (acc) {
        console.log('[PAGE: Tabs/Home] Loaded saved receiver account:', acc);
        setSavedReceiverAccount(acc);
      }
    });
  }, []);

  const handleVerify = async () => {
    const trimmedRef = reference.trim();
    if (!trimmedRef || !selectedBank) return;

    if (!isReliable) {
      const isOnline = await checkConnection();
      if (!isOnline) {
        showNoNetworkModal();
        return;
      }
    }

    console.log('[PAGE: Tabs/Home] Starting manual verification for bank:', selectedBank, 'ref:', trimmedRef);
    setLoading(true);

    try {
      if (selectedBank === 'telebirr') {
        const { getOcrReferenceVariants } = await import('../../lib/adapters/telebirrUtils');
        const candidateRefs = getOcrReferenceVariants(trimmedRef);
        console.log('[PAGE: Tabs/Home] [Telebirr] Testing candidate references (0 <-> O variants):', candidateRefs);

        const { parseOfficialTelebirrHtml } = await import('../../src/providers/telebirrOfficialScraper');

        let verifiedRecord: any = null;
        let lastFailedRecord: any = null;

        for (let i = 0; i < candidateRefs.length; i++) {
          const currentRef = candidateRefs[i];
          const isRetry = i > 0;
          if (isRetry) {
            console.log(`[PAGE: Tabs/Home] [Telebirr] Auto-retrying candidate variant #${i + 1}: ${currentRef}`);
          }
          const receiptUrl = `https://transactioninfo.ethiotelecom.et/receipt/${currentRef}`;
          let htmlText = '';
          const ethioCtrl = new AbortController();
          const ethioTimer = setTimeout(() => ethioCtrl.abort(), 25000);
          try {
            const response = await fetch(receiptUrl, {
              signal: ethioCtrl.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
              },
            });
            clearTimeout(ethioTimer);
            if (!response.ok) {
              lastFailedRecord = {
                bank: 'telebirr',
                bankName: 'Telebirr',
                reference: currentRef,
                amount: null,
                currency: 'ETB',
                status: 'failed',
                senderName: null,
                receiverName: null,
                receiverAccount: null,
                transactionTime: null,
                receiptUrl,
                errorMessage: `Could not reach Telebirr server (HTTP ${response.status})`,
                isLegacy: false,
              };
              continue;
            }
            htmlText = await response.text();
          } catch (fetchErr) {
            console.warn('[PAGE: Tabs/Home] [Telebirr] Network error connecting to Telebirr:', fetchErr);
            if (!isReliable) {
              showNoNetworkModal();
            }
            lastFailedRecord = {
              bank: 'telebirr',
              bankName: 'Telebirr',
              reference: currentRef,
              amount: null,
              currency: 'ETB',
              status: 'failed',
              senderName: null,
              receiverName: null,
              receiverAccount: null,
              transactionTime: null,
              receiptUrl,
              errorMessage: 'Could not connect to Telebirr server. Requires Ethiopian IP network.',
              isLegacy: false,
            };
            continue;
          }

          const parsed = parseOfficialTelebirrHtml(htmlText);
          const amountMatch = htmlText.match(/([\d,]+(?:\.\d+)?)\s*Birr/i);
          const timeMatch = htmlText.match(/(\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/);
          const isCompleted = /Completed|Successful/i.test(htmlText) || (parsed.status ? /completed|successful/i.test(parsed.status) : false);
          const isExplicitlyFailed = parsed.status ? /fail|cancel/i.test(parsed.status) : /transaction not found|invalid transaction/i.test(htmlText);

          const hasAmount = parsed.amount !== null || !!amountMatch;
          const hasReceiptDetails = !!parsed.receiverName || !!parsed.payerName || !!parsed.paymentDate || !!parsed.reference;
          const isSuccess = hasAmount && !isExplicitlyFailed && (isCompleted || hasReceiptDetails);

          const amountStr = parsed.amount !== null ? `${parsed.amount} ETB` : (amountMatch ? `${amountMatch[1]} ETB` : null);

          if (isSuccess) {
            verifiedRecord = {
              bank: 'telebirr',
              bankName: 'Telebirr',
              reference: parsed.reference || currentRef,
              amount: amountStr,
              currency: 'ETB',
              status: 'verified',
              senderName: parsed.payerName || null,
              receiverName: parsed.receiverName || null,
              receiverAccount: null,
              transactionTime: parsed.paymentDate || (timeMatch ? timeMatch[1] : null),
              receiptUrl,
              errorMessage: null,
              isLegacy: false,
            };
            if (isRetry) {
              console.log(`[PAGE: Tabs/Home] [Telebirr] SUCCEEDED with 0 <-> O variant: ${currentRef}!`);
            }
            break;
          } else {
            lastFailedRecord = {
              bank: 'telebirr',
              bankName: 'Telebirr',
              reference: parsed.reference || currentRef,
              amount: amountStr,
              currency: 'ETB',
              status: 'failed',
              senderName: parsed.payerName || null,
              receiverName: parsed.receiverName || null,
              receiverAccount: null,
              transactionTime: parsed.paymentDate || (timeMatch ? timeMatch[1] : null),
              receiptUrl,
              errorMessage: 'Could not find or verify official Telebirr receipt details.',
              isLegacy: false,
            };
          }
        }

        const toSave = verifiedRecord || lastFailedRecord;
        const record = await saveVerification(toSave);
        console.log('[PAGE: Tabs/Home] [Telebirr] Saved record id:', record.id, 'status:', record.status, '-> Navigating to /verify-result');
        router.push({ pathname: '/verify-result', params: { recordId: record.id } });
        return;
      }

      // CBE verification
      await executeCbeVerification(trimmedRef, savedReceiverAccount || undefined);
    } finally {
      setLoading(false);
    }
  };

  const executeCbeVerification = async (trimmedRef: string, accountDigits?: string) => {
    console.log('[PAGE: Tabs/Home] [CBE] Starting CBE verification for ref:', trimmedRef, 'with account digits:', accountDigits);
    const { verifyCbeTransaction } = await import('../../lib/adapters/cbeVerifier');

    try {
      const result = await verifyCbeTransaction(trimmedRef, accountDigits);
      console.log('[PAGE: Tabs/Home] [CBE] Result:', result);

      if (result.needsReceiverAccount) {
        console.log('[PAGE: Tabs/Home] [CBE] FT ref requires receiver account prompt modal');
        setInputDigits(accountDigits || savedReceiverAccount);
        setShowAccountModal(true);
        return;
      }

      const record = await saveVerification({
        bank: 'cbe',
        bankName: 'CBE',
        reference: result.transactionNumber || trimmedRef,
        amount: result.amount || null,
        currency: 'ETB',
        status: result.success ? 'verified' : 'failed',
        senderName: result.senderName || null,
        receiverName: result.receiverName || null,
        receiverAccount: accountDigits ? accountDigits.slice(-8) : null,
        transactionTime: result.transactionTime || null,
        receiptUrl: result.receiptUrl || null,
        errorMessage: result.error || null,
        isLegacy: result.isLegacy || false,
      });

      console.log('[PAGE: Tabs/Home] [CBE] Saved record id:', record.id, '-> Navigating to /verify-result');
      router.push({ pathname: '/verify-result', params: { recordId: record.id } });
    } catch (cbeErr) {
      console.warn('[PAGE: Tabs/Home] [CBE] Error during CBE verification:', cbeErr);
      if (!isReliable) {
        showNoNetworkModal();
      }
      const record = await saveVerification({
        bank: 'cbe',
        bankName: 'CBE',
        reference: trimmedRef,
        amount: null,
        currency: 'ETB',
        status: 'failed',
        senderName: null,
        receiverName: null,
        receiverAccount: null,
        transactionTime: null,
        receiptUrl: null,
        errorMessage: 'Could not connect to CBE banking API.',
        isLegacy: false,
      });
      router.push({ pathname: '/verify-result', params: { recordId: record.id } });
    }
  };

  const handleAccountSubmit = async () => {
    const raw = inputDigits.replace(/\D/g, '');
    if (raw.length < 8) return;
    const eight = raw.slice(-8);

    if (rememberAccount) {
      setSavedReceiverAccount(eight);
      await setStoredReceiverAccount(eight);
    }
    setShowAccountModal(false);

    // Immediately start verification with the newly entered 8 digits!
    setLoading(true);
    try {
      await executeCbeVerification(reference.trim(), eight);
    } finally {
      setLoading(false);
    }
  };

  const goToScan = () => {
    console.log('[PAGE: Tabs/Home] goToScan clicked -> Navigating to /scan-upload with bank:', selectedBank);
    router.push({ pathname: '/scan-upload', params: selectedBank ? { bank: selectedBank } : undefined });
  };

  const goToBatch = () => {
    console.log('[PAGE: Tabs/Home] goToBatch clicked -> Navigating to /batch-verify');
    router.push({ pathname: '/batch-verify' });
  };

  const rawClean = inputDigits.replace(/\D/g, '');
  const isValidDigits = rawClean.length >= 8;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.ground }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.brandGroup}>
              <View style={[styles.headerLogoWrap, isDark && styles.headerLogoDarkBg]}>
                <Image
                  source={APP_LOGO}
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.scannerHeaderBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={goToScan}
              activeOpacity={0.7}
            >
              <Ionicons name="camera-outline" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>

          {/* Offline Notice Banner if network is disconnected or unreachable */}
          {!isReliable && (
            <TouchableOpacity
              style={[
                styles.offlineNotice,
                {
                  backgroundColor: isDark ? '#2D1515' : '#FEF2F2',
                  borderColor: isDark ? '#7F1D1D' : '#FECDD3',
                },
              ]}
              onPress={showNoNetworkModal}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-offline" size={15} color="#DC2626" style={{ marginRight: 8 }} />
              <Text style={[styles.offlineNoticeText, { color: '#DC2626' }]} numberOfLines={1}>
                {t.noNetworkTitle} — Tap to test connection
              </Text>
            </TouchableOpacity>
          )}

          {/* Official Verification Feature Banner */}
          <View style={[styles.bannerCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Image
              source={BANNER_IMAGE}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          </View>

          {/* Bank Provider Selection Grid */}
          <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>SELECT PAYMENT RAIL</Text>
          <View style={styles.bankList}>
            {BANK_OPTIONS.map((b) => {
              const active = selectedBank === b.id;
              const isSupported = (b.id === 'cbe' || b.id === 'telebirr') && !b.disabled;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.bankRow,
                    {
                      backgroundColor: active ? colors.accentSubtle : colors.surface,
                      borderColor: active ? colors.accent : colors.border,
                    },
                    !isSupported && styles.bankRowDisabled,
                  ]}
                  onPress={() => isSupported && setSelectedBank(b.id)}
                  disabled={!isSupported}
                  activeOpacity={0.75}
                >
                  <View style={!isSupported && styles.bankLogoDisabled}>
                    <BankLogo bankId={b.id} size={36} />
                  </View>
                  <View style={styles.bankMeta}>
                    <View style={styles.bankNameRow}>
                      <Text style={[styles.bankName, { color: isSupported ? colors.ink : colors.inkFaint }]}>
                        {b.name}
                      </Text>
                      {!isSupported && (
                        <View
                          style={[
                            styles.soonBadge,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            },
                          ]}
                        >
                          <Text style={[styles.soonBadgeText, { color: colors.inkFaint }]}>Coming Soon</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.bankType, { color: colors.inkFaint }]}>{b.subtitle}</Text>
                  </View>
                  <View
                    style={[
                      styles.indicatorCircle,
                      {
                        borderColor: active ? colors.accent : colors.border,
                        backgroundColor: active ? colors.accent : 'transparent',
                        opacity: !isSupported ? 0.35 : 1,
                      },
                    ]}
                  >
                    {active && <View style={styles.indicatorDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Reference Input Panel */}
          <Text style={[styles.sectionLabel, { color: colors.inkFaint, marginTop: 22 }]}>
            TRANSACTION REFERENCE OR RECEIPT URL
          </Text>
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.surface,
                borderColor: isInputFocused ? colors.accent : colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.ink }]}
              value={reference}
              onChangeText={setReference}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder={t.refPlaceholder}
              placeholderTextColor={colors.inkFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.inlineScanBtn} onPress={goToScan} activeOpacity={0.7}>
              <Ionicons name="scan" size={20} color={colors.accent} />
            </TouchableOpacity>
          </View>

          {/* Verify CTA */}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.accent },
              (!reference.trim() || !selectedBank || loading) && styles.disabledBtn,
            ]}
            onPress={handleVerify}
            disabled={!reference.trim() || !selectedBank || loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>
                  {!selectedBank && reference.trim() ? 'Select Payment Rail' : t.btnVerify}
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Quick Scan / Upload Receipt Card */}
          <TouchableOpacity
            style={[styles.photoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={goToScan}
            activeOpacity={0.75}
          >
            <View style={[styles.photoIconWrap, { backgroundColor: colors.accentSubtle }]}>
              <Ionicons name="camera" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.photoTitle, { color: colors.ink }]}>{t.btnScanUpload}</Text>
              <Text style={[styles.photoSub, { color: colors.inkFaint }]}>Auto-detects QR codes, barcodes & OCR</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </TouchableOpacity>

          {/* Batch Verification Card */}
          <TouchableOpacity
            style={[styles.photoCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 10 }]}
            onPress={goToBatch}
            activeOpacity={0.75}
          >
            <View style={[styles.photoIconWrap, { backgroundColor: colors.accentSubtle }]}>
              <Ionicons name="layers" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.photoTitle, { color: colors.ink }]}>Batch Verification</Text>
              <Text style={[styles.photoSub, { color: colors.inkFaint }]}>Verify multiple screenshots or bulk references</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </TouchableOpacity>

          {/* Reserved Monetization Banner Space */}
          <AdPlaceholder variant="banner" style={{ marginTop: 14 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Account Confirmation Modal */}
      <Modal visible={showAccountModal} transparent animationType="fade">
        <View style={styles.modalShade}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.ink }]}>Receiver Account</Text>
            <Text style={[styles.modalDesc, { color: colors.inkMuted }]}>
              To confirm this receipt with the bank, enter the receiver's last 8 account digits.
            </Text>

            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: colors.surfaceSubtle, borderColor: colors.border, color: colors.ink },
              ]}
              value={inputDigits}
              onChangeText={(v) => setInputDigits(v.replace(/\D/g, ''))}
              placeholder="e.g. 100012340393"
              placeholderTextColor={colors.inkFaint}
              keyboardType="number-pad"
              maxLength={16}
              autoFocus
            />

            <View style={styles.rememberRow}>
              <Text style={[styles.rememberText, { color: colors.inkMuted }]}>
                Remember account for future checks
              </Text>
              <Switch
                value={rememberAccount}
                onValueChange={setRememberAccount}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancel, { borderColor: colors.border }]}
                onPress={() => setShowAccountModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.inkMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  { backgroundColor: colors.accent },
                  !isValidDigits && { opacity: 0.5 },
                ]}
                disabled={!isValidDigits}
                onPress={handleAccountSubmit}
              >
                <Text style={styles.modalConfirmText}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 6,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogoWrap: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLogoDarkBg: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  headerLogo: {
    width: 96,
    height: 38,
  },
  scannerHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCard: {
    width: '100%',
    height: 108,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  bankList: {
    gap: 7,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 11,
  },
  bankRowDisabled: {
    opacity: 0.45,
  },
  bankLogoDisabled: {
    opacity: 0.7,
  },
  bankMeta: {
    flex: 1,
    marginLeft: 12,
  },
  bankNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bankName: {
    fontSize: 14,
    fontWeight: '700',
  },
  soonBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  soonBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bankType: {
    fontSize: 11,
    marginTop: 1,
  },
  indicatorCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 13,
  },
  inlineScanBtn: {
    padding: 6,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 11,
    paddingVertical: 14,
    marginBottom: 18,
  },
  disabledBtn: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  photoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 11,
    padding: 13,
  },
  photoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  photoSub: {
    fontSize: 11,
    marginTop: 1,
  },
  modalShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  rememberText: {
    fontSize: 12,
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  offlineNoticeText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});
