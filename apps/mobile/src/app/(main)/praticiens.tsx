/**
 * Praticiens Directory Screen with enhanced design
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Linking,
  Platform,
  RefreshControl,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { apiClient } from '@/lib/api-client';
import { Skeleton } from '@/components/Skeleton';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';

interface Praticien {
  id: string;
  nom: string;
  prenom?: string;
  specialite: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  telephone?: string;
  email?: string;
  conventionnement: 'conventionne' | 'non_conventionne' | 'partiellement';
  tauxRemboursement?: number;
  horaires?: string;
  latitude?: number;
  longitude?: number;
  estActif: boolean;
  distance?: number;
}

const SPECIALITES = [
  { value: '', label: 'Toutes', icon: '🏥' },
  { value: 'generaliste', label: 'Généraliste', icon: '🩺' },
  { value: 'cardiologie', label: 'Cardiologue', icon: '❤️' },
  { value: 'dermatologie', label: 'Dermatologue', icon: '🧴' },
  { value: 'ophtalmologie', label: 'Ophtalmologue', icon: '👁️' },
  { value: 'pediatrie', label: 'Pédiatre', icon: '👶' },
  { value: 'dentaire', label: 'Dentiste', icon: '🦷' },
  { value: 'pharmacie', label: 'Pharmacie', icon: '💊' },
  { value: 'laboratoire', label: 'Laboratoire', icon: '🔬' },
];

const CONVENTIONNEMENT_CONFIG = {
  conventionne: { label: 'Conventionné', color: colors.success[500], bg: colors.success[50] },
  non_conventionne: { label: 'Non conv.', color: colors.error[500], bg: colors.error[50] },
  partiellement: { label: 'Partiel', color: colors.warning[500], bg: colors.warning[50] },
};

function PraticienCard({
  praticien,
  index,
  onPress,
  onCall,
  onMap,
}: {
  praticien: Praticien;
  index: number;
  onPress: () => void;
  onCall: (phone: string) => void;
  onMap: (p: Praticien) => void;
}) {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, slideAnim, opacityAnim]);

  const getSpecialiteIcon = (specialite: string): string => {
    const spec = SPECIALITES.find(
      (s) => s.value === specialite.toLowerCase() || s.label.toLowerCase().includes(specialite.toLowerCase())
    );
    return spec?.icon || '🏥';
  };

  const convConfig = CONVENTIONNEMENT_CONFIG[praticien.conventionnement] || CONVENTIONNEMENT_CONFIG.non_conventionne;

  return (
    <Animated.View
      style={{
        transform: [{ translateY: slideAnim }],
        opacity: opacityAnim,
      }}
    >
      <TouchableOpacity
        style={styles.praticienCard}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.praticienHeader}>
          <View style={styles.praticienAvatar}>
            <Text style={styles.avatarIcon}>
              {getSpecialiteIcon(praticien.specialite)}
            </Text>
          </View>
          <View style={styles.praticienInfo}>
            <Text style={styles.praticienName}>
              {praticien.prenom ? `Dr. ${praticien.prenom} ${praticien.nom}` : praticien.nom}
            </Text>
            <Text style={styles.praticienSpecialite}>{praticien.specialite}</Text>
          </View>
          <View style={[styles.convBadge, { backgroundColor: convConfig.bg }]}>
            <Text style={[styles.convBadgeText, { color: convConfig.color }]}>
              {convConfig.label}
            </Text>
          </View>
        </View>

        <View style={styles.praticienBody}>
          {praticien.ville && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>📍</Text>
              <Text style={styles.infoText} numberOfLines={1}>
                {praticien.adresse ? `${praticien.adresse}, ` : ''}{praticien.ville}
                {praticien.distance !== undefined && (
                  <Text style={styles.distanceText}> • {praticien.distance.toFixed(1)} km</Text>
                )}
              </Text>
            </View>
          )}
          {praticien.telephone && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>📞</Text>
              <Text style={styles.infoText}>{praticien.telephone}</Text>
            </View>
          )}
          {praticien.tauxRemboursement && praticien.tauxRemboursement > 0 && (
            <View style={styles.tauxRow}>
              <Text style={styles.tauxLabel}>Remboursement:</Text>
              <Text style={styles.tauxValue}>{praticien.tauxRemboursement}%</Text>
            </View>
          )}
        </View>

        <View style={styles.praticienFooter}>
          {praticien.telephone && (
            <TouchableOpacity
              style={styles.actionButtonPrimary}
              onPress={() => onCall(praticien.telephone!)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>📞</Text>
              <Text style={styles.actionTextPrimary}>Appeler</Text>
            </TouchableOpacity>
          )}
          {(praticien.latitude || praticien.adresse) && (
            <TouchableOpacity
              style={styles.actionButtonSecondary}
              onPress={() => onMap(praticien)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🗺️</Text>
              <Text style={styles.actionTextSecondary}>Itinéraire</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function FilterChip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.filterChipIcon}>{icon}</Text>
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <Skeleton width={56} height={56} borderRadius={28} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Skeleton width="70%" height={18} borderRadius={9} />
              <Skeleton width="40%" height={14} borderRadius={7} style={{ marginTop: 6 }} />
            </View>
          </View>
          <Skeleton width="90%" height={12} borderRadius={6} style={{ marginTop: 12 }} />
          <Skeleton width="60%" height={12} borderRadius={6} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function PraticiensScreen() {
  const [search, setSearch] = useState('');
  const [specialite, setSpecialite] = useState('');
  const [page, setPage] = useState(1);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedPraticien, setSelectedPraticien] = useState<Praticien | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setIsLocating(true);
        try {
          const location = await Location.getCurrentPositionAsync({});
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        } catch {
          // Ignore location error
        }
        setIsLocating(false);
      }
    })();
  }, []);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['praticiens-mobile', search, specialite, page, userLocation],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (specialite) params.set('specialite', specialite);
      if (userLocation) {
        params.set('latitude', userLocation.latitude.toString());
        params.set('longitude', userLocation.longitude.toString());
      }

      const response = await apiClient.get<{
        success: boolean;
        data: { data: Praticien[]; meta: { page: number; limit: number; total: number; totalPages: number } };
      }>(`/sante/praticiens?${params.toString()}`);

      if (response.success && response.data?.data) {
        let praticiens = response.data.data.data;
        if (userLocation) {
          praticiens = praticiens.map((p) => ({
            ...p,
            distance:
              p.latitude && p.longitude
                ? calculateDistance(userLocation.latitude, userLocation.longitude, p.latitude, p.longitude)
                : undefined,
          }));
          praticiens.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        }
        return { ...response.data.data, data: praticiens };
      }
      return { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    },
  });

  const praticiens = data?.data || [];
  const meta = data?.meta || { page: 1, limit: 20, total: 0, totalPages: 1 };

  const handleCall = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  const handleMap = useCallback((praticien: Praticien) => {
    if (praticien.latitude && praticien.longitude) {
      const url = Platform.select({
        ios: `maps:0,0?q=${praticien.nom}@${praticien.latitude},${praticien.longitude}`,
        android: `geo:0,0?q=${praticien.latitude},${praticien.longitude}(${praticien.nom})`,
      });
      if (url) Linking.openURL(url);
    } else if (praticien.adresse) {
      const address = encodeURIComponent(`${praticien.adresse}, ${praticien.ville || ''}, Tunisie`);
      Linking.openURL(`https://maps.google.com/?q=${address}`);
    }
  }, []);

  const handleSpecialiteFilter = (spec: string) => {
    setSpecialite(spec);
    setPage(1);
    setShowFilters(false);
  };

  const getSpecialiteIcon = (specialite: string): string => {
    const spec = SPECIALITES.find(
      (s) => s.value === specialite.toLowerCase() || s.label.toLowerCase().includes(specialite.toLowerCase())
    );
    return spec?.icon || '🏥';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={[colors.info[600], colors.info[700]]}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Annuaire Praticiens</Text>
            <Text style={styles.headerSubtitle}>
              {isLocating ? '📍 Localisation...' : `${meta.total} praticien${meta.total > 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilters(true)}>
            <Text style={styles.filterButtonIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher par nom, spécialité..."
            placeholderTextColor={colors.neutral[400]}
            value={search}
            onChangeText={(text) => {
              setSearch(text);
              setPage(1);
            }}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContainer}
        >
          {SPECIALITES.slice(0, 7).map((spec) => (
            <FilterChip
              key={spec.value}
              label={spec.label}
              icon={spec.icon}
              selected={specialite === spec.value}
              onPress={() => handleSpecialiteFilter(spec.value)}
            />
          ))}
        </ScrollView>

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <FlatList
            data={praticiens}
            renderItem={({ item, index }) => (
              <PraticienCard
                praticien={item}
                index={index}
                onPress={() => setSelectedPraticien(item)}
                onCall={handleCall}
                onMap={handleMap}
              />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isFetching && !isLoading}
                onRefresh={refetch}
                colors={[colors.info[500]]}
                tintColor={colors.info[500]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconContainer}>
                  <Text style={styles.emptyIcon}>🏥</Text>
                </View>
                <Text style={styles.emptyText}>Aucun praticien trouvé</Text>
                <Text style={styles.emptySubtext}>Modifiez vos critères de recherche</Text>
              </View>
            }
            onEndReached={() => {
              if (page < meta.totalPages) setPage((p) => p + 1);
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetching && !isLoading ? (
                <View style={styles.loadingMore}>
                  <Text style={styles.loadingText}>Chargement...</Text>
                </View>
              ) : (
                <View style={{ height: spacing['2xl'] }} />
              )
            }
          />
        )}
      </Animated.View>

      {/* Detail Modal */}
      <Modal
        visible={!!selectedPraticien}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedPraticien(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            {selectedPraticien && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarIcon}>
                      {getSpecialiteIcon(selectedPraticien.specialite)}
                    </Text>
                  </View>
                  <View style={styles.modalHeaderInfo}>
                    <Text style={styles.modalTitle}>
                      {selectedPraticien.prenom
                        ? `Dr. ${selectedPraticien.prenom} ${selectedPraticien.nom}`
                        : selectedPraticien.nom}
                    </Text>
                    <Text style={styles.modalSubtitle}>{selectedPraticien.specialite}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedPraticien(null)}
                    style={styles.modalClose}
                  >
                    <Text style={styles.modalCloseText}>×</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  {/* Convention Badge */}
                  <View style={styles.convSection}>
                    <View
                      style={[
                        styles.modalConvBadge,
                        {
                          backgroundColor:
                            CONVENTIONNEMENT_CONFIG[selectedPraticien.conventionnement]?.bg ||
                            colors.neutral[100],
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalConvText,
                          {
                            color:
                              CONVENTIONNEMENT_CONFIG[selectedPraticien.conventionnement]?.color ||
                              colors.text.secondary,
                          },
                        ]}
                      >
                        {CONVENTIONNEMENT_CONFIG[selectedPraticien.conventionnement]?.label ||
                          'Non conventionné'}
                      </Text>
                    </View>
                  </View>

                  {/* Contact Section */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Contact</Text>
                    {selectedPraticien.adresse && (
                      <TouchableOpacity
                        style={styles.contactRow}
                        onPress={() => handleMap(selectedPraticien)}
                      >
                        <View style={styles.contactIconContainer}>
                          <Text style={styles.contactIcon}>📍</Text>
                        </View>
                        <View style={styles.contactTextContainer}>
                          <Text style={styles.contactText}>{selectedPraticien.adresse}</Text>
                          {selectedPraticien.codePostal && selectedPraticien.ville && (
                            <Text style={styles.contactSubtext}>
                              {selectedPraticien.codePostal} {selectedPraticien.ville}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.contactAction}>→</Text>
                      </TouchableOpacity>
                    )}
                    {selectedPraticien.telephone && (
                      <TouchableOpacity
                        style={styles.contactRow}
                        onPress={() => handleCall(selectedPraticien.telephone!)}
                      >
                        <View style={styles.contactIconContainer}>
                          <Text style={styles.contactIcon}>📞</Text>
                        </View>
                        <Text style={styles.contactText}>{selectedPraticien.telephone}</Text>
                        <Text style={styles.contactAction}>Appeler</Text>
                      </TouchableOpacity>
                    )}
                    {selectedPraticien.email && (
                      <TouchableOpacity
                        style={styles.contactRow}
                        onPress={() => Linking.openURL(`mailto:${selectedPraticien.email}`)}
                      >
                        <View style={styles.contactIconContainer}>
                          <Text style={styles.contactIcon}>✉️</Text>
                        </View>
                        <Text style={styles.contactText}>{selectedPraticien.email}</Text>
                        <Text style={styles.contactAction}>Email</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Remboursement */}
                  {selectedPraticien.tauxRemboursement && selectedPraticien.tauxRemboursement > 0 && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Remboursement</Text>
                      <View style={styles.remboursementCard}>
                        <Text style={styles.remboursementLabel}>Taux de remboursement</Text>
                        <Text style={styles.remboursementValue}>
                          {selectedPraticien.tauxRemboursement}%
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Horaires */}
                  {selectedPraticien.horaires && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Horaires</Text>
                      <View style={styles.horairesCard}>
                        <Text style={styles.horairesText}>{selectedPraticien.horaires}</Text>
                      </View>
                    </View>
                  )}
                </ScrollView>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
                  {selectedPraticien.telephone && (
                    <TouchableOpacity
                      style={styles.modalActionPrimary}
                      onPress={() => handleCall(selectedPraticien.telephone!)}
                    >
                      <Text style={styles.modalActionIcon}>📞</Text>
                      <Text style={styles.modalActionTextPrimary}>Appeler</Text>
                    </TouchableOpacity>
                  )}
                  {(selectedPraticien.latitude || selectedPraticien.adresse) && (
                    <TouchableOpacity
                      style={styles.modalActionSecondary}
                      onPress={() => handleMap(selectedPraticien)}
                    >
                      <Text style={styles.modalActionIcon}>🗺️</Text>
                      <Text style={styles.modalActionTextSecondary}>Itinéraire</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Filter Modal */}
      <Modal visible={showFilters} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.filterModalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filtrer par spécialité</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.filtersList}>
              {SPECIALITES.map((spec) => (
                <TouchableOpacity
                  key={spec.value}
                  style={[styles.filterOption, specialite === spec.value && styles.filterOptionSelected]}
                  onPress={() => handleSpecialiteFilter(spec.value)}
                >
                  <Text style={styles.filterOptionIcon}>{spec.icon}</Text>
                  <Text
                    style={[
                      styles.filterOptionText,
                      specialite === spec.value && styles.filterOptionTextSelected,
                    ]}
                  >
                    {spec.label}
                  </Text>
                  {specialite === spec.value && <Text style={styles.filterCheckmark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: typography.fontWeight.bold,
  },
  headerCenter: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonIcon: {
    fontSize: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: colors.neutral[600],
    lineHeight: 18,
  },
  content: {
    flex: 1,
  },
  filtersScroll: {
    maxHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  filtersContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  filterChipSelected: {
    backgroundColor: colors.info[500],
    borderColor: colors.info[500],
  },
  filterChipIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  filterChipText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  filterChipTextSelected: {
    color: '#fff',
    fontWeight: typography.fontWeight.medium,
  },
  listContent: {
    padding: spacing.lg,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
  skeletonCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  praticienCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  praticienHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  praticienAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.info[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarIcon: {
    fontSize: 24,
  },
  praticienInfo: {
    flex: 1,
  },
  praticienName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  praticienSpecialite: {
    fontSize: typography.fontSize.sm,
    color: colors.info[600],
    marginTop: 2,
  },
  convBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
  },
  convBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  praticienBody: {
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    paddingTop: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  infoIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
    width: 20,
    textAlign: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  distanceText: {
    color: colors.info[500],
    fontWeight: typography.fontWeight.medium,
  },
  tauxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  tauxLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  tauxValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.success[600],
  },
  praticienFooter: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    gap: spacing.sm,
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info[500],
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionTextPrimary: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: '#fff',
  },
  actionTextSecondary: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  emptyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    marginTop: spacing.lg,
    ...shadows.sm,
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
    fontSize: 36,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  loadingMore: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '90%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.neutral[300],
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  modalAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.info[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  modalAvatarIcon: {
    fontSize: 26,
  },
  modalHeaderInfo: {
    flex: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  modalSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.info[600],
    marginTop: 2,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  convSection: {
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  modalConvBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  modalConvText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  modalSection: {
    marginBottom: spacing.xl,
  },
  modalSectionTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  contactIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  contactIcon: {
    fontSize: 18,
  },
  contactTextContainer: {
    flex: 1,
  },
  contactText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  contactSubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  contactAction: {
    fontSize: typography.fontSize.sm,
    color: colors.info[500],
    fontWeight: typography.fontWeight.medium,
  },
  remboursementCard: {
    backgroundColor: colors.success[50],
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remboursementLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.success[700],
  },
  remboursementValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.success[600],
  },
  horairesCard: {
    backgroundColor: colors.neutral[50],
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  horairesText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  modalActionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info[500],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    gap: spacing.sm,
  },
  modalActionSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    gap: spacing.sm,
  },
  modalActionIcon: {
    fontSize: 18,
  },
  modalActionTextPrimary: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: '#fff',
  },
  modalActionTextSecondary: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  filterModalContent: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '70%',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  filterModalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  filtersList: {
    padding: spacing.lg,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  filterOptionSelected: {
    backgroundColor: colors.info[50],
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderBottomWidth: 0,
  },
  filterOptionIcon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  filterOptionText: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  filterOptionTextSelected: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.info[600],
  },
  filterCheckmark: {
    fontSize: 18,
    color: colors.info[500],
    fontWeight: typography.fontWeight.bold,
  },
});
