import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendingUp } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useToastStore } from '@/stores/toast';

interface MedicationFamily {
  id: string;
  code: string;
  name: string;
}

interface MedicationFamilyBareme {
  id: string;
  medication_family_id: string;
  family_code: string;
  family_name: string;
  taux_remboursement: number;
  plafond_acte: number | null;
  plafond_famille_annuel: number | null;
  date_effet: string;
  date_fin_effet: string | null;
  motif: string | null;
}

export default function MedicationBaremeFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToastStore();
  const isEditing = !!id;

  const [form, setForm] = useState({
    medicationFamilyId: '',
    tauxRemboursement: '',
    plafondActe: '',
    plafondFamilleAnnuel: '',
    dateEffet: new Date().toISOString().split('T')[0],
    dateFinEffet: '',
    motif: '',
  });

  const { data: familiesData } = useQuery({
    queryKey: ['medication-families'],
    queryFn: async () => {
      const response = await apiClient.get<MedicationFamily[]>('/medications/families');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  const { data: bareme } = useQuery({
    queryKey: ['medication-family-bareme', id],
    queryFn: async () => {
      const response = await apiClient.get<MedicationFamilyBareme>(`/medication-family-baremes/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: isEditing,
  });

  useEffect(() => {
    if (bareme) {
      setForm({
        medicationFamilyId: bareme.medication_family_id,
        tauxRemboursement: String(bareme.taux_remboursement * 100),
        plafondActe: bareme.plafond_acte ? String(bareme.plafond_acte) : '',
        plafondFamilleAnnuel: bareme.plafond_famille_annuel ? String(bareme.plafond_famille_annuel) : '',
        dateEffet: bareme.date_effet,
        dateFinEffet: bareme.date_fin_effet || '',
        motif: '',
      });
    }
  }, [bareme]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const taux = parseFloat(form.tauxRemboursement) / 100;
      if (isNaN(taux) || taux < 0 || taux > 1) {
        throw new Error('Taux invalide (0-100%)');
      }
      const data: Record<string, unknown> = {
        medicationFamilyId: form.medicationFamilyId,
        tauxRemboursement: taux,
        dateEffet: form.dateEffet || new Date().toISOString().split('T')[0],
      };
      if (form.plafondActe) data.plafondActe = parseFloat(form.plafondActe);
      if (form.plafondFamilleAnnuel) data.plafondFamilleAnnuel = parseFloat(form.plafondFamilleAnnuel);
      if (form.dateFinEffet) data.dateFinEffet = form.dateFinEffet;
      if (form.motif) data.motif = form.motif;

      if (isEditing) {
        const response = await apiClient.put(`/medication-family-baremes/${id}`, data);
        if (!response.success) throw new Error(response.error?.message);
        return response.data;
      }
      const response = await apiClient.post('/medication-family-baremes', {
        ...data,
        contractId: 'default',
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-family-baremes'] });
      toast({ variant: 'success', title: isEditing ? 'Barème mis à jour' : 'Barème créé avec succès' });
      navigate('/admin/medications');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: error.message });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? 'Modifier le barème' : 'Nouveau barème de remboursement'}
        description={isEditing ? `Modifier le barème ${bareme?.family_name || ''}` : 'Définir un taux de remboursement par famille de médicaments'}
        icon={<TrendingUp className="w-6 h-6" />}
        breadcrumb={[
          { label: 'Médicaments', href: '/admin/medications' },
          { label: isEditing ? 'Modifier barème' : 'Nouveau barème' },
        ]}
      />

      <div className="max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div>
            <Label>Famille de médicaments</Label>
            <Select
              value={form.medicationFamilyId}
              onValueChange={(v) => setForm({ ...form, medicationFamilyId: v })}
              disabled={isEditing}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Sélectionner une famille" />
              </SelectTrigger>
              <SelectContent>
                {familiesData?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Taux de remboursement (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="Ex: 80"
              value={form.tauxRemboursement}
              onChange={(e) => setForm({ ...form, tauxRemboursement: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Plafond par acte (TND, optionnel)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                placeholder="Ex: 50.000"
                value={form.plafondActe}
                onChange={(e) => setForm({ ...form, plafondActe: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Plafond famille/an (TND, optionnel)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                placeholder="Ex: 500.000"
                value={form.plafondFamilleAnnuel}
                onChange={(e) => setForm({ ...form, plafondFamilleAnnuel: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date d'effet</Label>
              <Input
                type="date"
                value={form.dateEffet}
                onChange={(e) => setForm({ ...form, dateEffet: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Date fin d'effet (optionnel)</Label>
              <Input
                type="date"
                value={form.dateFinEffet}
                onChange={(e) => setForm({ ...form, dateFinEffet: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Motif du changement</Label>
            <Textarea
              placeholder="Ex: Révision annuelle des taux, décision CA..."
              value={form.motif}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.medicationFamilyId || !form.tauxRemboursement || !form.dateEffet}
              className="bg-slate-900 hover:bg-[#19355d]"
            >
              {saveMutation.isPending ? 'Enregistrement...' : isEditing ? 'Mettre à jour' : 'Créer le barème'}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/admin/medications')}
            >
              Annuler
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
