/**
 * New Demande Screen - Camera capture for bulletin scan with OCR
 *
 * Flow: select-type -> capture -> page-review -> extracting -> ocr-review
 * Supports multi-page document capture (F-006)
 * Pattern modeled after bulletins/nouveau.tsx
 */
import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Image as RNImage,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  FlatList,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system/next';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  fieldConfidences?: Record<string, number>;
  warnings: string[];
}

type Step = 'select-type' | 'capture' | 'page-review' | 'extracting' | 'ocr-review';

async function validateImage(uri: string): Promise<{ valid: boolean; warnings: string[]; error?: string }> {
  const warnings: string[] = [];

  // 1. Check file size using new expo-file-system API
  const file = new File(uri);
  if (!file.exists) {
    return { valid: false, warnings, error: 'Fichier introuvable' };
  }
  if (file.size && file.size > 10 * 1024 * 1024) {
    return { valid: false, warnings, error: 'Le fichier depasse 10 Mo. Veuillez reduire la taille ou reprendre la photo.' };
  }

  // 2. Check format (from URI extension)
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext && !['jpg', 'jpeg', 'png'].includes(ext)) {
    return { valid: false, warnings, error: 'Format non supporte. Seuls JPEG et PNG sont acceptes.' };
  }

  // 3. Check resolution (warning only, non-blocking)
  return new Promise(resolve => {
    RNImage.getSize(
      uri,
      (width, height) => {
        if (width < 1280 || height < 960) {
          warnings.push(`Resolution faible (${width}x${height}). Recommande: 1280x960 minimum pour une meilleure extraction.`);
        }
        resolve({ valid: true, warnings });
      },
      () => resolve({ valid: true, warnings }) // Can't check size, proceed anyway
    );
  });
}

function mergeOcrResults(results: OCRExtractedData[]): OCRExtractedData {
  if (results.length === 0) {
    return { montantTotal: 0, lignes: [], confidence: 0, warnings: [] };
  }
  if (results.length === 1) return results[0];

  const merged: OCRExtractedData = {
    dateSoin: results.find(r => r.dateSoin)?.dateSoin,
    typeSoin: results.find(r => r.typeSoin)?.typeSoin,
    montantTotal: results.reduce((sum, r) => sum + r.montantTotal, 0),
    praticien: results.find(r => r.praticien?.nom)?.praticien,
    lignes: results.flatMap(r => r.lignes),
    confidence: Math.min(...results.map(r => r.confidence)),
    warnings: results.flatMap(r => r.warnings),
  };

  // Merge field confidences: take minimum per field
  const allConfidences = results.filter(r => r.fieldConfidences).map(r => r.fieldConfidences!);
  if (allConfidences.length > 0) {
    const mergedConfidences: Record<string, number> = {};
    for (const fc of allConfidences) {
      for (const [key, val] of Object.entries(fc)) {
        mergedConfidences[key] = mergedConfidences[key] !== undefined
          ? Math.min(mergedConfidences[key], val)
          : val;
      }
    }
    merged.fieldConfidences = mergedConfidences;
  }

  return merged;
}

