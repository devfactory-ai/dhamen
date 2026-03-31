import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileText, Building2, Shield, Users, Pencil, Check, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/stores/toast';

interface Guarantee {
  id: string;
  care_type: string;
  label: string;
  rate: number | null;
  annual_ceiling: number | null;
  per_act_ceiling: number | null;
  per_day_ceiling: number | null;
  letter_keys: Record<string, number> | null;
  sub_limits: Record<string, number> | null;
  conditions: string | null;
  requires_prescription: number;
  requires_cnam_complement: number;
  renewal_period: string | null;
  age_limit: number | null;
  sort_order: number;
}

interface GroupContract {
  id: string;
  contract_number: string;
  contract_type: 'group' | 'individual';
  company_id: string;
  company_name: string;
  insurer_id: string | null;
  insurer_name: string | null;
  intermediary: string | null;
  effective_date: string;
  expiry_date: string | null;
  global_ceiling: number | null;
  covered_risks: string | null;
  category: string | null;
  status: string;
  guarantees: Guarantee[];
  created_at: string;
  updated_at: string;
}

const CARE_TYPE_LABELS: Record<string, string> = {
  consultation: 'Soins medicaux (Consultations et Visites)',
  pharmacy: 'Frais pharmaceutiques',
  laboratory: 'Analyses et travaux de laboratoire',
  optical: 'Optique',
  refractive_surgery: 'Chirurgie refractive (laser)',
  medical_acts: 'Actes medicaux courants',
  transport: 'Transport du malade',
  surgery: 'Frais chirurgicaux',
  orthopedics: 'Orthopedie / Protheses',
  hospitalization: 'Hospitalisation',
  maternity: 'Accouchement',
  ivg: 'Interruption involontaire de grossesse',
  dental: 'Soins et protheses dentaires',
  orthodontics: 'Soins orthodontiques',
  circumcision: 'Circoncision',
  sanatorium: 'Sanatorium / Preventorium',
  thermal_cure: 'Cures thermales',
  funeral: 'Frais funeraires',
};

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'default' }> = {
  active: { label: 'Actif', variant: 'success' },
  draft: { label: 'Brouillon', variant: 'secondary' },
  expired: { label: 'Expire', variant: 'destructive' },
  suspended: { label: 'Suspendu', variant: 'default' },
};

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('fr-TN', {
    style: 'currency',
    currency: 'TND',
  }).format(amount / 1000);
}

