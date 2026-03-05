/**
 * Demandes List Screen
 */
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SanteDemande, SanteStatutDemande, SanteTypeSoin } from '@dhamen/shared';

const STATUT_LABELS: Record<SanteStatutDemande, string> = {
  soumise: 'Soumise',
  en_examen: 'En examen',
  info_requise: 'Info requise',
  approuvee: 'Approuvée',
  en_paiement: 'En paiement',
  payee: 'Payée',
  rejetee: 'Rejetée',
};

const STATUT_COLORS: Record<SanteStatutDemande, string> = {
  soumise: '#6c757d',
  en_examen: '#ffc107',
  info_requise: '#fd7e14',
  approuvee: '#28a745',
  en_paiement: '#6f42c1',
  payee: '#17a2b8',
  rejetee: '#dc3545',
};

const TYPE_LABELS: Record<SanteTypeSoin, string> = {
  pharmacie: 'Pharmacie',
  consultation: 'Consultation',
  hospitalisation: 'Hospitalisation',
  optique: 'Optique',
  dentaire: 'Dentaire',
  laboratoire: 'Laboratoire',
  kinesitherapie: 'Kinésithérapie',
  autre: 'Autre',
};

interface DemandesResponse {
  success: boolean;
  data: SanteDemande[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function DemandesListScreen() {
  const [filter, setFilter] = useState<SanteStatutDemande | 'all'>('all');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['mes-demandes', filter],
    queryFn: async ({ pageParam = 1 }) => {
      const params: Record<string, string> = {
        page: String(pageParam),
        limit: '20',
      };
      if (filter !== 'all') {
        params.statut = filter;
      }

      const response = await apiClient.get<DemandesResponse>('/sante/demandes/mes-demandes', {
        params,
      });

      const emptyResult: DemandesResponse = { success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } };

      if (!response.success || !response.data) {
        return emptyResult;
      }

      // response.data may be the full DemandesResponse or just the inner data
      const result = response.data as unknown as DemandesResponse;
      if (!result.data || !result.meta) {
        return emptyResult;
      }

      return result;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage?.meta && lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const demandes = data?.pages.flatMap((page) => page.data ?? []) ?? [];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return `${(amount / 1000).toFixed(3)} TND`;
  };

  const renderItem = ({ item }: { item: SanteDemande }) => (
    <TouchableOpacity
      style={styles.demandeCard}
      onPress={() => router.push(`/(main)/demandes/${item.id}`)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.numeroText}>{item.numeroDemande}</Text>
        <View style={[styles.statusBadge, { backgroundColor: STATUT_COLORS[item.statut] }]}>
          <Text style={styles.statusText}>{STATUT_LABELS[item.statut]}</Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.row}>
          <Text style={styles.label}>Type:</Text>
          <Text style={styles.value}>{TYPE_LABELS[item.typeSoin]}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date:</Text>
          <Text style={styles.value}>{formatDate(item.dateSoin)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Montant:</Text>
          <Text style={styles.valueAmount}>{formatAmount(item.montantDemande)}</Text>
        </View>
        {item.montantRembourse !== null && item.montantRembourse > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Remboursé:</Text>
            <Text style={styles.valueGreen}>{formatAmount(item.montantRembourse)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color="#1e3a5f" />
        </View>
      );
    }
    return null;
  };

  const filters: { value: SanteStatutDemande | 'all'; label: string }[] = [
    { value: 'all', label: 'Toutes' },
    { value: 'soumise', label: 'Soumises' },
    { value: 'en_examen', label: 'En examen' },
    { value: 'approuvee', label: 'Approuvées' },
    { value: 'payee', label: 'Payées' },
    { value: 'rejetee', label: 'Rejetées' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes demandes</Text>
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filters}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                filter === item.value && styles.filterChipActive,
              ]}
              onPress={() => setFilter(item.value)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item.value && styles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e3a5f" />
        </View>
      ) : (
        <FlatList
          data={demandes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Aucune demande trouvée</Text>
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => router.push('/(main)/demandes/nouvelle')}
              >
                <Text style={styles.createButtonText}>Créer une demande</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={styles.listContent}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={['#1e3a5f']}
            />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(main)/demandes/nouvelle')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e3a5f',
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    color: '#a0c4e8',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  filtersContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filtersContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1e3a5f',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  demandeCard: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  numeroText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e3a5f',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  cardContent: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  valueAmount: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  valueGreen: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1e3a5f',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  fabIcon: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    lineHeight: 30,
  },
});
