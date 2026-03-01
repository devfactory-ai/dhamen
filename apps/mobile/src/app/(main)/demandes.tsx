/**
 * Demandes Screen for Dhamen Mobile
 * Shows list of care requests with filters and beautiful design
 */
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';
import { Skeleton, SkeletonCard } from '@/components';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Demande {
  id: string;
  numeroDemande: string;
  typeSoin: string;
  statut: string;
  montantDemande: number;
  montantAccepte: number | null;
  dateCreation: string;
  prestataire?: {
    nom: string;
    type: string;
  };
}

interface DemandesResponse {
  demandes: Demande[];
  meta: { total: number };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  brouillon: { label: 'Brouillon', color: colors.gray[600], bg: colors.gray[100], icon: '📝' },
  soumis: { label: 'Soumis', color: colors.info.dark, bg: colors.info.light, icon: '📤' },
  en_cours: { label: 'En cours', color: colors.warning.dark, bg: colors.warning.light, icon: '⏳' },
  accepte: { label: 'Accepte', color: colors.success.dark, bg: colors.success.light, icon: '✅' },
  refuse: { label: 'Refuse', color: colors.error.dark, bg: colors.error.light, icon: '❌' },
  rembourse: { label: 'Rembourse', color: colors.primary[600], bg: colors.primary[50], icon: '💰' },
};

const TYPE_ICONS: Record<string, string> = {
  pharmacie: '💊',
  consultation: '🩺',
  analyse: '🔬',
  radiologie: '📷',
  hospitalisation: '🏥',
  dentaire: '🦷',
  optique: '👓',
};

const FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'accepte', label: 'Acceptees' },
  { value: 'refuse', label: 'Refusees' },
];

