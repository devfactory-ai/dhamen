/**
 * Virtual Card Screen
 *
 * Digital adherent card with QR code for instant verification
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Dimensions,
  Alert,
  Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../lib/api-client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = CARD_WIDTH * 0.63; // Standard card ratio

interface VirtualCardData {
  id: string;
  cardNumber: string;
  qrCodeToken: string;
  status: 'active' | 'suspended' | 'revoked' | 'expired';
  expiresAt: string;
  usageCount: number;
  adherent: {
    firstName: string;
    lastName: string;
    adherentNumber: string;
    dateOfBirth: string;
  };
  contract: {
    contractNumber: string;
    insurerName: string;
    startDate: string;
    endDate: string;
  };
  coverage: {
    consultation: number;
    pharmacy: number;
    lab: number;
    hospitalization: number;
  };
}

interface QRCodeData {
  qrCodeData: string;
  expiresIn: number;
}

export default function VirtualCardScreen() {
  const { user } = useAuth();
  const [card, setCard] = useState<VirtualCardData | null>(null);
  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qrRefreshing, setQrRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);

  const fetchCard = useCallback(async () => {
    try {
      const response = await apiClient.get(`/cards/adherent/${user?.adherentId}/active`);
      if (response.data.success) {
        setCard(response.data.data.card);
        await refreshQRCode(response.data.data.card.id);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        setCard(null);
      } else {
        Alert.alert('Erreur', 'Impossible de charger la carte');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.adherentId]);

  const refreshQRCode = async (cardId: string) => {
    try {
      setQrRefreshing(true);
      const response = await apiClient.get(`/cards/${cardId}/qr`);
      if (response.data.success) {
        setQrData(response.data.data);
        setTimeLeft(response.data.data.expiresIn);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de générer le QR code');
    } finally {
      setQrRefreshing(false);
    }
  };

  const requestNewCard = async () => {
    try {
      setLoading(true);
      const response = await apiClient.post('/cards/generate', {
        adherentId: user?.adherentId,
      });
      if (response.data.success) {
        Alert.alert('Succès', 'Votre carte virtuelle a été créée');
        fetchCard();
      }
    } catch (error: any) {
      Alert.alert(
        'Erreur',
        error.response?.data?.error?.message || 'Impossible de créer la carte'
      );
      setLoading(false);
    }
  };

  const shareCard = async () => {
    if (!card) return;
    try {
      await Share.share({
        message: `Ma carte Dhamen\nNuméro: ${card.cardNumber}\nTitulaire: ${card.adherent.firstName} ${card.adherent.lastName}`,
        title: 'Carte Dhamen',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  useEffect(() => {
    fetchCard();
  }, [fetchCard]);

  // QR code countdown timer
  useEffect(() => {
    if (timeLeft <= 0 || !card) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          refreshQRCode(card.id);
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, card]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#22c55e';
      case 'suspended':
        return '#f59e0b';
      case 'expired':
      case 'revoked':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'suspended':
        return 'Suspendue';
      case 'expired':
        return 'Expirée';
      case 'revoked':
        return 'Révoquée';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0891b2" />
        <Text style={styles.loadingText}>Chargement de votre carte...</Text>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={styles.noCardContainer}>
        <Ionicons name="card-outline" size={80} color="#cbd5e1" />
        <Text style={styles.noCardTitle}>Pas de carte virtuelle</Text>
        <Text style={styles.noCardText}>
          Vous n'avez pas encore de carte virtuelle.{'\n'}
          Demandez-en une pour faciliter vos démarches.
        </Text>
        <TouchableOpacity style={styles.requestButton} onPress={requestNewCard}>
          <Text style={styles.requestButtonText}>Demander ma carte</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          fetchCard();
        }} />
      }
    >
      {/* Virtual Card */}
      <View style={styles.cardContainer}>
        <LinearGradient
          colors={['#0891b2', '#0e7490', '#155e75']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Card Header */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardBrand}>DHAMEN</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(card.status) }]}>
              <Text style={styles.statusText}>{getStatusText(card.status)}</Text>
            </View>
          </View>

          {/* Card Number */}
          <Text style={styles.cardNumber}>{card.cardNumber}</Text>

          {/* Cardholder Info */}
          <View style={styles.cardholderInfo}>
            <View>
              <Text style={styles.cardLabel}>TITULAIRE</Text>
              <Text style={styles.cardValue}>
                {card.adherent.firstName} {card.adherent.lastName}
              </Text>
            </View>
            <View style={styles.expiryContainer}>
              <Text style={styles.cardLabel}>EXPIRE</Text>
              <Text style={styles.cardValue}>{formatDate(card.expiresAt)}</Text>
            </View>
          </View>

          {/* Insurer */}
          <View style={styles.insurerContainer}>
            <Text style={styles.insurerName}>{card.contract.insurerName}</Text>
          </View>

          {/* Decorative elements */}
          <View style={styles.chipIcon}>
            <Ionicons name="wifi" size={24} color="rgba(255,255,255,0.6)" />
          </View>
        </LinearGradient>
      </View>

      {/* QR Code Section */}
      <View style={styles.qrSection}>
        <Text style={styles.sectionTitle}>Code QR de vérification</Text>
        <Text style={styles.qrDescription}>
          Présentez ce code au praticien pour vérifier votre éligibilité
        </Text>

        <View style={styles.qrContainer}>
          {qrRefreshing ? (
            <ActivityIndicator size="large" color="#0891b2" />
          ) : qrData ? (
            <>
              <QRCode
                value={qrData.qrCodeData}
                size={180}
                backgroundColor="white"
                color="#1e293b"
              />
              <View style={styles.timerContainer}>
                <Ionicons name="time-outline" size={16} color="#64748b" />
                <Text style={styles.timerText}>
                  Expire dans {formatTime(timeLeft)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.refreshQrButton}
                onPress={() => refreshQRCode(card.id)}
              >
                <Ionicons name="refresh" size={16} color="#0891b2" />
                <Text style={styles.refreshQrText}>Actualiser</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.qrError}>QR code non disponible</Text>
          )}
        </View>
      </View>

      {/* Card Details Toggle */}
      <TouchableOpacity
        style={styles.detailsToggle}
        onPress={() => setShowDetails(!showDetails)}
      >
        <Text style={styles.detailsToggleText}>
          {showDetails ? 'Masquer les détails' : 'Voir les détails de couverture'}
        </Text>
        <Ionicons
          name={showDetails ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#0891b2"
        />
      </TouchableOpacity>

      {/* Coverage Details */}
      {showDetails && (
        <View style={styles.detailsSection}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>N° Adhérent</Text>
            <Text style={styles.detailValue}>{card.adherent.adherentNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>N° Contrat</Text>
            <Text style={styles.detailValue}>{card.contract.contractNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Validité contrat</Text>
            <Text style={styles.detailValue}>
              {formatDate(card.contract.startDate)} - {formatDate(card.contract.endDate)}
            </Text>
          </View>

          <Text style={styles.coverageTitle}>Taux de couverture</Text>
          <View style={styles.coverageGrid}>
            <View style={styles.coverageItem}>
              <Ionicons name="medical" size={24} color="#0891b2" />
              <Text style={styles.coveragePercent}>{card.coverage.consultation}%</Text>
              <Text style={styles.coverageLabel}>Consultation</Text>
            </View>
            <View style={styles.coverageItem}>
              <Ionicons name="medkit" size={24} color="#0891b2" />
              <Text style={styles.coveragePercent}>{card.coverage.pharmacy}%</Text>
              <Text style={styles.coverageLabel}>Pharmacie</Text>
            </View>
            <View style={styles.coverageItem}>
              <Ionicons name="flask" size={24} color="#0891b2" />
              <Text style={styles.coveragePercent}>{card.coverage.lab}%</Text>
              <Text style={styles.coverageLabel}>Laboratoire</Text>
            </View>
            <View style={styles.coverageItem}>
              <Ionicons name="bed" size={24} color="#0891b2" />
              <Text style={styles.coveragePercent}>{card.coverage.hospitalization}%</Text>
              <Text style={styles.coverageLabel}>Hospitalisation</Text>
            </View>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={shareCard}>
          <Ionicons name="share-outline" size={20} color="#0891b2" />
          <Text style={styles.actionText}>Partager</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => Alert.alert('Historique', `${card.usageCount} vérifications effectuées`)}
        >
          <Ionicons name="list-outline" size={20} color="#0891b2" />
          <Text style={styles.actionText}>Historique</Text>
        </TouchableOpacity>
      </View>

      {/* Usage Stats */}
      <View style={styles.statsContainer}>
        <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
        <Text style={styles.statsText}>
          {card.usageCount} vérification{card.usageCount > 1 ? 's' : ''} effectuée{card.usageCount > 1 ? 's' : ''}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  noCardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 40,
  },
  noCardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 20,
    marginBottom: 8,
  },
  noCardText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  requestButton: {
    backgroundColor: '#0891b2',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  requestButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBrand: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    letterSpacing: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  cardNumber: {
    fontSize: 18,
    fontWeight: '500',
    color: 'white',
    letterSpacing: 3,
    marginTop: 30,
    fontFamily: 'monospace',
  },
  cardholderInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  cardLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  expiryContainer: {
    alignItems: 'flex-end',
  },
  insurerContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
  },
  insurerName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  chipIcon: {
    position: 'absolute',
    top: 60,
    right: 20,
    transform: [{ rotate: '90deg' }],
  },
  qrSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  qrDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  qrContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  timerText: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 6,
  },
  refreshQrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0891b2',
  },
  refreshQrText: {
    fontSize: 14,
    color: '#0891b2',
    marginLeft: 6,
    fontWeight: '500',
  },
  qrError: {
    fontSize: 14,
    color: '#ef4444',
  },
  detailsToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  detailsToggleText: {
    fontSize: 14,
    color: '#0891b2',
    fontWeight: '500',
    marginRight: 4,
  },
  detailsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  coverageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 20,
    marginBottom: 16,
  },
  coverageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  coverageItem: {
    width: '48%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  coveragePercent: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0891b2',
    marginTop: 8,
  },
  coverageLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionText: {
    fontSize: 14,
    color: '#0891b2',
    marginLeft: 8,
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsText: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 6,
  },
});
