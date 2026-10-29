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

  useEffect(() => {
    if (recordId) {
      getVerificationById(recordId).then((rec) => {
        setRecord(rec);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [recordId]);

  const handleShare = async () => {
    try {
      const msg = `✅ ${record?.bankName || 'Telebirr'} Receipt Verified\nReference: ${record?.reference || 'DJR1DSXKZH'}\nAmount: ${record?.amount || '-101.00 ETB'}\nReceiver: ${record?.receiverName || 'Zemensa Behaylu'}\nTime: ${record?.transactionTime || '2026/10/27 21:37:57'}`;
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

  const data: VerificationRecord = record || {
    id: 'demo',
    bank: 'telebirr',
    bankName: 'Telebirr',
    reference: 'DJR1DSXKZH',
    amount: '-101.00 ETB',
    currency: 'ETB',
    status: 'verified',
    senderName: '(not available)',
    receiverName: 'Zemensa Behaylu',
    receiverAccount: 'HO',
    transactionTime: '2026/10/27 21:37:57',
    receiptUrl: null,
    errorMessage: null,
    isLegacy: false,
    createdAt: new Date().toISOString(),
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top Navbar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
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
              <Text style={[styles.bankTitle, { color: colors.textPrimary }]}>{data.bankName || 'Telebirr'}</Text>
            </View>
            <View style={[styles.pillVerified, { backgroundColor: colors.successSurface }]}>
              <Ionicons name="checkmark-circle" size={11} color="#10B981" />
              <Text style={styles.pillVerifiedText}>{t.statusVerified}</Text>
            </View>
          </View>

          {/* Amount Row */}
          <View style={[styles.amountArea, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.amountLarge, { color: colors.textPrimary }]}>
              {data.amount
                ? (data.amount.startsWith('-') ? data.amount : `-${data.amount}`)
                : '-101.00 ETB'}
            </Text>
            <Text style={[styles.transferTypeLabel, { color: colors.textSecondary }]}>{t.labelTransferMoney}</Text>
          </View>

          {/* Quick Details Table */}
          <View style={styles.quickDetails}>
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{t.labelReference}</Text>
              <Text style={[styles.quickValueBold, { color: colors.textPrimary }]}>{data.reference || 'DJR1DSXKZH'}</Text>
            </View>
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{t.labelStatus}</Text>
              <View style={[styles.pillVerified, { backgroundColor: colors.successSurface }]}>
                <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                <Text style={styles.pillVerifiedText}>{t.labelSuccessful}</Text>
              </View>
            </View>
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{t.labelTime}</Text>
              <Text style={[styles.quickValue, { color: colors.textPrimary }]}>{data.transactionTime || '2026/10/27 21:37:57'}</Text>
            </View>
          </View>
        </View>

        {/* Transaction Information Detail Rows */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>{t.headingTxInfo}</Text>
        <View style={[styles.detailsTable, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelTransactionTo}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>{data.receiverName || 'Zemensa Behaylu'}</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelReceiverAccount}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>{data.receiverAccount || 'HO'}</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelPayerName}</Text>
            <Text style={[styles.tableValueFaded, { color: colors.textTertiary }]}>{data.senderName || '(not available)'}</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelServiceFee}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>0.00 ETB</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelTotalPaid}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>101.00 ETB</Text>
          </View>
          <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.tableLabel, { color: colors.textSecondary }]}>{t.labelCurrency}</Text>
            <Text style={[styles.tableValue, { color: colors.textPrimary }]}>ETB</Text>
          </View>
        </View>

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
});
