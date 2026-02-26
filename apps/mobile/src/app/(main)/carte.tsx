/**
 * Digital Insurance Card Screen for SoinFlow Mobile
 * Shows the adherent's digital card with QR code for quick verification
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Share,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getUser } from '@/lib/auth';
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
const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_HEIGHT = CARD_WIDTH * 0.63; // Standard credit card ratio

export default function CarteScreen() {
  const [user, setUserState] = useState<UserPublic | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    getUser().then(setUserState);
  }, []);

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

  const handleShare = useCallback(async () => {
    if (!carte) return;

    try {
      await Share.share({
        message: `Ma carte sante Dhamen\n\nAdherent: ${carte.adherent.prenom} ${carte.adherent.nom}\nMatricule: ${carte.adherent.matricule}\nAssureur: ${carte.assureur.nom}\nFormule: ${carte.formule.nom}\n\nPour verification: ${carte.qrCodeData}`,
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ma Carte Sante</Text>
        <Text style={styles.headerSubtitle}>Carte numerique d'adherent</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      >
        {carte ? (
          <>
            {/* Insurance Card */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setIsFlipped(!isFlipped)}
            >
              <View style={styles.cardContainer}>
                {!isFlipped ? (
                  // Front of card
                  <View style={[styles.card, styles.cardFront]}>
                    {/* Card Header */}
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.cardTitle}>DHAMEN</Text>
                        <Text style={styles.cardSubtitle}>Carte Sante</Text>
                      </View>
                      <View style={styles.statusBadge}>
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

                    {/* Adherent Info */}
                    <View style={styles.cardBody}>
                      <Text style={styles.adherentName}>
                        {carte.adherent.prenom} {carte.adherent.nom}
                      </Text>
                      <Text style={styles.matricule}>{carte.adherent.matricule}</Text>
                    </View>

                    {/* Card Footer */}
                    <View style={styles.cardFooter}>
                      <View style={styles.footerItem}>
                        <Text style={styles.footerLabel}>Assureur</Text>
                        <Text style={styles.footerValue}>{carte.assureur.nom}</Text>
                      </View>
                      <View style={styles.footerItem}>
                        <Text style={styles.footerLabel}>Formule</Text>
                        <Text style={styles.footerValue}>{carte.formule.nom}</Text>
                      </View>
                    </View>

                    {/* Flip Indicator */}
                    <Text style={styles.flipHint}>Appuyer pour voir le QR code</Text>
                  </View>
                ) : (
                  // Back of card (QR Code)
                  <View style={[styles.card, styles.cardBack]}>
                    <View style={styles.qrContainer}>
                      {/* Simple QR representation - in production, use react-native-qrcode-svg */}
                      <View style={styles.qrPlaceholder}>
                        <Text style={styles.qrText}>QR</Text>
                        <Text style={styles.qrSubtext}>Code</Text>
                      </View>
                      <Text style={styles.qrMatricule}>{carte.adherent.matricule}</Text>
                    </View>

                    {/* Contract Info */}
                    <View style={styles.contractInfo}>
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
                        <Text style={styles.expiredWarning}>⚠️ Contrat expire</Text>
                      )}
                    </View>

                    <Text style={styles.flipHint}>Appuyer pour retourner</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Card Details */}
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>Details de la couverture</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date de naissance</Text>
                <Text style={styles.detailValue}>
                  {formatDate(carte.adherent.dateNaissance)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Formule</Text>
                <Text style={styles.detailValue}>
                  {carte.formule.nom} ({carte.formule.code})
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Plafond annuel</Text>
                <Text style={styles.detailValue}>
                  {formatAmount(carte.formule.plafondGlobal)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Statut contrat</Text>
                <Text
                  style={[
                    styles.detailValue,
                    carte.contrat.estActif && !isContractExpired
                      ? styles.statusActive
                      : styles.statusInactive,
                  ]}
                >
                  {carte.contrat.estActif && !isContractExpired ? 'Actif' : 'Inactif'}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                <Text style={styles.actionIcon}>📤</Text>
                <Text style={styles.actionText}>Partager</Text>
              </TouchableOpacity>
            </View>

            {/* Usage instructions */}
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>Comment utiliser votre carte</Text>
              <View style={styles.instruction}>
                <Text style={styles.instructionNumber}>1</Text>
                <Text style={styles.instructionText}>
                  Presentez cette carte lors de vos soins
                </Text>
              </View>
              <View style={styles.instruction}>
                <Text style={styles.instructionNumber}>2</Text>
                <Text style={styles.instructionText}>
                  Le praticien scanne le QR code pour verifier votre eligibilite
                </Text>
              </View>
              <View style={styles.instruction}>
                <Text style={styles.instructionNumber}>3</Text>
                <Text style={styles.instructionText}>
                  Profitez du tiers payant sans avance de frais
                </Text>
              </View>
            </View>
          </>
        ) : !isLoading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💳</Text>
            <Text style={styles.emptyTitle}>Pas de carte disponible</Text>
            <Text style={styles.emptyText}>
              Votre carte numerique sera disponible une fois votre compte adherent active.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    backgroundColor: '#1e3a5f',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#a0c4e8',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  cardContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  cardFront: {
    backgroundColor: '#1e3a5f',
  },
  cardBack: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1e3a5f',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#a0c4e8',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotActive: {
    backgroundColor: '#28a745',
  },
  statusDotInactive: {
    backgroundColor: '#dc3545',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
  },
  adherentName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  matricule: {
    fontSize: 16,
    color: '#a0c4e8',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerItem: {},
  footerLabel: {
    fontSize: 10,
    color: '#a0c4e8',
    textTransform: 'uppercase',
  },
  footerValue: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
    marginTop: 2,
  },
  flipHint: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  qrContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholder: {
    width: 120,
    height: 120,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#1e3a5f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1e3a5f',
  },
  qrSubtext: {
    fontSize: 16,
    color: '#1e3a5f',
  },
  qrMatricule: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e3a5f',
    marginTop: 12,
    fontFamily: 'monospace',
  },
  contractInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  contractRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  contractLabel: {
    fontSize: 12,
    color: '#666',
  },
  contractValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
  },
  expiredWarning: {
    fontSize: 12,
    color: '#dc3545',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  statusActive: {
    color: '#28a745',
  },
  statusInactive: {
    color: '#dc3545',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e3a5f',
  },
  instructionsCard: {
    backgroundColor: '#e8f4fd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e3a5f',
    marginBottom: 16,
  },
  instruction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1e3a5f',
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
