// app/(tabs)/history.tsx — History screen with full trilingual translation & dark mode
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../lib/AppContext';
import { getHistory } from '../../lib/storage';
import type { VerificationRecord, BankId } from '../../lib/types';
import { AdPlaceholder } from '../../src/components/AdPlaceholder';

type FilterOption = 'all' | 'telebirr' | 'cbe' | 'dashen';

export default function HistoryScreen() {
  const router = useRouter();
  const { colors, t, isDark } = useApp();
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [search, setSearch] = useState('');

  const FILTER_OPTIONS: { id: FilterOption; label: string }[] = [
    { id: 'all', label: t.filterAll },
    { id: 'telebirr', label: 'Telebirr' },
    { id: 'cbe', label: 'CBE' },
    { id: 'dashen', label: 'Dashen Bank' },
  ];

  const loadHistory = useCallback(async () => {
    const data = await getHistory(filter === 'dashen' ? undefined : filter, search);
    setRecords(data);
  }, [filter, search]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const renderItem = useCallback(
    ({ item, index }: { item: VerificationRecord; index: number }) => {
      const isVerified = item.status === 'verified';
      const isFailed = item.status === 'failed';

      return (
        <View>
          <TouchableOpacity
            style={[
              styles.historyCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
            onPress={() => router.push({ pathname: '/receipt-details', params: { recordId: item.id } })}
            activeOpacity={0.7}
          >
            {/* Status Icon */}
            <View style={styles.iconColumn}>
              {isVerified ? (
                <View style={styles.statusIconVerified}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                </View>
              ) : isFailed ? (
                <View style={styles.statusIconFailed}>
                  <Text style={styles.statusExclamation}>!</Text>
                </View>
              ) : (
                <View style={styles.statusIconPending}>
                  <Ionicons name="time" size={16} color="#FFFFFF" />
                </View>
              )}
            </View>

            {/* Bank & Reference Column */}
            <View style={styles.mainColumn}>
              <Text style={[styles.bankName, { color: colors.textSecondary }]}>{item.bankName}</Text>
              <Text style={[styles.amountText, { color: colors.textPrimary }]}>{item.amount || '0.00 ETB'}</Text>
              <Text style={[styles.refText, { color: colors.textTertiary }]}>{item.reference}</Text>
            </View>

            {/* Status Pill & Timestamp */}
            <View style={styles.rightColumn}>
              {isVerified ? (
                <View style={[styles.pillVerified, { backgroundColor: colors.successSurface }]}>
                  <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                  <Text style={styles.pillVerifiedText}>{t.statusVerified}</Text>
                </View>
              ) : isFailed ? (
                <View style={[styles.pillFailed, { backgroundColor: colors.errorSurface }]}>
                  <Text style={styles.pillFailedIcon}>✕</Text>
                  <Text style={styles.pillFailedText}>{t.statusUnable}</Text>
                </View>
              ) : (
                <View style={[styles.pillPending, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.pillPendingText, { color: colors.textSecondary }]}>{t.statusPending}</Text>
                </View>
              )}

              <Text style={[styles.timestampText, { color: colors.textTertiary }]}>
                {item.transactionTime || item.createdAt.slice(0, 10).replace(/-/g, '/')}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          {/* Native In-Feed Ad after the 3rd transaction */}
          {index === 2 ? (
            <AdPlaceholder variant="native" style={{ marginTop: 6, marginBottom: 10 }} />
          ) : null}
        </View>
      );
    },
    [colors, t, router]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t.historyTitle}</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchInputWrap,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            value={search}
            onChangeText={setSearch}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={colors.textTertiary}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.filterBtn,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
          activeOpacity={0.7}
        >
          <Ionicons name="filter" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs / Chips */}
      <View style={styles.chipRow}>
        {FILTER_OPTIONS.map((opt) => {
          const isSelected = filter === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? colors.primaryBlue : colors.surface,
                  borderColor: isSelected ? colors.primaryBlue : colors.surfaceBorder,
                },
              ]}
              onPress={() => setFilter(opt.id)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isSelected ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Verification History List */}
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="document-text-outline" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{t.emptyHistory}</Text>
            <Text style={[styles.emptySub, { color: colors.textTertiary }]}>{t.emptyHistorySub}</Text>
          </View>
        }
        ListFooterComponent={
          records.length > 0 ? (
            <AdPlaceholder variant="banner" style={{ marginTop: 14, marginBottom: 12 }} />
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 10,
  },
  filterBtn: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 10,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
  },
  iconColumn: {
    marginRight: 12,
  },
  statusIconVerified: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconFailed: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconPending: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusExclamation: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
    lineHeight: 20,
  },
  mainColumn: {
    flex: 1,
  },
  bankName: {
    fontSize: 13,
    fontWeight: '500',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  refText: {
    fontSize: 11,
    marginTop: 2,
  },
  rightColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  pillVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillVerifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  pillFailed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillFailedIcon: {
    fontSize: 10,
    color: '#EF4444',
    fontWeight: '700',
  },
  pillFailedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  pillPending: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillPendingText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timestampText: {
    fontSize: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    marginTop: 4,
  },
});
