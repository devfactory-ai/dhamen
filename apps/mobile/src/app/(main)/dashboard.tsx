/**
 * Dashboard Screen for Dhamen Mobile
 * Enhanced UX with better visual hierarchy and animations
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
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';
import type { UserPublic, SanteDemande } from '@dhamen/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  subtitle: string;
  onPress: () => void;
  gradient?: string[];
  delay?: number;
}

function QuickAction({ icon, title, subtitle, onPress, gradient, delay = 0 }: QuickActionProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

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
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }], flex: 1 }}>
      <TouchableOpacity
        style={styles.quickAction}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {gradient ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.quickActionGradient}
          >
            <Text style={styles.quickActionIcon}>{icon}</Text>
            <Text style={styles.quickActionTitleWhite}>{title}</Text>
            <Text style={styles.quickActionSubtitleWhite}>{subtitle}</Text>
          </LinearGradient>
        ) : (
          <View style={styles.quickActionInner}>
            <View style={styles.quickActionIconContainer}>
              <Text style={styles.quickActionIcon}>{icon}</Text>
            </View>
            <Text style={styles.quickActionTitle}>{title}</Text>
            <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// Stats card component
interface StatCardProps {
  value: number | string;
  label: string;
  color: string;
  icon: string;
}

function StatCard({ value, label, color, icon }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: `${color}15` }]}>
        <Text style={styles.statIcon}>{icon}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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

    // Animate entrance
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
          <Text style={styles.offlineBannerIcon}>📴</Text>
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
          colors={[colors.primary[500], colors.primary[600]]}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>Bonjour,</Text>
              <Text style={styles.userName}>
                {user?.firstName} {user?.lastName}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={() => router.push('/(main)/notifications')}
                style={styles.notificationButton}
              >
                <Text style={styles.notificationIcon}>🔔</Text>
                {unreadCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/(main)/parametres')}
                style={styles.settingsButton}
              >
                <Text style={styles.settingsIcon}>⚙️</Text>
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
              activeOpacity={0.9}
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
                  <StatCard
                    value={bulletinStats.total}
                    label="Total"
                    color="#ffffff"
                    icon="📄"
                  />
                  <StatCard
                    value={bulletinStats.pending}
                    label="En attente"
                    color="#fbbf24"
                    icon="⏳"
                  />
                  <StatCard
                    value={bulletinStats.inPayment}
                    label="En paiement"
                    color="#60a5fa"
                    icon="💳"
                  />
                  <StatCard
                    value={bulletinStats.reimbursed}
                    label="Rembourses"
                    color="#34d399"
                    icon="✅"
                  />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActions}>
            <QuickAction
              icon="📷"
              title="Scanner"
              subtitle="Nouveau bulletin"
              onPress={() => router.push('/(main)/bulletins/nouveau')}
              gradient={[colors.accent.teal, colors.accent.emerald]}
              delay={100}
            />
            <QuickAction
              icon="📋"
              title="Demandes"
              subtitle="Voir l'historique"
              onPress={() => router.push('/(main)/demandes')}
              delay={200}
            />
          </View>

          <View style={styles.quickActions}>
            <QuickAction
              icon="🛡️"
              title="Garanties"
              subtitle="Couvertures"
              onPress={() => router.push('/(main)/garanties')}
              delay={300}
            />
            <QuickAction
              icon="💰"
              title="Remboursements"
              subtitle="Historique"
              onPress={() => router.push('/(main)/remboursements')}
              delay={400}
            />
          </View>

          <View style={styles.quickActions}>
            <QuickAction
              icon="🏥"
              title="Praticiens"
              subtitle="Annuaire sante"
              onPress={() => router.push('/(main)/praticiens')}
              delay={500}
            />
            <QuickAction
              icon="👤"
              title="Mon profil"
              subtitle="Plafonds"
              onPress={() => router.push('/(main)/profil')}
              delay={600}
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
            demandes.map((demande, index) => {
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

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutIcon}>🚪</Text>
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
    backgroundColor: colors.background.primary,
  },
  offlineBanner: {
    backgroundColor: colors.error.main,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBannerIcon: {
    marginRight: spacing[2],
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
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    paddingBottom: spacing[6],
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {},
  greeting: {
    fontSize: typography.fontSize.base,
    color: colors.primary[200],
  },
  userName: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  notificationButton: {
    position: 'relative',
    padding: spacing[2],
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.lg,
  },
  notificationIcon: {
    fontSize: 22,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.error.main,
    borderRadius: borderRadius.full,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: colors.text.inverse,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  settingsButton: {
    padding: spacing[2],
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.lg,
  },
  settingsIcon: {
    fontSize: 22,
  },

  // Content
  content: {
    flex: 1,
    marginTop: -spacing[4],
  },
  contentContainer: {
    paddingHorizontal: spacing[4],
    paddingBottom: 120,
  },

  // Bulletins Card
  bulletinsCard: {
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden',
    marginBottom: spacing[5],
    ...shadows.lg,
  },
  bulletinsGradient: {
    padding: spacing[4],
  },
  bulletinsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  bulletinsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
  },
  bulletinsSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[200],
    marginTop: 2,
  },
  bulletinsArrow: {
    fontSize: 24,
    color: colors.text.inverse,
  },
  bulletinsStats: {
    flexDirection: 'row',
    gap: spacing[2],
  },

  // Stat Card
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    alignItems: 'center',
  },
  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  statIcon: {
    fontSize: 14,
  },
  statValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.8)',
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
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  seeAllButton: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[500],
    fontWeight: typography.fontWeight.medium,
  },

  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  quickAction: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  quickActionGradient: {
    padding: spacing[4],
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'center',
  },
  quickActionInner: {
    backgroundColor: colors.background.secondary,
    padding: spacing[4],
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'center',
  },
  quickActionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${colors.primary[500]}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  quickActionIcon: {
    fontSize: 24,
  },
  quickActionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginTop: spacing[1],
  },
  quickActionTitleWhite: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
    marginTop: spacing[1],
  },
  quickActionSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  quickActionSubtitleWhite: {
    fontSize: typography.fontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Demande Card
  demandeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    ...shadows.sm,
  },
  demandeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  demandeIcon: {
    fontSize: 22,
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
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  statusBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  demandeType: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  demandeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  demandeMontant: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[500],
  },
  demandeDate: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  demandeChevron: {
    fontSize: 24,
    color: colors.text.tertiary,
    marginLeft: spacing[2],
  },

  // Empty State
  emptyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing[3],
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[4],
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  emptyButtonText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },

  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    marginTop: spacing[4],
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
  },
  logoutIcon: {
    fontSize: 18,
    marginRight: spacing[2],
  },
  logoutText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
});
