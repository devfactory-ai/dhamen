/**
 * Demande Detail Screen
 */
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SanteDemandeAvecDetails, SanteStatutDemande, SanteTypeSoin, SanteDocument } from '@dhamen/shared';

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

const STATUT_DESCRIPTIONS: Record<SanteStatutDemande, string> = {
  soumise: 'Votre demande a été soumise et sera traitée prochainement.',
  en_examen: 'Votre demande est en cours d\'examen par nos équipes.',
  info_requise: 'Des informations complémentaires sont nécessaires pour traiter votre demande.',
  approuvee: 'Votre demande a été approuvée. Le remboursement sera effectué prochainement.',
  en_paiement: 'Le paiement de votre remboursement est en cours de traitement.',
  payee: 'Votre remboursement a été effectué.',
  rejetee: 'Votre demande a été rejetée.',
};

interface DemandeResponse {
  success: boolean;
  data: SanteDemandeAvecDetails;
}

interface DocumentsResponse {
  success: boolean;
  data: SanteDocument[];
}

export default function DemandeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: demande, isLoading: isLoadingDemande } = useQuery({
    queryKey: ['demande', id],
    queryFn: async () => {
      const response = await apiClient.get<DemandeResponse>(`/sante/demandes/${id}`);
      if (!response.success) {
        throw new Error('Failed to fetch demande');
      }
      return response.data.data;
    },
    enabled: !!id,
  });

  const { data: documents } = useQuery({
    queryKey: ['demande-documents', id],
    queryFn: async () => {
      const response = await apiClient.get<DocumentsResponse>(`/sante/documents/demande/${id}`);
      if (!response.success) {
        return [];
      }
      return response.data.data;
    },
    enabled: !!id,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: number) => {
    return `${(amount / 1000).toFixed(3)} TND`;
  };

  if (isLoadingDemande) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e3a5f" />
        </View>
      </SafeAreaView>
    );
  }

  if (!demande) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Demande introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{demande.numeroDemande}</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Status Card */}
        <View style={[styles.statusCard, { borderLeftColor: STATUT_COLORS[demande.statut] }]}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusBadge, { backgroundColor: STATUT_COLORS[demande.statut] }]}>
              <Text style={styles.statusBadgeText}>{STATUT_LABELS[demande.statut]}</Text>
            </View>
          </View>
          <Text style={styles.statusDescription}>
            {STATUT_DESCRIPTIONS[demande.statut]}
          </Text>
          {demande.motifRejet && (
            <View style={styles.rejectionBox}>
              <Text style={styles.rejectionLabel}>Motif:</Text>
              <Text style={styles.rejectionText}>{demande.motifRejet}</Text>
            </View>
          )}
        </View>

        {/* Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Détails de la demande</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type de soin</Text>
            <Text style={styles.infoValue}>{TYPE_LABELS[demande.typeSoin]}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date du soin</Text>
            <Text style={styles.infoValue}>{formatDate(demande.dateSoin)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date de soumission</Text>
            <Text style={styles.infoValue}>{formatDateTime(demande.createdAt)}</Text>
          </View>

          {demande.praticien && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Praticien</Text>
              <Text style={styles.infoValue}>
                {demande.praticien.prenom ? `Dr. ${demande.praticien.prenom} ${demande.praticien.nom}` : demande.praticien.nom}
              </Text>
            </View>
          )}
        </View>

        {/* Amount Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Montants</Text>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Montant demandé</Text>
            <Text style={styles.amountValue}>{formatAmount(demande.montantDemande)}</Text>
          </View>

          {demande.montantRembourse !== null && demande.montantRembourse > 0 && (
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Montant remboursé</Text>
              <Text style={styles.amountValueGreen}>{formatAmount(demande.montantRembourse)}</Text>
            </View>
          )}

          {demande.montantResteCharge !== null && demande.montantResteCharge > 0 && (
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Reste à charge</Text>
              <Text style={styles.amountValueRed}>{formatAmount(demande.montantResteCharge)}</Text>
            </View>
          )}
        </View>

        {/* Documents Card */}
        {documents && documents.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Documents</Text>
            {documents.map((doc) => (
              <View key={doc.id} style={styles.documentRow}>
                <View style={styles.documentIcon}>
                  <Text style={styles.documentIconText}>
                    {doc.mimeType.includes('pdf') ? '📄' : '🖼️'}
                  </Text>
                </View>
                <View style={styles.documentInfo}>
                  <Text style={styles.documentName} numberOfLines={1}>
                    {doc.nomFichier}
                  </Text>
                  <Text style={styles.documentMeta}>
                    {(doc.tailleOctets / 1024).toFixed(0)} KB
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Timeline Card */}
        {demande.dateTraitement && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Historique</Text>

            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>Demande soumise</Text>
                <Text style={styles.timelineDate}>{formatDateTime(demande.createdAt)}</Text>
              </View>
            </View>

            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: STATUT_COLORS[demande.statut] }]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>{STATUT_LABELS[demande.statut]}</Text>
                <Text style={styles.timelineDate}>{formatDateTime(demande.dateTraitement)}</Text>
              </View>
            </View>
          </View>
        )}

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  rejectionBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  rejectionLabel: {
    fontSize: 12,
    color: '#dc3545',
    fontWeight: '600',
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 14,
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  amountLabel: {
    fontSize: 14,
    color: '#666',
  },
  amountValue: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
  amountValueGreen: {
    fontSize: 18,
    color: '#28a745',
    fontWeight: '600',
  },
  amountValueRed: {
    fontSize: 16,
    color: '#dc3545',
    fontWeight: '600',
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  documentIconText: {
    fontSize: 20,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  documentMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6c757d',
    marginTop: 4,
    marginRight: 12,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  timelineDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  bottomPadding: {
    height: 40,
  },
});
