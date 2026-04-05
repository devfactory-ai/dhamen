import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, User, Building2, CreditCard, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  scan_uploaded: { label: 'Scan envoyé', color: 'bg-blue-50 text-blue-700' },
  paper_received: { label: 'Reçu', color: 'bg-blue-50 text-blue-700' },
  paper_incomplete: { label: 'Incomplet', color: 'bg-amber-50 text-amber-700' },
  paper_complete: { label: 'Complet', color: 'bg-blue-50 text-blue-700' },
  processing: { label: 'En traitement', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approuvé', color: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejeté', color: 'bg-red-50 text-red-700' },
  paid: { label: 'Payé', color: 'bg-emerald-50 text-emerald-700' },
  submitted: { label: 'Soumis', color: 'bg-blue-50 text-blue-700' },
  in_batch: { label: 'En lot', color: 'bg-orange-50 text-orange-700' },
  pending: { label: 'En attente', color: 'bg-amber-50 text-amber-700' },
};

const CARE_TYPE_LABELS: Record<string, string> = {
  pharmacy: 'Pharmacie',
  consultation: 'Consultation',
  lab: 'Laboratoire',
  hospital: 'Hospitalisation',
  hospitalization: 'Hospitalisation',
  dental: 'Dentaire',
  optical: 'Optique',
};

const BASE_PATH = '/praticien';

function formatAmount(amount: number): string {
  return (amount / 1000).toFixed(3) + ' TND';
}

export function PraticienActeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const basePath = BASE_PATH;
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('claims', 'read');

  const { data, isLoading, error } = useQuery({
    queryKey: ['praticien-acte', id],
    queryFn: async () => {
      const response = await apiClient.get<Record<string, unknown>>(`/praticien/actes/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  if (!canRead) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(`${basePath}/actes`)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700">Vous n'avez pas la permission de consulter cet acte.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(`${basePath}/actes`)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700">Acte non trouvé ou accès refusé.</p>
        </div>
      </div>
    );
  }

  const d = data as Record<string, unknown>;
  const status = String(d.status || '');
  const statusInfo = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' };
  const careType = String(d.care_type || '');
  const bulletinDate = d.bulletin_date ? new Date(String(d.bulletin_date)).toLocaleDateString('fr-TN') : '\u2014';
  const createdAt = d.created_at ? new Date(String(d.created_at)).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014';

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(`${basePath}/actes`)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux actes
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {String(d.bulletin_number || d.id || '')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Créé le {createdAt}</p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Adherent info */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <User className="h-5 w-5 text-gray-400" /> Informations adhérent
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Nom complet</p>
              <p className="font-medium">{`${d.adherent_first_name || ''} ${d.adherent_last_name || ''}`.trim() || '\u2014'}</p>
            </div>
            <div>
              <p className="text-gray-500">Matricule</p>
              <p className="font-medium">{String(d.adherent_national_id || d.adherent_matricule || '\u2014')}</p>
            </div>
            <div>
              <p className="text-gray-500">Date de naissance</p>
              <p className="font-medium">{d.adherent_dob ? new Date(String(d.adherent_dob)).toLocaleDateString('fr-TN') : '\u2014'}</p>
            </div>
            <div>
              <p className="text-gray-500">Entreprise</p>
              <p className="font-medium">{String(d.company_name || '\u2014')}</p>
            </div>
          </div>
        </div>

        {/* Bulletin info */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <FileText className="h-5 w-5 text-gray-400" /> Détails du bulletin
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Type de soin</p>
              <p className="font-medium">{CARE_TYPE_LABELS[careType] ?? (careType || '\u2014')}</p>
            </div>
            <div>
              <p className="text-gray-500">Date du soin</p>
              <p className="font-medium flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                {bulletinDate}
              </p>
            </div>
            <div>
              <p className="text-gray-500">N° bulletin</p>
              <p className="font-medium font-mono">{String(d.bulletin_number || '\u2014')}</p>
            </div>
            <div>
              <p className="text-gray-500">Statut</p>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Financial info */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <CreditCard className="h-5 w-5 text-gray-400" /> Informations financières
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">Montant total</p>
              <p className="text-lg font-bold">{d.total_amount != null ? formatAmount(Number(d.total_amount)) : '\u2014'}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-xs text-gray-500">Montant remboursé</p>
              <p className="text-lg font-bold text-emerald-700">{d.reimbursed_amount != null ? formatAmount(Number(d.reimbursed_amount)) : '\u2014'}</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-xs text-gray-500">Part assureur (PEC)</p>
              <p className="text-lg font-bold text-blue-700">{d.insurer_amount != null ? formatAmount(Number(d.insurer_amount)) : '\u2014'}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-4">
              <p className="text-xs text-gray-500">Ticket modérateur</p>
              <p className="text-lg font-bold text-amber-700">{d.patient_amount != null ? formatAmount(Number(d.patient_amount)) : '\u2014'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PraticienActeDetailPage;
