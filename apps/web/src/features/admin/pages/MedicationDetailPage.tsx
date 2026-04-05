import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Pill } from 'lucide-react';
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Identification */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Identification
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Nom commercial" value={med.brand_name} />
            <DetailField label="DCI" value={med.dci} />
            <DetailField label="Code PCT" value={med.code_pct} />
            <DetailField label="Code AMM" value={med.code_amm} />
            <DetailField label="Code CNAM" value={med.code_cnam} />
            <DetailField label="Famille" value={med.family_name} />
          </div>
        </div>

        {/* Pharmaceutical */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Informations pharmaceutiques
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Dosage" value={med.dosage} />
            <DetailField label="Forme" value={med.form} />
            <DetailField label="Conditionnement" value={med.packaging} />
            <DetailField label="Laboratoire" value={med.laboratory} />
            <DetailField label="Pays d'origine" value={med.country_origin} />
            <DetailField
              label="Durée conservation"
              value={med.duree_conservation ? `${med.duree_conservation} mois` : null}
            />
          </div>
        </div>

        {/* Classification */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Classification
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <p className="text-xs text-muted-foreground">VEIC</p>
              {med.veic ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${veicLabel[med.veic]?.color || ''}`}
                >
                  {veicLabel[med.veic]?.label || med.veic}
                </span>
              ) : (
                <p className="text-sm text-muted-foreground">-</p>
              )}
            </div>
            <DetailField label="Classe AMM" value={med.amm_classe} />
            <DetailField label="Sous-classe AMM" value={med.amm_sous_classe} />
            <DetailField label="Date AMM" value={med.amm_date} />
            <DetailField label="Tableau" value={med.tableau_amm} />
          </div>
        </div>

        {/* Pricing & Reimbursement */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Tarification & Remboursement
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Prix public" value={formatPrice(med.price_public)} />
            <DetailField label="Prix hospitalier" value={formatPrice(med.price_hospital)} />
            <DetailField label="Prix référence" value={formatPrice(med.price_reference)} />
            <div>
              <p className="text-xs text-muted-foreground">Remboursable</p>
              {med.is_reimbursable ? (
                <Badge variant="success">{Math.round(med.reimbursement_rate * 100)}%</Badge>
              ) : (
                <Badge variant="outline">Non</Badge>
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
