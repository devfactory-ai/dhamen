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
import { useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider, type Provider } from '../hooks/useProviders';

const PROVIDER_TYPES = {
  PHARMACY: { label: 'Pharmacie', color: 'bg-green-100 text-green-800' },
  DOCTOR: { label: 'Cabinet Médical', color: 'bg-blue-100 text-blue-800' },
  LAB: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  CLINIC: { label: 'Clinique', color: 'bg-orange-100 text-orange-800' },
};

export function ProvidersPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data, isLoading } = useProviders(page, 20, typeFilter);
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      type: 'PHARMACY',
      registrationNumber: '',
      taxId: '',
      address: '',
      city: '',
      postalCode: '',
      phone: '',
      email: '',
    },
  });

  const selectedType = watch('type');

  const handleCreate = () => {
    setSelectedProvider(undefined);
    reset({
      name: '',
      type: 'PHARMACY',
      registrationNumber: '',
      taxId: '',
      address: '',
      city: '',
      postalCode: '',
      phone: '',
      email: '',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (provider: Provider) => {
    setSelectedProvider(provider);
    reset({
      name: provider.name,
      type: provider.type,
      registrationNumber: provider.registrationNumber,
      taxId: provider.taxId || '',
      address: provider.address,
      city: provider.city,
      postalCode: provider.postalCode || '',
      phone: provider.phone,
      email: provider.email || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (formData: Record<string, string>) => {
    try {
      if (selectedProvider) {
        await updateProvider.mutateAsync({ id: selectedProvider.id, data: formData });
      } else {
        await createProvider.mutateAsync(formData as Parameters<typeof createProvider.mutateAsync>[0]);
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving provider:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProvider.mutateAsync(id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting provider:', error);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Prestataire',
      render: (provider: Provider) => (
        <div>
          <p className="font-medium">{provider.name}</p>
          <p className="text-sm text-muted-foreground">{provider.registrationNumber}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (provider: Provider) => {
        const typeInfo = PROVIDER_TYPES[provider.type];
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
      render: (provider: Provider) => (
        <div>
          <p className="text-sm">{provider.city}</p>
          <p className="text-xs text-muted-foreground">{provider.address}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (provider: Provider) => (
        <div>
          <p className="text-sm">{provider.phone}</p>
          {provider.email && <p className="text-xs text-muted-foreground">{provider.email}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (provider: Provider) => (
        <Badge variant={provider.isActive ? 'success' : 'destructive'}>
          {provider.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (provider: Provider) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(provider)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(provider.id)}
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
        title="Prestataires"
        description="Gérer les prestataires de santé"
        action={{
          label: 'Nouveau prestataire',
          onClick: handleCreate,
        }}
      />

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {Object.entries(PROVIDER_TYPES).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.providers || []}
        isLoading={isLoading}
        emptyMessage="Aucun prestataire trouvé"
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
              {selectedProvider ? 'Modifier le prestataire' : 'Nouveau prestataire'}
            </DialogTitle>
            <DialogDescription>
              {selectedProvider
                ? 'Modifier les informations du prestataire'
                : 'Ajouter un nouveau prestataire de santé'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={selectedType} onValueChange={(v) => setValue('type', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_TYPES).map(([value, { label }]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createProvider.isPending || updateProvider.isPending}>
                {createProvider.isPending || updateProvider.isPending ? 'Enregistrement...' : selectedProvider ? 'Mettre à jour' : 'Créer'}
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
              Êtes-vous sûr de vouloir supprimer ce prestataire ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteProvider.isPending}
            >
              {deleteProvider.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
