/**
 * Dashboard Screen for Dhamen Mobile
 * Modern UI with clean visual hierarchy and smooth animations
 */
import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { apiClient } from '@/lib/api-client';
import { getUser, clearAuth } from '@/lib/auth';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePushNotifications, getUnreadCount, setBadgeCount } from '@/hooks/usePushNotifications';
import { DashboardSkeleton } from '@/components';
import { colors, typography, spacing, shadows } from '@/theme';
import type { UserPublic, SanteDemande } from '@dhamen/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 10;
const ACTION_SIZE = (SCREEN_WIDTH - spacing[4] * 2 - CARD_GAP * 2) / 3;

interface BulletinStats {
  total: number;
  pending: number;
  inPayment: number;
  reimbursed: number;
  totalAmount: number;
  reimbursedAmount: number;
}

// Quick action card component
interface QuickActionProps {
  icon: string;
  title: string;
  onPress: () => void;
  accentColor: string;
  delay?: number;
}

function QuickAction({ icon, title, onPress, accentColor, delay = 0 }: QuickActionProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim, delay]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.quickAction}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.quickActionIconWrap, { backgroundColor: `${accentColor}18` }]}>
          <Text style={styles.quickActionIcon}>{icon}</Text>
        </View>
        <Text style={styles.quickActionTitle} numberOfLines={1}>{title}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Stat pill for bulletin stats
interface StatPillProps {
  value: number | string;
  label: string;
  icon: string;
  color: string;
}