export default function NouvelleDemande() {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<SanteTypeSoin | null>(null);
  const [step, setStep] = useState<Step>('select-type');
  const [ocrData, setOcrData] = useState<OCRExtractedData | null>(null);
  const [demandeId, setDemandeId] = useState<string | null>(null);
  const [editedAmount, setEditedAmount] = useState<string>('');
  const [editedDate, setEditedDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [praticienName, setPraticienName] = useState('');
  const [extractionProgress, setExtractionProgress] = useState('');
  const [ocrError, setOcrError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const queryClient = useQueryClient();

  const isLowConfidence = (field: string) =>
    ocrData?.fieldConfidences?.[field] !== undefined &&
    ocrData.fieldConfidences[field] < 0.7;

  // Format amount for display (millimes to TND)
  const formatAmount = (millimes: number) => {
    return (millimes / 1000).toFixed(3);
  };

  // OCR extraction: create brouillon -> upload each page -> OCR each -> merge -> prefill
  const runOcrExtraction = async (images: string[]) => {
    setOcrError(null);

    try {
      // 1. Create brouillon demande
      setExtractionProgress('Creation de la demande...');
      const demandeResp = await apiClient.post<{ id: string; numeroDemande: string }>(
        '/sante/demandes',
        {
          typeSoin: selectedType,
          montantDemande: 0,
          dateSoin: new Date().toISOString().split('T')[0],
          statut: 'brouillon',
        }
      );
      if (!demandeResp.success || !demandeResp.data) {
        throw new Error('Failed to create demande');
      }
      const createdId = (demandeResp.data as unknown as { data: { id: string } }).data?.id
        ?? (demandeResp.data as unknown as { id: string }).id;
      setDemandeId(createdId);

      // 2. Upload and OCR each page
      const ocrResults: OCRExtractedData[] = [];
      const totalPages = images.length;
      let hasTimeout = false;

      for (let i = 0; i < totalPages; i++) {
        const imageUri = images[i];
        setExtractionProgress(
          totalPages > 1
            ? `Extraction page ${i + 1}/${totalPages}...`
            : 'Extraction des informations...'
        );

        // Upload
        const formData = new FormData();
        formData.append('file', {
          uri: imageUri,
          type: 'image/jpeg',
          name: `page_${i + 1}.jpg`,
        } as unknown as Blob);
        formData.append('demandeId', createdId);
        formData.append('typeDocument', 'bulletin_soin');

        const uploadResp = await apiClient.upload<{ id: string }>('/sante/documents/upload', formData);
        if (!uploadResp.success || !uploadResp.data) {
          console.warn(`Upload failed for page ${i + 1}, skipping`);
          continue;
        }
        const docId = (uploadResp.data as unknown as { data: { id: string } }).data?.id
          ?? (uploadResp.data as unknown as { id: string }).id;

        // Trigger OCR (with 15s timeout per page)
        const ocrResp = await Promise.race([
          apiClient.post<{ data: OCRExtractedData }>(`/sante/documents/${docId}/ocr`),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
        ]);

        if (ocrResp === null) {
          hasTimeout = true;
        } else if (typeof ocrResp === 'object' && 'success' in ocrResp) {
          if (ocrResp.success && ocrResp.data) {
            const extracted = (ocrResp.data as unknown as { data: OCRExtractedData }).data
              ?? (ocrResp.data as unknown as OCRExtractedData);
            // Skip fallback results (confidence=0 means AI was unavailable)
            if (extracted && extracted.confidence > 0) {
              ocrResults.push(extracted);
            } else {
              console.warn(`OCR page ${i + 1}: resultat fallback (AI indisponible)`);
            }
          } else {
            // OCR API returned an error
            const errorMsg = (ocrResp as { error?: { message?: string } }).error?.message || '';
            console.warn(`OCR page ${i + 1} echouee: ${errorMsg}`);
          }
        }
      }

      // 3. Merge results and prefill
      if (ocrResults.length > 0) {
        const merged = mergeOcrResults(ocrResults);
        setOcrData(merged);

        if (merged.dateSoin) setEditedDate(merged.dateSoin);
        if (merged.typeSoin) setSelectedType(merged.typeSoin);
        if (merged.montantTotal > 0) {
          setEditedAmount((merged.montantTotal / 1000).toFixed(3));
        }
        if (merged.praticien?.nom) setPraticienName(merged.praticien.nom);

        if (hasTimeout) {
          setOcrError('L\'extraction de certaines pages a pris trop de temps. Verifiez les champs ci-dessous.');
        }
      } else if (hasTimeout) {
        setOcrError('L\'extraction a pris trop de temps. Vous pouvez remplir les champs manuellement.');
      } else {
        setOcrError('L\'extraction automatique a echoue. Veuillez remplir les champs manuellement.');
      }
    } catch (error) {
      console.warn('OCR extraction failed, continuing with manual entry:', error);
      setOcrError('L\'extraction automatique a echoue. Veuillez remplir les champs manuellement.');
    } finally {
      setExtractionProgress('');
      setStep('ocr-review');
    }
  };

  // Submit mutation: PATCH brouillon -> soumise
  const submitDemande = useMutation({
    mutationFn: async (data: {
      demandeId: string;
      statut: 'soumise';
      montantDemande: number;
      dateSoin: string;
      typeSoin: SanteTypeSoin;
    }) => {
      const response = await apiClient.patch<{ id: string; numeroDemande: string }>(
        `/sante/demandes/${data.demandeId}`,
        {
          statut: data.statut,
          montantDemande: data.montantDemande,
          dateSoin: data.dateSoin,
          typeSoin: data.typeSoin,
        }
      );
      if (!response.success) {
        const msg = response.error?.message || 'Erreur lors de la soumission';
        throw new Error(msg);
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mes-demandes'] });
      queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
      queryClient.invalidateQueries({ queryKey: ['sante-stats'] });
      const numDemande = (data as unknown as { data: { numeroDemande: string } })?.data?.numeroDemande
        ?? (data as unknown as { numeroDemande: string })?.numeroDemande
        ?? '';
      Alert.alert(
        'Demande soumise',
        `Votre demande ${numDemande} a ete soumise avec succes.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: Error) => {
      Alert.alert(
        'Erreur',
        error.message || 'Une erreur est survenue lors de la soumission. Veuillez reessayer.'
      );
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
        const validation = await validateImage(photo.uri);
        if (!validation.valid) {
          Alert.alert('Fichier invalide', validation.error!);
          return;
        }
        if (validation.warnings.length > 0) {
          Alert.alert(
            'Qualite de l\'image',
            validation.warnings.join('\n'),
            [
              { text: 'Reprendre', style: 'cancel' },
              { text: 'Continuer quand meme', onPress: () => {
                setCapturedImages(prev => [...prev, photo.uri]);
                setStep('page-review');
              }},
            ]
          );
          return;
        }
        setCapturedImages(prev => [...prev, photo.uri]);
        setStep('page-review');
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
      const uri = result.assets[0].uri;
      const validation = await validateImage(uri);
      if (!validation.valid) {
        Alert.alert('Fichier invalide', validation.error!);
        return;
      }
      if (validation.warnings.length > 0) {
        Alert.alert(
          'Qualite de l\'image',
          validation.warnings.join('\n'),
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Continuer quand meme', onPress: () => {
              setCapturedImages(prev => [...prev, uri]);
              setStep('page-review');
            }},
          ]
        );
        return;
      }
      setCapturedImages(prev => [...prev, uri]);
      setStep('page-review');
    }
  };

  const handleRemovePage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleProceedToExtraction = () => {
    if (capturedImages.length === 0) return;
    setStep('extracting');
    runOcrExtraction(capturedImages);
  };

  const handleRetake = () => {
    setCapturedImages([]);
    setOcrData(null);
    setOcrError(null);
    setDemandeId(null);
    setEditedAmount('');
    setEditedDate('');
    setPraticienName('');
    setExtractionProgress('');
    setStep('capture');
  };

  const handleSubmit = () => {
    if (!demandeId || !selectedType) return;

    const montant = parseFloat((editedAmount || '0').replace(',', '.'));
    if (isNaN(montant) || montant <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un montant valide');
      return;
    }

    const dateSoin = editedDate || new Date().toISOString().split('T')[0];

    submitDemande.mutate({
      demandeId,
      statut: 'soumise',
      montantDemande: Math.round(montant * 1000), // TND -> millimes
      dateSoin,
      typeSoin: selectedType,
    });
  };

  // Step 1: Select type of care
  if (step === 'select-type') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{'<-'} Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nouvelle demande</Text>
        </View>

        <ScrollView style={styles.content}>
          <Text style={styles.stepTitle}>1. Type de soin</Text>
          <Text style={styles.stepDescription}>
            Selectionnez le type de soin pour votre demande de remboursement
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
              Nous avons besoin de votre permission pour acceder a la camera
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Autoriser la camera</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.cameraContainer}>
        <View style={styles.cameraHeader}>
          <TouchableOpacity
            onPress={() => setStep(capturedImages.length > 0 ? 'page-review' : 'select-type')}
            style={styles.backButton}
          >
            <Text style={styles.backTextWhite}>{'<-'} Retour</Text>
          </TouchableOpacity>
          <Text style={styles.cameraHeaderTitle}>
            {capturedImages.length > 0 ? `Scanner page ${capturedImages.length + 1}` : 'Scanner le bulletin'}
          </Text>
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

  // Step 3: Page review (multi-page support)
  if (step === 'page-review') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
            <Text style={styles.backText}>{'<-'} Reprendre</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {capturedImages.length} page{capturedImages.length > 1 ? 's' : ''} capturee{capturedImages.length > 1 ? 's' : ''}
          </Text>
        </View>

        <ScrollView style={styles.content}>
          <Text style={styles.stepTitle}>Pages capturees</Text>
          <Text style={styles.stepDescription}>
            Vous pouvez ajouter d'autres pages ou continuer vers l'extraction.
          </Text>

          <View style={styles.pageGrid}>
            {capturedImages.map((uri, index) => (
              <View key={index} style={styles.pageThumbnailContainer}>
                <Image source={{ uri }} style={styles.pageThumbnail} />
                <View style={styles.pageBadge}>
                  <Text style={styles.pageBadgeText}>Page {index + 1}</Text>
                </View>
                <TouchableOpacity
                  style={styles.pageRemoveButton}
                  onPress={() => {
                    handleRemovePage(index);
                    if (capturedImages.length <= 1) {
                      setStep('capture');
                    }
                  }}
                >
                  <Text style={styles.pageRemoveText}>X</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep('capture')}
          >
            <Text style={styles.secondaryButtonText}>Ajouter une page</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, capturedImages.length === 0 && styles.buttonDisabled]}
            onPress={handleProceedToExtraction}
            disabled={capturedImages.length === 0}
          >
            <Text style={styles.primaryButtonText}>Continuer vers l'extraction</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 4: OCR extraction in progress
  if (step === 'extracting') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
            <Text style={styles.backText}>{'<-'} Reprendre</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analyse en cours</Text>
        </View>

        <View style={styles.extractingContainer}>
          {capturedImages.length > 0 && (
            <Image source={{ uri: capturedImages[0] }} style={styles.extractingImage} />
          )}
          <ActivityIndicator size="large" color="#1e3a5f" style={{ marginTop: 24 }} />
          <Text style={styles.extractingTitle}>
            {extractionProgress || 'Extraction des informations...'}
          </Text>
          <Text style={styles.extractingSubtitle}>
            {capturedImages.length > 1
              ? `Analyse de ${capturedImages.length} pages en cours.\nLes resultats seront fusionnes automatiquement.`
              : 'Analyse du bulletin de soins en cours.\nLes champs seront pre-remplis automatiquement.'}
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep('ocr-review')}
          >
            <Text style={styles.secondaryButtonText}>Passer et remplir manuellement</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Step 4: OCR review and submit
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
          <Text style={styles.backText}>{'<-'} Reprendre</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verification</Text>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {capturedImages.length > 0 && (
          <View style={styles.previewContainer}>
            {capturedImages.length === 1 ? (
              <Image source={{ uri: capturedImages[0] }} style={styles.previewImage} />
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={capturedImages}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item, index }) => (
                  <View style={styles.reviewThumbnailContainer}>
                    <Image source={{ uri: item }} style={styles.reviewThumbnail} />
                    <Text style={styles.reviewThumbnailLabel}>Page {index + 1}</Text>
                  </View>
                )}
                contentContainerStyle={styles.reviewThumbnailList}
              />
            )}
          </View>
        )}

        {ocrError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{ocrError}</Text>
            <Text style={styles.errorSubtext}>
              Tous les champs sont modifiables ci-dessous.
            </Text>
          </View>
        )}

        {ocrData && ocrData.confidence > 0 && (
          <View style={styles.ocrInfoCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ocrInfoTitle}>
                Champs pre-remplis automatiquement
              </Text>
              <Text style={styles.ocrInfoText}>
                Confiance: {Math.round(ocrData.confidence * 100)}% — Verifiez et corrigez si necessaire.
              </Text>
            </View>
          </View>
        )}

        {/* Type de soin */}
        <View style={[
          styles.formCard,
          isLowConfidence('typeSoin') && styles.lowConfidenceCard,
        ]}>
          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>Type de soin</Text>
            {isLowConfidence('typeSoin') && (
              <Text style={styles.lowConfidenceWarning}>Confiance faible</Text>
            )}
          </View>
          <Text style={styles.formValue}>
            {TYPES_SOIN.find((t) => t.value === selectedType)?.label || 'Non defini'}
          </Text>
        </View>

        {/* Date du soin */}
        <View style={[
          styles.formCard,
          isLowConfidence('dateSoin') && styles.lowConfidenceCard,
        ]}>
          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>
              Date du soin <Text style={styles.required}>*</Text>
            </Text>
            {isLowConfidence('dateSoin') && (
              <Text style={styles.lowConfidenceWarning}>Confiance faible — verifiez cette valeur</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.datePickerButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={editedDate ? styles.datePickerText : styles.datePickerPlaceholder}>
              {editedDate
                ? new Date(editedDate).toLocaleDateString('fr-TN', { day: '2-digit', month: 'long', year: 'numeric' })
                : 'Selectionner une date'}
            </Text>
            <Text style={styles.datePickerIcon}>📅</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={editedDate ? new Date(editedDate) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              locale="fr-TN"
              onChange={(_event, selectedDate) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) {
                  setEditedDate(selectedDate.toISOString().split('T')[0]);
                }
              }}
            />
          )}
        </View>

        {/* Montant total */}
        <View style={[
          styles.formCard,
          isLowConfidence('montantTotal') && styles.lowConfidenceCard,
        ]}>
          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>
              Montant total (TND) <Text style={styles.required}>*</Text>
            </Text>
            {isLowConfidence('montantTotal') && (
              <Text style={styles.lowConfidenceWarning}>Confiance faible — verifiez cette valeur</Text>
            )}
          </View>
          <TextInput
            style={styles.formInput}
            value={editedAmount}
            onChangeText={setEditedAmount}
            placeholder="Ex: 50.000"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Praticien */}
        <View style={[
          styles.formCard,
          isLowConfidence('praticienNom') && styles.lowConfidenceCard,
        ]}>
          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>Praticien</Text>
            {isLowConfidence('praticienNom') && (
              <Text style={styles.lowConfidenceWarning}>Confiance faible — verifiez cette valeur</Text>
            )}
          </View>
          <TextInput
            style={styles.formInput}
            value={praticienName}
            onChangeText={setPraticienName}
            placeholder="Nom du praticien"
          />
          {ocrData?.praticien?.specialite && (
            <Text style={styles.formSubvalue}>{ocrData.praticien.specialite}</Text>
          )}
        </View>

        {/* Articles/Actes (read-only from OCR) */}
        {ocrData?.lignes && ocrData.lignes.length > 0 && (
          <View style={[
            styles.formCard,
            isLowConfidence('lignes') && styles.lowConfidenceCard,
          ]}>
            <View style={styles.formLabelRow}>
              <Text style={styles.formLabel}>Articles/Actes detectes</Text>
              {isLowConfidence('lignes') && (
                <Text style={styles.lowConfidenceWarning}>Confiance faible</Text>
              )}
            </View>
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

        {/* Warnings */}
        {ocrData?.warnings && ocrData.warnings.length > 0 && (
          <View style={styles.warningCard}>
            {ocrData.warnings.map((w, i) => (
              <Text key={i} style={styles.warningText}>{w}</Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (submitDemande.isPending || !editedAmount) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitDemande.isPending || !editedAmount}
        >
          {submitDemande.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Envoyer la demande</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleRetake}>
          <Text style={styles.secondaryButtonText}>Reprendre la photo</Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
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
  previewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewImage: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
    backgroundColor: '#000',
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
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  lowConfidenceCard: {
    borderLeftColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  required: {
    color: '#ef4444',
  },
  lowConfidenceWarning: {
    fontSize: 11,
    color: '#d97706',
    fontWeight: '500',
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
  datePickerButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePickerText: {
    fontSize: 16,
    color: '#333',
  },
  datePickerPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  datePickerIcon: {
    fontSize: 18,
  },
  formValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  formSubvalue: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  ligneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
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
  errorCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#991b1b',
    marginBottom: 4,
  },
  errorSubtext: {
    fontSize: 12,
    color: '#b91c1c',
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
    marginBottom: 2,
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
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  pageThumbnailContainer: {
    width: '47%',
    position: 'relative',
  },
  pageThumbnail: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    resizeMode: 'cover',
    backgroundColor: '#e0e0e0',
  },
  pageBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pageBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
  pageRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(220,53,69,0.85)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageRemoveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewThumbnailContainer: {
    marginRight: 8,
    alignItems: 'center',
  },
  reviewThumbnail: {
    width: 100,
    height: 70,
    borderRadius: 8,
    resizeMode: 'cover',
    backgroundColor: '#e0e0e0',
  },
  reviewThumbnailLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  reviewThumbnailList: {
    paddingVertical: 4,
  },
  bottomPadding: {
    height: 40,
  },
});
