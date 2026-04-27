import { useState, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileText, Building2, Shield, Users, Pencil, Check, Trash2, Upload, Loader2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useToast } from '@/stores/toast';
import { usePermissions } from '@/hooks/usePermissions';

interface Guarantee {
  id: string;
  care_type: string;
  label: string;
  rate: number | null;
  annual_ceiling: number | null;
  per_act_ceiling: number | null;
  per_day_ceiling: number | null;
  max_days: number | null;
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
  // English keys (legacy)
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
  // French keys (from TP extraction)
  pharmacie: 'Frais pharmaceutiques',
  laboratoire: 'Analyses et travaux de laboratoire',
  optique: 'Optique',
  chirurgie_refractive: 'Chirurgie refractive (laser)',
  actes_courants: 'Actes medicaux courants',
  chirurgie: 'Frais chirurgicaux',
  orthopedie: 'Orthopedie / Protheses',
  hospitalisation: 'Hospitalisation',
  accouchement: 'Accouchement',
  interruption_grossesse: 'Interruption involontaire de grossesse',
  dentaire: 'Soins et protheses dentaires',
  orthodontie: 'Soins orthodontiques',
  circoncision: 'Circoncision',
  cures_thermales: 'Cures thermales',
  frais_funeraires: 'Frais funeraires',
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
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('contracts', 'update');
  const canDelete = hasPermission('contracts', 'delete');

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
      queryClient.invalidateQueries({ queryKey: ['adherents'] });
      queryClient.invalidateQueries({ queryKey: ['adherent-plafonds'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    },
  });

  // TP Upload state
  const [tpDialogOpen, setTpDialogOpen] = useState(false);
  const [tpFile, setTpFile] = useState<File | null>(null);
  const [tpResult, setTpResult] = useState<{ id: string; name: string; guaranteesExtracted: number; annualGlobalLimit: number | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadTpMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', `TP - ${contract?.company_name || 'Contrat'} ${new Date().getFullYear()}`);
      formData.append('year', String(new Date().getFullYear()));
      if (contract?.insurer_id) formData.append('insurerId', contract.insurer_id);

      const response = await apiClient.upload<{
        id: string; name: string; guaranteesExtracted: number; annualGlobalLimit: number | null;
        guarantees: Array<Record<string, unknown>>;
        message: string;
      }>('/baremes-tp/upload-pdf', formData);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        setTpResult({ id: data.id, name: data.name, guaranteesExtracted: data.guaranteesExtracted, annualGlobalLimit: data.annualGlobalLimit ?? null });
        toast({ title: 'TP extrait avec succès', description: data.message, variant: 'success' });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Erreur extraction TP', description: err.message, variant: 'destructive' });
    },
  });

  const applyTpMutation = useMutation({
    mutationFn: async (tpId: string) => {
      const response = await apiClient.post(`/baremes-tp/${tpId}/apply-to-contract`, {
        groupContractId: id,
        annualGlobalLimit: tpResult?.annualGlobalLimit ?? undefined,
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      toast({ title: 'Barème TP appliqué', description: 'Les garanties du contrat ont été mises à jour.', variant: 'success' });
      setTpDialogOpen(false);
      setTpFile(null);
      setTpResult(null);
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
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        <Link to="/group-contracts" className="hover:text-gray-900 transition-colors">Contrats Groupe</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <PageHeader
          title={`Contrat ${contract.contract_number}`}
          description={contract.company_name}
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Button
            variant="outline"
            onClick={() => { setTpDialogOpen(true); setTpFile(null); setTpResult(null); }}
          >
            <Upload className="mr-2 h-4 w-4" />
            Importer un barème TP
          </Button>

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

          {canUpdate && (
            <Button onClick={() => navigate(`/group-contracts/${id}/edit`)}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifier
            </Button>
          )}

          {canDelete && <AlertDialog>
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
          </AlertDialog>}
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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Tableau des garanties
            </CardTitle>
            {guarantees.length === 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setTpDialogOpen(true); setTpFile(null); setTpResult(null); }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Importer depuis un TP
              </Button>
            )}
          </div>
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
                    <th className="px-3 py-3 text-right font-medium">Plafond/jour</th>
                    <th className="px-3 py-3 text-left font-medium">Clés lettres</th>
                    <th className="px-3 py-3 text-left font-medium">Sous-limites</th>
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
                            <Badge variant="secondary">{Math.round(Number(g.rate) * 100)}%</Badge>
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
                        <td className="px-3 py-3 text-right font-mono">
                          {g.per_day_ceiling != null ? formatAmount(g.per_day_ceiling) : '-'}
                          {g.per_day_ceiling != null && g.max_days != null && (
                            <span className="text-xs text-muted-foreground block">max {g.max_days}j</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {g.letter_keys &&
                              Object.entries(g.letter_keys).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs font-mono">
                                  {key}={(value / 1000).toFixed(3)} DT
                                </Badge>
                              ))}
                            {(!g.letter_keys || Object.keys(g.letter_keys).length === 0) && '-'}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {g.sub_limits &&
                              Object.entries(g.sub_limits).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {key.replace(/_/g, ' ')}: {formatAmount(value as number)}
                                </Badge>
                              ))}
                            {(!g.sub_limits || Object.keys(g.sub_limits).length === 0) && '-'}
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

      {/* TP Upload Dialog */}
      <Dialog open={tpDialogOpen} onOpenChange={setTpDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importer un barème — Tableau de Prestations (TP)</DialogTitle>
            <DialogDescription>
              Importez le fichier du barème TP (PDF, Word ou image). Les garanties seront extraites automatiquement par IA et appliquées à ce contrat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* File upload zone */}
            {!tpResult && (
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const f = e.dataTransfer.files[0];
                  if (f) setTpFile(f);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setTpFile(f);
                  }}
                />
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                {tpFile ? (
                  <div className="text-center">
                    <p className="font-medium text-sm">{tpFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(tpFile.size / 1024).toFixed(0)} Ko
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-medium">Cliquez ou glissez le fichier TP ici</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, Word ou image (max 10 Mo)</p>
                  </div>
                )}
              </div>
            )}

            {/* Extraction result */}
            {tpResult && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <p className="font-medium text-green-800">Extraction réussie</p>
                </div>
                <p className="text-sm text-green-700">
                  <strong>{tpResult.guaranteesExtracted}</strong> garanties extraites du barème <strong>"{tpResult.name}"</strong>.
                </p>
                <p className="text-xs text-green-600 mt-2">
                  Cliquez "Appliquer au contrat" pour remplacer les garanties actuelles.
                </p>
              </div>
            )}

            {/* Loading state */}
            {uploadTpMutation.isPending && (
              <div className="flex items-center justify-center gap-3 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Extraction IA en cours... (peut prendre 10-30s)</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {!tpResult ? (
              <Button
                onClick={() => tpFile && uploadTpMutation.mutate(tpFile)}
                disabled={!tpFile || uploadTpMutation.isPending}
              >
                {uploadTpMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extraction...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Extraire les garanties
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => tpResult && applyTpMutation.mutate(tpResult.id)}
                disabled={applyTpMutation.isPending}
              >
                {applyTpMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Application...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Appliquer au contrat
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GroupContractDetailPage;
