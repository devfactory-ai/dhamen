/**
 * Garanties Manager Component
 *
 * Advanced guarantees management for contracts
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

const garantieSchema = z.object({
  code: z.string().min(1, 'Code requis'),
  nom: z.string().min(1, 'Nom requis'),
  catégorie: z.enum([
    'pharmacie',
    'consultation',
    'hospitalisation',
    'optique',
    'dentaire',
    'laboratoire',
    'maternite',
    'prevention',
  ]),
  tauxRemboursement: z.number().min(0).max(100),
  plafondAnnuel: z.number().min(0),
  plafondParActe: z.number().min(0).optional(),
  delaiCarence: z.number().min(0).default(0),
  franchise: z.number().min(0).default(0),
  actif: z.boolean().default(true),
});

type GarantieFormData = z.infer<typeof garantieSchema>;

interface Garantie extends GarantieFormData {
  id: string;
}

interface GarantiesManagerProps {
  contractId: string;
  garanties: Garantie[];
  onAdd: (garantie: GarantieFormData) => void;
  onUpdate: (id: string, garantie: GarantieFormData) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

const CATEGORIES = {
  pharmacie: { label: 'Pharmacie', color: 'bg-blue-100 text-blue-800' },
  consultation: { label: 'Consultation', color: 'bg-green-100 text-green-800' },
  hospitalisation: { label: 'Hospitalisation', color: 'bg-red-100 text-red-800' },
  optique: { label: 'Optique', color: 'bg-purple-100 text-purple-800' },
  dentaire: { label: 'Dentaire', color: 'bg-yellow-100 text-yellow-800' },
  laboratoire: { label: 'Laboratoire', color: 'bg-cyan-100 text-cyan-800' },
  maternite: { label: 'Maternité', color: 'bg-pink-100 text-pink-800' },
  prevention: { label: 'Prévention', color: 'bg-teal-100 text-teal-800' },
};

export function GarantiesManager({
  contractId,
  garanties,
  onAdd,
  onUpdate,
  onDelete,
  isLoading,
}: GarantiesManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingGarantie, setEditingGarantie] = useState<Garantie | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<GarantieFormData>({
    resolver: zodResolver(garantieSchema),
    defaultValues: {
      tauxRemboursement: 70,
      plafondAnnuel: 1000000,
      delaiCarence: 0,
      franchise: 0,
      actif: true,
    },
  });

  const selectedCatégorie = watch('catégorie');
  const isActif = watch('actif');

  const handleFormSubmit = (data: GarantieFormData) => {
    if (editingGarantie) {
      onUpdate(editingGarantie.id, data);
    } else {
      onAdd(data);
    }
    reset();
    setShowForm(false);
    setEditingGarantie(null);
  };

  const handleEdit = (garantie: Garantie) => {
    setEditingGarantie(garantie);
    Object.entries(garantie).forEach(([key, value]) => {
      if (key !== 'id') {
        setValue(key as keyof GarantieFormData, value as never);
      }
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    reset();
    setShowForm(false);
    setEditingGarantie(null);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const groupedGaranties = garanties.reduce(
    (acc, garantie) => {
      const cat = garantie.catégorie;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(garantie);
      return acc;
    },
    {} as Record<string, Garantie[]>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Garanties du contrat</h3>
          <p className="text-muted-foreground text-sm">
            Configurez les garanties et taux de remboursement
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>Ajouter une garantie</Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingGarantie ? 'Modifier la garantie' : 'Nouvelle garantie'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    {...register('code')}
                    placeholder="Ex: GAR-PHARMA-01"
                  />
                  {errors.code && (
                    <p className="text-destructive text-sm">{errors.code.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nom">Nom</Label>
                  <Input
                    id="nom"
                    {...register('nom')}
                    placeholder="Ex: Pharmacie standard"
                  />
                  {errors.nom && (
                    <p className="text-destructive text-sm">{errors.nom.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select
                    value={selectedCatégorie}
                    onValueChange={(value) =>
                      setValue('catégorie', value as GarantieFormData['catégorie'])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIES).map(([value, { label }]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.catégorie && (
                    <p className="text-destructive text-sm">{errors.catégorie.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tauxRemboursement">Taux de remboursement (%)</Label>
                  <Input
                    id="tauxRemboursement"
                    type="number"
                    min="0"
                    max="100"
                    {...register('tauxRemboursement', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="plafondAnnuel">Plafond annuel (millimes)</Label>
                  <Input
                    id="plafondAnnuel"
                    type="number"
                    min="0"
                    {...register('plafondAnnuel', { valueAsNumber: true })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plafondParActe">Plafond par acte (millimes)</Label>
                  <Input
                    id="plafondParActe"
                    type="number"
                    min="0"
                    {...register('plafondParActe', { valueAsNumber: true })}
                    placeholder="Optionnel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="franchise">Franchise (millimes)</Label>
                  <Input
                    id="franchise"
                    type="number"
                    min="0"
                    {...register('franchise', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="delaiCarence">Délai de carence (jours)</Label>
                  <Input
                    id="delaiCarence"
                    type="number"
                    min="0"
                    {...register('delaiCarence', { valueAsNumber: true })}
                  />
                </div>

                <div className="flex items-center space-x-2 pt-7">
                  <Switch
                    id="actif"
                    checked={isActif}
                    onCheckedChange={(checked) => setValue('actif', checked)}
                  />
                  <Label htmlFor="actif">Garantie active</Label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading
                    ? 'Enregistrement...'
                    : editingGarantie
                      ? 'Mettre à jour'
                      : 'Ajouter'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Garanties List */}
      <div className="space-y-4">
        {Object.entries(groupedGaranties).map(([catégorie, items]) => (
          <Card key={catégorie}>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${CATEGORIES[catégorie as keyof typeof CATEGORIES]?.color}`}
                >
                  {CATEGORIES[catégorie as keyof typeof CATEGORIES]?.label}
                </span>
                <span className="text-muted-foreground">({items.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y">
                {items.map((garantie) => (
                  <div
                    key={garantie.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{garantie.nom}</p>
                        <span className="text-muted-foreground text-xs">
                          ({garantie.code})
                        </span>
                        {!garantie.actif && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex gap-4 text-muted-foreground text-sm">
                        <span>Taux: {garantie.tauxRemboursement}%</span>
                        <span>Plafond: {formatAmount(garantie.plafondAnnuel)}</span>
                        {garantie.franchise > 0 && (
                          <span>Franchise: {formatAmount(garantie.franchise)}</span>
                        )}
                        {garantie.delaiCarence > 0 && (
                          <span>Carence: {garantie.delaiCarence}j</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(garantie)}
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => onDelete(garantie.id)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {garanties.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            Aucune garantie configurée. Cliquez sur &quot;Ajouter une garantie&quot;
            pour commencer.
          </div>
        )}
      </div>
    </div>
  );
}