function StatPill({ value, label, icon, color }: StatPillProps) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillIcon}>{icon}</Text>
      <Text style={[styles.statPillValue, { color }]}>{value}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const [user, setUserState] = useState<UserPublic | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const { isOnline, pendingCount, isSyncing } = useOfflineSync();
  const { registerToken } = usePushNotifications();

  // Animations
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslate = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    getUser().then(setUserState);
    registerToken();
    getUnreadCount().then((count) => {
      setUnreadCount(count);
      setBadgeCount(count);
    });

    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslate, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [registerToken, headerOpacity, contentTranslate]);

  const { data: demandes, isLoading: demandesLoading, refetch } = useQuery({
    queryKey: ['mes-demandes'],
    queryFn: async () => {
      const response = await apiClient.getPaginated<SanteDemande>(
        '/sante/demandes/mes-demandes',
        { params: { limit: 5 } }
      );
      if (response.success) {
        return response.data;
      }
      return [];
    },
  });

  const { data: bulletinStats, refetch: refetchBulletins } = useQuery({
    queryKey: ['bulletins-stats'],
    queryFn: async () => {
      const response = await apiClient.get<BulletinStats>(
        '/bulletins-soins/me/stats'
      );
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    },
  });

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchBulletins()]);
  };

  const handleLogout = async () => {
    await clearAuth();
    router.replace('/(auth)/login');
  };

  const getStatusConfig = (statut: string) => {
    const configs: Record<string, { color: string; bg: string; label: string }> = {
      soumise: { color: colors.text.secondary, bg: colors.gray[200], label: 'Soumise' },
      en_examen: { color: colors.warning.dark, bg: colors.warning.light, label: 'En examen' },
      info_requise: { color: colors.info.dark, bg: colors.info.light, label: 'Info requise' },
      approuvee: { color: colors.success.dark, bg: colors.success.light, label: 'Approuvee' },
      en_paiement: { color: colors.info.dark, bg: colors.info.light, label: 'En paiement' },
      payee: { color: colors.accent.teal, bg: '#d1fae5', label: 'Payee' },
      rejetee: { color: colors.error.dark, bg: colors.error.light, label: 'Rejetee' },
    };
    return configs[statut] || configs.soumise;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'short',
    });
  };

  const isLoading = demandesLoading;

  if (isLoading && !demandes) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Offline Banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Mode hors ligne {pendingCount > 0 ? `(${pendingCount} en attente)` : ''}
          </Text>
        </View>
      )}

      {/* Syncing indicator */}
      {isSyncing && (
        <View style={styles.syncingBanner}>
          <Text style={styles.syncingBannerText}>Synchronisation en cours...</Text>
        </View>
      )}

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <LinearGradient
          colors={[colors.primary[500], colors.primary[700] || colors.primary[600]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>Bonjour</Text>
              <Text style={styles.userName}>
                {user?.firstName} {user?.lastName}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={() => router.push('/(main)/notifications')}
                style={styles.headerBtn}
              >
                <Text style={styles.headerBtnIcon}>🔔</Text>
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/(main)/parametres')}
                style={styles.headerBtn}
              >
                <Text style={styles.headerBtnIcon}>⚙️</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ transform: [{ translateY: contentTranslate }] }}>
          {/* Bulletins Stats Card */}
          {bulletinStats && bulletinStats.total > 0 && (
            <TouchableOpacity
              style={styles.bulletinsCard}
              onPress={() => router.push('/(main)/bulletins')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.primary[500], colors.primary[600]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bulletinsGradient}
              >
                <View style={styles.bulletinsHeader}>
                  <View>
                    <Text style={styles.bulletinsTitle}>Mes Bulletins de Soins</Text>
                    <Text style={styles.bulletinsSubtitle}>
                      {bulletinStats.reimbursedAmount > 0
                        ? `${(bulletinStats.reimbursedAmount / 1000).toFixed(3)} TND rembourses`
                        : 'Suivez vos remboursements'}
                    </Text>
                  </View>
                  <Text style={styles.bulletinsArrow}>→</Text>
                </View>
                <View style={styles.bulletinsStats}>
                  <StatPill
                    value={bulletinStats.total}
                    label="Total"
                    color="#ffffff"
                    icon="📄"
                  />
                  <StatPill
                    value={bulletinStats.pending}
                    label="En attente"
                    color="#fbbf24"
                    icon="⏳"
                  />
                  <StatPill
                    value={bulletinStats.inPayment}
                    label="En paiement"
                    color="#60a5fa"
                    icon="💳"
                  />
                  <StatPill
                    value={bulletinStats.reimbursed}
                    label="Rembourses"
                    color="#34d399"
                    icon="✅"
                  />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Quick Actions - compact 3x2 grid */}
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActionsGrid}>
            <QuickAction
              icon="📷"
              title="Scanner"
              accentColor={colors.accent.teal}
              onPress={() => router.push('/(main)/bulletins/nouveau')}
              delay={100}
            />
            <QuickAction
              icon="📋"
              title="Demandes"
              accentColor={colors.primary[500]}
              onPress={() => router.push('/(main)/demandes')}
              delay={150}
            />
            <QuickAction
              icon="🛡️"
              title="Garanties"
              accentColor="#8b5cf6"
              onPress={() => router.push('/(main)/garanties')}
              delay={200}
            />
            <QuickAction
              icon="💰"
              title="Rembours."
              accentColor="#f59e0b"
              onPress={() => router.push('/(main)/remboursements')}
              delay={250}
            />
            <QuickAction
              icon="🏥"
              title="Praticiens"
              accentColor="#ec4899"
              onPress={() => router.push('/(main)/praticiens')}
              delay={300}
            />
            <QuickAction
              icon="👤"
              title="Profil"
              accentColor="#6366f1"
              onPress={() => router.push('/(main)/profil')}
              delay={350}
            />
          </View>

          {/* Recent Demandes */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Demandes recentes</Text>
            {demandes && demandes.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(main)/demandes')}>
                <Text style={styles.seeAllButton}>Voir tout</Text>
              </TouchableOpacity>
            )}
          </View>

          {demandes && demandes.length > 0 ? (
            demandes.map((demande) => {
              const statusConfig = getStatusConfig(demande.statut);
              return (
                <TouchableOpacity
                  key={demande.id}
                  style={styles.demandeCard}
                  onPress={() => router.push(`/(main)/demandes/${demande.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.demandeIconContainer}>
                    <Text style={styles.demandeIcon}>
                      {demande.typeSoin === 'pharmacie' ? '💊' : '🩺'}
                    </Text>
                  </View>
                  <View style={styles.demandeContent}>
                    <View style={styles.demandeHeader}>
                      <Text style={styles.demandeNumero}>{demande.numeroDemande}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                        <Text style={[styles.statusText, { color: statusConfig.color }]}>
                          {statusConfig.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.demandeType}>
                      {demande.typeSoin.charAt(0).toUpperCase() + demande.typeSoin.slice(1)}
                    </Text>
                    <View style={styles.demandeFooter}>
                      <Text style={styles.demandeMontant}>
                        {(demande.montantDemande / 1000).toFixed(3)} TND
                      </Text>
                      <Text style={styles.demandeDate}>
                        {formatDate(demande.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.demandeChevron}>›</Text>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>Aucune demande</Text>
              <Text style={styles.emptyText}>
                Soumettez votre premier bulletin de soins pour demander un remboursement.
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/(main)/bulletins/nouveau')}
              >
                <Text style={styles.emptyButtonText}>Scanner un bulletin</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Logout */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Deconnexion</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  offlineBanner: {
    backgroundColor: colors.error.main,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
  },
  offlineBannerText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  syncingBanner: {
    backgroundColor: colors.warning.main,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  syncingBannerText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },

  // Header
  header: {},
  headerGradient: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {},
  greeting: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  userName: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
    marginTop: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  headerBtn: {
    position: 'relative',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnIcon: {
    fontSize: 20,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.error.main,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.primary[500],
  },
  badgeText: {
    color: colors.text.inverse,
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
  },

  // Content
  content: {
    flex: 1,
    marginTop: -12,
  },
  contentContainer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: 120,
  },

  // Bulletins Card
  bulletinsCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: spacing[5],
    ...shadows.lg,
  },
  bulletinsGradient: {
    padding: spacing[4],
    paddingBottom: spacing[5],
  },
  bulletinsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  bulletinsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
  },
  bulletinsSubtitle: {
    fontSize: typography.fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  bulletinsArrow: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.6)',
  },
  bulletinsStats: {
    flexDirection: 'row',
    gap: spacing[2],
  },

  // Stat Pill
  statPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    alignItems: 'center',
  },
  statPillIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  statPillValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  statPillLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    textAlign: 'center',
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  seeAllButton: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[500],
    fontWeight: typography.fontWeight.semibold,
  },

  // Quick Actions - 3x2 grid
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    marginBottom: spacing[5],
  },
  quickAction: {
    width: ACTION_SIZE,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    ...shadows.sm,
  },
  quickActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  quickActionIcon: {
    fontSize: 24,
  },
  quickActionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    textAlign: 'center',
  },

  // Demande Card
  demandeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: spacing[4],
    marginBottom: spacing[3],
    ...shadows.sm,
  },
  demandeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  demandeIcon: {
    fontSize: 20,
  },
  demandeContent: {
    flex: 1,
  },
  demandeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  demandeNumero: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  statusBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
  },
  demandeType: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  demandeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  demandeMontant: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[500],
  },
  demandeDate: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  demandeChevron: {
    fontSize: 22,
    color: colors.text.tertiary,
    marginLeft: spacing[2],
  },

  // Empty State
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: spacing[6],
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing[3],
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[4],
    lineHeight: 20,
  },
  emptyButton: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: 12,
  },
  emptyButtonText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },

  // Logout
  logoutButton: {
    alignItems: 'center',
    paddingVertical: spacing[4],
    marginTop: spacing[6],
  },
  logoutText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    fontWeight: typography.fontWeight.medium,
  },
});
