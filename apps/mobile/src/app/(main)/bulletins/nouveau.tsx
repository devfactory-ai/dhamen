/**
 * New Bulletin de Soins Screen - Camera capture with OCR for reimbursement
 */
import { useState, useRef, useEffect } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

type CareType = 'consultation' | 'pharmacy' | 'lab' | 'hospital' | 'dentaire' | 'optique' | 'autre';

const CARE_TYPES: { value: CareType; label: string; icon: string }[] = [
  { value: 'consultation', label: 'Consultation', icon: '🩺' },
  { value: 'pharmacy', label: 'Pharmacie', icon: '💊' },
  { value: 'lab', label: 'Analyses', icon: '🔬' },
  { value: 'hospital', label: 'Hospitalisation', icon: '🏥' },
  { value: 'dentaire', label: 'Dentaire', icon: '🦷' },
  { value: 'optique', label: 'Optique', icon: '👓' },
  { value: 'autre', label: 'Autre', icon: '📋' },
];

// Map OCR care types to our CareType
const OCR_TYPE_MAP: Record<string, CareType> = {
  pharmacie: 'pharmacy',
  consultation: 'consultation',
  hospitalisation: 'hospital',
  optique: 'optique',
  dentaire: 'dentaire',
  laboratoire: 'lab',
};

interface OcrExtractedData {
  dateSoin: string | null;
  typeSoin: string | null;
  montantTotal: number;
  praticienNom: string | null;
  praticienSpecialite: string | null;
  description: string | null;
  adherentNom: string | null;
  adherentMatricule: string | null;
  confidence: number;
  warnings: string[];
}

