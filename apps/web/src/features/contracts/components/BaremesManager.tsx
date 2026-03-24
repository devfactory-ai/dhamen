/**
 * Baremes Manager Component
 *
 * Pricing tables management for contracts
 */
import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { FilePreview } from '@/components/ui/file-preview';
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
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload } from 'lucide-react';

const baremeSchema = z.object({
  codeActe: z.string().min(1, 'Code acte requis'),
  libellé: z.string().min(1, 'Libellé requis'),
  catégorie: z.enum([
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
  const [filterCatégorie, setFilterCatégorie] = useState<string>('all');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

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

  const selectedCatégorie = watch('catégorie');

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setShowImportDialog(true);
    }
    // Reset the input
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (importFile && onImport) {
      onImport(importFile);
      setShowImportDialog(false);
      setImportFile(null);
    }
  };

  const handleCancelImport = () => {
    setShowImportDialog(false);
    setImportFile(null);
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
      bareme.libellé.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCatégorie =
      filterCatégorie === 'all' || bareme.catégorie === filterCatégorie;
    return matchesSearch && matchesCatégorie;
  });

  const statsByCatégorie = baremes.reduce(
    (acc, bareme) => {
      acc[bareme.catégorie] = (acc[bareme.catégorie] || 0) + 1;
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
            <>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button variant="outline" onClick={() => importFileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Importer CSV
              </Button>
            </>
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
        {Object.entries(statsByCatégorie).map(([cat, count]) => (
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
                  <Label htmlFor="libellé">Libellé</Label>
                  <Input
                    id="libellé"
                    {...register('libellé')}
                    placeholder="Ex: Consultation médecine générale"
                  />
                  {errors.libellé && (
                    <p className="text-destructive text-sm">
                      {errors.libellé.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select
                    value={selectedCatégorie}
                    onValueChange={(value) =>
                      setValue('catégorie', value as BaremeFormData['catégorie'])
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
                    ? 'Enregistrément...'
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
        <Select value={filterCatégorie} onValueChange={setFilterCatégorie}>
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
      <DataTable
        columns={[
          {
            key: 'codeActe',
            header: 'Code',
            render: (b: Bareme) => <span className="font-mono text-sm">{b.codeActe}</span>,
          },
          {
            key: 'libellé',
            header: 'Libellé',
            render: (b: Bareme) => <span>{b.libellé}</span>,
          },
          {
            key: 'catégorie',
            header: 'Catégorie',
            render: (b: Bareme) => (
              <Badge variant="outline">
                {CATEGORIES[b.catégorie as keyof typeof CATEGORIES]}
              </Badge>
            ),
          },
          {
            key: 'tarifConventionne',
            header: 'Conventionné',
            className: 'text-right',
            render: (b: Bareme) => <span className="text-right">{formatAmount(b.tarifConventionne)}</span>,
          },
          {
            key: 'tarifPlafond',
            header: 'Plafond',
            className: 'text-right',
            render: (b: Bareme) => <span className="text-right">{formatAmount(b.tarifPlafond)}</span>,
          },
          {
            key: 'coefficient',
            header: 'Coef.',
            className: 'text-right',
            render: (b: Bareme) => <span className="text-right">{b.coefficient}</span>,
          },
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            render: (b: Bareme) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(b)}>
                  Modifier
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(b.id)}>
                  Supprimer
                </Button>
              </div>
            ),
          },
        ]}
        data={filteredBaremes}
        isLoading={isLoading}
        emptyMessage={baremes.length === 0 ? 'Aucun barème configuré' : 'Aucun résultat pour cette recherche'}
        searchTerm={searchTerm || undefined}
        onClearSearch={() => setSearchTerm('')}
      />

      {/* Import Confirmation Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importer des baremes</DialogTitle>
            <DialogDescription>
              Vérifiéz le fichier avant d'importer les baremes
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {importFile && (
              <FilePreview
                file={importFile}
                onRemove={() => setImportFile(null)}
                showRemove={false}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelImport}>
              Annuler
            </Button>
            <Button onClick={handleConfirmImport} disabled={!importFile}>
              Confirmer l'import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
