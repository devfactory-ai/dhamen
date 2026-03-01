/**
 * Digital Insurance Card Screen for Dhamen Mobile
 * Shows the adherent's digital card with QR code and flip animation
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Share,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getUser } from '@/lib/auth';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';
import { Skeleton } from '@/components';
import type { UserPublic } from '@dhamen/shared';

interface CarteData {
  adherent: {
    id: string;
    matricule: string;
    nom: string;
    prenom: string;
    dateNaissance: string;
    estActif: boolean;
  };
  assureur: {
    id: string;
    nom: string;
    logo?: string;
  };
  formule: {
    code: string;
    nom: string;
    plafondGlobal: number | null;
  };
  contrat: {
    numero: string;
    dateDebut: string;
    dateFin: string;
    estActif: boolean;
  };
  qrCodeData: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = CARD_WIDTH * 0.63;

function CardSkeleton() {
  return (
    <View style={styles.cardContainer}>
      <View style={[styles.card, styles.cardFront]}>
        <View style={styles.skeletonHeader}>
          <Skeleton width={100} height={28} />
          <Skeleton width={70} height={24} borderRadius={12} />
        </View>
        <View style={styles.skeletonBody}>
          <Skeleton width={180} height={22} />
          <Skeleton width={140} height={16} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.skeletonFooter}>
          <View>
            <Skeleton width={60} height={10} />
            <Skeleton width={80} height={14} style={{ marginTop: 4 }} />
          </View>
          <View>
            <Skeleton width={60} height={10} />
            <Skeleton width={80} height={14} style={{ marginTop: 4 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

export default function CarteScreen() {
  const [user, setUserState] = useState<UserPublic | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;
  const cardScaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    getUser().then(setUserState);
    Animated.spring(cardScaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [cardScaleAnim]);

  const { data: carte, isLoading, refetch } = useQuery({
    queryKey: ['ma-carte-sante'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: CarteData }>(
        '/sante/carte'
      );
      if (response.success && response.data?.data) {
        return response.data.data;
      }
      return null;
    },
    retry: false,
  });

  const flipCard = useCallback(() => {
    const toValue = isFlipped ? 0 : 1;
    Animated.spring(flipAnimation, {
      toValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  }, [isFlipped, flipAnimation]);

  const handleShare = useCallback(async () => {
    if (!carte) return;

    try {
      await Share.share({
        message: `Ma carte sante Dhamen\n\nAdherent: ${carte.adherent.prenom} ${carte.adherent.nom}\nMatricule: ${carte.adherent.matricule}\nAssureur: ${carte.assureur.nom}\nFormule: ${carte.formule.nom}`,
        title: 'Ma Carte Sante Dhamen',
      });
    } catch {
      // Ignore share errors
    }
  }, [carte]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number | null) => {
    if (!amount) return 'Illimite';
    return (amount / 1000).toFixed(3) + ' TND';
  };

  const isContractExpired = carte?.contrat
    ? new Date(carte.contrat.dateFin) < new Date()
    : false;

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const frontAnimatedStyle = {
    transform: [{ rotateY: frontInterpolate }],
  };

  const backAnimatedStyle = {
    transform: [{ rotateY: backInterpolate }],
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary[600], colors.primary[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Ma Carte Sante</Text>
            <Text style={styles.headerSubtitle}>Carte numerique d'adherent</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

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
          <CardSkeleton />
        ) : carte ? (
          <>
            {/* Flip Card */}
            <Animated.View style={[styles.cardContainer, { transform: [{ scale: cardScaleAnim }] }]}>
              <TouchableOpacity activeOpacity={0.95} onPress={flipCard}>
                {/* Front */}
                <Animated.View
                  style={[styles.cardWrapper, frontAnimatedStyle, { backfaceVisibility: 'hidden' }]}
                >
                  <LinearGradient
                    colors={[colors.primary[700], colors.primary[500]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.card, styles.cardFront]}
                  >
                    {/* Card Pattern */}
                    <View style={styles.cardPattern}>
                      <View style={styles.patternCircle} />
                      <View style={[styles.patternCircle, styles.patternCircle2]} />
                    </View>

                    {/* Card Header */}
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.cardBrand}>DHAMEN</Text>
                        <Text style={styles.cardType}>Carte Sante</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          carte.adherent.estActif && !isContractExpired
                            ? styles.statusBadgeActive
                            : styles.statusBadgeInactive,
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            carte.adherent.estActif && !isContractExpired
                              ? styles.statusDotActive
                              : styles.statusDotInactive,
                          ]}
                        />
                        <Text style={styles.statusText}>
                          {carte.adherent.estActif && !isContractExpired ? 'ACTIF' : 'INACTIF'}
                        </Text>
                      </View>
                    </View>

                    {/* Card Body */}
                    <View style={styles.cardBody}>
                      <Text style={styles.adherentName}>
                        {carte.adherent.prenom} {carte.adherent.nom}
                      </Text>
                      <Text style={styles.matricule}>{carte.adherent.matricule}</Text>
                    </View>

                    {/* Card Footer */}
                    <View style={styles.cardFooter}>
                      <View>
                        <Text style={styles.footerLabel}>Assureur</Text>
                        <Text style={styles.footerValue}>{carte.assureur.nom}</Text>
                      </View>
                      <View>
                        <Text style={styles.footerLabel}>Formule</Text>
                        <Text style={styles.footerValue}>{carte.formule.nom}</Text>
                      </View>
                    </View>

                    {/* Flip Hint */}
                    <View style={styles.flipHint}>
                      <Text style={styles.flipHintText}>Appuyer pour voir le QR</Text>
                      <Text style={styles.flipHintIcon}>↻</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>

                {/* Back */}
                <Animated.View
                  style={[
                    styles.cardWrapper,
                    styles.cardWrapperBack,
                    backAnimatedStyle,
                    { backfaceVisibility: 'hidden' },
                  ]}
                >
                  <View style={[styles.card, styles.cardBack]}>
                    {/* QR Code */}
                    <View style={styles.qrSection}>
                      <View style={styles.qrContainer}>
                        <View style={styles.qrPlaceholder}>
                          <Text style={styles.qrIcon}>📱</Text>
                          <Text style={styles.qrText}>QR CODE</Text>
                        </View>
                      </View>
                      <Text style={styles.qrMatricule}>{carte.adherent.matricule}</Text>
                    </View>

                    {/* Contract Info */}
                    <View style={styles.contractSection}>
                      <View style={styles.contractRow}>
                        <Text style={styles.contractLabel}>Contrat N°</Text>
                        <Text style={styles.contractValue}>{carte.contrat.numero}</Text>
                      </View>
                      <View style={styles.contractRow}>
                        <Text style={styles.contractLabel}>Validite</Text>
                        <Text style={styles.contractValue}>
                          {formatDate(carte.contrat.dateDebut)} - {formatDate(carte.contrat.dateFin)}
                        </Text>
                      </View>
                      {isContractExpired && (
                        <View style={styles.expiredBadge}>
                          <Text style={styles.expiredText}>⚠️ Contrat expire</Text>
                        </View>
                      )}
                    </View>

                    {/* Flip Hint */}
                    <View style={styles.flipHintBack}>
                      <Text style={styles.flipHintTextBack}>Appuyer pour retourner</Text>
                      <Text style={styles.flipHintIconBack}>↻</Text>
                    </View>
                  </View>
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>

            {/* Details Card */}
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>Details de la couverture</Text>

              <View style={styles.detailRow}>
                <View style={styles.detailIconContainer}>
                  <Text style={styles.detailIcon}>🎂</Text>
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Date de naissance</Text>
                  <Text style={styles.detailValue}>{formatDate(carte.adherent.dateNaissance)}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailIconContainer}>
                  <Text style={styles.detailIcon}>🏷️</Text>
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Formule</Text>
                  <Text style={styles.detailValue}>
                    {carte.formule.nom} ({carte.formule.code})
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailIconContainer}>
                  <Text style={styles.detailIcon}>💰</Text>
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Plafond annuel</Text>
                  <Text style={[styles.detailValue, styles.detailValueHighlight]}>
                    {formatAmount(carte.formule.plafondGlobal)}
                  </Text>
                </View>
              </View>

              <View style={[styles.detailRow, styles.detailRowLast]}>
                <View style={styles.detailIconContainer}>
                  <Text style={styles.detailIcon}>📋</Text>
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Statut contrat</Text>
                  <View
                    style={[
                      styles.statusTag,
                      carte.contrat.estActif && !isContractExpired
                        ? styles.statusTagActive
                        : styles.statusTagInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusTagText,
                        carte.contrat.estActif && !isContractExpired
                          ? styles.statusTagTextActive
                          : styles.statusTagTextInactive,
                      ]}
                    >
                      {carte.contrat.estActif && !isContractExpired ? 'Actif' : 'Inactif'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                <LinearGradient
                  colors={[colors.primary[500], colors.primary[600]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.actionButtonGradient}
                >
                  <Text style={styles.actionIcon}>📤</Text>
                  <Text style={styles.actionText}>Partager ma carte</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Instructions */}
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>Comment utiliser votre carte</Text>

              <View style={styles.instruction}>
                <View style={styles.instructionNumber}>
                  <Text style={styles.instructionNumberText}>1</Text>
                </View>
                <Text style={styles.instructionText}>
                  Presentez cette carte lors de vos soins
                </Text>
              </View>

              <View style={styles.instruction}>
                <View style={styles.instructionNumber}>
                  <Text style={styles.instructionNumberText}>2</Text>
                </View>
                <Text style={styles.instructionText}>
                  Le praticien scanne le QR code pour verifier votre eligibilite
                </Text>
              </View>

              <View style={[styles.instruction, styles.instructionLast]}>
                <View style={styles.instructionNumber}>
                  <Text style={styles.instructionNumberText}>3</Text>
                </View>
                <Text style={styles.instructionText}>
                  Profitez du tiers payant sans avance de frais
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>💳</Text>
            </View>
            <Text style={styles.emptyTitle}>Pas de carte disponible</Text>
            <Text style={styles.emptyText}>
              Votre carte numerique sera disponible une fois votre compte adherent active.
            </Text>
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
  header: {
    paddingBottom: spacing[6],
    borderBottomLeftRadius: borderRadius['2xl'],
    borderBottomRightRadius: borderRadius['2xl'],
  },
  headerContent: {
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
  content: {
    flex: 1,
    marginTop: -spacing[4],
  },
  contentContainer: {
    padding: spacing[5],
    paddingBottom: spacing[24],
  },
  cardContainer: {
    alignItems: 'center',
    height: CARD_HEIGHT + 20,
    marginBottom: spacing[5],
  },
  cardWrapper: {
    position: 'absolute',
    width: CARD_WIDTH,
  },
  cardWrapperBack: {
    position: 'absolute',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    ...shadows.xl,
  },
  cardFront: {
    overflow: 'hidden',
  },
  cardPattern: {
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
    bottom: -100,
    left: -100,
    right: undefined,
  },
  cardBack: {
    backgroundColor: colors.background.secondary,
    borderWidth: 2,
    borderColor: colors.primary[500],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardBrand: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
    letterSpacing: 3,
  },
  cardType: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[200],
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusBadgeInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing[2],
  },
  statusDotActive: {
    backgroundColor: colors.success.main,
  },
  statusDotInactive: {
    backgroundColor: colors.error.main,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
  },
  adherentName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  matricule: {
    fontSize: typography.fontSize.md,
    color: colors.primary[200],
    marginTop: spacing[1],
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[300],
    textTransform: 'uppercase',
  },
  footerValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text.inverse,
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
  },
  flipHint: {
    position: 'absolute',
    bottom: spacing[3],
    right: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
  },
  flipHintText: {
    fontSize: typography.fontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    marginRight: spacing[1],
  },
  flipHintIcon: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  flipHintBack: {
    position: 'absolute',
    bottom: spacing[3],
    right: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
  },
  flipHintTextBack: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    marginRight: spacing[1],
  },
  flipHintIconBack: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  qrSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrContainer: {
    padding: spacing[3],
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  qrPlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrIcon: {
    fontSize: 32,
    marginBottom: spacing[1],
  },
  qrText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[500],
  },
  qrMatricule: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[500],
    marginTop: spacing[3],
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  contractSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingTop: spacing[3],
  },
  contractRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  contractLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  contractValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  expiredBadge: {
    alignSelf: 'center',
    backgroundColor: colors.error.light,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
    marginTop: spacing[2],
  },
  expiredText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error.dark,
  },
  detailsCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    marginBottom: spacing[4],
    ...shadows.md,
  },
  detailsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  detailIcon: {
    fontSize: 18,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  detailValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginTop: 2,
  },
  detailValueHighlight: {
    color: colors.success.main,
  },
  statusTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    marginTop: spacing[1],
  },
  statusTagActive: {
    backgroundColor: colors.success.light,
  },
  statusTagInactive: {
    backgroundColor: colors.error.light,
  },
  statusTagText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  statusTagTextActive: {
    color: colors.success.dark,
  },
  statusTagTextInactive: {
    color: colors.error.dark,
  },
  actionsContainer: {
    marginBottom: spacing[4],
  },
  actionButton: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[5],
  },
  actionIcon: {
    fontSize: 20,
    marginRight: spacing[3],
  },
  actionText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
  },
  instructionsCard: {
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    marginBottom: spacing[6],
  },
  instructionsTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[700],
    marginBottom: spacing[4],
  },
  instruction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing[4],
  },
  instructionLast: {
    marginBottom: 0,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  instructionNumberText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
  },
  instructionText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 22,
    paddingTop: 4,
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
    lineHeight: 22,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  skeletonBody: {
    flex: 1,
    justifyContent: 'center',
  },
  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
