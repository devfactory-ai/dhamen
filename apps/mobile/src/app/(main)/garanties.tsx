/**
 * Guarantees Screen with enhanced design
 */
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Skeleton } from '@/components/Skeleton';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';

interface GarantieActe {
  codeActe: string;
  libelleActe: string;
  tauxCouverture: number;
  plafondActe: number | null;
  franchiseActe: number;
  delaiCarence: number;
  estActif: boolean;
}

interface GarantieType {
  typeSoin: string;
  libelle: string;
  tauxBase: number;
  plafondAnnuel: number | null;
  montantConsomme: number;
  montantRestant: number;
  pourcentageUtilise: number;
  actes: GarantieActe[];
}

interface GarantiesData {
  formule: {
    id: string;
    code: string;
    nom: string;
    description: string;
    dateEffet: string;
    dateFin: string | null;
  };
  garanties: GarantieType[];
}

function AnimatedProgressBar({
  percentage,
  delay = 0,
}: {
  percentage: number;
  delay?: number;
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
    if (pct >= 90) return colors.error[500];
    if (pct >= 70) return colors.warning[500];
    return colors.success[500];
  };

  return (
    <View style={styles.progressBar}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            width: progressAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
            backgroundColor: getProgressColor(percentage),
          },
        ]}
      />
    </View>
  );
}

function GarantieCard({
  garantie,
  index,
  onPress,
}: {
  garantie: GarantieType;
  index: number;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay: index * 80,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, scaleAnim, opacityAnim]);

  const getTypeSoinIcon = (typeSoin: string): string => {
    const icons: Record<string, string> = {
      consultation: '🩺',
      pharmacie: '💊',
      hospitalisation: '🏥',
      analyse: '🔬',
      radiologie: '📷',
      dentaire: '🦷',
      optique: '👓',
      maternite: '👶',
      autre: '📋',
    };
    return icons[typeSoin] || '📋';
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 90) return colors.error[500];
    if (pct >= 70) return colors.warning[500];
    return colors.success[500];
  };

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
      }}
    >
      <TouchableOpacity
        style={styles.garantieCard}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.garantieHeader}>
          <View style={styles.garantieIconContainer}>
            <Text style={styles.garantieIcon}>
              {getTypeSoinIcon(garantie.typeSoin)}
            </Text>
          </View>
          <View style={styles.garantieInfo}>
            <Text style={styles.garantieType}>{garantie.libelle}</Text>
            <Text style={styles.garantieTaux}>
              Taux de base: {garantie.tauxBase}%
            </Text>
          </View>
          <View style={styles.garantieChevron}>
            <Text style={styles.chevronText}>›</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Consommation annuelle</Text>
            <Text
              style={[
                styles.progressPercent,
                { color: getProgressColor(garantie.pourcentageUtilise) },
              ]}
            >
              {garantie.pourcentageUtilise.toFixed(0)}%
            </Text>
          </View>
          <AnimatedProgressBar
            percentage={garantie.pourcentageUtilise}
            delay={index * 80 + 300}
          />
          <View style={styles.progressAmounts}>
            <Text style={styles.progressConsumed}>
              Consommé: {formatAmount(garantie.montantConsomme)}
            </Text>
            <Text style={styles.progressRemaining}>
              Restant: {formatAmount(garantie.montantRestant)}
            </Text>
          </View>
        </View>

        {/* Plafond */}
        {garantie.plafondAnnuel && (
          <View style={styles.plafondInfo}>
            <Text style={styles.plafondLabel}>Plafond annuel:</Text>
            <Text style={styles.plafondValue}>
              {formatAmount(garantie.plafondAnnuel)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.skeletonFormule}>
        <Skeleton width="60%" height={20} borderRadius={10} />
        <Skeleton
          width="100%"
          height={14}
          borderRadius={7}
          style={{ marginTop: 12 }}
        />
        <Skeleton
          width="40%"
          height={12}
          borderRadius={6}
          style={{ marginTop: 12 }}
        />
      </View>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <Skeleton width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Skeleton width="70%" height={16} borderRadius={8} />
              <Skeleton
                width="40%"
                height={12}
                borderRadius={6}
                style={{ marginTop: 6 }}
              />
            </View>
          </View>
          <Skeleton
            width="100%"
            height={8}
            borderRadius={4}
            style={{ marginTop: 16 }}
          />
        </View>
      ))}
    </View>
  );
}

