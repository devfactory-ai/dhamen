import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Pill, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Medication {
  id: string;
  code_pct: string;
  code_cnam: string | null;
  code_amm: string | null;
  dci: string;
  brand_name: string;
  brand_name_ar: string | null;
  dosage: string;
  form: string;
  packaging: string;
  family_id: string | null;
  family_name: string | null;
  family_code: string | null;
  laboratory: string | null;
  country_origin: string | null;
  price_public: number | null;
  price_hospital: number | null;
  price_reference: number | null;
  is_generic: number;
  is_reimbursable: number;
  reimbursement_rate: number;
  requires_prescription: number;
  requires_prior_approval: number;
  is_controlled: number;
  gpb: string | null;
  veic: string | null;
  amm_classe: string | null;
  amm_sous_classe: string | null;
  amm_date: string | null;
  indications: string | null;
  duree_conservation: number | null;
  conditionnement_primaire: string | null;
  spec_conditionnement: string | null;
  tableau_amm: string | null;
  created_at: string;
  updated_at: string;
}

const gpbLabel: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  G: { label: 'Générique', variant: 'secondary' },
  P: { label: 'Princeps', variant: 'default' },
  B: { label: 'Biosimilaire', variant: 'outline' },
};

const veicLabel: Record<string, { label: string; color: string }> = {
  V: { label: 'Vital', color: 'text-red-600 bg-red-50 border-red-200' },
  E: { label: 'Essentiel', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  I: { label: 'Intermédiaire', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  C: { label: 'Confort', color: 'text-gray-600 bg-gray-50 border-gray-200' },
};

function formatPrice(price: number | null) {
  if (!price) return '-';
  return `${(price / 1000).toFixed(3)} TND`;
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || <span className="text-muted-foreground">-</span>}</p>
    </div>
  );
}

export default function MedicationDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: med, isLoading } = useQuery({
    queryKey: ['medication', id],
    queryFn: async () => {
      const response = await apiClient.get<{ medication: Medication }>(`/medications/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.medication;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Chargement...</div>;
  }

  if (!med) {
    return <div className="flex items-center justify-center p-8">Médicament non trouvé</div>;
  }

  const hasAmmData = med.code_amm || med.amm_classe || med.amm_date || med.laboratory;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={med.brand_name}
          description={med.dci ? `DCI: ${med.dci}` : 'Fiche médicament'}
          icon={<Pill className="w-6 h-6" />}
          breadcrumb={[
            { label: 'Médicaments', href: '/admin/medications' },
            { label: med.brand_name },
          ]}
        />
      </div>

      {/* Badges résumé */}
      <div className="flex flex-wrap gap-2">
        {med.veic && veicLabel[med.veic] ? (
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${veicLabel[med.veic]!.color}`}>
            {veicLabel[med.veic]!.label}
          </span>
        ) : null}
        {med.gpb && gpbLabel[med.gpb] ? (
          <Badge variant={gpbLabel[med.gpb]!.variant}>{gpbLabel[med.gpb]!.label}</Badge>
        ) : null}
        {med.requires_prior_approval ? (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Accord préalable requis
          </Badge>
        ) : null}
        {med.is_reimbursable ? (
          <Badge variant="success">Remboursable {Math.round(med.reimbursement_rate * 100)}%</Badge>
        ) : (
          <Badge variant="outline">Non remboursable</Badge>
        )}
        {med.is_generic ? <Badge variant="secondary">Générique</Badge> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Identification CNAM */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Identification
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Code PCT" value={med.code_pct} />
            <DetailField label="Nom commercial" value={med.brand_name} />
            <DetailField label="DCI (Dénomination Commune)" value={med.dci} />
            <div>
              <p className="text-xs text-muted-foreground">Catégorie CNAM</p>
              {med.veic ? (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${veicLabel[med.veic]?.color || ''}`}>
                  {veicLabel[med.veic]?.label || med.veic}
                </span>
              ) : (
                <p className="text-sm text-muted-foreground">-</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Accord préalable (AP)</p>
              {med.requires_prior_approval ? (
                <Badge variant="destructive" className="text-xs">Oui</Badge>
              ) : (
                <p className="text-sm">Non</p>
              )}
            </div>
            <DetailField label="Famille thérapeutique" value={med.family_name} />
          </div>
        </div>

        {/* Tarification */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Tarification
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Prix public</p>
              <p className="text-lg font-semibold">{formatPrice(med.price_public)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tarif de référence</p>
              <p className="text-lg font-semibold text-blue-600">{formatPrice(med.price_reference)}</p>
            </div>
            <DetailField label="Prix hospitalier" value={formatPrice(med.price_hospital)} />
            <div>
              <p className="text-xs text-muted-foreground">Remboursable</p>
              {med.is_reimbursable ? (
                <Badge variant="success">{Math.round(med.reimbursement_rate * 100)}%</Badge>
              ) : (
                <Badge variant="outline">Non</Badge>
              )}
            </div>
            {med.price_public && med.price_reference ? (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Écart prix public / tarif référence</p>
                <p className="text-sm">
                  {((med.price_public - med.price_reference) / 1000).toFixed(3)} TND
                  {' '}
                  <span className="text-muted-foreground">
                    ({med.price_reference > 0
                      ? `${(((med.price_public - med.price_reference) / med.price_reference) * 100).toFixed(1)}%`
                      : '-'})
                  </span>
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Informations pharmaceutiques */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Informations pharmaceutiques
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Dosage" value={med.dosage} />
            <DetailField label="Forme" value={med.form} />
            <DetailField label="Conditionnement" value={med.packaging} />
            <div>
              <p className="text-xs text-muted-foreground">G/P/B</p>
              {med.gpb ? (
                <Badge variant={gpbLabel[med.gpb]?.variant || 'outline'}>
                  {gpbLabel[med.gpb]?.label || med.gpb}
                </Badge>
              ) : (
                <p className="text-sm text-muted-foreground">-</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ordonnance requise</p>
              <p className="text-sm">{med.requires_prescription ? 'Oui' : 'Non'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Substance contrôlée</p>
              <p className="text-sm">{med.is_controlled ? 'Oui' : 'Non'}</p>
            </div>
          </div>
        </div>

        {/* Données AMM (si disponibles) */}
        {hasAmmData && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Données AMM
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Code AMM" value={med.code_amm} />
              <DetailField label="Laboratoire" value={med.laboratory} />
              <DetailField label="Classe AMM" value={med.amm_classe} />
              <DetailField label="Sous-classe AMM" value={med.amm_sous_classe} />
              <DetailField label="Date AMM" value={med.amm_date} />
              <DetailField label="Tableau" value={med.tableau_amm} />
              <DetailField label="Pays d'origine" value={med.country_origin} />
              <DetailField
                label="Durée conservation"
                value={med.duree_conservation ? `${med.duree_conservation} mois` : null}
              />
            </div>
          </div>
        )}
      </div>

      {/* Indications */}
      {med.indications && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Indications
          </h4>
          <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-line">
            {med.indications}
          </p>
        </div>
      )}
    </div>
  );
}