export function GroupContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contract, isLoading } = useQuery({
    queryKey: ['group-contract', id],
    queryFn: async () => {
      const response = await apiClient.get<GroupContract>(`/group-contracts/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete(`/group-contracts/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      toast({ title: 'Contrat supprimé avec succès', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['group-contracts'] });
      navigate('/group-contracts');
    },
    onError: (err: Error) => {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/group-contracts/${id}/apply-to-adherents`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      toast({ title: 'Garanties appliquées aux adhérents avec succès', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['group-contract', id] });
    },
    onError: (err: Error) => {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Chargement...</div>;
  }

  if (!contract) {
    return <div className="flex items-center justify-center p-8">Contrat non trouve</div>;
  }

  const statusInfo = STATUS_LABELS[contract.status] || { label: contract.status, variant: 'secondary' as const };
  const guarantees = contract.guarantees || [];
  const activeGuarantees = guarantees.length;
  const coveredRisks = contract.covered_risks ? JSON.parse(contract.covered_risks) : [];

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/group-contracts" className="hover:text-gray-900 transition-colors">Contrats Groupe</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Contrat ${contract.contract_number}`}
          description={contract.company_name}
        />
        <div className="flex items-center gap-2">
          {contract.status === 'active' && (
          <Button
            variant="outline"
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
          >
            <Users className="mr-2 h-4 w-4" />
            {applyMutation.isPending ? 'Application...' : contract.contract_type === 'individual' ? 'Créer contrat individuel' : 'Appliquer aux adhérents'}
          </Button>
          )}

          <Button onClick={() => navigate(`/group-contracts/${id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleteMutation.isPending}>
                <Trash2 className="mr-2 h-4 w-4" />
                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer le contrat</AlertDialogTitle>
                <AlertDialogDescription>
                  Êtes-vous sûr de vouloir supprimer le contrat <strong>{contract.contract_number}</strong> ? Les contrats individuels et garanties associés seront également désactivés. Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">-</p>
              <p className="text-sm text-muted-foreground">Adherents couverts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeGuarantees}</p>
              <p className="text-sm text-muted-foreground">Garanties actives</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Informations du contrat
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Numéro de contrat</p>
              <p className="font-medium">{contract.contract_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Société</p>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">{contract.company_name}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Assureur</p>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">{contract.insurer_name || '-'}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Intermediaire</p>
              <p className="font-medium">{contract.intermediary || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date d'effet</p>
              <p className="font-medium">
                {contract.effective_date ? new Date(contract.effective_date).toLocaleDateString('fr-TN') : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date d'expiration</p>
              <p className="font-medium">
                {contract.expiry_date ? new Date(contract.expiry_date).toLocaleDateString('fr-TN') : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Plafond global</p>
              <p className="font-medium">{formatAmount(contract.global_ceiling)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Categorie</p>
              <p className="font-medium">{contract.category || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Statut</p>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-sm text-muted-foreground">Risques garantis</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {Array.isArray(coveredRisks) && coveredRisks.length > 0 ? (
                  coveredRisks.map((risk: string) => (
                    <Badge key={risk} variant="secondary">{risk}</Badge>
                  ))
                ) : (
                  <span className="text-sm">-</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Guarantees Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Tableau des garanties
          </CardTitle>
        </CardHeader>
        <CardContent>
          {guarantees.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              Aucune garantie configuree pour ce contrat.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-3 text-left font-medium">#</th>
                    <th className="px-3 py-3 text-left font-medium">Rubrique</th>
                    <th className="px-3 py-3 text-center font-medium">Taux</th>
                    <th className="px-3 py-3 text-right font-medium">Plafond annuel</th>
                    <th className="px-3 py-3 text-right font-medium">Plafond/acte</th>
                    <th className="px-3 py-3 text-left font-medium">Cles lettres</th>
                    <th className="px-3 py-3 text-left font-medium">Conditions</th>
                  </tr>
                </thead>
                <tbody>
                  {guarantees
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((g, idx) => (
                      <tr key={g.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3 text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-3">
                          <div>
                            <p className="font-medium">
                              {CARE_TYPE_LABELS[g.care_type] || g.care_type}
                            </p>
                            {g.label && g.label !== CARE_TYPE_LABELS[g.care_type] && (
                              <p className="text-xs text-muted-foreground">{g.label}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {g.rate != null ? (
                            <Badge variant="secondary">{g.rate}%</Badge>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {formatAmount(g.annual_ceiling)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {formatAmount(g.per_act_ceiling)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {g.letter_keys &&
                              Object.entries(g.letter_keys).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs font-mono">
                                  {key}={value}
                                </Badge>
                              ))}
                            {(!g.letter_keys || Object.keys(g.letter_keys).length === 0) && '-'}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            {g.conditions && (
                              <span className="text-xs text-muted-foreground">{g.conditions}</span>
                            )}
                            {g.requires_prescription === 1 && (
                              <Badge variant="outline" className="text-xs w-fit">
                                <Check className="mr-1 h-3 w-3" />
                                Ordonnance
                              </Badge>
                            )}
                            {g.requires_cnam_complement === 1 && (
                              <Badge variant="outline" className="text-xs w-fit">
                                <Check className="mr-1 h-3 w-3" />
                                Complement CNAM
                              </Badge>
                            )}
                            {!g.conditions && g.requires_prescription !== 1 && g.requires_cnam_complement !== 1 && '-'}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default GroupContractDetailPage;
