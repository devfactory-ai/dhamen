/**
 * Baremes Manager Component
 *
 * Pricing tables management for contracts
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const baremeSchema = z.object({
  codeActe: z.string().min(1, 'Code acte requis'),
  libelle: z.string().min(1, 'Libellé requis'),
  categorie: z.enum([
    'consultation',
    'pharmacie',
    'laboratoire',
    'radiologie',
    'hospitalisation',
    'chirurgie',
    'soins_dentaires',
    'optique',
  ]),
  tarifConventionne: z.number().min(0, 'Tarif invalide'),
  tarifPlafond: z.number().min(0, 'Tarif plafond invalide'),
  tarifLibre: z.number().min(0, 'Tarif libre invalide').optional(),
  coefficient: z.number().min(0).default(1),
  actif: z.boolean().default(true),
});

type BaremeFormData = z.infer<typeof baremeSchema>;

interface Bareme extends BaremeFormData {
  id: string;
}

interface BaremesManagerProps {
  contractId: string;
  baremes: Bareme[];
  onAdd: (bareme: BaremeFormData) => void;
  onUpdate: (id: string, bareme: BaremeFormData) => void;
  onDelete: (id: string) => void;
  onImport?: (file: File) => void;
  onExport?: () => void;
  isLoading?: boolean;
}

const CATEGORIES = {
  consultation: 'Consultation',
  pharmacie: 'Pharmacie',
  laboratoire: 'Laboratoire',
  radiologie: 'Radiologie',
  hospitalisation: 'Hospitalisation',
  chirurgie: 'Chirurgie',
  soins_dentaires: 'Soins dentaires',
  optique: 'Optique',
};

export function BaremesManager({
  contractId,
  baremes,
  onAdd,
  onUpdate,
  onDelete,
  onImport,
  onExport,
  isLoading,
}: BaremesManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingBareme, setEditingBareme] = useState<Bareme | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategorie, setFilterCategorie] = useState<string>('all');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BaremeFormData>({
    resolver: zodResolver(baremeSchema),
    defaultValues: {
      coefficient: 1,
      actif: true,
    },
  });

  const selectedCategorie = watch('categorie');

  const handleFormSubmit = (data: BaremeFormData) => {
    if (editingBareme) {
      onUpdate(editingBareme.id, data);
    } else {
      onAdd(data);
    }
    reset();
    setShowForm(false);
    setEditingBareme(null);
  };

  const handleEdit = (bareme: Bareme) => {
    setEditingBareme(bareme);
    Object.entries(bareme).forEach(([key, value]) => {
      if (key !== 'id') {
        setValue(key as keyof BaremeFormData, value as never);
      }
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    reset();
    setShowForm(false);
    setEditingBareme(null);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImport) {
      onImport(file);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const filteredBaremes = baremes.filter((bareme) => {
    const matchesSearch =
      bareme.codeActe.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bareme.libelle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategorie =
      filterCategorie === 'all' || bareme.categorie === filterCategorie;
    return matchesSearch && matchesCategorie;
  });

  const statsByCategorie = baremes.reduce(
    (acc, bareme) => {
      acc[bareme.categorie] = (acc[bareme.categorie] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Barèmes et tarification</h3>
          <p className="text-muted-foreground text-sm">
            Configurez les tarifs conventionnés et plafonds de remboursement
          </p>
        </div>
        <div className="flex gap-2">
          {onExport && (
            <Button variant="outline" onClick={onExport}>
              Exporter CSV
            </Button>
          )}
          {onImport && (
            <label>
              <Button variant="outline" asChild>
                <span>Importer CSV</span>
              </Button>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleFileImport}
              />
            </label>
          )}
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>Ajouter un acte</Button>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="cursor-default">
          Total: {baremes.length} actes
        </Badge>
        {Object.entries(statsByCategorie).map(([cat, count]) => (
          <Badge key={cat} variant="secondary" className="cursor-default">
            {CATEGORIES[cat as keyof typeof CATEGORIES]}: {count}
          </Badge>
        ))}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingBareme ? 'Modifier le barème' : 'Nouveau barème'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="codeActe">Code acte</Label>
                  <Input
                    id="codeActe"
                    {...register('codeActe')}
                    placeholder="Ex: NGAP-C"
                  />
                  {errors.codeActe && (
                    <p className="text-destructive text-sm">
                      {errors.codeActe.message}
                    </p>
                  )}
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="libelle">Libellé</Label>
                  <Input
                    id="libelle"
                    {...register('libelle')}
                    placeholder="Ex: Consultation médecine générale"
                  />
                  {errors.libelle && (
                    <p className="text-destructive text-sm">
                      {errors.libelle.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select
                    value={selectedCategorie}
                    onValueChange={(value) =>
                      setValue('categorie', value as BaremeFormData['categorie'])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coefficient">Coefficient</Label>
                  <Input
                    id="coefficient"
                    type="number"
                    step="0.1"
                    min="0"
                    {...register('coefficient', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="tarifConventionne">
                    Tarif conventionné (millimes)
                  </Label>
                  <Input
                    id="tarifConventionne"
                    type="number"
                    min="0"
                    {...register('tarifConventionne', { valueAsNumber: true })}
                    placeholder="35000"
                  />
                  {errors.tarifConventionne && (
                    <p className="text-destructive text-sm">
                      {errors.tarifConventionne.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tarifPlafond">Tarif plafond (millimes)</Label>
                  <Input
                    id="tarifPlafond"
                    type="number"
                    min="0"
                    {...register('tarifPlafond', { valueAsNumber: true })}
                    placeholder="50000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tarifLibre">Tarif libre (millimes)</Label>
                  <Input
                    id="tarifLibre"
                    type="number"
                    min="0"
                    {...register('tarifLibre', { valueAsNumber: true })}
                    placeholder="Optionnel"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading
                    ? 'Enregistrement...'
                    : editingBareme
                      ? 'Mettre à jour'
                      : 'Ajouter'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            placeholder="Rechercher par code ou libellé..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterCategorie} onValueChange={setFilterCategorie}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Toutes catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {Object.entries(CATEGORIES).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Baremes Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Conventionné</TableHead>
                <TableHead className="text-right">Plafond</TableHead>
                <TableHead className="text-right">Coef.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBaremes.map((bareme) => (
                <TableRow key={bareme.id}>
                  <TableCell className="font-mono text-sm">
                    {bareme.codeActe}
                  </TableCell>
                  <TableCell>{bareme.libelle}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CATEGORIES[bareme.categorie as keyof typeof CATEGORIES]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatAmount(bareme.tarifConventionne)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatAmount(bareme.tarifPlafond)}
                  </TableCell>
                  <TableCell className="text-right">{bareme.coefficient}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(bareme)}
                    >
                      Modifier
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => onDelete(bareme.id)}
                    >
                      Supprimer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredBaremes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {baremes.length === 0
                      ? 'Aucun barème configuré'
                      : 'Aucun résultat pour cette recherche'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
