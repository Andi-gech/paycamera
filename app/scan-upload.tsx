// app/scan-upload.tsx — Scan or Upload Receipt view with theme and translations
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Switch,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useApp } from '../lib/AppContext';
import { useNetwork } from '../lib/NetworkContext';
import { verifyTelebirrReceipt } from '../lib/adapters/telebirrVerifier';
import { verifyCbeReceipt } from '../lib/adapters/cbeVerifier';
import { verifyBoaReceipt } from '../lib/adapters/boaVerifier';
import { identifyReceiptBankAndReference } from '../lib/adapters/autoIdentifier';
import { saveVerification, getStoredReceiverAccount, setStoredReceiverAccount } from '../lib/storage';
import type { BankId, VerificationStatus } from '../lib/types';

export default function ScanUploadScreen() {
  const router = useRouter();
  const { colors, t } = useApp();
  const { isReliable, showNoNetworkModal, checkConnection } = useNetwork();
  const { bank = 'telebirr' } = useLocalSearchParams<{ bank?: BankId }>();
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [showReceiverModal, setShowReceiverModal] = useState(false);
  const [pendingUri, setPendingUri] = useState('');
  const [receiverInput, setReceiverInput] = useState('');
  const [rememberReceiver, setRememberReceiver] = useState(true);

  // In-App CameraView State (Never backgrounded, never killed by Android OS)
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'back' | 'front'>('back');
  const [cameraFlash, setCameraFlash] = useState<'off' | 'on'>('off');
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    console.log('[PAGE: ScanUpload (app/scan-upload.tsx)] Mounted with initial bank param:', bank);

    // If Android killed the activity while camera was active, recover the pending photo on recreation
    let isMounted = true;
    const checkPendingImage = async () => {
      try {
        const pending = await ImagePicker.getPendingResultAsync();
        if (!isMounted || !pending) return;
        if ('canceled' in pending && !pending.canceled && pending.assets && pending.assets.length > 0 && pending.assets[0]?.uri) {
          console.log('[PAGE: ScanUpload] Recovered pending camera result after OS resume:', pending.assets[0].uri);
          await processImageUri(pending.assets[0].uri);
        }
      } catch (err) {
        console.warn('[PAGE: ScanUpload] Could not retrieve pending camera result:', err);
      }
    };

    checkPendingImage();
    return () => {
      isMounted = false;
    };
  }, [bank]);

  const processImageUri = async (uri: string, overrideAccountDigits?: string) => {
    if (!isReliable) {
      const isOnline = await checkConnection();
      if (!isOnline) {
        showNoNetworkModal();
        return;
      }
    }

    console.log('----------------------------------------------------');
    console.log('[PAGE: ScanUpload] [Pipeline] STEP 1: Starting processImageUri with URI:', uri, 'overrideAccountDigits:', overrideAccountDigits);
    setLoading(true);
    setLoadingStatus(t.analyzingText);

    try {
      console.log('[PAGE: ScanUpload] [Pipeline] STEP 2: Running identifyReceiptBankAndReference...');
      const detection = await identifyReceiptBankAndReference(uri);
      console.log('[PAGE: ScanUpload] [Pipeline] STEP 3: Identification complete:', JSON.stringify(detection));
      const effectiveBank: BankId = detection.detectedBank || bank || 'telebirr';
      console.log('[PAGE: ScanUpload] [Pipeline] STEP 4: Effective bank selected:', effectiveBank);
      console.log('[PAGE: ScanUpload] [Pipeline] STEP 4: Actual extracted text:\n--- START EXTRACTED TEXT ---\n' + (detection.rawText || detection.rawTextPreview || '(no OCR text)') + '\n--- END EXTRACTED TEXT ---');

      if (effectiveBank === 'telebirr') {
        console.log('[PAGE: ScanUpload] [Pipeline] STEP 5 [Telebirr]: Calling verifyTelebirrReceipt (reusing extracted ref & OCR text)...');
        const data = await verifyTelebirrReceipt(uri, {
          preExtractedRef: detection.extractedReference,
          preExtractedText: detection.rawText,
        });
        console.log('[PAGE: ScanUpload] [Pipeline] STEP 6 [Telebirr]: Verification returned:', JSON.stringify(data));
        const status: VerificationStatus = data.success ? 'verified' : 'failed';
        
        console.log('[PAGE: ScanUpload] [Pipeline] STEP 7 [Telebirr]: Saving record to storage...');
        const record = await saveVerification({
          bank: 'telebirr',
          bankName: 'Telebirr',
          reference: data.transactionNumber || detection.extractedReference || 'Unknown',
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
          imageUri: uri,
        });

        console.log('[PAGE: ScanUpload] [Pipeline] STEP 8 [Telebirr]: Record saved id =', record.id, '-> Navigating to /verify-result');
        router.replace({ pathname: '/verify-result', params: { recordId: record.id, imageUri: uri } });
        return;
      }

      // BOA flow
      if (effectiveBank === 'boa') {
        console.log('[PAGE: ScanUpload] [Pipeline] STEP 5 [BOA]: Getting stored receiver account...');
        const savedAccount = overrideAccountDigits || (await getStoredReceiverAccount());
        console.log('[PAGE: ScanUpload] [Pipeline] STEP 6 [BOA]: Calling verifyBoaReceipt with account:', savedAccount);
        const data = await verifyBoaReceipt(
          uri,
          savedAccount || undefined,
          detection.extractedReference || undefined,
          detection.rawText || undefined
        );
        console.log('[PAGE: ScanUpload] [Pipeline] STEP 7 [BOA]: Verification returned:', JSON.stringify(data));

        if (data.status === 'needs_input') {
          console.log('[PAGE: ScanUpload] [Pipeline] STEP 8 [BOA]: Receipt needs account digits, opening modal');
          setPendingUri(uri);
          const stored = await getStoredReceiverAccount();
          if (stored) setReceiverInput(stored);
          setShowReceiverModal(true);
          return;
        }

        const status: VerificationStatus = data.success || data.verified ? 'verified' : 'failed';
        console.log('[PAGE: ScanUpload] [Pipeline] STEP 8 [BOA]: Saving verification record to storage...');
        const record = await saveVerification({
          bank: 'boa',
          bankName: 'Bank of Abyssinia',
          reference: data.transactionNumber || detection.extractedReference || 'Unknown',
          amount: data.amount !== null && data.amount !== undefined ? `${data.amount} ${data.currency || 'ETB'}` : null,
          currency: data.currency || 'ETB',
          status,
          senderName: data.senderName || null,
          receiverName: data.receiverName || null,
          receiverAccount: data.receiverAccount || (savedAccount ? savedAccount.slice(-5) : null),
          transactionTime: data.transactionTime || null,
          receiptUrl: data.receiptUrl || null,
          errorMessage: data.error || null,
          isLegacy: false,
          imageUri: uri,
        });

        console.log('[PAGE: ScanUpload] [Pipeline] STEP 9 [BOA]: Record saved id =', record.id, '-> Navigating to /verify-result');
        router.replace({ pathname: '/verify-result', params: { recordId: record.id, imageUri: uri } });
        return;
      }

      // CBE flow
      console.log('[PAGE: ScanUpload] [Pipeline] STEP 5 [CBE]: Getting stored receiver account...');
      const savedAccount = overrideAccountDigits || await getStoredReceiverAccount();
      console.log('[PAGE: ScanUpload] [Pipeline] STEP 6 [CBE]: Calling verifyCbeReceipt with account:', savedAccount);
      const data = await verifyCbeReceipt(
        uri,
        savedAccount || undefined,
        detection.extractedReference,
        detection.rawText
      );
      console.log('[PAGE: ScanUpload] [Pipeline] STEP 7 [CBE]: Verification returned:', JSON.stringify(data));

      if (data.needsReceiverAccount) {
        console.log('[PAGE: ScanUpload] [Pipeline] STEP 8 [CBE]: Receipt needs receiver account, opening modal');
        setPendingUri(uri);
        const stored = await getStoredReceiverAccount();
        if (stored) setReceiverInput(stored);
        setShowReceiverModal(true);
        return;
      }

      const status: VerificationStatus = data.success ? 'verified' : 'failed';
      console.log('[PAGE: ScanUpload] [Pipeline] STEP 8 [CBE]: Saving verification record to storage...');
      const record = await saveVerification({
        bank: 'cbe',
        bankName: 'CBE',
        reference: data.transactionNumber || detection.extractedReference || 'Unknown',
        amount: data.amount || null,
        currency: 'ETB',
        status,
        senderName: data.senderName || null,
        receiverName: data.receiverName || null,
        receiverAccount: savedAccount ? savedAccount.slice(-8) : null,
        transactionTime: data.transactionTime || null,
        receiptUrl: data.receiptUrl || null,
        errorMessage: data.error || null,
        isLegacy: data.isLegacy || false,
        imageUri: uri,
      });

      console.log('[PAGE: ScanUpload] [Pipeline] STEP 9 [CBE]: Record saved id =', record.id, '-> Navigating to /verify-result');
      router.replace({ pathname: '/verify-result', params: { recordId: record.id, imageUri: uri } });
    } catch (err) {
      console.error('[PAGE: ScanUpload] [Pipeline] ERROR in processImageUri:', err);
      if (!isReliable) {
        showNoNetworkModal();
      }
      Alert.alert('Verification Error', 'Failed to parse receipt image. Please try again.');
    } finally {
      console.log('[PAGE: ScanUpload] [Pipeline] processImageUri completed, setting loading = false');
      setLoading(false);
    }
  };

  const handleTakePhoto = async () => {
    console.log('[PAGE: ScanUpload] handleTakePhoto triggered — opening in-app camera');
    try {
      if (!permission?.granted) {
        console.log('[PAGE: ScanUpload] Requesting camera permission...');
        const res = await requestPermission();
        if (!res.granted) {
          Alert.alert('Permission Denied', 'Camera access is required to take photos of receipts.');
          return;
        }
      }
      setIsCameraActive(true);
    } catch (e) {
      console.error('[PAGE: ScanUpload] Camera permission check error:', e);
      Alert.alert('Camera Error', 'Could not open camera. Please check camera permissions in settings.');
    }
  };

  const captureInAppPhoto = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      console.log('[PAGE: ScanUpload] In-app camera capturing photo...');
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
      });

      if (photo?.uri) {
        console.log('[PAGE: ScanUpload] In-app camera captured URI:', photo.uri);
        setIsCameraActive(false);
        setIsCapturing(false);
        await processImageUri(photo.uri);
      } else {
        setIsCapturing(false);
      }
    } catch (err) {
      console.error('[PAGE: ScanUpload] In-app camera capture failed:', err);
      setIsCapturing(false);
      Alert.alert('Capture Failed', 'Failed to take photo. Please try again.');
    }
  };

  const handleChooseGallery = async () => {
    console.log('[PAGE: ScanUpload] handleChooseGallery triggered');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('[PAGE: ScanUpload] Gallery permission result:', permission.status, 'granted:', permission.granted);
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Media library access is required to select photos.');
        return;
      }

      console.log('[PAGE: ScanUpload] Launching gallery picker...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });

      console.log('[PAGE: ScanUpload] Gallery closed. canceled:', result.canceled, 'assets length:', result.assets?.length);
      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        console.log('[PAGE: ScanUpload] Gallery image selected with URI:', result.assets[0].uri);
        await processImageUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[PAGE: ScanUpload] Gallery Pick Error:', e);
    }
  };

  const handleModalReceiverSubmit = async () => {
    const raw = receiverInput.replace(/\D/g, '');
    if (raw.length < 5) return;
    const digits = raw.length >= 8 ? raw.slice(-8) : raw.slice(-5);

    if (rememberReceiver) {
      await setStoredReceiverAccount(digits);
    }
    setShowReceiverModal(false);

    if (pendingUri) {
      await processImageUri(pendingUri, digits);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top Navbar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>{t.navScanTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {/* Graphic Illustration */}
        <View style={styles.illustrationSection}>
          <View style={[styles.lightAuraBackdrop, { backgroundColor: colors.primaryLight }]}>
            <View style={[styles.phoneFrame, { borderColor: colors.primaryBlue, backgroundColor: colors.surface }]}>
              <View style={[styles.phoneScreen, { backgroundColor: colors.background }]}>
                <View style={styles.receiptPaper}>
                  <View style={styles.dummyLineHeader} />
                  <View style={styles.dummyLineLong} />
                  <View style={styles.dummyLineShort} />
                  <View style={[styles.dummyLineAmount, { backgroundColor: colors.primaryBlue + '55' }]} />
                </View>
              </View>
              <View style={styles.floatingCheck}>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              </View>
            </View>
          </View>
        </View>

        {/* Title and Instruction Copy */}
        <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>{t.addReceiptTitle}</Text>
        <Text style={[styles.subTitle, { color: colors.textSecondary }]}>{t.addReceiptSub}</Text>

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator size="large" color={colors.primaryBlue} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{loadingStatus}</Text>
          </View>
        ) : (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.takePhotoBtn, { backgroundColor: colors.primaryBlue }]}
              onPress={handleTakePhoto}
              activeOpacity={0.88}
            >
              <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
              <Text style={styles.takePhotoBtnText}>{t.btnTakePhoto}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.chooseGalleryBtn,
                { backgroundColor: colors.surface, borderColor: colors.primaryBlue },
              ]}
              onPress={handleChooseGallery}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={20} color={colors.primaryBlue} />
              <Text style={[styles.chooseGalleryBtnText, { color: colors.primaryBlue }]}>
                {t.btnChooseGallery}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.chooseGalleryBtn,
                { backgroundColor: colors.surface, borderColor: colors.primaryBlue, marginTop: 10 },
              ]}
              onPress={() => router.push('/batch-verify')}
              activeOpacity={0.8}
            >
              <Ionicons name="layers-outline" size={20} color={colors.primaryBlue} />
              <Text style={[styles.chooseGalleryBtnText, { color: colors.primaryBlue }]}>
                Batch Verify (Multiple Receipts)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer Support Info */}
        <View style={styles.footerNote}>
          <Text style={[styles.formatsText, { color: colors.textTertiary }]}>{t.supportedFormats}</Text>
          <Text style={[styles.clarityText, { color: colors.textTertiary }]}>{t.clarityNote}</Text>
        </View>
      </View>

      {/* Custom Designed Modal Matching the UI */}
      <Modal
        visible={showReceiverModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowReceiverModal(false);
          router.replace('/(tabs)');
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContentCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            {/* Top Icon Badge */}
            <View style={[styles.modalIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="card-outline" size={28} color={colors.primaryBlue} />
            </View>

            <Text style={[styles.modalCardTitle, { color: colors.textPrimary }]}>
              Receiver Account Required
            </Text>

            <Text style={[styles.modalCardDesc, { color: colors.textSecondary }]}>
              To confirm this receipt with the bank, enter the account digits (last 5 to 8 digits).
            </Text>

            <TextInput
              style={[
                styles.modalTextInput,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary },
              ]}
              value={receiverInput}
              onChangeText={(v) => setReceiverInput(v.replace(/\D/g, ''))}
              placeholder="e.g. 100012340393"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={16}
              autoFocus
            />

            <View style={styles.modalRememberRow}>
              <Text style={[styles.modalRememberText, { color: colors.textSecondary }]}>
                Remember account for future checks
              </Text>
              <Switch
                value={rememberReceiver}
                onValueChange={setRememberReceiver}
                trackColor={{ false: colors.surfaceBorder, true: colors.primaryBlue }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { backgroundColor: colors.cardBg, borderColor: colors.surfaceBorder }]}
                onPress={() => {
                  setShowReceiverModal(false);
                  router.replace('/(tabs)');
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtnPrimary,
                  { backgroundColor: colors.primaryBlue },
                  receiverInput.replace(/\D/g, '').length < 5 && { opacity: 0.5 },
                ]}
                disabled={receiverInput.replace(/\D/g, '').length < 5}
                onPress={handleModalReceiverSubmit}
                activeOpacity={0.88}
              >
                <Text style={styles.modalBtnPrimaryText}>Verify</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* In-App Camera Viewfinder Modal (Zero OS backgrounding, Zero Shutdown) */}
      <Modal
        visible={isCameraActive}
        animationType="slide"
        onRequestClose={() => setIsCameraActive(false)}
        statusBarTranslucent
      >
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={cameraFacing}
            flash={cameraFlash}
            mode="picture"
          />

          {/* Top Control Bar */}
          <SafeAreaView style={styles.cameraTopBar}>
            <TouchableOpacity
              onPress={() => setIsCameraActive(false)}
              style={styles.cameraCircleBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.cameraHeaderWrap}>
              <Text style={styles.cameraHeaderTitle}>Scan Receipt</Text>
            </View>

            <TouchableOpacity
              onPress={() => setCameraFlash((f) => (f === 'off' ? 'on' : 'off'))}
              style={[
                styles.cameraCircleBtn,
                cameraFlash === 'on' && { backgroundColor: '#F59E0B' },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name={cameraFlash === 'on' ? 'flash' : 'flash-off'}
                size={20}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </SafeAreaView>

          {/* Viewfinder Center Box */}
          <View style={styles.viewfinderCenterArea} pointerEvents="none">
            <View style={styles.viewfinderBox}>
              <View style={[styles.cornerMarker, styles.cornerTL]} />
              <View style={[styles.cornerMarker, styles.cornerTR]} />
              <View style={[styles.cornerMarker, styles.cornerBL]} />
              <View style={[styles.cornerMarker, styles.cornerBR]} />
            </View>
            <View style={styles.viewfinderTipBadge}>
              <Ionicons name="scan-outline" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.viewfinderTipText}>Fit receipt neatly in this frame</Text>
            </View>
          </View>

          {/* Bottom Bar Controls */}
          <SafeAreaView style={styles.cameraBottomBar}>
            <TouchableOpacity
              onPress={() => {
                setIsCameraActive(false);
                handleChooseGallery();
              }}
              style={styles.cameraSideBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={24} color="#FFFFFF" />
              <Text style={styles.cameraSideBtnLabel}>Gallery</Text>
            </TouchableOpacity>

            {/* Shutter Capture Button */}
            <TouchableOpacity
              onPress={captureInAppPhoto}
              disabled={isCapturing}
              style={styles.shutterRing}
              activeOpacity={0.7}
            >
              {isCapturing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.shutterCore} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCameraFacing((c) => (c === 'back' ? 'front' : 'back'))}
              style={styles.cameraSideBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-reverse-outline" size={24} color="#FFFFFF" />
              <Text style={styles.cameraSideBtnLabel}>Flip</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
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
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  illustrationSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  lightAuraBackdrop: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrame: {
    width: 86,
    height: 124,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  phoneScreen: {
    width: 68,
    height: 98,
    borderRadius: 6,
    padding: 8,
    justifyContent: 'center',
  },
  receiptPaper: {
    gap: 6,
  },
  dummyLineHeader: {
    height: 6,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    width: '45%',
  },
  dummyLineLong: {
    height: 6,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    width: '85%',
  },
  dummyLineShort: {
    height: 6,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    width: '65%',
  },
  dummyLineAmount: {
    height: 6,
    borderRadius: 3,
    width: '50%',
    marginTop: 4,
  },
  floatingCheck: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  subTitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 32,
  },
  actionsContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 36,
  },
  takePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 28,
    paddingVertical: 15,
  },
  takePhotoBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chooseGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 28,
    paddingVertical: 14,
  },
  chooseGalleryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  loadingArea: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  footerNote: {
    alignItems: 'center',
  },
  formatsText: {
    fontSize: 12,
    fontWeight: '500',
  },
  clarityText: {
    fontSize: 12,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContentCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  modalCardDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  modalTextInput: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 14,
  },
  modalRememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  modalRememberText: {
    fontSize: 12,
    flex: 1,
    paddingRight: 8,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 24,
  },
  modalBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  cameraTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    zIndex: 10,
  },
  cameraCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraHeaderWrap: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  cameraHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  viewfinderCenterArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderBox: {
    width: '82%',
    height: '62%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    position: 'relative',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  cornerMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#3B82F6',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  viewfinderTipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 18,
  },
  viewfinderTipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  cameraBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 24,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  cameraSideBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  cameraSideBtnLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  shutterRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
});
