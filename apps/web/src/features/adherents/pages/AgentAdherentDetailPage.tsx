import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users,
  FileText,
  Pencil,
  Trash2,
  AlertCircle,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import {
  useAdherentBulletins,
  useDeleteAdherent,
  type AdherentBulletin,
} from '../hooks/useAdherents';
import { useAdherentFamille } from '@/features/agent/hooks/use-adherent-famille';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';

// --- Constants ---

const bulletinStatusConfig: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive'; className?: string }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  in_batch: { label: 'Dans un lot', variant: 'default' },
  exported: { label: 'Exporté', variant: 'outline' },
  soumis: { label: 'Soumis', variant: 'default' },
  en_examen: { label: 'En examen', variant: 'default', className: 'bg-yellow-500 hover:bg-yellow-600' },
  approuve: { label: 'Approuvé', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  rejete: { label: 'Rejeté', variant: 'destructive' },
  paye: { label: 'Payé', variant: 'default', className: 'bg-emerald-700 hover:bg-emerald-800' },
};

// --- Types ---

interface AdherentDetail {
  id: string;
  matricule: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  companyId: string | null;
  companyName: string | null;
  contractNumber: string | null;
  plafondGlobal: number | null;
  plafondConsomme: number | null;
  isActive: boolean;
  dossierComplet: boolean;
  createdAt: string;
}

// --- Helpers ---

function formatAmount(amount: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 0 }).format(amount / 1000) + ' DT';
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-TN');
}

// --- Hooks ---

function useAdherentDetail(id: string) {
  return useQuery({
    queryKey: ['adherent-detail', id],
    queryFn: async (): Promise<AdherentDetail> => {
      const response = await apiClient.get<AdherentDetail>(`/adherents/${id}`);
      if (!response.success) {
        throw new Error(response.error?.message || "Erreur lors du chargement de l'adhérent");
      }
      const d = response.data as unknown as Record<string, unknown>;
      return {
        id: d.id as string,
        matricule: (d.matricule as string) || null,
        firstName: d.firstName as string,
        lastName: d.lastName as string,
        dateOfBirth: (d.dateOfBirth as string) || null,
        gender: (d.gender as string) || null,
        email: (d.email as string) || null,
        city: (d.city as string) || null,
        address: (d.address as string) || null,
        companyId: (d.companyId as string) || null,
        companyName: (d.companyName as string) || null,
        contractNumber: (d.contractNumber as string) || null,
        plafondGlobal: d.plafondGlobal != null ? Number(d.plafondGlobal) : null,
        plafondConsomme: d.plafondConsomme != null ? Number(d.plafondConsomme) : null,
        isActive: !!d.isActive,
        dossierComplet: d.dossierComplet !== false && d.dossierComplet !== 0,
        createdAt: d.createdAt as string,
      };
    },
    enabled: !!id,
  });
}

// --- Sub-components ---

