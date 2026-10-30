// app/receipt-details.tsx — Receipt details with theme & trilingual localization
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../lib/AppContext';
import { getVerificationById } from '../lib/storage';
import type { VerificationRecord } from '../lib/types';
import { BankLogo } from '../src/components/BankLogos';
import { AdPlaceholder } from '../src/components/AdPlaceholder';

export default function ReceiptDetailsScreen() {
  const router = useRouter();
  const { colors, t, isDark } = useApp();
  const { recordId } = useLocalSearchParams<{ recordId?: string }>();
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreenModal, setFullscreenModal] = useState(false);

  useEffect(() => {
    console.log('[PAGE: ReceiptDetails (app/receipt-details.tsx)] Mounted with recordId:', recordId);
    if (recordId) {
      console.log('[PAGE: ReceiptDetails] Fetching verification record for id:', recordId);
      getVerificationById(recordId).then((rec) => {
        console.log('[PAGE: ReceiptDetails] Loaded record:', JSON.stringify(rec));
        setRecord(rec);
        setLoading(false);
      }).catch((err) => {
        console.error('[PAGE: ReceiptDetails] Error loading record:', err);
        setLoading(false);
      });
    } else {
      console.warn('[PAGE: ReceiptDetails] No recordId provided, using demo data');
      setLoading(false);
    }
  }, [recordId]);

  const data: VerificationRecord = record || {
    id: '',
    bank: 'telebirr',
    bankName: '',
    reference: '',
    amount: '',
    currency: 'ETB',
    status: 'pending',
    senderName: '',
    receiverName: '',
    receiverAccount: '',
    transactionTime: '',
    receiptUrl: null,
    errorMessage: null,
    isLegacy: false,
    createdAt: new Date().toISOString(),
  };

  const isVerified = data.status === 'verified';
  const isFailed = data.status === 'failed';

  const handleShare = async () => {
    try {
      const statusIcon = isVerified ? '✅' : isFailed ? '❌' : '⏳';
      const statusTitle = isVerified ? 'Verified' : isFailed ? 'Failed' : 'Pending';
      const msg = `${statusIcon} ${data.bankName || 'Receipt'} (${statusTitle})\nReference: ${data.reference || '-'}\nAmount: ${data.amount || '-'}\nReceiver: ${data.receiverName || '-'}\nTime: ${data.transactionTime || '-'}`;
      await Share.share({ message: msg });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primaryBlue} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top Navbar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            console.log('[PAGE: ReceiptDetails] Back button pressed');
            router.back();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>{t.navDetailsTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main Receipt Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          {/* Bank Row with Verified Tag */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.bankIdentity}>
              <BankLogo bankId={data.bank} size={36} />
              <Text style={[styles.bankTitle, { color: colors.textPrimary }]}>{data.bankName || '-'}</Text>
            </View>
            {isVerified ? (
              <View style={[styles.pillVerified, { backgroundColor: colors.successSurface }]}>
                <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                <Text style={styles.pillVerifiedText}>{t.statusVerified}</Text>
              </View>
            ) : isFailed ? (
              <View style={[styles.pillVerified, { backgroundColor: colors.errorSurface }]}>
                <Ionicons name="close-circle" size={11} color="#EF4444" />
                <Text style={[styles.pillVerifiedText, { color: '#EF4444' }]}>{t.statusUnable}</Text>
              </View>
            ) : (
              <View style={[styles.pillVerified, { backgroundColor: colors.surfaceSubtle }]}>
                <Ionicons name="time-outline" size={11} color={colors.textSecondary} />
                <Text style={[styles.pillVerifiedText, { color: colors.textSecondary }]}>{t.statusPending}</Text>
              </View>
            )}
          </View>

          {/* Amount Row */}
          <View style={[styles.amountArea, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.amountLarge, { color: colors.textPrimary }]}>
              {data.amount
                ? (data.amount.startsWith('-') ? data.amount : `-${data.amount}`)
                : '-'}
            </Text>
            <Text style={[styles.transferTypeLabel, { color: colors.textSecondary }]}>{t.labelTransferMoney}</Text>
          </View>

          {/* Quick Details Table */}
          <View style={styles.quickDetails}>
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{t.labelReference}</Text>
              <Text style={[styles.quickValueBold, { color: colors.textPrimary }]}>{data.reference || '-'}</Text>
            </View>
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{t.labelStatus}</Text>
              {isVerified ? (
                <View style={[styles.pillVerified, { backgroundColor: colors.successSurface }]}>
                  <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                  <Text style={styles.pillVerifiedText}>{t.labelSuccessful}</Text>
                </View>
              ) : isFailed ? (
                <View style={[styles.pillVerified, { backgroundColor: colors.errorSurface }]}>
                  <Ionicons name="close-circle" size={11} color="#EF4444" />
                  <Text style={[styles.pillVerifiedText, { color: '#EF4444' }]}>{t.statusUnable}</Text>
                </View>
              ) : (
                <View style={[styles.pillVerified, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.pillVerifiedText, { color: colors.textSecondary }]}>{t.statusPending}</Text>
                </View>
              )}
            </View>
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{t.labelTime}</Text>
              <Text style={[styles.quickValue, { color: colors.textPrimary }]}>{data.transactionTime || '-'}</Text>
            </View>
          </View>
        </View>

        {/* Transaction Information Detail Rows */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>{t.headingTxInfo}</Text>
        <View style={[styles.detailsTable, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelTransactionTo}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>{data.receiverName || '-'}</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelReceiverAccount}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>{data.receiverAccount || '-'}</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelPayerName}</Text>
            <Text style={[styles.tableValueFaded, { color: colors.textTertiary }]}>{data.senderName || '-'}</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelServiceFee}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>0.00 ETB</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelTotalPaid}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>
              {data.amount ? data.amount.replace(/^-/, '') : '-'}
            </Text>
          </View>
          <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelCurrency}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>{data.currency || 'ETB'}</Text>
          </View>
        </View>

        {/* Scanned Receipt Image Card (if present) */}
        {data.imageUri ? (
          <View style={[styles.receiptImageCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <View style={styles.receiptImageHeader}>
              <View style={styles.receiptImageHeaderLeft}>
                <Ionicons name="image-outline" size={17} color={colors.primaryBlue} style={{ marginRight: 6 }} />
                <Text style={[styles.receiptImageHeaderTitle, { color: colors.textPrimary }]}>
                  {t.labelScannedReceipt || 'Scanned Receipt Image'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setFullscreenModal(true)}
                style={[styles.expandPill, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]}
                activeOpacity={0.7}
              >
                <Ionicons name="expand-outline" size={12} color={colors.textPrimary} style={{ marginRight: 4 }} />
                <Text style={[styles.expandPillText, { color: colors.textPrimary }]}>
                  {t.labelTapToZoom || 'Tap to Zoom'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setFullscreenModal(true)}
              activeOpacity={0.9}
              style={[styles.imageWrapper, { backgroundColor: isDark ? '#000000' : '#F8FAFC' }]}
            >
              <Image
                source={{ uri: data.imageUri }}
                style={styles.receiptImagePreview}
                resizeMode="contain"
              />
              <View style={styles.imageOverlayBadge}>
                <Ionicons name="search" size={12} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.imageOverlayText}>
                  {t.labelTapToZoom || 'Tap to Zoom'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Share Button */}
        <TouchableOpacity
          style={[styles.shareOutlineBtn, { borderColor: colors.primaryBlue, backgroundColor: colors.surface }]}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <Ionicons name="share-social-outline" size={18} color={colors.primaryBlue} />
          <Text style={[styles.shareOutlineBtnText, { color: colors.primaryBlue }]}>{t.btnShareReceipt}</Text>
        </TouchableOpacity>

        {/* Non-Intrusive Sponsored Space */}
        <AdPlaceholder variant="banner" style={{ marginTop: 20 }} />
      </ScrollView>

      {/* Fullscreen Image Zoom Modal */}
      {data.imageUri ? (
        <Modal
          visible={fullscreenModal}
          transparent
          animationType="fade"
          onRequestClose={() => setFullscreenModal(false)}
        >
          <View style={styles.fullscreenBackdrop}>
            <SafeAreaView style={styles.fullscreenSafe} edges={['top', 'bottom']}>
              <View style={styles.fullscreenHeader}>
                <Text style={styles.fullscreenHeaderTitle}>
                  {t.labelScannedReceipt || 'Scanned Receipt Image'}
                </Text>
                <TouchableOpacity
                  style={styles.fullscreenCloseBtn}
                  onPress={() => setFullscreenModal(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <View style={styles.fullscreenImageContainer}>
                <Image
                  source={{ uri: data.imageUri }}
                  style={styles.fullscreenImage}
                  resizeMode="contain"
                />
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 18,
    marginTop: 8,
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  bankIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bankTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  pillVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillVerifiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  amountArea: {
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 14,
  },
  amountLarge: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  transferTypeLabel: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  quickDetails: {
    gap: 10,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickLabel: {
    fontSize: 13,
  },
  quickValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  quickValueBold: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  detailsTable: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 24,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tableLabel: {
    fontSize: 13,
  },
  tableValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  tableValueFaded: {
    fontSize: 13,
  },
  shareOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 28,
    paddingVertical: 14,
  },
  shareOutlineBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  receiptImageCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 20,
  },
  receiptImageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  receiptImageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptImageHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  expandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 12,
  },
  expandPillText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  imageWrapper: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptImagePreview: {
    width: '100%',
    height: '100%',
  },
  imageOverlayBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  imageOverlayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  fullscreenSafe: {
    flex: 1,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  fullscreenHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  fullscreenCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
});
