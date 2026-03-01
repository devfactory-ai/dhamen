/**
 * User Profile Screen for Dhamen Mobile
 * Beautiful design with animated progress bars and coverage details
 */
import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getUser, clearAuth } from '@/lib/auth';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';
import { Skeleton } from '@/components';
import type { UserPublic } from '@dhamen/shared';

interface PlafondInfo {
  typeSoin: string;
  montantPlafond: number;
  montantConsomme: number;
  montantRestant: number;
  pourcentageUtilise: number;
}

interface FormuleInfo {
  id: string;
  code: string;
  nom: string;
  plafondGlobal: number | null;
  tarifMensuel: number;
}

interface ProfilData {
  adherent: {
    id: string;
    matricule: string;
    dateNaissance: string;
    estActif: boolean;
  };
  formule: FormuleInfo | null;
  plafonds: PlafondInfo[];
}

const TYPE_ICONS: Record<string, string> = {
  pharmacie: '💊',
  consultation: '🩺',
  analyse: '🔬',
  radiologie: '📷',
  hospitalisation: '🏥',
  dentaire: '🦷',
  optique: '👓',
};

function AnimatedProgressBar({
  percentage,
  delay,
}: {
  percentage: number;
  delay: number;
}) {
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: Math.min(100, percentage),
      duration: 1000,
      delay,
      useNativeDriver: false,
    }).start();
  }, [percentage, delay, progressAnim]);

  const getProgressColor = (pct: number) => {
    if (pct >= 90) return colors.error.main;
    if (pct >= 70) return colors.warning.main;
    return colors.success.main;
  };

  const width = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.progressBarContainer}>
      <Animated.View
        style={[
          styles.progressBarFill,
          {
            width,
            backgroundColor: getProgressColor(percentage),
          },
        ]}
      />
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View>
      {/* Avatar skeleton */}
      <View style={styles.avatarSection}>
        <Skeleton width={100} height={100} borderRadius={50} />
        <Skeleton width={160} height={24} style={{ marginTop: spacing[3] }} />
        <Skeleton width={120} height={16} style={{ marginTop: spacing[2] }} />
      </View>

      {/* Cards skeleton */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.card, { marginBottom: spacing[4] }]}>
          <Skeleton width={120} height={20} />
          <View style={{ marginTop: spacing[4] }}>
            <Skeleton width="100%" height={16} />
            <Skeleton width="80%" height={16} style={{ marginTop: spacing[2] }} />
            <Skeleton width="60%" height={16} style={{ marginTop: spacing[2] }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ProfilScreen() {
  const [user, setUserState] = useState<UserPublic | null>(null);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getUser().then(setUserState);
    Animated.stagger(200, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [headerAnim, contentAnim]);

  const { data: profil, isLoading, refetch } = useQuery({
    queryKey: ['mon-profil-sante'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: ProfilData }>(
        '/sante/profil'
      );
      if (response.success) {
        return response.data?.data || null;
      }
      return null;
    },
    retry: false,
  });

  const handleLogout = async () => {
    await clearAuth();
    router.replace('/(auth)/login');
  };

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
  };

  const getInitials = () => {
    if (!user) return '?';
    return `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase();
  };

  return (
    <View style={styles.container}>
      {/* Header with Avatar */}
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
          colors={[colors.primary[700], colors.primary[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          {/* Pattern */}
          <View style={styles.headerPattern}>
            <View style={styles.patternCircle} />
            <View style={[styles.patternCircle, styles.patternCircle2]} />
          </View>

          <SafeAreaView edges={['top']}>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>Mon Profil</Text>

              {/* Avatar */}
              <View style={styles.avatarContainer}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{getInitials()}</Text>
                </LinearGradient>
                {profil?.adherent?.estActif && (
                  <View style={styles.statusIndicator}>
                    <View style={styles.statusDot} />
                  </View>
                )}
              </View>

              <Text style={styles.userName}>
                {user?.firstName} {user?.lastName}
              </Text>
              <Text style={styles.userEmail}>{user?.email}</Text>

              {profil?.adherent && (
                <View style={styles.matriculeBadge}>
                  <Text style={styles.matriculeText}>{profil.adherent.matricule}</Text>
                </View>
              )}
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Animated.View>

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
        <Animated.View
          style={{
            opacity: contentAnim,
            transform: [
              { translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
            ],
          }}
        >
          {isLoading ? (
            <ProfileSkeleton />
          ) : (
            <>
              {/* Formule Card */}
              {profil?.formule && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIconContainer}>
                      <Text style={styles.cardIcon}>🏷️</Text>
                    </View>
                    <Text style={styles.cardTitle}>Ma Formule</Text>
                  </View>

                  <View style={styles.formuleContent}>
                    <Text style={styles.formuleName}>{profil.formule.nom}</Text>
                    <View style={styles.formuleCode}>
                      <Text style={styles.formuleCodeText}>{profil.formule.code}</Text>
                    </View>
                  </View>

                  <View style={styles.formuleDetails}>
                    {profil.formule.plafondGlobal && (
                      <View style={styles.formuleDetailRow}>
                        <Text style={styles.formuleDetailIcon}>💰</Text>
                        <View style={styles.formuleDetailContent}>
                          <Text style={styles.formuleDetailLabel}>Plafond global</Text>
                          <Text style={styles.formuleDetailValue}>
                            {formatAmount(profil.formule.plafondGlobal)}
                          </Text>
                        </View>
                      </View>
                    )}
                    <View style={styles.formuleDetailRow}>
                      <Text style={styles.formuleDetailIcon}>📅</Text>
                      <View style={styles.formuleDetailContent}>
                        <Text style={styles.formuleDetailLabel}>Cotisation mensuelle</Text>
                        <Text style={styles.formuleDetailValue}>
                          {formatAmount(profil.formule.tarifMensuel)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* Plafonds Card */}
              {profil?.plafonds && profil.plafonds.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIconContainer}>
                      <Text style={styles.cardIcon}>📊</Text>
                    </View>
                    <Text style={styles.cardTitle}>Consommation annuelle</Text>
                  </View>

                  {profil.plafonds.map((plafond, index) => (
                    <View
                      key={plafond.typeSoin}
                      style={[
                        styles.plafondItem,
                        index === profil.plafonds.length - 1 && styles.plafondItemLast,
                      ]}
                    >
                      <View style={styles.plafondHeader}>
                        <View style={styles.plafondTypeContainer}>
                          <Text style={styles.plafondIcon}>
                            {TYPE_ICONS[plafond.typeSoin] || '📋'}
                          </Text>
                          <Text style={styles.plafondType}>
                            {plafond.typeSoin.charAt(0).toUpperCase() + plafond.typeSoin.slice(1)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.plafondPercentBadge,
                            {
                              backgroundColor:
                                plafond.pourcentageUtilise >= 90
                                  ? colors.error.light
                                  : plafond.pourcentageUtilise >= 70
                                    ? colors.warning.light
                                    : colors.success.light,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.plafondPercent,
                              {
                                color:
                                  plafond.pourcentageUtilise >= 90
                                    ? colors.error.dark
                                    : plafond.pourcentageUtilise >= 70
                                      ? colors.warning.dark
                                      : colors.success.dark,
                              },
                            ]}
                          >
                            {plafond.pourcentageUtilise.toFixed(0)}%
                          </Text>
                        </View>
                      </View>

                      <AnimatedProgressBar
                        percentage={plafond.pourcentageUtilise}
                        delay={index * 150}
                      />

                      <View style={styles.plafondAmounts}>
                        <View style={styles.plafondAmountItem}>
                          <Text style={styles.plafondAmountLabel}>Consomme</Text>
                          <Text style={styles.plafondAmountValue}>
                            {formatAmount(plafond.montantConsomme)}
                          </Text>
                        </View>
                        <View style={styles.plafondAmountItem}>
                          <Text style={styles.plafondAmountLabel}>Restant</Text>
                          <Text style={[styles.plafondAmountValue, styles.plafondAmountRestant]}>
                            {formatAmount(plafond.montantRestant)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* No coverage */}
              {!profil?.formule && !isLoading && (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconContainer}>
                    <Text style={styles.emptyIcon}>📋</Text>
                  </View>
                  <Text style={styles.emptyTitle}>Aucune formule</Text>
                  <Text style={styles.emptyText}>
                    Aucune formule de garantie associee a votre compte.
                    Contactez votre gestionnaire pour plus d'informations.
                  </Text>
                </View>
              )}

              {/* Menu Items */}
              <View style={styles.menuSection}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => router.push('/(main)/garanties')}
                >
                  <View style={[styles.menuIconContainer, { backgroundColor: colors.primary[50] }]}>
                    <Text style={styles.menuIcon}>🛡️</Text>
                  </View>
                  <View style={styles.menuContent}>
                    <Text style={styles.menuTitle}>Mes Garanties</Text>
                    <Text style={styles.menuSubtitle}>Details de couverture</Text>
                  </View>
                  <Text style={styles.menuChevron}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => router.push('/(main)/remboursements')}
                >
                  <View style={[styles.menuIconContainer, { backgroundColor: colors.success.light }]}>
                    <Text style={styles.menuIcon}>💵</Text>
                  </View>
                  <View style={styles.menuContent}>
                    <Text style={styles.menuTitle}>Remboursements</Text>
                    <Text style={styles.menuSubtitle}>Historique des paiements</Text>
                  </View>
                  <Text style={styles.menuChevron}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => router.push('/(main)/parametres')}
                >
                  <View style={[styles.menuIconContainer, { backgroundColor: colors.gray[100] }]}>
                    <Text style={styles.menuIcon}>⚙️</Text>
                  </View>
                  <View style={styles.menuContent}>
                    <Text style={styles.menuTitle}>Parametres</Text>
                    <Text style={styles.menuSubtitle}>Notifications, securite</Text>
                  </View>
                  <Text style={styles.menuChevron}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemDanger]}
                  onPress={handleLogout}
                >
                  <View style={[styles.menuIconContainer, { backgroundColor: colors.error.light }]}>
                    <Text style={styles.menuIcon}>🚪</Text>
                  </View>
                  <View style={styles.menuContent}>
                    <Text style={[styles.menuTitle, styles.menuTitleDanger]}>Deconnexion</Text>
                    <Text style={styles.menuSubtitle}>Se deconnecter du compte</Text>
                  </View>
                  <Text style={[styles.menuChevron, styles.menuChevronDanger]}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Version */}
              <Text style={styles.versionText}>Dhamen Mobile v1.0.0</Text>
            </>
          )}
        </Animated.View>
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
    paddingBottom: spacing[8],
    borderBottomLeftRadius: borderRadius['3xl'],
    borderBottomRightRadius: borderRadius['3xl'],
    overflow: 'hidden',
  },
  headerPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  patternCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -80,
    right: -80,
  },
  patternCircle2: {
    top: undefined,
    bottom: -50,
    left: -100,
    right: undefined,
  },
  headerContent: {
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: Platform.OS === 'android' ? spacing[10] : spacing[4],
    paddingBottom: spacing[4],
  },
  headerTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[200],
    marginBottom: spacing[4],
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success.main,
  },
  userName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
    marginTop: spacing[3],
  },
  userEmail: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[200],
    marginTop: spacing[1],
  },
  matriculeBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    marginTop: spacing[3],
  },
  matriculeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  content: {
    flex: 1,
    marginTop: -spacing[4],
  },
  contentContainer: {
    padding: spacing[5],
    paddingBottom: spacing[24],
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    marginBottom: spacing[4],
    ...shadows.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  cardIcon: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  formuleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  formuleName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
    flex: 1,
  },
  formuleCode: {
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
  },
  formuleCodeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  formuleDetails: {
    gap: spacing[3],
  },
  formuleDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formuleDetailIcon: {
    fontSize: 16,
    marginRight: spacing[3],
  },
  formuleDetailContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formuleDetailLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  formuleDetailValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  plafondItem: {
    paddingBottom: spacing[4],
    marginBottom: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  plafondItemLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  plafondHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  plafondTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plafondIcon: {
    fontSize: 18,
    marginRight: spacing[2],
  },
  plafondType: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  plafondPercentBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  plafondPercent: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.gray[100],
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing[3],
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  plafondAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  plafondAmountItem: {},
  plafondAmountLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  plafondAmountValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginTop: 2,
  },
  plafondAmountRestant: {
    color: colors.success.main,
  },
  emptyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[8],
    alignItems: 'center',
    marginBottom: spacing[4],
    ...shadows.sm,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  emptyIcon: {
    fontSize: 36,
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
    lineHeight: 22,
  },
  menuSection: {
    marginTop: spacing[2],
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    ...shadows.sm,
  },
  menuItemDanger: {
    borderWidth: 1,
    borderColor: colors.error.light,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  menuIcon: {
    fontSize: 20,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  menuTitleDanger: {
    color: colors.error.main,
  },
  menuSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  menuChevron: {
    fontSize: typography.fontSize['2xl'],
    color: colors.text.tertiary,
    marginLeft: spacing[2],
  },
  menuChevronDanger: {
    color: colors.error.main,
  },
  versionText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing[6],
    marginBottom: spacing[4],
  },
});