export default function NouveauBulletin() {
  const params = useLocalSearchParams<{ imageUri?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(params.imageUri || null);
  const [selectedType, setSelectedType] = useState<CareType | null>(null);
  const [step, setStep] = useState<'capture' | 'extracting' | 'select-type' | 'preview' | 'details'>(
    params.imageUri ? 'extracting' : 'capture'
  );
  const [bulletinDate, setBulletinDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [providerName, setProviderName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [ocrData, setOcrData] = useState<OcrExtractedData | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const queryClient = useQueryClient();

  // Trigger OCR if arriving with a pre-existing image
  useEffect(() => {
    if (params.imageUri && step === 'extracting') {
      runOcrExtraction(params.imageUri);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runOcrExtraction = async (imageUri: string) => {
    setOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'scan.jpg',
      } as unknown as Blob);

      const response = await apiClient.upload<OcrExtractedData>(
        '/bulletins-soins/ocr-extract', formData
      );

      if (response.success && response.data) {
        const extracted = response.data as OcrExtractedData;
        setOcrData(extracted);

        // Pre-fill form fields from OCR
        if (extracted.dateSoin) {
          setBulletinDate(extracted.dateSoin);
        }
        if (extracted.typeSoin && OCR_TYPE_MAP[extracted.typeSoin]) {
          setSelectedType(OCR_TYPE_MAP[extracted.typeSoin] as CareType);
        }
        if (extracted.montantTotal > 0) {
          // Convert millimes to TND for display
          const amountTND = extracted.montantTotal >= 1000
            ? (extracted.montantTotal / 1000).toFixed(3)
            : String(extracted.montantTotal);
          setTotalAmount(amountTND);
        }
        if (extracted.praticienNom) {
          setProviderName(extracted.praticienNom);
        }
        if (extracted.description) {
          setDescription(extracted.description);
        }
      }
    } catch (error) {
      console.warn('OCR extraction failed, continuing with manual entry:', error);
    } finally {
      setOcrLoading(false);
      setStep('select-type');
    }
  };

  const submitBulletin = useMutation({
    mutationFn: async (data: {
      imageUri: string;
      careType: CareType;
      bulletinDate: string;
      totalAmount: number;
      providerName?: string;
      description?: string;
    }) => {
      // Create form data for upload
      const formData = new FormData();
      formData.append('scan', {
        uri: data.imageUri,
        type: 'image/jpeg',
        name: 'bulletin_scan.jpg',
      } as unknown as Blob);
      formData.append('care_type', data.careType);
      formData.append('bulletin_date', data.bulletinDate);
      formData.append('total_amount', String(data.totalAmount));
      if (data.providerName) {
        formData.append('provider_name', data.providerName);
      }
      if (data.description) {
        formData.append('care_description', data.description);
      }

      const response = await apiClient.upload<{
        success: boolean;
        data: { id: string; bulletin_number: string };
      }>('/bulletins-soins', formData);

      if (!response.success) {
        throw new Error('Failed to submit bulletin');
      }

      return response.data;
    },
    onSuccess: (data: { id: string; bulletin_number: string } | undefined) => {
      queryClient.invalidateQueries({ queryKey: ['mes-bulletins'] });
      queryClient.invalidateQueries({ queryKey: ['mes-bulletins-stats'] });
      queryClient.invalidateQueries({ queryKey: ['bulletins-stats'] });
      Alert.alert(
        'Bulletin soumis',
        `Votre bulletin ${data?.bulletin_number || ''} a été soumis avec succès.\n\nVous pouvez suivre son statut dans la section Bulletins.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: Error) => {
      Alert.alert(
        'Erreur',
        'Une erreur est survenue lors de la soumission. Veuillez réessayer.'
      );
      console.error('Submit bulletin error:', error);
    },
  });

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (photo?.uri) {
        setCapturedImage(photo.uri);
        setStep('extracting');
        runOcrExtraction(photo.uri);
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
      setStep('extracting');
      runOcrExtraction(result.assets[0].uri);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setOcrData(null);
    setSelectedType(null);
    setTotalAmount('');
    setProviderName('');
    setDescription('');
    setBulletinDate(new Date().toISOString().split('T')[0]);
    setStep('capture');
  };

  const handleSubmit = () => {
    if (!capturedImage || !selectedType || !totalAmount) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires');
      return;
    }

    const amount = parseFloat(totalAmount.replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Erreur', 'Montant invalide');
      return;
    }

    submitBulletin.mutate({
      imageUri: capturedImage,
      careType: selectedType,
      bulletinDate,
      totalAmount: amount,
      providerName: providerName || undefined,
      description: description || undefined,
    });
  };

  // Step 1: Camera capture
  if (step === 'capture') {
    if (!permission) {
      return <View style={styles.container} />;
    }

    if (!permission.granted) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Scanner un bulletin</Text>
          </View>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionIcon}>📷</Text>
            <Text style={styles.permissionText}>
              Nous avons besoin de votre permission pour accéder à la caméra
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Autoriser la caméra</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handlePickImage}>
              <Text style={styles.secondaryButtonText}>Choisir depuis la galerie</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.cameraContainer}>
        <View style={styles.cameraHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backTextWhite}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.cameraHeaderTitle}>Scanner le bulletin</Text>
        </View>

        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraOverlay}>
            <View style={styles.frameBorder}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>
          </View>
        </CameraView>

        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.galleryButton} onPress={handlePickImage}>
            <Text style={styles.galleryIcon}>🖼️</Text>
            <Text style={styles.galleryButtonText}>Galerie</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>

          <View style={styles.placeholder} />
        </View>

        <Text style={styles.cameraHint}>
          Placez le bulletin de soins dans le cadre et assurez-vous qu'il est bien lisible
        </Text>
      </SafeAreaView>
    );
  }

  // Step 1.5: OCR extracting
  if (step === 'extracting') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
            <Text style={styles.backText}>← Reprendre</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analyse en cours</Text>
        </View>

        <View style={styles.extractingContainer}>
          {capturedImage && (
            <Image source={{ uri: capturedImage }} style={styles.extractingImage} />
          )}
          <ActivityIndicator size="large" color="#1e3a5f" style={{ marginTop: 24 }} />
          <Text style={styles.extractingTitle}>Extraction des informations...</Text>
          <Text style={styles.extractingSubtitle}>
            Analyse du bulletin de soins en cours.{'\n'}Les champs seront pré-remplis automatiquement.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep('select-type')}
          >
            <Text style={styles.secondaryButtonText}>Passer et remplir manuellement</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Step 2: Select care type
  if (step === 'select-type') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
            <Text style={styles.backText}>← Reprendre</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Type de soin</Text>
        </View>

        <ScrollView style={styles.content}>
          {capturedImage && (
            <View style={styles.miniPreview}>
              <Image source={{ uri: capturedImage }} style={styles.miniPreviewImage} />
              <View style={styles.miniPreviewBadge}>
                <Text style={styles.miniPreviewBadgeText}>✓ Scan capturé</Text>
              </View>
            </View>
          )}

          <Text style={styles.stepTitle}>Type de soin</Text>
          <Text style={styles.stepDescription}>
            {ocrData && ocrData.confidence > 0
              ? 'Type détecté automatiquement. Vous pouvez le modifier si nécessaire.'
              : 'Sélectionnez le type de soins pour ce bulletin'}
          </Text>

          {ocrData && ocrData.confidence > 0 && (
            <View style={styles.ocrBadge}>
              <Text style={styles.ocrBadgeText}>
                Extraction auto ({Math.round(ocrData.confidence * 100)}% confiance)
              </Text>
            </View>
          )}

          <View style={styles.typesGrid}>
            {CARE_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.typeCard,
                  selectedType === type.value && styles.typeCardSelected,
                ]}
                onPress={() => setSelectedType(type.value)}
              >
                <Text style={styles.typeIcon}>{type.icon}</Text>
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
            onPress={() => selectedType && setStep('details')}
            disabled={!selectedType}
          >
            <Text style={styles.primaryButtonText}>Continuer</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 3: Details and submit
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('select-type')} style={styles.backButton}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails du bulletin</Text>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {capturedImage && (
          <TouchableOpacity style={styles.previewContainer} onPress={() => setStep('capture')}>
            <Image source={{ uri: capturedImage }} style={styles.previewImage} />
            <View style={styles.previewOverlay}>
              <Text style={styles.previewOverlayText}>Appuyez pour reprendre</Text>
            </View>
          </TouchableOpacity>
        )}

        {ocrData && ocrData.confidence > 0 && (
          <View style={styles.ocrInfoCard}>
            <Text style={styles.ocrInfoIcon}>🤖</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.ocrInfoTitle}>
                Champs pré-remplis automatiquement
              </Text>
              <Text style={styles.ocrInfoText}>
                Confiance: {Math.round(ocrData.confidence * 100)}% — Vérifiez et corrigez si nécessaire.
              </Text>
              {ocrData.warnings.length > 0 && (
                <Text style={styles.ocrWarningText}>
                  {ocrData.warnings[0]}
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.formCard}>
          <View style={styles.formRow}>
            <Text style={styles.formLabel}>Type de soin</Text>
            <View style={styles.selectedTypeDisplay}>
              <Text style={styles.selectedTypeIcon}>
                {CARE_TYPES.find((t) => t.value === selectedType)?.icon}
              </Text>
              <Text style={styles.selectedTypeText}>
                {CARE_TYPES.find((t) => t.value === selectedType)?.label}
              </Text>
            </View>
          </View>

          <View style={styles.formRow}>
            <Text style={styles.formLabel}>
              Date du bulletin <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.formInput}
              value={bulletinDate}
              onChangeText={setBulletinDate}
              placeholder="AAAA-MM-JJ"
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.formLabel}>
              Montant total (TND) <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.formInput}
              value={totalAmount}
              onChangeText={setTotalAmount}
              placeholder="Ex: 150.500"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.formLabel}>Nom du praticien/prestataire</Text>
            <TextInput
              style={styles.formInput}
              value={providerName}
              onChangeText={setProviderName}
              placeholder="Ex: Dr. Ben Ali, Pharmacie Centrale..."
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.formLabel}>Description des soins</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Détails optionnels sur les soins reçus..."
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            Après soumission, vous devrez envoyer le bulletin original par courrier à votre assureur pour finaliser le remboursement.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!totalAmount || submitBulletin.isPending) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!totalAmount || submitBulletin.isPending}
        >
          {submitBulletin.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Soumettre le bulletin</Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 24,
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
    width: '90%',
    height: '55%',
    borderWidth: 0,
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#fff',
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#fff',
    borderTopRightRadius: 12,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#fff',
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#fff',
    borderBottomRightRadius: 12,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  galleryButton: {
    padding: 12,
    alignItems: 'center',
  },
  galleryIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  galleryButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    borderWidth: 4,
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
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  miniPreview: {
    position: 'relative',
    marginBottom: 16,
  },
  miniPreviewImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  miniPreviewBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#22c55e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  miniPreviewBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
    marginBottom: 20,
  },
  typesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  typeCard: {
    width: '31%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  typeCardSelected: {
    borderColor: '#1e3a5f',
    backgroundColor: '#e8f0f8',
  },
  typeIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    textAlign: 'center',
  },
  typeLabelSelected: {
    color: '#1e3a5f',
    fontWeight: '600',
  },
  previewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
  },
  previewOverlayText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  formRow: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#ef4444',
  },
  formInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  formTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  selectedTypeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f0f8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  selectedTypeIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  selectedTypeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e3a5f',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
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
    marginBottom: 24,
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  extractingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  extractingImage: {
    width: 200,
    height: 140,
    borderRadius: 12,
    resizeMode: 'cover',
    opacity: 0.7,
  },
  extractingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e3a5f',
    marginTop: 16,
  },
  extractingSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 20,
  },
  ocrBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  ocrBadgeText: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '500',
  },
  ocrInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  ocrInfoIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  ocrInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 2,
  },
  ocrInfoText: {
    fontSize: 12,
    color: '#15803d',
  },
  ocrWarningText: {
    fontSize: 11,
    color: '#b45309',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
