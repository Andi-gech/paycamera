// app/scan-upload.tsx — Scan or Upload Receipt view with theme and translations
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../lib/AppContext';
import { verifyTelebirrReceipt } from '../lib/adapters/telebirrVerifier';
import { verifyCbeReceipt } from '../lib/adapters/cbeVerifier';
import { identifyReceiptBankAndReference } from '../lib/adapters/autoIdentifier';
import { saveVerification, getStoredReceiverAccount } from '../lib/storage';
import type { BankId, VerificationStatus } from '../lib/types';

export default function ScanUploadScreen() {
  const router = useRouter();
  const { colors, t } = useApp();
  const { bank = 'telebirr' } = useLocalSearchParams<{ bank?: BankId }>();
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [showReceiverModal, setShowReceiverModal] = useState(false);

  const processImageUri = async (uri: string) => {
    setLoading(true);
    setLoadingStatus(t.analyzingText);

    try {
      const detection = await identifyReceiptBankAndReference(uri);
      const effectiveBank: BankId = detection.detectedBank || bank || 'telebirr';

      if (effectiveBank === 'telebirr') {
        const data = await verifyTelebirrReceipt(uri);
        const status: VerificationStatus = data.success ? 'verified' : 'failed';
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
        });

        router.replace({ pathname: '/verify-result', params: { recordId: record.id } });
        return;
      }

      // CBE flow
      const savedAccount = await getStoredReceiverAccount();
      const data = await verifyCbeReceipt(uri, savedAccount || undefined);

      if (data.needsReceiverAccount) {
        setShowReceiverModal(true);
        return;
      }

      const status: VerificationStatus = data.success ? 'verified' : 'failed';
      const record = await saveVerification({
        bank: 'cbe',
        bankName: 'CBE',
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
        isLegacy: data.isLegacy || false,
      });

      router.replace({ pathname: '/verify-result', params: { recordId: record.id } });
    } catch (err) {
      console.error(err);
      Alert.alert('Verification Error', 'Failed to parse receipt image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Camera access is required to take photos of receipts.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0]?.uri) {
        const photoUri = result.assets[0].uri;
        setTimeout(() => {
          processImageUri(photoUri);
        }, 150);
      }
    } catch (e) {
      console.error('Camera Launch Error:', e);
      Alert.alert('Camera Error', 'Could not take photo. Please try again or choose from gallery.');
    }
  };

  const handleChooseGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Media library access is required to select photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        await processImageUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error(e);
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
              In order to verify this receipt with the bank, we need the receiver's account number.
            </Text>

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
                style={[styles.modalBtnPrimary, { backgroundColor: colors.primaryBlue }]}
                onPress={() => {
                  setShowReceiverModal(false);
                  router.replace('/(tabs)/profile');
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.modalBtnPrimaryText}>Go to Settings</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
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
    marginBottom: 24,
    paddingHorizontal: 4,
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
});
