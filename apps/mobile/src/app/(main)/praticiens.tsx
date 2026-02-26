/**
 * Praticiens Directory Screen for SoinFlow Mobile
 * Lists practitioners with search, filters and geolocation
 */
import { useState, useEffect, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { apiClient } from '@/lib/api-client';

// Types
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
  distance?: number; // in km
}

interface PraticiensResponse {
  data: Praticien[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Constants
const SPECIALITES = [
  'Toutes',
  'Medecine generale',
  'Cardiologie',
  'Dermatologie',
  'Gynecologie',
  'Ophtalmologie',
  'ORL',
  'Pediatrie',
  'Pharmacie',
  'Laboratoire',
  'Kinesitherapie',
  'Dentaire',
];

const CONVENTIONNEMENT_COLORS: Record<string, string> = {
  conventionne: '#28a745',
  non_conventionne: '#dc3545',
  partiellement: '#ffc107',
};

const CONVENTIONNEMENT_LABELS: Record<string, string> = {
  conventionne: 'Conventionne',
  non_conventionne: 'Non conventionne',
  partiellement: 'Partiellement',
};

export default function PraticiensScreen() {
  const [search, setSearch] = useState('');
  const [specialite, setSpecialite] = useState('Toutes');
  const [page, setPage] = useState(1);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  const [selectedPraticien, setSelectedPraticien] = useState<Praticien | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Get user location
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
        } catch (error) {
          console.log('Location error:', error);
        }
        setIsLocating(false);
      }
    })();
  }, []);

  // Fetch praticiens
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['praticiens-mobile', search, specialite, page, userLocation],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (specialite !== 'Toutes') params.set('specialite', specialite);
      if (userLocation) {
        params.set('latitude', userLocation.latitude.toString());
        params.set('longitude', userLocation.longitude.toString());
      }

      const response = await apiClient.get<{ success: boolean; data: PraticiensResponse }>(
        `/sante/praticiens?${params.toString()}`
      );

      if (response.success && response.data?.data) {
        // Calculate distances if user location is available
        let praticiens = response.data.data.data;
        if (userLocation) {
          praticiens = praticiens.map((p) => ({
            ...p,
            distance:
              p.latitude && p.longitude
                ? calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    p.latitude,
                    p.longitude
                  )
                : undefined,
          }));
          // Sort by distance
          praticiens.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        }
        return { ...response.data.data, data: praticiens };
      }
      return null;
    },
  });

  const praticiens = data?.data || [];
  const meta = data?.meta || { page: 1, limit: 20, total: 0, totalPages: 1 };

  const handleSearch = useCallback(() => {
    setPage(1);
    refetch();
  }, [refetch]);

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleMap = (praticien: Praticien) => {
    if (praticien.latitude && praticien.longitude) {
      const url = Platform.select({
        ios: `maps:0,0?q=${praticien.nom}@${praticien.latitude},${praticien.longitude}`,
        android: `geo:0,0?q=${praticien.latitude},${praticien.longitude}(${praticien.nom})`,
      });
      if (url) Linking.openURL(url);
    } else if (praticien.adresse) {
      const address = encodeURIComponent(
        `${praticien.adresse}, ${praticien.ville || ''}, Tunisie`
      );
      const url = Platform.select({
        ios: `maps:0,0?q=${address}`,
        android: `geo:0,0?q=${address}`,
      });
      if (url) Linking.openURL(url);
    }
  };

  const renderPraticien = ({ item }: { item: Praticien }) => (
    <TouchableOpacity
      style={styles.praticienCard}
      onPress={() => setSelectedPraticien(item)}
    >
      <View style={styles.praticienHeader}>
        <View style={styles.praticienInfo}>
          <Text style={styles.praticienName}>
            {item.prenom ? `${item.prenom} ${item.nom}` : item.nom}
          </Text>
          <Text style={styles.praticienSpecialite}>{item.specialite}</Text>
        </View>
        <View
          style={[
            styles.conventionnementBadge,
            { backgroundColor: CONVENTIONNEMENT_COLORS[item.conventionnement] + '20' },
          ]}
        >
          <Text
            style={[
              styles.conventionnementText,
              { color: CONVENTIONNEMENT_COLORS[item.conventionnement] },
            ]}
          >
            {CONVENTIONNEMENT_LABELS[item.conventionnement]}
          </Text>
        </View>
      </View>

      {item.ville && (
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText}>
            {item.ville}
            {item.distance !== undefined && ` - ${item.distance.toFixed(1)} km`}
          </Text>
        </View>
      )}

      {item.tauxRemboursement && (
        <Text style={styles.remboursement}>
          Remboursement: {item.tauxRemboursement}%
        </Text>
      )}

      <View style={styles.praticienActions}>
        {item.telephone && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleCall(item.telephone!)}
          >
            <Text style={styles.actionIcon}>📞</Text>
            <Text style={styles.actionText}>Appeler</Text>
          </TouchableOpacity>
        )}
        {(item.latitude || item.adresse) && (
          <TouchableOpacity style={styles.actionButton} onPress={() => handleMap(item)}>
            <Text style={styles.actionIcon}>🗺️</Text>
            <Text style={styles.actionText}>Itineraire</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Annuaire Praticiens</Text>
        {isLocating && (
          <View style={styles.locatingBadge}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.locatingText}>Localisation...</Text>
          </View>
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom, specialite..."
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilters(true)}>
          <Text style={styles.filterIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Active filters */}
      {specialite !== 'Toutes' && (
        <View style={styles.activeFilters}>
          <TouchableOpacity
            style={styles.activeFilter}
            onPress={() => setSpecialite('Toutes')}
          >
            <Text style={styles.activeFilterText}>{specialite}</Text>
            <Text style={styles.activeFilterClose}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results count */}
      <View style={styles.resultsInfo}>
        <Text style={styles.resultsText}>
          {meta.total} praticien{meta.total > 1 ? 's' : ''} trouve{meta.total > 1 ? 's' : ''}
        </Text>
        {userLocation && (
          <Text style={styles.locationActiveText}>📍 Tri par distance</Text>
        )}
      </View>

      {/* List */}
      <FlatList
        data={praticiens}
        renderItem={renderPraticien}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading || isFetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏥</Text>
              <Text style={styles.emptyText}>Aucun praticien trouve</Text>
              <Text style={styles.emptySubtext}>Modifiez vos criteres de recherche</Text>
            </View>
          ) : null
        }
        onEndReached={() => {
          if (page < meta.totalPages) {
            setPage((p) => p + 1);
          }
        }}
        onEndReachedThreshold={0.5}
      />

      {/* Filter Modal */}
      <Modal visible={showFilters} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filtrer par specialite</Text>
            {SPECIALITES.map((spec) => (
              <TouchableOpacity
                key={spec}
                style={[
                  styles.filterOption,
                  specialite === spec && styles.filterOptionActive,
                ]}
                onPress={() => {
                  setSpecialite(spec);
                  setPage(1);
                  setShowFilters(false);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    specialite === spec && styles.filterOptionTextActive,
                  ]}
                >
                  {spec}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowFilters(false)}
            >
              <Text style={styles.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal
        visible={!!selectedPraticien}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedPraticien(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContent}>
            {selectedPraticien && (
              <PraticienDetail
                praticien={selectedPraticien}
                onClose={() => setSelectedPraticien(null)}
                onCall={handleCall}
                onMap={handleMap}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Detail component
function PraticienDetail({
  praticien,
  onClose,
  onCall,
  onMap,
}: {
  praticien: Praticien;
  onClose: () => void;
  onCall: (phone: string) => void;
  onMap: (p: Praticien) => void;
}) {
  return (
    <View style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <View>
          <Text style={styles.detailName}>
            {praticien.prenom ? `${praticien.prenom} ${praticien.nom}` : praticien.nom}
          </Text>
          <Text style={styles.detailSpecialite}>{praticien.specialite}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.detailBadge,
          { backgroundColor: CONVENTIONNEMENT_COLORS[praticien.conventionnement] + '20' },
        ]}
      >
        <Text
          style={[
            styles.detailBadgeText,
            { color: CONVENTIONNEMENT_COLORS[praticien.conventionnement] },
          ]}
        >
          {CONVENTIONNEMENT_LABELS[praticien.conventionnement]}
        </Text>
      </View>

      <View style={styles.detailSection}>
        {praticien.adresse && (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📍</Text>
            <View>
              <Text style={styles.detailText}>{praticien.adresse}</Text>
              {praticien.codePostal && praticien.ville && (
                <Text style={styles.detailSubtext}>
                  {praticien.codePostal} {praticien.ville}
                </Text>
              )}
            </View>
          </View>
        )}

        {praticien.telephone && (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📞</Text>
            <Text style={styles.detailText}>{praticien.telephone}</Text>
          </View>
        )}

        {praticien.email && (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>✉️</Text>
            <Text style={styles.detailText}>{praticien.email}</Text>
          </View>
        )}

        {praticien.horaires && (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>🕐</Text>
            <Text style={styles.detailText}>{praticien.horaires}</Text>
          </View>
        )}

        {praticien.tauxRemboursement && (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>💰</Text>
            <Text style={styles.detailText}>
              Remboursement: {praticien.tauxRemboursement}%
            </Text>
          </View>
        )}
      </View>

      <View style={styles.detailActions}>
        {praticien.telephone && (
          <TouchableOpacity
            style={styles.detailActionButton}
            onPress={() => onCall(praticien.telephone!)}
          >
            <Text style={styles.detailActionIcon}>📞</Text>
            <Text style={styles.detailActionText}>Appeler</Text>
          </TouchableOpacity>
        )}
        {(praticien.latitude || praticien.adresse) && (
          <TouchableOpacity
            style={[styles.detailActionButton, styles.detailActionButtonPrimary]}
            onPress={() => onMap(praticien)}
          >
            <Text style={styles.detailActionIcon}>🗺️</Text>
            <Text style={[styles.detailActionText, styles.detailActionTextPrimary]}>
              Itineraire
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Helper function to calculate distance between two coordinates
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    backgroundColor: '#1e3a5f',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  locatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locatingText: {
    color: '#a0c4e8',
    fontSize: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  filterButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterIcon: {
    fontSize: 18,
  },
  activeFilters: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  activeFilterText: {
    color: '#fff',
    fontSize: 12,
  },
  activeFilterClose: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultsText: {
    fontSize: 12,
    color: '#666',
  },
  locationActiveText: {
    fontSize: 12,
    color: '#1e3a5f',
  },
  listContent: {
    padding: 12,
    paddingTop: 0,
  },
  praticienCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  praticienHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  praticienInfo: {
    flex: 1,
  },
  praticienName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  praticienSpecialite: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  conventionnementBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  conventionnementText: {
    fontSize: 11,
    fontWeight: '500',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  locationText: {
    fontSize: 13,
    color: '#666',
  },
  remboursement: {
    fontSize: 13,
    color: '#1e3a5f',
    fontWeight: '500',
    marginBottom: 12,
  },
  praticienActions: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    fontSize: 14,
  },
  actionText: {
    fontSize: 13,
    color: '#1e3a5f',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  filterOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterOptionActive: {
    backgroundColor: '#f0f7ff',
  },
  filterOptionText: {
    fontSize: 15,
    color: '#333',
  },
  filterOptionTextActive: {
    color: '#1e3a5f',
    fontWeight: '600',
  },
  modalClose: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  detailModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  detailContainer: {
    padding: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  detailName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  detailSpecialite: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
    lineHeight: 28,
  },
  detailBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 20,
  },
  detailBadgeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  detailSection: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  detailIcon: {
    fontSize: 16,
    marginRight: 12,
    width: 24,
  },
  detailText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  detailSubtext: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 12,
  },
  detailActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  detailActionButtonPrimary: {
    backgroundColor: '#1e3a5f',
  },
  detailActionIcon: {
    fontSize: 16,
  },
  detailActionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  detailActionTextPrimary: {
    color: '#fff',
  },
});
