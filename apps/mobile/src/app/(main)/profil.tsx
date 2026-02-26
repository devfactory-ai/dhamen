/**
 * User Profile Screen for SoinFlow Mobile
 * Shows user info, coverage details and consumption plafonds
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getUser } from '@/lib/auth';
import type { UserPublic } from '@dhamen/shared';

interface PlafondInfo {
  typeSoin: string;
  montantPlafond: number;
  montantConsomme: number;
  montantRestant: number;
  pourcentageUtilise: number;
}

interface FormuleInfo {
  id: string;
  code: string;
  nom: string;
  plafondGlobal: number | null;
  tarifMensuel: number;
}

interface ProfilData {
  adherent: {
    id: string;
    matricule: string;
    dateNaissance: string;
    estActif: boolean;
  };
  formule: FormuleInfo | null;
  plafonds: PlafondInfo[];
}

export default function ProfilScreen() {
  const [user, setUserState] = useState<UserPublic | null>(null);

  useEffect(() => {
    getUser().then(setUserState);
  }, []);

  const { data: profil, isLoading, refetch } = useQuery({
    queryKey: ['mon-profil-sante'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: ProfilData }>(
        '/sante/profil'
      );
      if (response.success) {
        return response.data?.data || null;
      }
      return null;
    },
    retry: false,
  });

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return '#dc3545';
    if (percentage >= 70) return '#ffc107';
    return '#28a745';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mon Profil Sante</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      >
        {/* User Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informations</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nom</Text>
            <Text style={styles.infoValue}>{user?.firstName} {user?.lastName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>
          {profil?.adherent && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Matricule</Text>
                <Text style={styles.infoValue}>{profil.adherent.matricule}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Statut</Text>
                <Text style={[styles.infoValue, profil.adherent.estActif ? styles.statusActive : styles.statusInactive]}>
                  {profil.adherent.estActif ? 'Actif' : 'Inactif'}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Formule */}
        {profil?.formule && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ma Formule</Text>
            <Text style={styles.formuleName}>{profil.formule.nom}</Text>
            <Text style={styles.formuleCode}>Code: {profil.formule.code}</Text>
            {profil.formule.plafondGlobal && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Plafond global</Text>
                <Text style={styles.infoValue}>{formatAmount(profil.formule.plafondGlobal)}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Cotisation mensuelle</Text>
              <Text style={styles.infoValue}>{formatAmount(profil.formule.tarifMensuel)}</Text>
            </View>
          </View>
        )}

        {/* Plafonds */}
        {profil?.plafonds && profil.plafonds.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Consommation annuelle</Text>
            {profil.plafonds.map((plafond) => (
              <View key={plafond.typeSoin} style={styles.plafondItem}>
                <View style={styles.plafondHeader}>
                  <Text style={styles.plafondType}>
                    {plafond.typeSoin.charAt(0).toUpperCase() + plafond.typeSoin.slice(1)}
                  </Text>
                  <Text style={styles.plafondPercent}>
                    {plafond.pourcentageUtilise.toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, plafond.pourcentageUtilise)}%`,
                        backgroundColor: getProgressColor(plafond.pourcentageUtilise),
                      },
                    ]}
                  />
                </View>
                <View style={styles.plafondAmounts}>
                  <Text style={styles.plafondConsomme}>
                    Consomme: {formatAmount(plafond.montantConsomme)}
                  </Text>
                  <Text style={styles.plafondRestant}>
                    Restant: {formatAmount(plafond.montantRestant)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* No coverage */}
        {!profil?.formule && !isLoading && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Aucune formule de garantie associee.
            </Text>
            <Text style={styles.emptySubtext}>
              Contactez votre gestionnaire pour plus d'informations.
            </Text>
          </View>
        )}

        {/* Settings Button */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/(main)/parametres')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
          <Text style={styles.settingsText}>Parametres</Text>
          <Text style={styles.settingsChevron}>›</Text>
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
  header: {
    padding: 16,
    backgroundColor: '#1e3a5f',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  statusActive: {
    color: '#28a745',
  },
  statusInactive: {
    color: '#dc3545',
  },
  formuleName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e3a5f',
    marginBottom: 4,
  },
  formuleCode: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  plafondItem: {
    marginBottom: 16,
  },
  plafondHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  plafondType: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  plafondPercent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  plafondAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  plafondConsomme: {
    fontSize: 12,
    color: '#666',
  },
  plafondRestant: {
    fontSize: 12,
    color: '#28a745',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  settingsIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  settingsText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  settingsChevron: {
    fontSize: 20,
    color: '#ccc',
  },
});
