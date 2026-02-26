/**
 * Eligibility Check Screen for SoinFlow Mobile
 * Allows adherents to verify their coverage eligibility
 */
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface EligibilityResult {
  estEligible: boolean;
  adherent: {
    id: string;
    matricule: string;
    nom: string;
    prenom: string;
  };
  formule?: {
    code: string;
    nom: string;
  };
  couverture?: {
    typeSoin: string;
    tauxRemboursement: number;
    plafondAnnuel: number;
    montantRestant: number;
    estCouvert: boolean;
  };
  motifIneligibilite?: string;
  dateVerification: string;
}

const TYPES_SOIN = [
  { value: 'pharmacie', label: 'Pharmacie', icon: '💊' },
  { value: 'consultation', label: 'Consultation', icon: '🩺' },
  { value: 'analyse', label: 'Analyses', icon: '🔬' },
  { value: 'radiologie', label: 'Radiologie', icon: '📷' },
  { value: 'hospitalisation', label: 'Hospitalisation', icon: '🏥' },
  { value: 'dentaire', label: 'Dentaire', icon: '🦷' },
  { value: 'optique', label: 'Optique', icon: '👓' },
];

export default function EligibilityScreen() {
  const [matricule, setMatricule] = useState('');
  const [selectedType, setSelectedType] = useState('pharmacie');
  const [montant, setMontant] = useState('');
  const [result, setResult] = useState<EligibilityResult | null>(null);

  const checkEligibility = useMutation({
    mutationFn: async (data: { matricule: string; typeSoin: string; montant?: number }) => {
      const response = await apiClient.post<{ success: boolean; data: EligibilityResult }>(
        '/sante/eligibility/check',
        data
      );
      if (response.success && response.data?.data) {
        return response.data.data;
      }
      throw new Error(response.error?.message || 'Erreur lors de la verification');
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: () => {
      setResult(null);
    },
  });

  const handleCheck = () => {
    if (!matricule.trim()) {
      return;
    }
    checkEligibility.mutate({
      matricule: matricule.trim(),
      typeSoin: selectedType,
      montant: montant ? Number.parseFloat(montant) * 1000 : undefined,
    });
  };

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Verification Eligibilite</Text>
        <Text style={styles.headerSubtitle}>Verifiez votre couverture sante</Text>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Matricule Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Matricule adherent</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: ADH-2024-0001"
            value={matricule}
            onChangeText={setMatricule}
            autoCapitalize="characters"
          />
        </View>

        {/* Type de soin */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Type de soin</Text>
          <View style={styles.typeGrid}>
            {TYPES_SOIN.map((type) => (
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
        </View>

        {/* Montant (optional) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Montant estime (optionnel)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: 50.000"
            value={montant}
            onChangeText={setMontant}
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>En dinars tunisiens (TND)</Text>
        </View>

        {/* Check Button */}
        <TouchableOpacity
          style={[styles.checkButton, !matricule && styles.checkButtonDisabled]}
          onPress={handleCheck}
          disabled={!matricule || checkEligibility.isPending}
        >
          {checkEligibility.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.checkButtonText}>Verifier l'eligibilite</Text>
          )}
        </TouchableOpacity>

        {/* Result */}
        {result && (
          <View style={styles.resultContainer}>
            <View
              style={[
                styles.resultHeader,
                result.estEligible ? styles.resultHeaderSuccess : styles.resultHeaderError,
              ]}
            >
              <Text style={styles.resultIcon}>
                {result.estEligible ? '✅' : '❌'}
              </Text>
              <Text style={styles.resultStatus}>
                {result.estEligible ? 'ELIGIBLE' : 'NON ELIGIBLE'}
              </Text>
            </View>

            <View style={styles.resultBody}>
              {/* Adherent Info */}
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Adherent</Text>
                <Text style={styles.resultText}>
                  {result.adherent.prenom} {result.adherent.nom}
                </Text>
                <Text style={styles.resultSubtext}>
                  Matricule: {result.adherent.matricule}
                </Text>
              </View>

              {/* Formule */}
              {result.formule && (
                <View style={styles.resultSection}>
                  <Text style={styles.resultSectionTitle}>Formule</Text>
                  <Text style={styles.resultText}>{result.formule.nom}</Text>
                  <Text style={styles.resultSubtext}>Code: {result.formule.code}</Text>
                </View>
              )}

              {/* Couverture */}
              {result.couverture && (
                <View style={styles.resultSection}>
                  <Text style={styles.resultSectionTitle}>Couverture</Text>
                  <View style={styles.couvertureRow}>
                    <Text style={styles.couvertureLabel}>Taux remboursement</Text>
                    <Text style={styles.couvertureValue}>
                      {result.couverture.tauxRemboursement}%
                    </Text>
                  </View>
                  <View style={styles.couvertureRow}>
                    <Text style={styles.couvertureLabel}>Plafond annuel</Text>
                    <Text style={styles.couvertureValue}>
                      {formatAmount(result.couverture.plafondAnnuel)}
                    </Text>
                  </View>
                  <View style={styles.couvertureRow}>
                    <Text style={styles.couvertureLabel}>Montant restant</Text>
                    <Text style={[styles.couvertureValue, styles.couvertureValueHighlight]}>
                      {formatAmount(result.couverture.montantRestant)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Motif ineligibilite */}
              {result.motifIneligibilite && (
                <View style={styles.motifContainer}>
                  <Text style={styles.motifTitle}>Motif</Text>
                  <Text style={styles.motifText}>{result.motifIneligibilite}</Text>
                </View>
              )}

              {/* Verification date */}
              <Text style={styles.verificationDate}>
                Verifie le {new Date(result.dateVerification).toLocaleDateString('fr-TN', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        )}

        {/* Error */}
        {checkEligibility.isError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>
              {(checkEligibility.error as Error)?.message || 'Erreur lors de la verification'}
            </Text>
          </View>
        )}
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
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    width: '30%',
    flexGrow: 1,
  },
  typeCardSelected: {
    borderColor: '#1e3a5f',
    backgroundColor: '#f0f7ff',
  },
  typeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  typeLabelSelected: {
    color: '#1e3a5f',
    fontWeight: '600',
  },
  checkButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  checkButtonDisabled: {
    backgroundColor: '#a0a0a0',
  },
  checkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  resultHeaderSuccess: {
    backgroundColor: '#d4edda',
  },
  resultHeaderError: {
    backgroundColor: '#f8d7da',
  },
  resultIcon: {
    fontSize: 24,
  },
  resultStatus: {
    fontSize: 18,
    fontWeight: '700',
  },
  resultBody: {
    padding: 16,
  },
  resultSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  resultSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  resultText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  resultSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  couvertureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  couvertureLabel: {
    fontSize: 14,
    color: '#666',
  },
  couvertureValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  couvertureValueHighlight: {
    color: '#28a745',
    fontWeight: '600',
  },
  motifContainer: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  motifTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  motifText: {
    fontSize: 14,
    color: '#856404',
  },
  verificationDate: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  errorIcon: {
    fontSize: 24,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#721c24',
  },
});
