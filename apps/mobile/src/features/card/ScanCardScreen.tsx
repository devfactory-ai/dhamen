/**
 * Scan Card Screen
 *
 * QR code scanner for providers to verify adherent cards
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Vibration,
  Dimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../lib/api-client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

interface VerificationResult {
  valid: boolean;
  verificationId?: string;
  card?: {
    cardNumber: string;
    status: string;
    adherent: {
      firstName: string;
      lastName: string;
      adherentNumber: string;
      dateOfBirth: string;
    };
    contract: {
      insurerName: string;
      endDate: string;
    };
    coverage: {
      consultation: number;
      pharmacy: number;
      lab: number;
      hospitalization: number;
    };
  };
  reason?: string;
}

export default function ScanCardScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || verifying) return;

    setScanned(true);
    setVerifying(true);
    Vibration.vibrate(100);

    try {
      const response = await apiClient.post('/cards/verify', {
        qrCodeData: data,
      });

      setResult(response.data.data);
      setShowResult(true);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || 'Erreur de vérification';
      setResult({
        valid: false,
        reason: errorMessage,
      });
      setShowResult(true);
    } finally {
      setVerifying(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setResult(null);
    setShowResult(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getReasonText = (reason: string) => {
    const reasons: Record<string, string> = {
      CARD_NOT_FOUND: 'Carte non trouvée',
      CARD_EXPIRED: 'Carte expirée',
      CARD_REVOKED: 'Carte révoquée',
      CARD_SUSPENDED: 'Carte suspendue',
      QR_CODE_EXPIRED: 'QR code expiré',
      INVALID_SIGNATURE: 'Signature invalide',
      INVALID_QR_DATA: 'QR code invalide',
    };
    return reasons[reason] || reason;
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0891b2" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#cbd5e1" />
        <Text style={styles.permissionTitle}>Accès à la caméra requis</Text>
        <Text style={styles.permissionText}>
          Pour scanner les cartes d'adhérents, vous devez autoriser l'accès à la caméra.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        enableTorch={flashOn}
      >
        {/* Overlay */}
        <View style={styles.overlay}>
          {/* Top */}
          <View style={styles.overlayTop} />

          {/* Middle row */}
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.scanArea}>
              {/* Corner markers */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />

              {/* Scanning animation */}
              {!scanned && (
                <View style={styles.scanLine} />
              )}
            </View>
            <View style={styles.overlaySide} />
          </View>

          {/* Bottom */}
          <View style={styles.overlayBottom}>
            <Text style={styles.instructionText}>
              Placez le QR code de la carte dans le cadre
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => setFlashOn(!flashOn)}
          >
            <Ionicons
              name={flashOn ? 'flash' : 'flash-off'}
              size={24}
              color="white"
            />
          </TouchableOpacity>
        </View>

        {/* Loading indicator */}
        {verifying && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="white" />
            <Text style={styles.loadingText}>Vérification en cours...</Text>
          </View>
        )}
      </CameraView>

      {/* Result Modal */}
      <Modal
        visible={showResult}
        animationType="slide"
        transparent={true}
        onRequestClose={resetScanner}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {result?.valid ? (
              <>
                {/* Success */}
                <View style={styles.successHeader}>
                  <View style={styles.successIcon}>
                    <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
                  </View>
                  <Text style={styles.successTitle}>Carte valide</Text>
                  <Text style={styles.verificationId}>
                    Vérification #{result.verificationId?.slice(-8)}
                  </Text>
                </View>

                {/* Card Info */}
                <View style={styles.cardInfo}>
                  <View style={styles.adherentSection}>
                    <Text style={styles.adherentName}>
                      {result.card?.adherent.firstName} {result.card?.adherent.lastName}
                    </Text>
                    <Text style={styles.adherentNumber}>
                      N° {result.card?.adherent.adherentNumber}
                    </Text>
                    <Text style={styles.insurerName}>
                      {result.card?.contract.insurerName}
                    </Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.coverageSection}>
                    <Text style={styles.coverageSectionTitle}>Couverture</Text>
                    <View style={styles.coverageRow}>
                      <Text style={styles.coverageLabel}>Consultation</Text>
                      <Text style={styles.coverageValue}>{result.card?.coverage.consultation}%</Text>
                    </View>
                    <View style={styles.coverageRow}>
                      <Text style={styles.coverageLabel}>Pharmacie</Text>
                      <Text style={styles.coverageValue}>{result.card?.coverage.pharmacy}%</Text>
                    </View>
                    <View style={styles.coverageRow}>
                      <Text style={styles.coverageLabel}>Laboratoire</Text>
                      <Text style={styles.coverageValue}>{result.card?.coverage.lab}%</Text>
                    </View>
                    <View style={styles.coverageRow}>
                      <Text style={styles.coverageLabel}>Hospitalisation</Text>
                      <Text style={styles.coverageValue}>{result.card?.coverage.hospitalization}%</Text>
                    </View>
                  </View>

                  <View style={styles.validityInfo}>
                    <Ionicons name="calendar-outline" size={16} color="#64748b" />
                    <Text style={styles.validityText}>
                      Valide jusqu'au {formatDate(result.card?.contract.endDate || '')}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* Failure */}
                <View style={styles.failureHeader}>
                  <View style={styles.failureIcon}>
                    <Ionicons name="close-circle" size={64} color="#ef4444" />
                  </View>
                  <Text style={styles.failureTitle}>Vérification échouée</Text>
                  <Text style={styles.failureReason}>
                    {getReasonText(result?.reason || 'UNKNOWN_ERROR')}
                  </Text>
                </View>
              </>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.primaryButton]}
                onPress={resetScanner}
              >
                <Ionicons name="scan" size={20} color="white" />
                <Text style={styles.primaryButtonText}>Scanner une autre carte</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    backgroundColor: 'transparent',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: 30,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#0891b2',
    borderWidth: 4,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: '#0891b2',
    top: '50%',
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 16,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 20,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#0891b2',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: '50%',
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  successIcon: {
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#22c55e',
    marginBottom: 4,
  },
  verificationId: {
    fontSize: 14,
    color: '#64748b',
  },
  cardInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  adherentSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  adherentName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
  },
  adherentNumber: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  insurerName: {
    fontSize: 14,
    color: '#0891b2',
    fontWeight: '500',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
  },
  coverageSection: {},
  coverageSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  coverageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  coverageLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  coverageValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0891b2',
  },
  validityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  validityText: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 8,
  },
  failureHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  failureIcon: {
    marginBottom: 12,
  },
  failureTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ef4444',
    marginBottom: 8,
  },
  failureReason: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  modalActions: {
    marginTop: 'auto',
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#0891b2',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
