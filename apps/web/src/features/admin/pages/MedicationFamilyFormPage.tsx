import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Package } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useToastStore } from '@/stores/toast';

export default function MedicationFamilyFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToastStore();
  const [form, setForm] = useState({ code: '', name: '', nameAr: '', description: '' });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const response = await apiClient.post('/medications/families', data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-families'] });
      toast({ variant: 'success', title: 'Famille créée avec succès' });
      navigate('/admin/medications');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: error.message });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouvelle famille de médicaments"
        description="Ajouter une nouvelle famille pour classer les médicaments"
        icon={<Package className="w-6 h-6" />}
        breadcrumb={[
          { label: 'Médicaments', href: '/admin/medications' },
          { label: 'Nouvelle famille' },
        ]}
      />

      <div className="max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div>
            <Label>Code</Label>
            <Input
              placeholder="Ex: ANTIB"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Nom</Label>
            <Input
              placeholder="Ex: Antibiotiques"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Nom en arabe (optionnel)</Label>
            <Input
              placeholder="Ex: مضادات حيوية"
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              dir="rtl"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Description (optionnel)</Label>
            <Textarea
              placeholder="Description de la famille..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.code || !form.name}
              className="bg-slate-900 hover:bg-[#19355d]"
            >
              Créer la famille
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
