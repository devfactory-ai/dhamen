/**
 * Reimbursements Screen with enhanced design
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
  FlatList,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Skeleton } from '@/components/Skeleton';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';

interface Remboursement {
  id: string;
  numeroPaiement: string;
  demandeId: string;
  numeroDemande: string;
  montantRembourse: number;
  montantDemande: number;
  tauxRemboursement: number;
  dateRemboursement: string;
  methodePaiement: 'virement' | 'cheque' | 'especes';
  referenceVirement: string | null;
  statut: 'en_attente' | 'valide' | 'envoye' | 'recu';
  typeSoin: string;
  praticien: {
    nom: string;
    specialite: string;
  } | null;
}

interface RemboursementsSummary {
  totalRembourse: number;
  nombreRemboursements: number;
  moyenneTaux: number;
  dernierRemboursement: string | null;
}

interface RemboursementsData {
  summary: RemboursementsSummary;
  remboursements: Remboursement[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

function SummaryCard({
  icon,
  value,
  label,
  color,
  delay,
}: {
  icon: string;
  value: string;
  label: string;
  color: string;
  delay: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [delay, scaleAnim]);

  return (
    <Animated.View
      style={[styles.summaryCard, { transform: [{ scale: scaleAnim }] }]}
    >
      <View style={[styles.summaryIconContainer, { backgroundColor: color + '20' }]}>
        <Text style={styles.summaryIcon}>{icon}</Text>
      </View>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Animated.View>
  );
}

function RemboursementCard({
  remboursement,
  index,
  onPress,
}: {
  remboursement: Remboursement;
  index: number;
  onPress: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, slideAnim, opacityAnim]);

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

  const getStatusColor = (statut: string) => {
    switch (statut) {
      case 'recu':
        return colors.success[500];
      case 'envoye':
        return colors.info[500];
      case 'valide':
        return colors.warning[500];
      case 'en_attente':
        return colors.neutral[400];
      default:
        return colors.neutral[400];
    }
  };

  const getStatusLabel = (statut: string) => {
    const labels: Record<string, string> = {
      en_attente: 'En attente',
      valide: 'Validé',
      envoye: 'Envoyé',
      recu: 'Reçu',
    };
    return labels[statut] || statut;
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
    <Animated.View
      style={{
        transform: [{ translateY: slideAnim }],
        opacity: opacityAnim,
      }}
    >
      <TouchableOpacity
        style={styles.remboursementCard}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.remboursementHeader}>
          <View style={styles.remboursementIcon}>
            <Text style={styles.iconText}>
              {getTypeSoinIcon(remboursement.typeSoin)}
            </Text>
          </View>
          <View style={styles.remboursementInfo}>
            <Text style={styles.remboursementNumero}>
              {remboursement.numeroPaiement}
            </Text>
            <Text style={styles.remboursementDate}>
              {formatDate(remboursement.dateRemboursement)}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(remboursement.statut) + '20' },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(remboursement.statut) },
              ]}
            >
              {getStatusLabel(remboursement.statut)}
            </Text>
          </View>
        </View>

        <View style={styles.remboursementBody}>
          <View style={styles.montantRow}>
            <View style={styles.montantItem}>
              <Text style={styles.montantLabel}>Demandé</Text>
              <Text style={styles.montantValue}>
                {formatAmount(remboursement.montantDemande)}
              </Text>
            </View>
            <View style={styles.montantArrow}>
              <Text style={styles.arrowText}>→</Text>
            </View>
            <View style={styles.montantItem}>
              <Text style={styles.montantLabel}>Remboursé</Text>
              <Text style={[styles.montantValue, styles.montantRembourse]}>
                {formatAmount(remboursement.montantRembourse)}
              </Text>
            </View>
            <View style={styles.tauxContainer}>
              <Text style={styles.tauxValue}>
                {remboursement.tauxRemboursement}%
              </Text>
            </View>
          </View>

          {remboursement.praticien && (
            <View style={styles.praticienRow}>
              <Text style={styles.praticienText}>
                {remboursement.praticien.nom} -{' '}
                {remboursement.praticien.specialite}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.summaryContainer}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonSummary}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <Skeleton
              width="60%"
              height={20}
              borderRadius={10}
              style={{ marginTop: 8 }}
            />
            <Skeleton
              width="80%"
              height={12}
              borderRadius={6}
              style={{ marginTop: 4 }}
            />
          </View>
        ))}
      </View>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <Skeleton width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Skeleton width="50%" height={16} borderRadius={8} />
              <Skeleton
                width="30%"
                height={12}
                borderRadius={6}
                style={{ marginTop: 6 }}
              />
            </View>
            <Skeleton width={60} height={24} borderRadius={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function RemboursementsScreen() {
  const [selectedRemboursement, setSelectedRemboursement] =
    useState<Remboursement | null>(null);
  const [page, setPage] = useState(1);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mes-remboursements', page],
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean;
        data: RemboursementsData;
      }>('/sante/profil/reimbursements', { params: { page, limit: 20 } });
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getMethodeLabel = (methode: string) => {
    const labels: Record<string, string> = {
      virement: 'Virement bancaire',
      cheque: 'Chèque',
      especes: 'Espèces',
    };
    return labels[methode] || methode;
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

  const getStatusColor = (statut: string) => {
    switch (statut) {
      case 'recu':
        return colors.success[500];
      case 'envoye':
        return colors.info[500];
      case 'valide':
        return colors.warning[500];
      case 'en_attente':
        return colors.neutral[400];
      default:
        return colors.neutral[400];
    }
  };

  const getStatusLabel = (statut: string) => {
    const labels: Record<string, string> = {
      en_attente: 'En attente',
      valide: 'Validé',
      envoye: 'Envoyé',
      recu: 'Reçu',
    };
    return labels[statut] || statut;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={[colors.success[600], colors.success[700]]}
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
            <Text style={styles.headerTitle}>Mes Remboursements</Text>
            <Text style={styles.headerSubtitle}>Historique des paiements</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <FlatList
            data={data?.remboursements || []}
            renderItem={({ item, index }) => (
              <RemboursementCard
                remboursement={item}
                index={index}
                onPress={() => setSelectedRemboursement(item)}
              />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isFetching && !isLoading}
                onRefresh={refetch}
                colors={[colors.success[500]]}
                tintColor={colors.success[500]}
              />
            }
            ListHeaderComponent={
              data?.summary ? (
                <View style={styles.summaryContainer}>
                  <SummaryCard
                    icon="💰"
                    value={formatAmount(data.summary.totalRembourse)}
                    label="Total remboursé"
                    color={colors.success[500]}
                    delay={0}
                  />
                  <SummaryCard
                    icon="📋"
                    value={String(data.summary.nombreRemboursements)}
                    label="Remboursements"
                    color={colors.primary[500]}
                    delay={100}
                  />
                  <SummaryCard
                    icon="📊"
                    value={`${data.summary.moyenneTaux.toFixed(0)}%`}
                    label="Taux moyen"
                    color={colors.info[500]}
                    delay={200}
                  />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconContainer}>
                  <Text style={styles.emptyIcon}>💰</Text>
                </View>
                <Text style={styles.emptyText}>Aucun remboursement</Text>
                <Text style={styles.emptySubtext}>
                  Vos remboursements apparaîtront ici une fois vos demandes
                  traitées.
                </Text>
              </View>
            }
            onEndReached={() => {
              if (
                data?.pagination &&
                page < Math.ceil(data.pagination.total / data.pagination.limit)
              ) {
                setPage(page + 1);
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetching && !isLoading ? (
                <View style={styles.loadingMore}>
                  <Text style={styles.loadingText}>Chargement...</Text>
                </View>
              ) : (
                <View style={{ height: spacing['2xl'] }} />
              )
            }
          />
        )}
      </Animated.View>

      {/* Detail Modal */}
      <Modal
        visible={selectedRemboursement !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedRemboursement(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Détail du remboursement</Text>
              <TouchableOpacity
                onPress={() => setSelectedRemboursement(null)}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Status Badge */}
              <View style={styles.modalStatusContainer}>
                <View
                  style={[
                    styles.modalStatusBadge,
                    {
                      backgroundColor:
                        getStatusColor(selectedRemboursement?.statut || '') +
                        '20',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalStatusText,
                      {
                        color: getStatusColor(
                          selectedRemboursement?.statut || ''
                        ),
                      },
                    ]}
                  >
                    {getStatusLabel(selectedRemboursement?.statut || '')}
                  </Text>
                </View>
              </View>

              {/* Amount Highlight */}
              <View style={styles.amountHighlight}>
                <Text style={styles.amountHighlightLabel}>
                  Montant remboursé
                </Text>
                <Text style={styles.amountHighlightValue}>
                  {formatAmount(selectedRemboursement?.montantRembourse || 0)}
                </Text>
              </View>

              {/* Details */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Informations</Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>N° Paiement</Text>
                  <Text style={styles.modalValue}>
                    {selectedRemboursement?.numeroPaiement}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>N° Demande</Text>
                  <Text style={styles.modalValue}>
                    {selectedRemboursement?.numeroDemande}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Date remboursement</Text>
                  <Text style={styles.modalValue}>
                    {selectedRemboursement?.dateRemboursement
                      ? formatDate(selectedRemboursement.dateRemboursement)
                      : '-'}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Type de soin</Text>
                  <Text style={styles.modalValue}>
                    {getTypeSoinIcon(selectedRemboursement?.typeSoin || '')}{' '}
                    {selectedRemboursement?.typeSoin}
                  </Text>
                </View>
              </View>

              {/* Amounts */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Montants</Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Montant demandé</Text>
                  <Text style={styles.modalValue}>
                    {formatAmount(selectedRemboursement?.montantDemande || 0)}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Montant remboursé</Text>
                  <Text style={[styles.modalValue, styles.valueGreen]}>
                    {formatAmount(selectedRemboursement?.montantRembourse || 0)}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Taux de remboursement</Text>
                  <Text style={styles.modalValue}>
                    {selectedRemboursement?.tauxRemboursement}%
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Reste à charge</Text>
                  <Text style={[styles.modalValue, styles.valueRed]}>
                    {formatAmount(
                      (selectedRemboursement?.montantDemande || 0) -
                        (selectedRemboursement?.montantRembourse || 0)
                    )}
                  </Text>
                </View>
              </View>

              {/* Payment Method */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Mode de paiement</Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Méthode</Text>
                  <Text style={styles.modalValue}>
                    {getMethodeLabel(
                      selectedRemboursement?.methodePaiement || ''
                    )}
                  </Text>
                </View>
                {selectedRemboursement?.referenceVirement && (
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Référence virement</Text>
                    <Text style={[styles.modalValue, styles.mono]}>
                      {selectedRemboursement.referenceVirement}
                    </Text>
                  </View>
                )}
              </View>

              {/* Praticien */}
              {selectedRemboursement?.praticien && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Praticien</Text>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Nom</Text>
                    <Text style={styles.modalValue}>
                      {selectedRemboursement.praticien.nom}
                    </Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Spécialité</Text>
                    <Text style={styles.modalValue}>
                      {selectedRemboursement.praticien.specialite}
                    </Text>
                  </View>
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
    color: 'rgba(255,255,255,0.8)',
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
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  summaryIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  summaryIcon: {
    fontSize: 18,
  },
  summaryValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  summaryLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
    textAlign: 'center',
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
  skeletonSummary: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  skeletonCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  remboursementCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  remboursementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  remboursementIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconText: {
    fontSize: 20,
  },
  remboursementInfo: {
    flex: 1,
  },
  remboursementNumero: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  remboursementDate: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  remboursementBody: {
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    paddingTop: spacing.md,
  },
  montantRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  montantItem: {
    flex: 1,
  },
  montantLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  montantValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginTop: 2,
  },
  montantRembourse: {
    color: colors.success[600],
  },
  montantArrow: {
    paddingHorizontal: spacing.sm,
  },
  arrowText: {
    fontSize: 18,
    color: colors.neutral[300],
  },
  tauxContainer: {
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    marginLeft: spacing.sm,
  },
  tauxValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  praticienRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  praticienText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  emptyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    marginTop: spacing.lg,
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
  loadingMore: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
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
  modalStatusContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalStatusBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
  },
  modalStatusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  amountHighlight: {
    backgroundColor: colors.success[50],
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  amountHighlightLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.success[700],
    marginBottom: spacing.xs,
  },
  amountHighlightValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.success[600],
  },
  modalSection: {
    marginBottom: spacing.xl,
  },
  modalSectionTitle: {
    fontSize: typography.fontSize.xs,
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
  valueGreen: {
    color: colors.success[600],
  },
  valueRed: {
    color: colors.error[600],
  },
  mono: {
    fontFamily: 'monospace',
  },
});
