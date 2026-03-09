/**
 * Bulletins de Soins List Screen
 * Shows history of bulletins with status tracking
 */
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';

type BulletinStatus =
  | 'scan_uploaded'
  | 'paper_received'
  | 'paper_incomplete'
  | 'paper_complete'
  | 'processing'
  | 'approved'
  | 'pending_payment'
  | 'reimbursed'
  | 'rejected';

interface BulletinSoins {
  id: string;
  bulletin_number: string;
  bulletin_date: string;
  provider_name: string | null;
  care_type: string;
  total_amount: number;
  reimbursed_amount: number;
  status: BulletinStatus;
  submission_date: string;
}

const statusConfig: Record<BulletinStatus, { label: string; icon: string; color: string; bgColor: string }> = {
  scan_uploaded: { label: 'Scan soumis', icon: '📤', color: '#d97706', bgColor: '#fef3c7' },
  paper_received: { label: 'Papier reçu', icon: '📬', color: '#2563eb', bgColor: '#dbeafe' },
  paper_incomplete: { label: 'Incomplet', icon: '⚠️', color: '#b45309', bgColor: '#fde68a' },
  paper_complete: { label: 'Complet', icon: '✅', color: '#16a34a', bgColor: '#dcfce7' },
  processing: { label: 'En traitement', icon: '⏳', color: '#2563eb', bgColor: '#dbeafe' },
  approved: { label: 'Approuvé', icon: '👍', color: '#16a34a', bgColor: '#dcfce7' },
  pending_payment: { label: 'Paiement en cours', icon: '💳', color: '#d97706', bgColor: '#fef3c7' },
  reimbursed: { label: 'Remboursé', icon: '✓', color: '#16a34a', bgColor: '#dcfce7' },
  rejected: { label: 'Rejeté', icon: '✗', color: '#dc2626', bgColor: '#fee2e2' },
};

const careTypeIcons: Record<string, string> = {
  consultation: '🩺',
  pharmacy: '💊',
  lab: '🔬',
  hospital: '🏥',
  dentaire: '🦷',
  optique: '👓',
};

export default function BulletinsListScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data: bulletins, isLoading, refetch } = useQuery({
    queryKey: ['mes-bulletins'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: BulletinSoins[] }>('/bulletins-soins/me');
      if (!response.success || !response.data) {
        return [];
      }
      return (response.data as unknown as { data: BulletinSoins[] }).data ?? [];
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number | null | undefined) => {
    if (!amount) return '0.00 TND';
    return `${amount.toFixed(2)} TND`;
  };

  const renderItem = ({ item }: { item: BulletinSoins }) => {
    const config = statusConfig[item.status] || statusConfig.scan_uploaded;
    const careIcon = careTypeIcons[item.care_type] || '📋';

    return (
      <TouchableOpacity style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.careTypeRow}>
            <Text style={styles.careIcon}>{careIcon}</Text>
            <View>
              <Text style={styles.bulletinNumber}>{item.bulletin_number}</Text>
              <Text style={styles.bulletinDate}>{formatDate(item.bulletin_date)}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.bgColor }]}>
            <Text style={[styles.statusText, { color: config.color }]}>
              {config.icon} {config.label}
            </Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBody}>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Montant</Text>
            <Text style={styles.amountValue}>{formatAmount(item.total_amount)}</Text>
          </View>
          {item.status === 'reimbursed' && item.reimbursed_amount > 0 && (
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Remboursé</Text>
              <Text style={[styles.amountValue, { color: colors.success[600] }]}>
                {formatAmount(item.reimbursed_amount)}
              </Text>
            </View>
          )}
          {item.provider_name && (
            <Text style={styles.providerText}>👨‍⚕️ {item.provider_name}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Bulletins</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={bulletins ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📄</Text>
              <Text style={styles.emptyTitle}>Aucun bulletin</Text>
              <Text style={styles.emptyText}>
                Scannez un bulletin de soins pour demander un remboursement
              </Text>
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => router.push('/(main)/bulletins/nouveau')}
              >
                <Text style={styles.createButtonText}>Scanner un bulletin</Text>
              </TouchableOpacity>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary[500]]}
            />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(main)/bulletins/nouveau')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary[600],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: typography.fontWeight.bold,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  careTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  careIcon: {
    fontSize: 24,
  },
  bulletinNumber: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  bulletinDate: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.neutral[100],
    marginVertical: spacing.sm,
  },
  cardBody: {
    gap: 6,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  amountValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  providerText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  createButton: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  createButtonText: {
    color: '#fff',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },
  fabIcon: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    lineHeight: 30,
  },
});
