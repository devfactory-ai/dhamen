/**
 * New Demande Screen - Camera capture for bulletin scan with OCR
 */
import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SanteTypeSoin } from '@dhamen/shared';

const TYPES_SOIN: { value: SanteTypeSoin; label: string }[] = [
  { value: 'pharmacie', label: 'Pharmacie' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'hospitalisation', label: 'Hospitalisation' },
  { value: 'optique', label: 'Optique' },
  { value: 'dentaire', label: 'Dentaire' },
  { value: 'laboratoire', label: 'Laboratoire' },
  { value: 'kinesitherapie', label: 'Kinesitherapie' },
  { value: 'autre', label: 'Autre' },
];

interface OCRExtractedData {
  dateSoin?: string;
  typeSoin?: SanteTypeSoin;
  montantTotal: number;
  praticien?: {
    nom?: string;
    specialite?: string;
  };
  lignes: Array<{
    libelle: string;
    montantTotal: number;
  }>;
  confidence: number;
  warnings: string[];
}

export default function NouvelleDemande() {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<SanteTypeSoin | null>(null);
  const [step, setStep] = useState<'select-type' | 'capture' | 'preview' | 'ocr-review'>('select-type');
  const [ocrData, setOcrData] = useState<OCRExtractedData | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [editedAmount, setEditedAmount] = useState<string>('');
  const [editedDate, setEditedDate] = useState<string>('');
  const cameraRef = useRef<CameraView>(null);
  const queryClient = useQueryClient();

  const createDemande = useMutation({
    mutationFn: async (data: {
      typeSoin: SanteTypeSoin;
      imageUri: string;
      montantDemande?: number;
      dateSoin?: string;
    }) => {
      // Create demande first
      const createResponse = await apiClient.post<{ success: boolean; data: { id: string } }>(
        '/sante/demandes',
        {
          typeSoin: data.typeSoin,
          montantDemande: data.montantDemande || 0,
          dateSoin: data.dateSoin || new Date().toISOString().split('T')[0],
        }
      );

      if (!createResponse.success || !createResponse.data?.id) {
        throw new Error('Failed to create demande');
      }

      const demandeId = createResponse.data.id;

      // Upload document
      const formData = new FormData();
      formData.append('file', {
        uri: data.imageUri,
        type: 'image/jpeg',
        name: 'bulletin.jpg',
      } as unknown as Blob);
      formData.append('demandeId', demandeId);
      formData.append('typeDocument', 'bulletin_soin');

      const uploadResponse = await apiClient.upload<{ data: { id: string } }>('/sante/documents/upload', formData);

      if (!uploadResponse.success) {
        throw new Error('Failed to upload document');
      }

      // Trigger OCR in background (don't wait for it)
      const documentId = uploadResponse.data?.id;
      if (documentId) {
        apiClient.post(`/sante/documents/${documentId}/ocr`).catch(console.error);
      }

      return { demandeId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mes-demandes'] });
      Alert.alert(
        'Demande envoyee',
        'Votre demande de remboursement a ete soumise avec succes.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error) => {
      Alert.alert(
        'Erreur',
        'Une erreur est survenue lors de l\'envoi de votre demande. Veuillez reessayer.'
      );
      console.error('Create demande error:', error);
    },
  });

  // OCR extraction after capture
  const runOCR = async (imageUri: string) => {
    setIsOcrLoading(true);
    try {
      // Create a temporary demande and upload document to trigger OCR
      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'bulletin_ocr.jpg',
      } as unknown as Blob);

      // For OCR preview, we'll do a simplified extraction locally
      // The full OCR will be done server-side after submission
      setOcrData(null);
      setStep('preview');
    } catch (error) {
      console.error('OCR error:', error);
      setStep('preview');
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (photo?.uri) {
        setCapturedImage(photo.uri);
        setStep('preview');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de prendre la photo');
      console.error('Camera capture error:', error);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
      setStep('preview');
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setStep('capture');
  };

  const handleSubmit = () => {
    if (!capturedImage || !selectedType) return;

    // Use edited or OCR values
    const montant = editedAmount ? parseFloat(editedAmount) * 1000 : ocrData?.montantTotal || 0;
    const date = editedDate || ocrData?.dateSoin || new Date().toISOString().split('T')[0];

    createDemande.mutate({
      typeSoin: selectedType,
      imageUri: capturedImage,
      montantDemande: montant,
      dateSoin: date,
    });
  };

  // Format amount for display (millimes to TND)
  const formatAmount = (millimes: number) => {
    return (millimes / 1000).toFixed(3);
  };

  // Step 1: Select type of care
  if (step === 'select-type') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nouvelle demande</Text>
        </View>

        <ScrollView style={styles.content}>
          <Text style={styles.stepTitle}>1. Type de soin</Text>
          <Text style={styles.stepDescription}>
            Sélectionnez le type de soin pour votre demande de remboursement
          </Text>

          <View style={styles.typesGrid}>
            {TYPES_SOIN.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.typeCard,
                  selectedType === type.value && styles.typeCardSelected,
                ]}
                onPress={() => setSelectedType(type.value)}
              >
                <Text
                  style={[
                    styles.typeLabel,
                    selectedType === type.value && styles.typeLabelSelected,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, !selectedType && styles.buttonDisabled]}
            onPress={() => selectedType && setStep('capture')}
            disabled={!selectedType}
          >
            <Text style={styles.primaryButtonText}>Continuer</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 2: Camera capture
  if (step === 'capture') {
    if (!permission) {
      return <View style={styles.container} />;
    }

    if (!permission.granted) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>
              Nous avons besoin de votre permission pour accéder à la caméra
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Autoriser la caméra</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.cameraContainer}>
        <View style={styles.cameraHeader}>
          <TouchableOpacity onPress={() => setStep('select-type')} style={styles.backButton}>
            <Text style={styles.backTextWhite}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.cameraHeaderTitle}>Scanner le bulletin</Text>
        </View>

        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraOverlay}>
            <View style={styles.frameBorder} />
          </View>
        </CameraView>

        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.galleryButton} onPress={handlePickImage}>
            <Text style={styles.galleryButtonText}>Galerie</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>

          <View style={styles.placeholder} />
        </View>

        <Text style={styles.cameraHint}>
          Placez le bulletin de soins dans le cadre et prenez une photo claire
        </Text>
      </SafeAreaView>
    );
  }

  // Step 3: Preview and submit
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
          <Text style={styles.backText}>← Reprendre</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vérification</Text>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.stepTitle}>3. Vérification</Text>
        <Text style={styles.stepDescription}>
          Vérifiez que le bulletin est lisible avant d'envoyer
        </Text>

        {capturedImage && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: capturedImage }} style={styles.previewImage} />
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Type de soin</Text>
          <Text style={styles.summaryValue}>
            {TYPES_SOIN.find((t) => t.value === selectedType)?.label}
          </Text>
        </View>

        {/* OCR extracted data or manual input */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Montant (TND)</Text>
          <TextInput
            style={styles.amountInput}
            value={editedAmount || (ocrData?.montantTotal ? formatAmount(ocrData.montantTotal) : '')}
            onChangeText={setEditedAmount}
            placeholder="Ex: 50.000"
            keyboardType="decimal-pad"
          />
          {ocrData?.confidence && ocrData.confidence > 0.5 && (
            <Text style={styles.ocrHint}>
              Detecte automatiquement (confiance: {Math.round(ocrData.confidence * 100)}%)
            </Text>
          )}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Date du soin</Text>
          <TextInput
            style={styles.amountInput}
            value={editedDate || ocrData?.dateSoin || ''}
            onChangeText={setEditedDate}
            placeholder="AAAA-MM-JJ"
          />
        </View>

        {ocrData?.praticien?.nom && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Praticien detecte</Text>
            <Text style={styles.summaryValue}>{ocrData.praticien.nom}</Text>
            {ocrData.praticien.specialite && (
              <Text style={styles.summarySubvalue}>{ocrData.praticien.specialite}</Text>
            )}
          </View>
        )}

        {ocrData?.lignes && ocrData.lignes.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Articles detectes</Text>
            {ocrData.lignes.slice(0, 5).map((ligne, index) => (
              <View key={index} style={styles.ligneRow}>
                <Text style={styles.ligneLibelle} numberOfLines={1}>{ligne.libelle}</Text>
                <Text style={styles.ligneMontant}>{formatAmount(ligne.montantTotal)} TND</Text>
              </View>
            ))}
            {ocrData.lignes.length > 5 && (
              <Text style={styles.ligneMore}>+{ocrData.lignes.length - 5} autres...</Text>
            )}
          </View>
        )}

        {ocrData?.warnings && ocrData.warnings.length > 0 && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              {ocrData.warnings[0]}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, createDemande.isPending && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={createDemande.isPending}
        >
          {createDemande.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Envoyer la demande</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleRetake}>
          <Text style={styles.secondaryButtonText}>Reprendre la photo</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e3a5f',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    color: '#a0c4e8',
    fontSize: 16,
  },
  backTextWhite: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  cameraHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  typesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  typeCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  typeCardSelected: {
    borderColor: '#1e3a5f',
    backgroundColor: '#e8f0f8',
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  typeLabelSelected: {
    color: '#1e3a5f',
    fontWeight: '600',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  frameBorder: {
    width: '100%',
    height: '60%',
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  galleryButton: {
    padding: 12,
  },
  galleryButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#1e3a5f',
  },
  placeholder: {
    width: 60,
  },
  cameraHint: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 24,
  },
  previewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewImage: {
    width: '100%',
    height: 300,
    resizeMode: 'contain',
    backgroundColor: '#000',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  primaryButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  amountInput: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 8,
    marginTop: 4,
  },
  ocrHint: {
    fontSize: 12,
    color: '#28a745',
    marginTop: 4,
  },
  summarySubvalue: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  ligneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  ligneLibelle: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  ligneMontant: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e3a5f',
  },
  ligneMore: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  warningCard: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#ffc107',
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
  },
});