function BulletinHistory({ adherentId }: { adherentId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdherentBulletins(adherentId, page, 10);
  const bulletins: AdherentBulletin[] = data?.data ?? [];
  const meta = data?.meta;

  if (isLoading) return <p className="text-sm text-gray-400 py-4">Chargement...</p>;
  if (!bulletins.length) {
    return (
      <div className="text-center py-6 text-gray-400">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Aucun bulletin de soins</p>
      </div>
    );
  }

  const totalDeclared = bulletins.reduce((s, b) => s + (Number(b.declaredAmount) || 0), 0);
  const totalReimbursed = bulletins.reduce((s, b) => s + (Number(b.reimbursedAmount) || 0), 0);

  return (
    <div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="py-2">Date</th><th>Statut</th><th className="text-right">Déclaré</th><th className="text-right">Remboursé</th><th className="text-right">Actes</th>
          </tr>
        </thead>
        <tbody>
          {bulletins.map((b) => {
            const cfg = bulletinStatusConfig[b.status] || { label: b.status, variant: 'outline' as const };
            return (
              <tr key={b.id} className="border-b last:border-0">
                <td className="py-2">{formatDate(b.dateSoins)}</td>
                <td><Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge></td>
                <td className="text-right">{formatAmount(b.declaredAmount)}</td>
                <td className="text-right font-medium">{formatAmount(b.reimbursedAmount)}</td>
                <td className="text-right">{b.actesCount}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium text-sm">
            <td colSpan={2} className="py-2">Total</td>
            <td className="text-right">{formatAmount(totalDeclared)}</td>
            <td className="text-right">{formatAmount(totalReimbursed)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      </div>
      {meta && meta.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</Button>
          <span className="text-xs text-gray-500 self-center">{page} / {meta.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Suivant</Button>
        </div>
      )}
    </div>
  );
}

// --- Main Page ---

export default function AgentAdherentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data: adherent, isLoading, error } = useAdherentDetail(id!);
  const { data: famille } = useAdherentFamille(id);
  const deleteMutation = useDeleteAdherent();
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('adherents', 'update');
  const canDelete = hasPermission('adherents', 'delete');

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !adherent) {
    return (
      <div className="space-y-4">
        <div className="text-center py-12">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">Adhérent introuvable</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/adherents/agent')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour à la liste
          </Button>
        </div>
      </div>
    );
  }

  const plafondGlobal = Number(adherent.plafondGlobal) || 0;
  const plafondConsomme = Number(adherent.plafondConsomme) || 0;
  const plafondRestant = Math.max(0, plafondGlobal - plafondConsomme);
  const plafondPct = plafondGlobal > 0 ? Math.round((plafondConsomme / plafondGlobal) * 100) : 0;

  // Build ayants droit from famille data
  const ayantsDroit: { nom: string; prenom: string; lien: string }[] = [];
  if (famille?.conjoint) {
    ayantsDroit.push({
      nom: famille.conjoint.lastName,
      prenom: famille.conjoint.firstName,
      lien: 'Conjoint(e)',
    });
  }
  if (famille?.enfants) {
    for (const enfant of famille.enfants) {
      ayantsDroit.push({
        nom: enfant.lastName,
        prenom: enfant.firstName,
        lien: 'Enfant',
      });
    }
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await deleteMutation.mutateAsync(id);
      navigate('/adherents/agent');
    } catch { /* handled by mutation */ }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        <Link to="/adherents/agent" className="hover:text-gray-900 transition-colors">
          Adhérents
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">
          {adherent.firstName} {adherent.lastName}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-gray-700" />
          <div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
              {adherent.firstName} {adherent.lastName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {adherent.matricule && (
                <Badge variant="outline" className="font-mono text-xs">
                  {adherent.matricule}
                </Badge>
              )}
              <Badge variant={adherent.isActive ? 'default' : 'destructive'} className={adherent.isActive ? 'bg-emerald-600' : ''}>
                {adherent.isActive ? 'Actif' : 'Inactif'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {canUpdate && (
            <Button
              variant="outline"
              onClick={() => navigate(`/adherents/agent/${id}/edit`)}
            >
              <Pencil className="w-4 h-4 mr-2" /> Modifier
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Supprimer
            </Button>
          )}
        </div>
      </div>

      {/* Alerte dossier incomplet */}
      {!adherent.dossierComplet && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Dossier incomplet</p>
            <p className="text-xs text-amber-700 mt-1">
              Cet adhérent a été créé automatiquement lors de l'import d'un bulletin. Veuillez compléter ses informations (CIN, date de naissance, adresse, etc.).
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Info + Entreprise */}
        <div className="lg:col-span-2 space-y-6">
          {/* Informations */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Informations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Nom complet</span>
                <p className="font-medium">{adherent.firstName} {adherent.lastName}</p>
              </div>
              <div>
                <span className="text-gray-500">Date de naissance</span>
                <p className="font-medium">{formatDate(adherent.dateOfBirth)}</p>
              </div>
              <div>
                <span className="text-gray-500">Sexe</span>
                <p className="font-medium">
                  {adherent.gender === 'M' ? 'Masculin' : adherent.gender === 'F' ? 'Féminin' : '—'}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Email</span>
                <p className="font-medium">{adherent.email || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Ville</span>
                <p className="font-medium">{adherent.city || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Matricule</span>
                <p className="font-medium font-mono">{adherent.matricule || '—'}</p>
              </div>
            </div>
          </div>

          {/* Entreprise & Contrat */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Entreprise & Contrat</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Entreprise</span>
                <p className="font-medium">{adherent.companyName || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">N° Contrat</span>
                <p className="font-medium font-mono">{adherent.contractNumber || '—'}</p>
              </div>
            </div>
          </div>

          {/* Historique bulletins */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Historique bulletins
            </h3>
            <BulletinHistory adherentId={adherent.id} />
          </div>
        </div>

        {/* Right column: Plafond + Ayants droit */}
        <div className="space-y-6">
          {/* Plafond */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Plafond annuel</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-xs">Global</p>
                  <p className="font-semibold">{formatAmount(plafondGlobal)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-xs">Consommé</p>
                  <p className="font-semibold text-orange-600">{formatAmount(plafondConsomme)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-xs">Restant</p>
                  <p className="font-semibold text-green-600">{formatAmount(plafondRestant)}</p>
                </div>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${plafondPct > 80 ? 'bg-red-500' : plafondPct > 50 ? 'bg-orange-400' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(plafondPct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 text-right">{plafondPct}% consommé</p>
            </div>
          </div>

          {/* Ayants droit */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Ayants droit</h3>
            {ayantsDroit.length > 0 ? (
              <div className="space-y-2">
                {ayantsDroit.map((ad, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{ad.prenom} {ad.nom}</span>
                    <Badge variant="outline" className="text-xs">{ad.lien}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucun ayant droit</p>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'adhérent</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer <strong>{adherent.firstName} {adherent.lastName}</strong>
              {adherent.matricule && <> (matricule: {adherent.matricule})</>} ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
