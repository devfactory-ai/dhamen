/**
 * Bulletins de Soins Screen for SoinFlow Mobile
 * Shows history of bulletins with payment workflow status
 * Enhanced with unified design system
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Platform,
  Dimensions,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';
import { Skeleton } from '@/components/ui/Skeleton';

// Blank bulletin types for download
const BLANK_BULLETINS = [
  {
    id: 'consultation',
    title: 'Bulletin Consultation',
    description: 'Pour les consultations médicales',
    icon: '🩺',
    filename: 'bulletin_consultation.pdf',
  },
  {
    id: 'pharmacy',
    title: 'Bulletin Pharmacie',
    description: 'Pour les achats en pharmacie',
    icon: '💊',
    filename: 'bulletin_pharmacie.pdf',
  },
  {
    id: 'lab',
    title: 'Bulletin Analyses',
    description: 'Pour les analyses de laboratoire',
    icon: '🔬',
    filename: 'bulletin_analyses.pdf',
  },
  {
    id: 'hospital',
    title: 'Bulletin Hospitalisation',
    description: 'Pour les séjours hospitaliers',
    icon: '🏥',
    filename: 'bulletin_hospitalisation.pdf',
  },
  {
    id: 'universal',
    title: 'Bulletin Universel',
    description: 'Formulaire multi-usage',
    icon: '📋',
    filename: 'bulletin_universel.pdf',
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Types
type BulletinStatus =
  | 'scan_uploaded'
  | 'paper_received'
  | 'paper_incomplete'
  | 'paper_complete'
  | 'processing'
  | 'approved'
  | 'pending_payment'
  | 'reimbursed'
  | 'rejected';

interface BulletinSoins {
  id: string;
  bulletin_number: string;
  bulletin_date: string;
  provider_name: string | null;
  provider_specialty: string | null;
  care_type: string;
  care_description: string | null;
  total_amount: number;
  reimbursed_amount: number;
  status: BulletinStatus;
  submission_date: string;
  paper_received_date: string | null;
  processing_date: string | null;
  reimbursement_date: string | null;
  estimated_reimbursement_date: string | null;
  rejection_reason: string | null;
  scan_url: string | null;
  missing_documents: string[] | null;
  approved_date: string | null;
  approved_amount: number | null;
  payment_reference: string | null;
  payment_method: string | null;
  payment_date: string | null;
  payment_notes: string | null;
}

interface BulletinStats {
  total: number;
  scan_uploaded: number;
  paper_received: number;
  processing: number;
  approved: number;
  pending_payment: number;
  reimbursed: number;
  rejected: number;
  total_amount: number;
  total_reimbursed: number;
  awaiting_payment_amount: number;
}

const statusConfig: Record<BulletinStatus, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  scan_uploaded: {
    label: 'Scan soumis',
    icon: '📤',
    color: colors.warning[600],
    bgColor: colors.warning[50],
    description: 'En attente du bulletin papier',
  },
  paper_received: {
    label: 'Papier reçu',
    icon: '📬',
    color: colors.primary[600],
    bgColor: colors.primary[50],
    description: 'Vérification en cours',
  },
  paper_incomplete: {
    label: 'Dossier incomplet',
    icon: '⚠️',
    color: colors.warning[700],
    bgColor: colors.warning[100],
    description: 'Documents manquants - délai 15j',
  },
  paper_complete: {
    label: 'Dossier complet',
    icon: '✅',
    color: colors.success[600],
    bgColor: colors.success[50],
    description: 'Délai de traitement: 2j',
  },
  processing: {
    label: 'En traitement',
    icon: '⏳',
    color: colors.primary[600],
    bgColor: colors.primary[50],
    description: 'Remboursement en cours',
  },
  approved: {
    label: 'Approuvé',
    icon: '👍',
    color: colors.success[500],
    bgColor: colors.success[50],
    description: 'En attente de paiement',
  },
  pending_payment: {
    label: 'Paiement en cours',
    icon: '💳',
    color: colors.warning[600],
    bgColor: colors.warning[50],
    description: 'Virement en traitement',
  },
  reimbursed: {
    label: 'Remboursé',
    icon: '✓',
    color: colors.success[600],
    bgColor: colors.success[50],
    description: 'Paiement effectué',
  },
  rejected: {
    label: 'Rejeté',
    icon: '✗',
    color: colors.error[600],
    bgColor: colors.error[50],
    description: 'Demande rejetée',
  },
};

const careTypeConfig: Record<string, { label: string; icon: string; color: string }> = {
  consultation: { label: 'Consultation', icon: '🩺', color: colors.primary[500] },
  pharmacy: { label: 'Pharmacie', icon: '💊', color: colors.success[500] },
  lab: { label: 'Analyses', icon: '🔬', color: colors.warning[500] },
  hospital: { label: 'Hospitalisation', icon: '🏥', color: colors.error[500] },
};

// Animated stat card component
interface StatCardProps {
  value: number;
  label: string;
  color: string;
  delay: number;
}

function StatCard({ value, label, color, delay }: StatCardProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const numberAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();

    Animated.timing(numberAnim, {
      toValue: value,
      duration: 800,
      delay: delay + 200,
      useNativeDriver: false,
    }).start();
  }, [delay, scaleAnim, numberAnim, value]);

  return (
    <Animated.View
      style={[
        styles.statCard,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// Animated bulletin card component
interface BulletinCardProps {
  bulletin: BulletinSoins;
  index: number;
  onPress: () => void;
}

function BulletinCard({ bulletin, index, onPress }: BulletinCardProps) {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, slideAnim, opacityAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const config = statusConfig[bulletin.status];
  const careConfig = careTypeConfig[bulletin.care_type] || careTypeConfig.consultation;

  const formatAmount = (amount: number | null | undefined) => {
    if (!amount) return '0.000 TND';
    return (amount / 1).toFixed(2) + ' TND';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <Animated.View
      style={[
        styles.bulletinCardWrapper,
        {
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim },
          ],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.bulletinCard}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View style={styles.bulletinHeader}>
          <View style={[styles.careTypeIcon, { backgroundColor: `${careConfig.color}15` }]}>
            <Text style={styles.careTypeIconText}>{careConfig.icon}</Text>
          </View>
          <View style={styles.bulletinInfo}>
            <Text style={styles.bulletinNumber}>{bulletin.bulletin_number}</Text>
            <Text style={styles.bulletinDate}>{formatDate(bulletin.bulletin_date)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.bgColor }]}>
            <Text style={[styles.statusText, { color: config.color }]}>
              {config.icon} {config.label}
            </Text>
          </View>
        </View>

        <View style={styles.bulletinDivider} />

        <View style={styles.bulletinBody}>
          <View style={styles.amountRow}>
            <View style={styles.amountItem}>
              <Text style={styles.amountLabel}>Montant</Text>
              <Text style={styles.amountValue}>{formatAmount(bulletin.total_amount)}</Text>
            </View>
            {bulletin.status === 'reimbursed' && (
              <View style={styles.amountItem}>
                <Text style={styles.amountLabel}>Remboursé</Text>
                <Text style={[styles.amountValue, { color: colors.success[600] }]}>
                  {formatAmount(bulletin.reimbursed_amount)}
                </Text>
              </View>
            )}
            {(bulletin.status === 'approved' || bulletin.status === 'pending_payment') && (
              <View style={styles.amountItem}>
                <Text style={styles.amountLabel}>Approuvé</Text>
                <Text style={[styles.amountValue, { color: colors.primary[600] }]}>
                  {formatAmount(bulletin.approved_amount || bulletin.total_amount)}
                </Text>
              </View>
            )}
          </View>

          {bulletin.provider_name && (
            <View style={styles.providerRow}>
              <Text style={styles.providerIcon}>👨‍⚕️</Text>
              <Text style={styles.providerText}>
                {bulletin.provider_name}
                {bulletin.provider_specialty && ` - ${bulletin.provider_specialty}`}
              </Text>
            </View>
          )}

          <View style={styles.statusDescRow}>
            <View style={[styles.statusDot, { backgroundColor: config.color }]} />
            <Text style={styles.statusDescription}>{config.description}</Text>
          </View>
        </View>

        <View style={styles.bulletinFooter}>
          <Text style={styles.viewDetailsText}>Voir les détails →</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Action button component
interface ActionButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  primary?: boolean;
}

function ActionButton({ icon, label, onPress, primary = false }: ActionButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.actionButton,
          primary ? styles.actionButtonPrimary : styles.actionButtonSecondary,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <Text style={styles.actionButtonIcon}>{icon}</Text>
        <Text style={[
          styles.actionButtonText,
          !primary && styles.actionButtonTextSecondary,
        ]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Filter chip component
interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function FilterChip({ label, active, onPress }: FilterChipProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, friction: 10, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 10, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.filterChip, active && styles.filterChipActive]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <Skeleton width={48} height={48} style={{ borderRadius: 24 }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Skeleton width={120} height={16} style={{ marginBottom: 6 }} />
              <Skeleton width={80} height={12} />
            </View>
            <Skeleton width={80} height={24} style={{ borderRadius: 12 }} />
          </View>
          <View style={styles.skeletonBody}>
            <Skeleton width="60%" height={20} style={{ marginBottom: 8 }} />
            <Skeleton width="40%" height={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Adherent profile for pre-filled bulletins
interface AdherentProfile {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  matricule: string;
  address?: string;
  phone?: string;
  email?: string;
}

export default function BulletinsScreen() {
  const [selectedBulletin, setSelectedBulletin] = useState<BulletinSoins | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [prefillMode, setPrefillMode] = useState<'blank' | 'prefilled'>('prefilled');
  const [selectedTemplate, setSelectedTemplate] = useState<typeof BLANK_BULLETINS[0] | null>(null);
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  // Fetch adherent profile for pre-filled bulletins
  const { data: adherentProfile } = useQuery({
    queryKey: ['adherent-profile'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: AdherentProfile }>(
        '/sante/profil/me'
      );
      if (response.success) {
        return response.data;
      }
      return null;
    },
    retry: false,
  });

  // Handle template selection - show options
  const handleSelectTemplate = (bulletin: typeof BLANK_BULLETINS[0]) => {
    setSelectedTemplate(bulletin);
  };

  // Download bulletin PDF (blank or pre-filled)
  const handleDownloadBulletin = async (mode: 'blank' | 'prefilled') => {
    if (!selectedTemplate) return;

    try {
      setDownloadingId(selectedTemplate.id);

      // Build URL with optional pre-fill parameter
      let pdfUrl = `${apiClient.baseUrl}/bulletins-soins/templates/${selectedTemplate.filename}`;

      if (mode === 'prefilled' && adherentProfile) {
        // Add query params for pre-filled data
        const params = new URLSearchParams({
          prefill: 'true',
          firstName: adherentProfile.first_name || '',
          lastName: adherentProfile.last_name || '',
          dateOfBirth: adherentProfile.date_of_birth || '',
          matricule: adherentProfile.matricule || '',
          address: adherentProfile.address || '',
          phone: adherentProfile.phone || '',
        });
        pdfUrl += `?${params.toString()}`;
      }

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();

      if (!isAvailable) {
        // Fallback to opening in browser
        Alert.alert(
          'Télécharger',
          'Voulez-vous ouvrir le bulletin dans votre navigateur?',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Ouvrir',
              onPress: () => Linking.openURL(pdfUrl)
            },
          ]
        );
        setDownloadingId(null);
        setSelectedTemplate(null);
        return;
      }

      // Download file to local storage
      const suffix = mode === 'prefilled' ? '_prerempli' : '_vierge';
      const filename = selectedTemplate.filename.replace('.pdf', `${suffix}.pdf`);
      const fileUri = FileSystem.documentDirectory + filename;
      const downloadResult = await FileSystem.downloadAsync(pdfUrl, fileUri);

      if (downloadResult.status === 200) {
        // Share the file (allows printing, saving, etc.)
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Imprimer ${selectedTemplate.title}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Erreur', 'Impossible de télécharger le bulletin. Veuillez réessayer.');
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert(
        'Erreur de téléchargement',
        'Une erreur est survenue lors du téléchargement. Vérifiez votre connexion internet.'
      );
    } finally {
      setDownloadingId(null);
      setSelectedTemplate(null);
    }
  };

  // Fetch bulletins
  const { data: bulletinsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mes-bulletins', statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('page', String(page));
      params.append('limit', '20');

      const url = `/bulletins-soins/me${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<{
        success: boolean;
        data: BulletinSoins[];
        meta: { page: number; limit: number; total: number };
      }>(url);

      if (response.success) {
        return {
          data: response.data || [],
          meta: (response as { meta?: { total: number } }).meta || { total: 0 },
        };
      }
      return { data: [], meta: { total: 0 } };
    },
    retry: false,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['mes-bulletins-stats'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: BulletinStats }>(
        '/bulletins-soins/me/stats'
      );
      if (response.success) {
        return response.data;
      }
      return null;
    },
    retry: false,
  });

  const formatAmount = (amount: number | null | undefined) => {
    if (!amount) return '0.000 TND';
    return (amount / 1).toFixed(2) + ' TND';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleNewBulletin = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission caméra requise pour scanner un bulletin');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      router.push({
        pathname: '/(main)/bulletins/nouveau',
        params: { imageUri: result.assets[0].uri },
      });
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission galerie requise');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      router.push({
        pathname: '/(main)/bulletins/nouveau',
        params: { imageUri: result.assets[0].uri },
      });
    }
  };

  const getPaymentMethodLabel = (method: string | null) => {
    if (!method) return '-';
    const labels: Record<string, string> = {
      bank_transfer: 'Virement bancaire',
      check: 'Chèque',
      cash: 'Espèces',
      mobile_payment: 'Paiement mobile',
    };
    return labels[method] || method;
  };

  const pendingCount = (stats?.scan_uploaded || 0) + (stats?.paper_received || 0);
  const paymentCount = (stats?.approved || 0) + (stats?.pending_payment || 0);

  const filters = [
    { key: 'all', label: 'Tous' },
    { key: 'scan_uploaded', label: 'Scan soumis' },
    { key: 'paper_received', label: 'Papier reçu' },
    { key: 'processing', label: 'En traitement' },
    { key: 'approved', label: 'Approuvé' },
    { key: 'pending_payment', label: 'Paiement' },
    { key: 'reimbursed', label: 'Remboursé' },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Gradient Header */}
        <Animated.View
          style={[
            styles.headerContainer,
            {
              opacity: headerAnim,
              transform: [
                {
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[colors.primary[600], colors.primary[700]]}
            style={styles.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>

            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>Mes Bulletins de Soins</Text>
              <Text style={styles.headerSubtitle}>Suivez vos remboursements</Text>
            </View>

            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{stats?.total || 0}</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <ActionButton
            icon="📷"
            label="Scanner"
            onPress={handleNewBulletin}
            primary
          />
          <View style={{ width: 8 }} />
          <ActionButton
            icon="🖼️"
            label="Galerie"
            onPress={handlePickImage}
          />
          <View style={{ width: 8 }} />
          <ActionButton
            icon="📥"
            label="Vierges"
            onPress={() => setShowDownloadModal(true)}
          />
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <StatCard value={stats?.total || 0} label="Total" color={colors.text.primary} delay={0} />
          <StatCard value={pendingCount} label="En attente" color={colors.warning[600]} delay={100} />
          <StatCard value={paymentCount} label="En paiement" color={colors.primary[600]} delay={200} />
          <StatCard value={stats?.reimbursed || 0} label="Remboursés" color={colors.success[600]} delay={300} />
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {filters.map((filter) => (
            <FilterChip
              key={filter.key}
              label={filter.label}
              active={statusFilter === filter.key}
              onPress={() => setStatusFilter(filter.key)}
            />
          ))}
        </ScrollView>

        {/* Bulletins List */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <FlatList<BulletinSoins>
            data={bulletinsData?.data || []}
            renderItem={({ item, index }: { item: BulletinSoins; index: number }) => (
              <BulletinCard
                bulletin={item}
                index={index}
                onPress={() => setSelectedBulletin(item)}
              />
            )}
            keyExtractor={(item: BulletinSoins) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isFetching && !isLoading}
                onRefresh={refetch}
                colors={[colors.primary[600]]}
                tintColor={colors.primary[600]}
              />
            }
            ListEmptyComponent={
              <Animated.View
                style={[
                  styles.emptyCard,
                  {
                    opacity: headerAnim,
                    transform: [{ scale: headerAnim }],
                  },
                ]}
              >
                <View style={styles.emptyIconContainer}>
                  <Text style={styles.emptyIcon}>📋</Text>
                </View>
                <Text style={styles.emptyText}>Aucun bulletin</Text>
                <Text style={styles.emptySubtext}>
                  Scannez ou photographiez votre bulletin de soins pour demander un remboursement.
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={handleNewBulletin}
                >
                  <LinearGradient
                    colors={[colors.primary[500], colors.primary[600]]}
                    style={styles.emptyButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.emptyButtonText}>📷 Scanner un bulletin</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            }
            ListFooterComponent={
              isFetching && !isLoading ? (
                <View style={styles.loadingMore}>
                  <View style={styles.loadingDots}>
                    {[0, 1, 2].map((i) => (
                      <View key={i} style={[styles.loadingDot, { backgroundColor: colors.primary[500] }]} />
                    ))}
                  </View>
                  <Text style={styles.loadingText}>Chargement...</Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Detail Modal */}
        <Modal
          visible={selectedBulletin !== null}
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedBulletin(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    {selectedBulletin?.bulletin_number}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedBulletin && formatDate(selectedBulletin.bulletin_date)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedBulletin(null)}
                  style={styles.modalClose}
                >
                  <Text style={styles.modalCloseText}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {selectedBulletin && (
                  <>
                    {/* Status */}
                    <View style={styles.modalStatusContainer}>
                      <View
                        style={[
                          styles.modalStatusBadge,
                          { backgroundColor: statusConfig[selectedBulletin.status].bgColor },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalStatusText,
                            { color: statusConfig[selectedBulletin.status].color },
                          ]}
                        >
                          {statusConfig[selectedBulletin.status].icon}{' '}
                          {statusConfig[selectedBulletin.status].label}
                        </Text>
                      </View>
                      <Text style={styles.modalStatusDescription}>
                        {statusConfig[selectedBulletin.status].description}
                      </Text>
                    </View>

                    {/* Amounts */}
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>💰 Montants</Text>
                      <View style={styles.modalCard}>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalLabel}>Montant total</Text>
                          <Text style={styles.modalValue}>
                            {formatAmount(selectedBulletin.total_amount)}
                          </Text>
                        </View>
                        {selectedBulletin.approved_amount && (
                          <View style={styles.modalRow}>
                            <Text style={styles.modalLabel}>Montant approuvé</Text>
                            <Text style={[styles.modalValue, { color: colors.primary[600] }]}>
                              {formatAmount(selectedBulletin.approved_amount)}
                            </Text>
                          </View>
                        )}
                        {selectedBulletin.reimbursed_amount > 0 && (
                          <View style={[styles.modalRow, { borderBottomWidth: 0 }]}>
                            <Text style={styles.modalLabel}>Montant remboursé</Text>
                            <Text style={[styles.modalValue, { color: colors.success[600] }]}>
                              {formatAmount(selectedBulletin.reimbursed_amount)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Informations */}
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>ℹ️ Informations</Text>
                      <View style={styles.modalCard}>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalLabel}>Date du bulletin</Text>
                          <Text style={styles.modalValue}>
                            {formatDate(selectedBulletin.bulletin_date)}
                          </Text>
                        </View>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalLabel}>Date de soumission</Text>
                          <Text style={styles.modalValue}>
                            {formatDate(selectedBulletin.submission_date)}
                          </Text>
                        </View>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalLabel}>Type de soin</Text>
                          <Text style={styles.modalValue}>
                            {careTypeConfig[selectedBulletin.care_type]?.icon}{' '}
                            {careTypeConfig[selectedBulletin.care_type]?.label || selectedBulletin.care_type}
                          </Text>
                        </View>
                        {selectedBulletin.provider_name && (
                          <View style={[styles.modalRow, { borderBottomWidth: 0 }]}>
                            <Text style={styles.modalLabel}>Praticien</Text>
                            <Text style={styles.modalValue}>
                              {selectedBulletin.provider_name}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Payment Info */}
                    {(selectedBulletin.status === 'approved' ||
                      selectedBulletin.status === 'pending_payment' ||
                      selectedBulletin.status === 'reimbursed') && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>💳 Paiement</Text>
                        <View style={styles.modalCard}>
                          {selectedBulletin.approved_date && (
                            <View style={styles.modalRow}>
                              <Text style={styles.modalLabel}>Date d'approbation</Text>
                              <Text style={styles.modalValue}>
                                {formatDate(selectedBulletin.approved_date)}
                              </Text>
                            </View>
                          )}
                          {selectedBulletin.payment_method && (
                            <View style={styles.modalRow}>
                              <Text style={styles.modalLabel}>Mode de paiement</Text>
                              <Text style={styles.modalValue}>
                                {getPaymentMethodLabel(selectedBulletin.payment_method)}
                              </Text>
                            </View>
                          )}
                          {selectedBulletin.payment_reference && (
                            <View style={styles.modalRow}>
                              <Text style={styles.modalLabel}>Référence</Text>
                              <Text style={[styles.modalValue, styles.mono]}>
                                {selectedBulletin.payment_reference}
                              </Text>
                            </View>
                          )}
                          {selectedBulletin.payment_date && (
                            <View style={[styles.modalRow, { borderBottomWidth: 0 }]}>
                              <Text style={styles.modalLabel}>Date de paiement</Text>
                              <Text style={styles.modalValue}>
                                {formatDate(selectedBulletin.payment_date)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}

                    {/* Rejection Reason */}
                    {selectedBulletin.rejection_reason && (
                      <View style={styles.rejectionCard}>
                        <View style={styles.rejectionHeader}>
                          <Text style={styles.rejectionIcon}>❌</Text>
                          <Text style={styles.rejectionTitle}>Motif du rejet</Text>
                        </View>
                        <Text style={styles.rejectionText}>
                          {selectedBulletin.rejection_reason}
                        </Text>
                      </View>
                    )}

                    {/* Missing Documents */}
                    {selectedBulletin.missing_documents &&
                      selectedBulletin.missing_documents.length > 0 && (
                        <View style={styles.warningCard}>
                          <View style={styles.warningHeader}>
                            <Text style={styles.warningIcon}>⚠️</Text>
                            <Text style={styles.warningTitle}>Documents manquants</Text>
                          </View>
                          {selectedBulletin.missing_documents.map((doc: string, index: number) => (
                            <View key={index} style={styles.warningItem}>
                              <Text style={styles.warningBullet}>•</Text>
                              <Text style={styles.warningText}>{doc}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                    <View style={styles.modalBottomSpacer} />
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Download Blank Bulletins Modal */}
        <Modal
          visible={showDownloadModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowDownloadModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.downloadModalContent}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Bulletins Vierges</Text>
                  <Text style={styles.modalSubtitle}>Télécharger pour impression</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowDownloadModal(false)}
                  style={styles.modalClose}
                >
                  <Text style={styles.modalCloseText}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.downloadModalBody} showsVerticalScrollIndicator={false}>
                {!selectedTemplate ? (
                  <>
                    <View style={styles.downloadInfoBanner}>
                      <Text style={styles.downloadInfoIcon}>ℹ️</Text>
                      <Text style={styles.downloadInfoText}>
                        Choisissez le type de bulletin à télécharger.
                        Vous pourrez ensuite choisir entre vierge ou pré-rempli.
                      </Text>
                    </View>

                    {BLANK_BULLETINS.map((bulletin) => (
                      <TouchableOpacity
                        key={bulletin.id}
                        style={styles.downloadItem}
                        onPress={() => handleSelectTemplate(bulletin)}
                        disabled={downloadingId !== null}
                      >
                        <View style={[
                          styles.downloadItemIcon,
                          { backgroundColor: `${colors.primary[500]}15` }
                        ]}>
                          <Text style={styles.downloadItemIconText}>{bulletin.icon}</Text>
                        </View>
                        <View style={styles.downloadItemContent}>
                          <Text style={styles.downloadItemTitle}>{bulletin.title}</Text>
                          <Text style={styles.downloadItemDescription}>{bulletin.description}</Text>
                        </View>
                        <View style={styles.downloadItemAction}>
                          <View style={styles.downloadChevron}>
                            <Text style={styles.downloadChevronText}>›</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}

                    <View style={styles.downloadTips}>
                      <Text style={styles.downloadTipsTitle}>💡 Conseils</Text>
                      <View style={styles.downloadTipItem}>
                        <Text style={styles.downloadTipBullet}>•</Text>
                        <Text style={styles.downloadTipText}>Imprimez en format A4</Text>
                      </View>
                      <View style={styles.downloadTipItem}>
                        <Text style={styles.downloadTipBullet}>•</Text>
                        <Text style={styles.downloadTipText}>Remplissez lisiblement au stylo noir</Text>
                      </View>
                      <View style={styles.downloadTipItem}>
                        <Text style={styles.downloadTipBullet}>•</Text>
                        <Text style={styles.downloadTipText}>Faites signer et cacheter par le praticien</Text>
                      </View>
                      <View style={styles.downloadTipItem}>
                        <Text style={styles.downloadTipBullet}>•</Text>
                        <Text style={styles.downloadTipText}>Scannez le bulletin rempli dans l'app</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    {/* Back button */}
                    <TouchableOpacity
                      style={styles.downloadBackButton}
                      onPress={() => setSelectedTemplate(null)}
                    >
                      <Text style={styles.downloadBackButtonText}>← Retour aux types</Text>
                    </TouchableOpacity>

                    {/* Selected template info */}
                    <View style={styles.selectedTemplateCard}>
                      <Text style={styles.selectedTemplateIcon}>{selectedTemplate.icon}</Text>
                      <Text style={styles.selectedTemplateTitle}>{selectedTemplate.title}</Text>
                      <Text style={styles.selectedTemplateDesc}>{selectedTemplate.description}</Text>
                    </View>

                    {/* Download options */}
                    <Text style={styles.downloadOptionsTitle}>Choisissez le format :</Text>

                    {/* Option 1: Blank */}
                    <TouchableOpacity
                      style={styles.downloadOptionCard}
                      onPress={() => handleDownloadBulletin('blank')}
                      disabled={downloadingId !== null}
                    >
                      <View style={styles.downloadOptionHeader}>
                        <View style={[styles.downloadOptionIcon, { backgroundColor: colors.neutral[100] }]}>
                          <Text style={styles.downloadOptionIconText}>📄</Text>
                        </View>
                        <View style={styles.downloadOptionContent}>
                          <Text style={styles.downloadOptionTitle}>Bulletin Vierge</Text>
                          <Text style={styles.downloadOptionDesc}>
                            Sans informations pré-remplies, tout à compléter
                          </Text>
                        </View>
                        {downloadingId === selectedTemplate.id ? (
                          <View style={styles.downloadingIndicator}>
                            <Text style={styles.downloadingText}>...</Text>
                          </View>
                        ) : (
                          <View style={styles.downloadButton}>
                            <Text style={styles.downloadButtonText}>📥</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Option 2: Pre-filled */}
                    <TouchableOpacity
                      style={[styles.downloadOptionCard, styles.downloadOptionCardHighlight]}
                      onPress={() => handleDownloadBulletin('prefilled')}
                      disabled={downloadingId !== null || !adherentProfile}
                    >
                      <View style={styles.downloadOptionHeader}>
                        <View style={[styles.downloadOptionIcon, { backgroundColor: colors.primary[50] }]}>
                          <Text style={styles.downloadOptionIconText}>✍️</Text>
                        </View>
                        <View style={styles.downloadOptionContent}>
                          <Text style={styles.downloadOptionTitle}>Bulletin Pré-rempli</Text>
                          <Text style={styles.downloadOptionDesc}>
                            Vos informations déjà complétées
                          </Text>
                        </View>
                        {downloadingId === selectedTemplate.id ? (
                          <View style={styles.downloadingIndicator}>
                            <Text style={styles.downloadingText}>...</Text>
                          </View>
                        ) : (
                          <View style={[styles.downloadButton, { backgroundColor: colors.primary[600] }]}>
                            <Text style={styles.downloadButtonText}>📥</Text>
                          </View>
                        )}
                      </View>
                      {adherentProfile && (
                        <View style={styles.prefilledPreview}>
                          <Text style={styles.prefilledPreviewTitle}>Aperçu des données :</Text>
                          <View style={styles.prefilledPreviewRow}>
                            <Text style={styles.prefilledPreviewLabel}>Nom :</Text>
                            <Text style={styles.prefilledPreviewValue}>
                              {adherentProfile.last_name} {adherentProfile.first_name}
                            </Text>
                          </View>
                          <View style={styles.prefilledPreviewRow}>
                            <Text style={styles.prefilledPreviewLabel}>Matricule :</Text>
                            <Text style={styles.prefilledPreviewValue}>{adherentProfile.matricule}</Text>
                          </View>
                          {adherentProfile.date_of_birth && (
                            <View style={styles.prefilledPreviewRow}>
                              <Text style={styles.prefilledPreviewLabel}>Date de naissance :</Text>
                              <Text style={styles.prefilledPreviewValue}>
                                {new Date(adherentProfile.date_of_birth).toLocaleDateString('fr-TN')}
                              </Text>
                            </View>
                          )}
                          {adherentProfile.address && (
                            <View style={styles.prefilledPreviewRow}>
                              <Text style={styles.prefilledPreviewLabel}>Adresse :</Text>
                              <Text style={styles.prefilledPreviewValue} numberOfLines={1}>
                                {adherentProfile.address}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                      {!adherentProfile && (
                        <View style={styles.prefilledUnavailable}>
                          <Text style={styles.prefilledUnavailableText}>
                            ⚠️ Profil non disponible - Veuillez compléter votre profil
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>✨ Recommandé : Pré-rempli pour gagner du temps</Text>
                    </View>
                  </>
                )}

                <View style={styles.modalBottomSpacer} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    overflow: 'hidden',
  },
  headerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    paddingTop: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.white,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  headerBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  headerBadgeText: {
    color: colors.white,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionButton: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.sm,
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary[600],
  },
  actionButtonSecondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary[600],
  },
  actionButtonIcon: {
    fontSize: 20,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  actionButtonTextSecondary: {
    color: colors.primary[600],
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  filterScroll: {
    maxHeight: 56,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    flexDirection: 'row',
  },
  filterChip: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginRight: spacing.xs,
  },
  filterChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  filterChipText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  bulletinCardWrapper: {
    marginBottom: spacing.md,
  },
  bulletinCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  bulletinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  careTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  careTypeIconText: {
    fontSize: 22,
  },
  bulletinInfo: {
    flex: 1,
  },
  bulletinNumber: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  bulletinDate: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  bulletinDivider: {
    height: 1,
    backgroundColor: colors.neutral[100],
    marginHorizontal: spacing.md,
  },
  bulletinBody: {
    padding: spacing.md,
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  amountItem: {
    flex: 1,
  },
  amountLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  amountValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginTop: 2,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  providerIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  providerText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  statusDescRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  statusDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  bulletinFooter: {
    backgroundColor: colors.neutral[50],
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-end',
  },
  viewDetailsText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[600],
    fontWeight: typography.fontWeight.medium,
  },
  skeletonContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  skeletonCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  skeletonBody: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    marginTop: spacing.lg,
    ...shadows.md,
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
    fontSize: 40,
  },
  emptyText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  emptyButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  emptyButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  loadingMore: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.6,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.neutral[300],
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  modalSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    marginBottom: spacing.xl,
    paddingVertical: spacing.md,
  },
  modalStatusBadge: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  modalStatusText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  modalStatusDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  modalSection: {
    marginBottom: spacing.lg,
  },
  modalSectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  modalLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  modalValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  rejectionCard: {
    backgroundColor: colors.error[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.error[500],
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  rejectionIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  rejectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error[700],
  },
  rejectionText: {
    fontSize: typography.fontSize.sm,
    color: colors.error[600],
    lineHeight: 20,
  },
  warningCard: {
    backgroundColor: colors.warning[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning[500],
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  warningIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  warningTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.warning[700],
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  warningBullet: {
    fontSize: typography.fontSize.sm,
    color: colors.warning[600],
    marginRight: spacing.xs,
    lineHeight: 20,
  },
  warningText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.warning[600],
    lineHeight: 20,
  },
  modalBottomSpacer: {
    height: 40,
  },
  // Download Modal Styles
  downloadModalContent: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    maxHeight: '80%',
  },
  downloadModalBody: {
    padding: spacing.lg,
  },
  downloadInfoBanner: {
    backgroundColor: colors.info[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  downloadInfoIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  downloadInfoText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.info[700],
    lineHeight: 20,
  },
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  downloadItemIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  downloadItemIconText: {
    fontSize: 22,
  },
  downloadItemContent: {
    flex: 1,
  },
  downloadItemTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: 2,
  },
  downloadItemDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  downloadItemAction: {
    marginLeft: spacing.sm,
  },
  downloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadButtonText: {
    fontSize: 18,
  },
  downloadingIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadingText: {
    fontSize: typography.fontSize.md,
    color: colors.text.tertiary,
  },
  downloadTips: {
    backgroundColor: colors.success[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  downloadTipsTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.success[700],
    marginBottom: spacing.sm,
  },
  downloadTipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  downloadTipBullet: {
    fontSize: typography.fontSize.sm,
    color: colors.success[600],
    marginRight: spacing.xs,
    lineHeight: 20,
  },
  downloadTipText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.success[600],
    lineHeight: 20,
  },
  // New download option styles
  downloadChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadChevronText: {
    fontSize: 20,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  downloadBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  downloadBackButtonText: {
    fontSize: typography.fontSize.md,
    color: colors.primary[600],
    fontWeight: typography.fontWeight.medium,
  },
  selectedTemplateCard: {
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary[200],
  },
  selectedTemplateIcon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  selectedTemplateTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[700],
    marginBottom: spacing.xs,
  },
  selectedTemplateDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[600],
    textAlign: 'center',
  },
  downloadOptionsTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  downloadOptionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    ...shadows.sm,
  },
  downloadOptionCardHighlight: {
    borderColor: colors.primary[300],
    borderWidth: 2,
    backgroundColor: colors.primary[50],
  },
  downloadOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  downloadOptionIconText: {
    fontSize: 22,
  },
  downloadOptionContent: {
    flex: 1,
  },
  downloadOptionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: 2,
  },
  downloadOptionDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  prefilledPreview: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  prefilledPreviewTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prefilledPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  prefilledPreviewLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    width: 110,
  },
  prefilledPreviewValue: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  prefilledUnavailable: {
    backgroundColor: colors.warning[50],
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  prefilledUnavailableText: {
    fontSize: typography.fontSize.sm,
    color: colors.warning[700],
    textAlign: 'center',
  },
  recommendedBadge: {
    backgroundColor: colors.success[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  recommendedBadgeText: {
    fontSize: typography.fontSize.sm,
    color: colors.success[700],
    fontWeight: typography.fontWeight.medium,
  },
});
