import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInsurers, useCreateInsurer, useUpdateInsurer, useDeleteInsurer, type Insurer } from '../hooks/useInsurers';

const INSURER_TYPES = {
  INSURANCE: { label: 'Assurance', color: 'bg-blue-100 text-blue-800' },
  MUTUAL: { label: 'Mutuelle', color: 'bg-green-100 text-green-800' },
};

export function InsurersPage() {
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedInsurer, setSelectedInsurer] = useState<Insurer | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data, isLoading } = useInsurers(page);
  const createInsurer = useCreateInsurer();
  const updateInsurer = useUpdateInsurer();
  const deleteInsurer = useDeleteInsurer();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm({
    defaultValues: {
      name: '',
      code: '',
      type: 'INSURANCE',
      registrationNumber: '',
      taxId: '',
      address: '',
      city: '',
      postalCode: '',
      phone: '',
      email: '',
      website: '',
    },
  });

  const selectedType = watch('type');

  const handleCreate = () => {
    setSelectedInsurer(undefined);
    reset({
      name: '',
      code: '',
      type: 'INSURANCE',
      registrationNumber: '',
      taxId: '',
      address: '',
      city: '',
      postalCode: '',
      phone: '',
      email: '',
      website: '',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (insurer: Insurer) => {
    setSelectedInsurer(insurer);
    reset({
      name: insurer.name,
      code: insurer.code,
      type: insurer.type,
      registrationNumber: insurer.registrationNumber,
      taxId: insurer.taxId || '',
      address: insurer.address,
      city: insurer.city,
      postalCode: insurer.postalCode || '',
      phone: insurer.phone,
      email: insurer.email || '',
      website: insurer.website || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (formData: Record<string, string>) => {
    try {
      if (selectedInsurer) {
        await updateInsurer.mutateAsync({ id: selectedInsurer.id, data: formData });
      } else {
        await createInsurer.mutateAsync(formData as Parameters<typeof createInsurer.mutateAsync>[0]);
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving insurer:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInsurer.mutateAsync(id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting insurer:', error);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Assureur',
      render: (insurer: Insurer) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm font-bold">
            {insurer.code}
          </div>
          <div>
            <p className="font-medium">{insurer.name}</p>
            <p className="text-sm text-muted-foreground">{insurer.registrationNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (insurer: Insurer) => {
        const typeInfo = INSURER_TYPES[insurer.type];
        return (
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        );
      },
    },
    {
      key: 'location',
      header: 'Localisation',
      render: (insurer: Insurer) => (
        <div>
          <p className="text-sm">{insurer.city}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (insurer: Insurer) => (
        <div>
          <p className="text-sm">{insurer.phone}</p>
          {insurer.email && <p className="text-xs text-muted-foreground">{insurer.email}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (insurer: Insurer) => (
        <Badge variant={insurer.isActive ? 'success' : 'destructive'}>
          {insurer.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (insurer: Insurer) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(insurer)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(insurer.id)}
          >
            Supprimer
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assureurs"
        description="Gérer les assureurs et mutuelles partenaires"
        action={{
          label: 'Nouvel assureur',
          onClick: handleCreate,
        }}
      />

      <DataTable
        columns={columns}
        data={data?.insurers || []}
        isLoading={isLoading}
        emptyMessage="Aucun assureur trouvé"
        pagination={
          data
            ? {
                page,
                limit: 20,
                total: data.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedInsurer ? 'Modifier l\'assureur' : 'Nouvel assureur'}
            </DialogTitle>
            <DialogDescription>
              {selectedInsurer
                ? 'Modifier les informations de l\'assureur'
                : 'Ajouter un nouvel assureur ou mutuelle'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={selectedType} onValueChange={(v) => setValue('type', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INSURER_TYPES).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" {...register('code', { required: true })} placeholder="STAR" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" {...register('name', { required: true })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registrationNumber">N° Enregistrement</Label>
                <Input id="registrationNumber" {...register('registrationNumber', { required: true })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxId">Matricule Fiscal</Label>
                <Input id="taxId" {...register('taxId')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" {...register('address', { required: true })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" {...register('city', { required: true })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Code Postal</Label>
                <Input id="postalCode" {...register('postalCode')} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" {...register('phone', { required: true })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Site Web</Label>
              <Input id="website" {...register('website')} placeholder="https://..." />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createInsurer.isPending || updateInsurer.isPending}>
                {createInsurer.isPending || updateInsurer.isPending ? 'Enregistrement...' : selectedInsurer ? 'Mettre à jour' : 'Créer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer cet assureur ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteInsurer.isPending}
            >
              {deleteInsurer.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
