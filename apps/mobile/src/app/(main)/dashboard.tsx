/**
 * Dashboard Screen for SoinFlow Mobile
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getUser, clearAuth } from '@/lib/auth';
import type { UserPublic, SanteDemande } from '@dhamen/shared';

export default function DashboardScreen() {
  const [user, setUserState] = useState<UserPublic | null>(null);

  useEffect(() => {
    getUser().then(setUserState);
  }, []);

  const { data: demandes, isLoading, refetch } = useQuery({
    queryKey: ['mes-demandes'],
    queryFn: async () => {
      const response = await apiClient.getPaginated<SanteDemande>(
        '/sante/demandes/mes-demandes',
        { params: { limit: 5 } }
      );
      if (response.success) {
        return response.data;
      }
      return [];
    },
  });

  const handleLogout = async () => {
    await clearAuth();
    router.replace('/(auth)/login');
  };

  const getStatusColor = (statut: string) => {
    switch (statut) {
      case 'soumise':
        return '#6c757d';
      case 'en_examen':
        return '#ffc107';
      case 'approuvee':
        return '#28a745';
      case 'payee':
        return '#17a2b8';
      case 'rejetee':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getStatusLabel = (statut: string) => {
    const labels: Record<string, string> = {
      soumise: 'Soumise',
      en_examen: 'En examen',
      info_requise: 'Info requise',
      approuvee: 'Approuvée',
      en_paiement: 'En paiement',
      payee: 'Payée',
      rejetee: 'Rejetée',
    };
    return labels[statut] || statut;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour,</Text>
          <Text style={styles.userName}>
            {user?.firstName} {user?.lastName}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      >
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(main)/demandes/nouvelle')}
          >
            <Text style={styles.actionIcon}>+</Text>
            <Text style={styles.actionTitle}>Nouvelle demande</Text>
            <Text style={styles.actionSubtitle}>Scanner un bulletin</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(main)/demandes')}
          >
            <Text style={styles.actionIcon}></Text>
            <Text style={styles.actionTitle}>Mes demandes</Text>
            <Text style={styles.actionSubtitle}>Voir l'historique</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionCardSecondary}
            onPress={() => router.push('/(main)/profil')}
          >
            <Text style={styles.actionIcon}></Text>
            <Text style={styles.actionTitle}>Mon profil</Text>
            <Text style={styles.actionSubtitle}>Plafonds et couverture</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Demandes récentes</Text>
          {demandes && demandes.length > 0 ? (
            demandes.map((demande) => (
              <TouchableOpacity
                key={demande.id}
                style={styles.demandeCard}
                onPress={() => router.push(`/(main)/demandes/${demande.id}`)}
              >
                <View style={styles.demandeHeader}>
                  <Text style={styles.demandeNumero}>{demande.numeroDemande}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(demande.statut) },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {getStatusLabel(demande.statut)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.demandeType}>
                  {demande.typeSoin.charAt(0).toUpperCase() + demande.typeSoin.slice(1)}
                </Text>
                <Text style={styles.demandeMontant}>
                  {(demande.montantDemande / 1000).toFixed(3)} TND
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyText}>Aucune demande récente</Text>
          )}
        </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e3a5f',
  },
  greeting: {
    fontSize: 14,
    color: '#a0c4e8',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    color: '#a0c4e8',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
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
  demandeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  demandeNumero: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e3a5f',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  demandeType: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  demandeMontant: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    padding: 24,
  },
  actionCardSecondary: {
    flex: 1,
    backgroundColor: '#e8f0f8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
});