export default function GarantiesScreen() {
  const [selectedGarantie, setSelectedGarantie] = useState<GarantieType | null>(
    null
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const {
    data: garantiesData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['mes-garanties'],
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean;
        data: GarantiesData;
      }>('/sante/profil/guarantees');
      if (response.success) {
        return response.data?.data || null;
      }
      return null;
    },
    retry: false,
  });

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
  };

  const getTypeSoinIcon = (typeSoin: string): string => {
    const icons: Record<string, string> = {
      consultation: '🩺',
      pharmacie: '💊',
      hospitalisation: '🏥',
      analyse: '🔬',
      radiologie: '📷',
      dentaire: '🦷',
      optique: '👓',
      maternite: '👶',
      autre: '📋',
    };
    return icons[typeSoin] || '📋';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary[600], colors.primary[700]]}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Mes Garanties</Text>
            {garantiesData?.formule && (
              <Text style={styles.headerSubtitle}>
                {garantiesData.formule.nom}
              </Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[colors.primary[500]]}
                tintColor={colors.primary[500]}
              />
            }
          >
            {/* Formule Summary */}
            {garantiesData?.formule && (
              <View style={styles.formuleCard}>
                <View style={styles.formuleHeader}>
                  <Text style={styles.formuleName}>
                    {garantiesData.formule.nom}
                  </Text>
                  <View style={styles.formuleBadge}>
                    <Text style={styles.formuleBadgeText}>
                      {garantiesData.formule.code}
                    </Text>
                  </View>
                </View>
                <Text style={styles.formuleDescription}>
                  {garantiesData.formule.description}
                </Text>
                <View style={styles.formuleDates}>
                  <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>Début</Text>
                    <Text style={styles.dateValue}>
                      {new Date(
                        garantiesData.formule.dateEffet
                      ).toLocaleDateString('fr-TN')}
                    </Text>
                  </View>
                  {garantiesData.formule.dateFin && (
                    <View style={styles.dateItem}>
                      <Text style={styles.dateLabel}>Fin</Text>
                      <Text style={styles.dateValue}>
                        {new Date(
                          garantiesData.formule.dateFin
                        ).toLocaleDateString('fr-TN')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Guarantees List */}
            <Text style={styles.sectionTitle}>
              Couvertures par type de soin
            </Text>

            {garantiesData?.garanties.map((garantie, index) => (
              <GarantieCard
                key={garantie.typeSoin}
                garantie={garantie}
                index={index}
                onPress={() => setSelectedGarantie(garantie)}
              />
            ))}

            {/* No guarantees */}
            {(!garantiesData?.garanties ||
              garantiesData.garanties.length === 0) &&
              !isLoading && (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconContainer}>
                    <Text style={styles.emptyIcon}>📋</Text>
                  </View>
                  <Text style={styles.emptyText}>
                    Aucune garantie disponible
                  </Text>
                  <Text style={styles.emptySubtext}>
                    Contactez votre assureur pour plus d'informations sur votre
                    couverture.
                  </Text>
                </View>
              )}

            <View style={{ height: spacing['2xl'] }} />
          </ScrollView>
        )}
      </Animated.View>

      {/* Detail Modal */}
      <Modal
        visible={selectedGarantie !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedGarantie(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {getTypeSoinIcon(selectedGarantie?.typeSoin || '')}{' '}
                {selectedGarantie?.libelle}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedGarantie(null)}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Coverage Summary */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>
                  Résumé de la couverture
                </Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Taux de base</Text>
                  <Text style={styles.modalValue}>
                    {selectedGarantie?.tauxBase}%
                  </Text>
                </View>
                {selectedGarantie?.plafondAnnuel && (
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Plafond annuel</Text>
                    <Text style={styles.modalValue}>
                      {formatAmount(selectedGarantie.plafondAnnuel)}
                    </Text>
                  </View>
                )}
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Montant consommé</Text>
                  <Text style={[styles.modalValue, styles.consumed]}>
                    {formatAmount(selectedGarantie?.montantConsomme || 0)}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Montant restant</Text>
                  <Text style={[styles.modalValue, styles.remaining]}>
                    {formatAmount(selectedGarantie?.montantRestant || 0)}
                  </Text>
                </View>
              </View>

              {/* Actes Details */}
              {selectedGarantie?.actes &&
                selectedGarantie.actes.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>
                      Détail par acte
                    </Text>
                    {selectedGarantie.actes.map((acte) => (
                      <View key={acte.codeActe} style={styles.acteCard}>
                        <View style={styles.acteHeader}>
                          <Text style={styles.acteCode}>{acte.codeActe}</Text>
                          {!acte.estActif && (
                            <View style={styles.inactiveBadge}>
                              <Text style={styles.inactiveBadgeText}>
                                Inactif
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.acteLibelle}>
                          {acte.libelleActe}
                        </Text>
                        <View style={styles.acteDetails}>
                          <View style={styles.acteDetailItem}>
                            <Text style={styles.acteDetailLabel}>Taux</Text>
                            <Text style={styles.acteDetailValue}>
                              {acte.tauxCouverture}%
                            </Text>
                          </View>
                          {acte.plafondActe && (
                            <View style={styles.acteDetailItem}>
                              <Text style={styles.acteDetailLabel}>
                                Plafond
                              </Text>
                              <Text style={styles.acteDetailValue}>
                                {formatAmount(acte.plafondActe)}
                              </Text>
                            </View>
                          )}
                          {acte.franchiseActe > 0 && (
                            <View style={styles.acteDetailItem}>
                              <Text style={styles.acteDetailLabel}>
                                Franchise
                              </Text>
                              <Text style={styles.acteDetailValue}>
                                {formatAmount(acte.franchiseActe)}
                              </Text>
                            </View>
                          )}
                          {acte.delaiCarence > 0 && (
                            <View style={styles.acteDetailItem}>
                              <Text style={styles.acteDetailLabel}>
                                Carence
                              </Text>
                              <Text style={styles.acteDetailValue}>
                                {acte.delaiCarence} jours
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: typography.fontWeight.bold,
  },
  headerCenter: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[100],
    marginTop: 2,
  },
  content: {
    flex: 1,
    marginTop: -spacing.lg,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
    padding: spacing.lg,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
  skeletonFormule: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  skeletonCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formuleCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary[500],
    ...shadows.md,
  },
  formuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  formuleName: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[700],
  },
  formuleBadge: {
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
  },
  formuleBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  formuleDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  formuleDates: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  dateItem: {},
  dateLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  dateValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  garantieCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  garantieHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  garantieIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  garantieIcon: {
    fontSize: 22,
  },
  garantieInfo: {
    flex: 1,
  },
  garantieType: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  garantieTaux: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  garantieChevron: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronText: {
    fontSize: 24,
    color: colors.text.tertiary,
  },
  progressSection: {
    marginBottom: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  progressPercent: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.neutral[100],
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressConsumed: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  progressRemaining: {
    fontSize: typography.fontSize.xs,
    color: colors.success[600],
    fontWeight: typography.fontWeight.medium,
  },
  plafondInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  plafondLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  plafondValue: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  emptyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    fontSize: 36,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.neutral[300],
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  modalTitle: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 24,
    color: colors.text.secondary,
    lineHeight: 26,
  },
  modalBody: {
    padding: spacing.lg,
  },
  modalSection: {
    marginBottom: spacing.xl,
  },
  modalSectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  modalLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  modalValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  consumed: {
    color: colors.error[600],
  },
  remaining: {
    color: colors.success[600],
  },
  acteCard: {
    backgroundColor: colors.neutral[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  acteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  acteCode: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  inactiveBadge: {
    backgroundColor: colors.error[500],
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  inactiveBadgeText: {
    fontSize: typography.fontSize.xs,
    color: '#fff',
    fontWeight: typography.fontWeight.medium,
  },
  acteLibelle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  acteDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  acteDetailItem: {
    minWidth: '40%',
  },
  acteDetailLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  acteDetailValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
});