function DemandeCard({
  demande,
  index,
}: {
  demande: Demande;
  index: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const config = STATUS_CONFIG[demande.statut] || STATUS_CONFIG.brouillon;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: index * 80,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [index, scaleAnim]);

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <Animated.View
      style={[
        styles.demandeCard,
        {
          opacity: scaleAnim,
          transform: [
            { scale: scaleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/(main)/bulletins/${demande.id}`)}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.typeIcon, { backgroundColor: colors.primary[50] }]}>
              <Text style={styles.typeIconText}>
                {TYPE_ICONS[demande.typeSoin] || '📋'}
              </Text>
            </View>
            <View>
              <Text style={styles.cardTitle}>{demande.numeroDemande}</Text>
              <Text style={styles.cardSubtitle}>
                {demande.typeSoin.charAt(0).toUpperCase() + demande.typeSoin.slice(1)}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
            <Text style={styles.statusIcon}>{config.icon}</Text>
            <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          {demande.prestataire && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>🏪</Text>
              <Text style={styles.infoText} numberOfLines={1}>
                {demande.prestataire.nom}
              </Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📅</Text>
            <Text style={styles.infoText}>{formatDate(demande.dateCreation)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Demande</Text>
            <Text style={styles.amountValue}>{formatAmount(demande.montantDemande)}</Text>
          </View>
          {demande.montantAccepte !== null && (
            <View style={styles.amountContainer}>
              <Text style={styles.amountLabel}>Accepte</Text>
              <Text style={[styles.amountValue, styles.amountAccepted]}>
                {formatAmount(demande.montantAccepte)}
              </Text>
            </View>
          )}
          <View style={styles.chevronContainer}>
            <Text style={styles.chevron}>→</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <Skeleton width={48} height={48} borderRadius={12} />
            <View style={{ flex: 1, marginLeft: spacing[3] }}>
              <Skeleton width={120} height={16} />
              <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
            </View>
            <Skeleton width={80} height={24} borderRadius={12} />
          </View>
          <View style={styles.skeletonContent}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="50%" height={14} style={{ marginTop: 8 }} />
          </View>
          <View style={styles.skeletonFooter}>
            <Skeleton width={80} height={20} />
            <Skeleton width={80} height={20} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function DemandesScreen() {
  const [filter, setFilter] = useState('all');
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mes-demandes-sante', filter],
    queryFn: async () => {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const response = await apiClient.get<{ success: boolean; data: DemandesResponse }>(
        `/sante/demandes${params}`
      );
      if (response.success && response.data?.data) {
        return response.data.data;
      }
      return { demandes: [], meta: { total: 0 } };
    },
  });

  const demandes = data?.demandes || [];
  const total = data?.meta?.total || 0;

  return (
    <View style={styles.container}>
      {/* Animated Header */}
      <Animated.View
        style={[
          styles.headerWrapper,
          {
            opacity: headerAnim,
            transform: [
              { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[colors.primary[600], colors.primary[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <SafeAreaView edges={['top']}>
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.headerTitle}>Mes Demandes</Text>
                <Text style={styles.headerSubtitle}>
                  {total} demande{total !== 1 ? 's' : ''} de prise en charge
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push('/(main)/bulletins/nouveau')}
              >
                <Text style={styles.addButtonIcon}>+</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Animated.View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterTab, filter === f.value && styles.filterTabActive]}
              onPress={() => setFilter(f.value)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  filter === f.value && styles.filterTabTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.primary[500]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <LoadingSkeleton />
        ) : demandes.length > 0 ? (
          demandes.map((demande, index) => (
            <DemandeCard key={demande.id} demande={demande} index={index} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>📋</Text>
            </View>
            <Text style={styles.emptyTitle}>Aucune demande</Text>
            <Text style={styles.emptyText}>
              Vous n'avez pas encore de demande de prise en charge
              {filter !== 'all' ? ` avec le statut "${FILTERS.find((f) => f.value === filter)?.label}"` : ''}.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/(main)/bulletins/nouveau')}
            >
              <Text style={styles.emptyButtonText}>Nouvelle demande</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  headerWrapper: {
    zIndex: 10,
  },
  header: {
    paddingBottom: spacing[4],
    borderBottomLeftRadius: borderRadius['2xl'],
    borderBottomRightRadius: borderRadius['2xl'],
    ...shadows.lg,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: Platform.OS === 'android' ? spacing[10] : spacing[4],
    paddingBottom: spacing[2],
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[200],
    marginTop: spacing[1],
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonIcon: {
    fontSize: 28,
    fontWeight: typography.fontWeight.light,
    color: colors.text.inverse,
  },
  filterContainer: {
    backgroundColor: colors.background.secondary,
    paddingVertical: spacing[3],
    marginTop: -spacing[3],
    zIndex: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  filterScroll: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  filterTab: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[100],
    marginRight: spacing[2],
  },
  filterTabActive: {
    backgroundColor: colors.primary[500],
  },
  filterTabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
  },
  filterTabTextActive: {
    color: colors.text.inverse,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing[4],
    paddingBottom: spacing[24],
  },
  demandeCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    marginBottom: spacing[3],
    ...shadows.md,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  typeIconText: {
    fontSize: 24,
  },
  cardTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  statusIcon: {
    fontSize: 12,
    marginRight: spacing[1],
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  cardContent: {
    padding: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  infoIcon: {
    fontSize: 14,
    marginRight: spacing[2],
  },
  infoText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    paddingTop: spacing[2],
    backgroundColor: colors.gray[50],
  },
  amountContainer: {
    marginRight: spacing[6],
  },
  amountLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  amountValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginTop: 2,
  },
  amountAccepted: {
    color: colors.success.main,
  },
  chevronContainer: {
    marginLeft: 'auto',
  },
  chevron: {
    fontSize: 20,
    color: colors.primary[500],
  },
  skeletonContainer: {
    gap: spacing[3],
  },
  skeletonCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    ...shadows.sm,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  skeletonContent: {
    marginBottom: spacing[3],
  },
  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[12],
    paddingHorizontal: spacing[6],
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[5],
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[6],
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  emptyButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
  },
});
