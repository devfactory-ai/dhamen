/**
 * Eligibility Check Screen for Dhamen Mobile
 * Beautiful design with animated interactions
 */
import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';

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
  { value: 'pharmacie', label: 'Pharmacie', icon: '💊', color: colors.primary[500] },
  { value: 'consultation', label: 'Consultation', icon: '🩺', color: colors.success.main },
  { value: 'analyse', label: 'Analyses', icon: '🔬', color: colors.info.main },
  { value: 'radiologie', label: 'Radiologie', icon: '📷', color: colors.warning.main },
  { value: 'hospitalisation', label: 'Hospital.', icon: '🏥', color: colors.error.main },
  { value: 'dentaire', label: 'Dentaire', icon: '🦷', color: colors.gray[500] },
  { value: 'optique', label: 'Optique', icon: '👓', color: colors.primary[400] },
];

function TypeCard({
  type,
  selected,
  onSelect,
  index,
}: {
  type: (typeof TYPES_SOIN)[0];
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: index * 50,
      friction: 8,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, [index, scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.typeCardWrapper,
        {
          opacity: scaleAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.typeCard, selected && styles.typeCardSelected]}
        onPress={onSelect}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.typeIconContainer,
            { backgroundColor: selected ? `${type.color}20` : colors.gray[100] },
          ]}
        >
          <Text style={styles.typeIcon}>{type.icon}</Text>
        </View>
        <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>
          {type.label}
        </Text>
        {selected && <View style={[styles.typeIndicator, { backgroundColor: type.color }]} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function EligibilityScreen() {
  const [matricule, setMatricule] = useState('');
  const [selectedType, setSelectedType] = useState('pharmacie');
  const [montant, setMontant] = useState('');
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [inputFocused, setInputFocused] = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const resultAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

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
      Animated.spring(resultAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    },
    onError: () => {
      setResult(null);
      resultAnim.setValue(0);
    },
  });

  const handleCheck = () => {
    if (!matricule.trim()) return;
    Keyboard.dismiss();
    resultAnim.setValue(0);
    checkEligibility.mutate({
      matricule: matricule.trim(),
      typeSoin: selectedType,
      montant: montant ? Number.parseFloat(montant) * 1000 : undefined,
    });
  };

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
  };

  const selectedTypeData = TYPES_SOIN.find((t) => t.value === selectedType);

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View
        style={[
          styles.headerWrapper,
          {
            opacity: headerAnim,
            transform: [
              { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[colors.primary[600], colors.primary[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <SafeAreaView edges={['top']}>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>Verification Eligibilite</Text>
              <Text style={styles.headerSubtitle}>Verifiez votre couverture sante</Text>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Animated.View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Matricule Input */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Matricule adherent</Text>
          <View
            style={[
              styles.inputContainer,
              inputFocused && styles.inputContainerFocused,
            ]}
          >
            <Text style={styles.inputIcon}>🔍</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: ADH-2024-0001"
              placeholderTextColor={colors.text.tertiary}
              value={matricule}
              onChangeText={setMatricule}
              autoCapitalize="characters"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
          </View>
        </View>

        {/* Type de soin */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Type de soin</Text>
          <View style={styles.typeGrid}>
            {TYPES_SOIN.map((type, index) => (
              <TypeCard
                key={type.value}
                type={type}
                selected={selectedType === type.value}
                onSelect={() => setSelectedType(type.value)}
                index={index}
              />
            ))}
          </View>
        </View>

        {/* Montant */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Montant estime (optionnel)</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>💵</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 50.000"
              placeholderTextColor={colors.text.tertiary}
              value={montant}
              onChangeText={setMontant}
              keyboardType="decimal-pad"
            />
            <Text style={styles.inputSuffix}>TND</Text>
          </View>
        </View>

        {/* Check Button */}
        <TouchableOpacity
          style={[styles.checkButton, !matricule && styles.checkButtonDisabled]}
          onPress={handleCheck}
          disabled={!matricule || checkEligibility.isPending}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={
              matricule
                ? [colors.primary[500], colors.primary[600]]
                : [colors.gray[300], colors.gray[400]]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.checkButtonGradient}
          >
            {checkEligibility.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.checkButtonIcon}>✨</Text>
                <Text style={styles.checkButtonText}>Verifier l'eligibilite</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Result */}
        {result && (
          <Animated.View
            style={[
              styles.resultContainer,
              {
                opacity: resultAnim,
                transform: [
                  { scale: resultAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
                ],
              },
            ]}
          >
            {/* Status Header */}
            <View
              style={[
                styles.resultHeader,
                result.estEligible ? styles.resultHeaderSuccess : styles.resultHeaderError,
              ]}
            >
              <View style={styles.resultStatusContainer}>
                <View
                  style={[
                    styles.resultStatusIcon,
                    result.estEligible
                      ? styles.resultStatusIconSuccess
                      : styles.resultStatusIconError,
                  ]}
                >
                  <Text style={styles.resultStatusEmoji}>
                    {result.estEligible ? '✅' : '❌'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.resultStatusText,
                    result.estEligible
                      ? styles.resultStatusTextSuccess
                      : styles.resultStatusTextError,
                  ]}
                >
                  {result.estEligible ? 'ELIGIBLE' : 'NON ELIGIBLE'}
                </Text>
              </View>
              <View style={styles.resultTypeContainer}>
                <Text style={styles.resultTypeIcon}>{selectedTypeData?.icon}</Text>
                <Text style={styles.resultTypeText}>{selectedTypeData?.label}</Text>
              </View>
            </View>

            {/* Adherent Info */}
            <View style={styles.resultSection}>
              <View style={styles.resultSectionHeader}>
                <Text style={styles.resultSectionIcon}>👤</Text>
                <Text style={styles.resultSectionTitle}>Adherent</Text>
              </View>
              <Text style={styles.resultName}>
                {result.adherent.prenom} {result.adherent.nom}
              </Text>
              <Text style={styles.resultMatricule}>
                Matricule: {result.adherent.matricule}
              </Text>
            </View>

            {/* Formule */}
            {result.formule && (
              <View style={styles.resultSection}>
                <View style={styles.resultSectionHeader}>
                  <Text style={styles.resultSectionIcon}>🏷️</Text>
                  <Text style={styles.resultSectionTitle}>Formule</Text>
                </View>
                <Text style={styles.resultName}>{result.formule.nom}</Text>
                <Text style={styles.resultMatricule}>Code: {result.formule.code}</Text>
              </View>
            )}

            {/* Couverture */}
            {result.couverture && (
              <View style={styles.resultSection}>
                <View style={styles.resultSectionHeader}>
                  <Text style={styles.resultSectionIcon}>📊</Text>
                  <Text style={styles.resultSectionTitle}>Couverture</Text>
                </View>
                <View style={styles.couvertureGrid}>
                  <View style={styles.couvertureItem}>
                    <Text style={styles.couvertureLabel}>Taux</Text>
                    <Text style={styles.couvertureValue}>
                      {result.couverture.tauxRemboursement}%
                    </Text>
                  </View>
                  <View style={styles.couvertureItem}>
                    <Text style={styles.couvertureLabel}>Plafond</Text>
                    <Text style={styles.couvertureValue}>
                      {formatAmount(result.couverture.plafondAnnuel)}
                    </Text>
                  </View>
                  <View style={[styles.couvertureItem, styles.couvertureItemFull]}>
                    <Text style={styles.couvertureLabel}>Montant restant</Text>
                    <Text style={[styles.couvertureValue, styles.couvertureValueHighlight]}>
                      {formatAmount(result.couverture.montantRestant)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Motif ineligibilite */}
            {result.motifIneligibilite && (
              <View style={styles.motifContainer}>
                <View style={styles.motifHeader}>
                  <Text style={styles.motifIcon}>⚠️</Text>
                  <Text style={styles.motifTitle}>Motif</Text>
                </View>
                <Text style={styles.motifText}>{result.motifIneligibilite}</Text>
              </View>
            )}

            {/* Verification date */}
            <Text style={styles.verificationDate}>
              Verifie le{' '}
              {new Date(result.dateVerification).toLocaleDateString('fr-TN', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </Animated.View>
        )}

        {/* Error */}
        {checkEligibility.isError && (
          <View style={styles.errorContainer}>
            <View style={styles.errorIconContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
            </View>
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Erreur</Text>
              <Text style={styles.errorText}>
                {(checkEligibility.error as Error)?.message || 'Erreur lors de la verification'}
              </Text>
            </View>
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
  headerWrapper: {
    zIndex: 10,
  },
  header: {
    paddingBottom: spacing[4],
    borderBottomLeftRadius: borderRadius['2xl'],
    borderBottomRightRadius: borderRadius['2xl'],
    ...shadows.lg,
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
  },
  contentContainer: {
    padding: spacing[5],
    paddingBottom: spacing[24],
  },
  inputSection: {
    marginBottom: spacing[5],
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    minHeight: 56,
    borderWidth: 2,
    borderColor: colors.border.light,
    ...shadows.sm,
  },
  inputContainerFocused: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  inputIcon: {
    fontSize: 20,
    marginRight: spacing[3],
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    paddingVertical: spacing[4],
  },
  inputSuffix: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.tertiary,
    marginLeft: spacing[2],
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing[1],
  },
  typeCardWrapper: {
    width: '25%',
    padding: spacing[1],
  },
  typeCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border.light,
    ...shadows.sm,
  },
  typeCardSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  typeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  typeIcon: {
    fontSize: 22,
  },
  typeLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
    fontWeight: typography.fontWeight.medium,
  },
  typeLabelSelected: {
    color: colors.primary[600],
    fontWeight: typography.fontWeight.semibold,
  },
  typeIndicator: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  checkButton: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginTop: spacing[2],
    marginBottom: spacing[6],
    ...shadows.md,
  },
  checkButtonDisabled: {
    opacity: 0.7,
  },
  checkButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[5],
  },
  checkButtonIcon: {
    fontSize: 20,
    marginRight: spacing[2],
  },
  checkButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
  },
  resultContainer: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden',
    ...shadows.lg,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[4],
  },
  resultHeaderSuccess: {
    backgroundColor: colors.success.light,
  },
  resultHeaderError: {
    backgroundColor: colors.error.light,
  },
  resultStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultStatusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  resultStatusIconSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  resultStatusIconError: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  resultStatusEmoji: {
    fontSize: 24,
  },
  resultStatusText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  resultStatusTextSuccess: {
    color: colors.success.dark,
  },
  resultStatusTextError: {
    color: colors.error.dark,
  },
  resultTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
  },
  resultTypeIcon: {
    fontSize: 16,
    marginRight: spacing[2],
  },
  resultTypeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  resultSection: {
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  resultSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  resultSectionIcon: {
    fontSize: 16,
    marginRight: spacing[2],
  },
  resultSectionTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  resultMatricule: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  couvertureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing[2],
    marginHorizontal: -spacing[2],
  },
  couvertureItem: {
    width: '50%',
    paddingHorizontal: spacing[2],
    marginBottom: spacing[3],
  },
  couvertureItemFull: {
    width: '100%',
  },
  couvertureLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    marginBottom: 2,
  },
  couvertureValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  couvertureValueHighlight: {
    color: colors.success.main,
  },
  motifContainer: {
    backgroundColor: colors.warning.light,
    margin: spacing[4],
    borderRadius: borderRadius.lg,
    padding: spacing[4],
  },
  motifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  motifIcon: {
    fontSize: 16,
    marginRight: spacing[2],
  },
  motifTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.warning.dark,
  },
  motifText: {
    fontSize: typography.fontSize.sm,
    color: colors.warning.dark,
    lineHeight: 20,
  },
  verificationDate: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    textAlign: 'center',
    padding: spacing[4],
  },
  errorContainer: {
    backgroundColor: colors.error.light,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  errorIcon: {
    fontSize: 24,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error.dark,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error.dark,
    marginTop: 2,
  },
});
