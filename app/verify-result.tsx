// app/verify-result.tsx — Result screen with theme and trilingual translations
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../lib/AppContext';
import { getVerificationById } from '../lib/storage';
import type { VerificationRecord } from '../lib/types';
import { checkCustomRules } from '../lib/rules';
import { BankLogo } from '../src/components/BankLogos';
import { AdPlaceholder } from '../src/components/AdPlaceholder';

export default function VerifyResultScreen() {
  const router = useRouter();
  const { colors, t, isDark, rules } = useApp();
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
    senderName: null,
    receiverName: 'Zemensa Behaylu',
    receiverAccount: 'HO',
    transactionTime: '2026/10/27 21:37:57',
    receiptUrl: null,
    errorMessage: null,
    isLegacy: false,
    createdAt: new Date().toISOString(),
  };

  const isSuccess = data.status === 'verified';
  const ruleCheck = rules ? checkCustomRules(data, rules) : { passed: true, warnings: [] };
  const hasRuleMismatch = isSuccess && !ruleCheck.passed;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top Navbar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>{t.navResultTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Graphic & Copy */}
        <View style={styles.statusSection}>
          {hasRuleMismatch ? (
            <View style={[styles.errorAura, { backgroundColor: colors.errorSurface }]}>
              <View style={styles.errorCircle}>
                <Ionicons name="alert" size={42} color="#FFFFFF" />
              </View>
            </View>
          ) : isSuccess ? (
            <View style={[styles.successAura, { backgroundColor: colors.successSurface }]}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={48} color="#FFFFFF" />
              </View>
            </View>
          ) : (
            <View style={[styles.errorAura, { backgroundColor: colors.errorSurface }]}>
              <View style={styles.errorCircle}>
                <Text style={styles.exclamationMark}>!</Text>
              </View>
            </View>
          )}

          <Text
            style={[
              styles.statusTitle,
              { color: hasRuleMismatch ? '#EF4444' : isSuccess ? '#10B981' : '#EF4444' },
            ]}
          >
            {hasRuleMismatch ? t.resVerifiedMismatch : isSuccess ? t.resVerified : t.resUnable}
          </Text>

          <Text style={[styles.statusDescription, { color: colors.textSecondary }]}>
            {hasRuleMismatch
              ? t.resMismatchSub
              : isSuccess
              ? t.resSuccessSub
              : t.resFailSub}
          </Text>
        </View>

        {/* Amount Display — Only shown if an amount actually exists on verified record */}
        {data.amount ? (
          <View style={styles.amountWrap}>
            <Text style={[styles.amountValue, { color: colors.textPrimary }]}>
              {data.amount.startsWith('-') ? data.amount : `-${data.amount}`}
            </Text>
            <Text style={[styles.amountSub, { color: colors.textSecondary }]}>{t.labelTransferMoney}</Text>
          </View>
        ) : null}

        {/* Verification Summary List */}
        <View style={styles.summaryList}>
          <View style={styles.summaryRow}>
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t.labelReference}</Text>
            <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{data.reference || 'DJR1DSXKZH'}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t.labelStatus}</Text>
            {isSuccess ? (
              <View style={[styles.badgeSuccess, { backgroundColor: colors.successSurface }]}>
                <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                <Text style={styles.badgeSuccessText}>{t.labelSuccessful}</Text>
              </View>
            ) : (
              <View style={[styles.badgeFailed, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.badgeFailedText, { color: colors.textSecondary }]}>{t.labelUnknown}</Text>
              </View>
            )}
          </View>

          {data.transactionTime ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t.labelTime}</Text>
              <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{data.transactionTime}</Text>
            </View>
          ) : null}

          {data.senderName && data.senderName !== '(not available)' ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t.labelPayerName}</Text>
              <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{data.senderName}</Text>
            </View>
          ) : null}

          {data.receiverName ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t.labelTransactionTo}</Text>
              <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{data.receiverName}</Text>
            </View>
          ) : null}

          {data.receiverAccount ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t.labelReceiverAccount}</Text>
              <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{data.receiverAccount}</Text>
            </View>
          ) : null}
        </View>

        {/* Custom Rule Warnings if any */}
        {rules && checkCustomRules(data, rules).warnings.map((warn, i) => (
          <View key={i} style={styles.warningAlertBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginTop: 1 }} />
            <Text style={styles.warningAlertText}>{warn}</Text>
          </View>
        ))}

        {/* Warning Callout Box for Failed Verification */}
        {!isSuccess && (
          <View style={styles.warningAlertBox}>
            <Ionicons name="warning-outline" size={18} color="#EF4444" style={{ marginTop: 1 }} />
            <Text style={styles.warningAlertText}>
              The official paid amount could not be safely extracted from the receipt table.
            </Text>
          </View>
        )}

        {/* Official Source Card */}
        <View style={[styles.officialSourceCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <BankLogo bankId={data.bank} size={36} />
          <View style={styles.officialSourceText}>
            <Text style={[styles.officialSourceTitle, { color: colors.textPrimary }]}>{data.bankName || 'Telebirr'}</Text>
            <Text style={[styles.officialSourceSub, { color: colors.textSecondary }]}>
              {isSuccess ? t.officialVerified : t.officialResponse}
            </Text>
          </View>
          {isSuccess ? (
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
          ) : (
            <Ionicons name="help-circle" size={20} color={colors.textTertiary} />
          )}
        </View>

        {/* Action Button */}
        {isSuccess ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primaryBlue }]}
            onPress={() =>
              router.push({
                pathname: '/receipt-details',
                params: { recordId: data.id },
              })
            }
            activeOpacity={0.88}
          >
            <Text style={styles.primaryBtnText}>{t.btnViewDetails}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.primaryBlue, backgroundColor: colors.surface }]}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primaryBlue }]}>{t.btnTryAgain}</Text>
          </TouchableOpacity>
        )}

        {/* Non-Intrusive Sponsored Space (Post-Task completion) */}
        <AdPlaceholder variant="rectangle" style={{ marginTop: 22 }} />
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
    paddingHorizontal: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  statusSection: {
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 20,
  },
  successAura: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorAura: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exclamationMark: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 38,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  statusDescription: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  amountWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  amountValue: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  amountSub: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  summaryList: {
    width: '100%',
    paddingVertical: 4,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  badgeFailed: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeFailedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginBottom: 16,
  },
  warningAlertText: {
    flex: 1,
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 16,
    fontWeight: '500',
  },
  officialSourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 14,
    width: '100%',
    marginBottom: 24,
  },
  officialSourceText: {
    flex: 1,
    marginLeft: 12,
  },
  officialSourceTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  officialSourceSub: {
    fontSize: 12,
    marginTop: 1,
  },
  primaryBtn: {
    borderRadius: 28,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderRadius: 28,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
