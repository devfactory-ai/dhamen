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
import { useAdherents, useCreateAdherent, useUpdateAdherent, useDeleteAdherent, type Adherent } from '../hooks/useAdherents';
import { useInsurers } from '@/features/insurers/hooks/useInsurers';

const RELATIONSHIP_LABELS = {
  PRIMARY: 'Titulaire',
  SPOUSE: 'Conjoint(e)',
  CHILD: 'Enfant',
  PARENT: 'Parent',
};

const GENDER_LABELS = {
  M: 'Masculin',
  F: 'Féminin',
};

export function AdherentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAdherent, setSelectedAdherent] = useState<Adherent | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data, isLoading } = useAdherents(page, 20, search || undefined);
  const { data: insurersData } = useInsurers(1, 100);
  const createAdherent = useCreateAdherent();
  const updateAdherent = useUpdateAdherent();
  const deleteAdherent = useDeleteAdherent();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm({
    defaultValues: {
      insurerId: '',
      nationalId: '',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: 'M',
      phone: '',
      email: '',
      address: '',
      city: '',
      relationship: 'PRIMARY',
    },
  });

  const selectedGender = watch('gender');
  const selectedRelationship = watch('relationship');
  const selectedInsurerId = watch('insurerId');

  const handleCreate = () => {
    setSelectedAdherent(undefined);
    reset({
      insurerId: '',
      nationalId: '',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: 'M',
      phone: '',
      email: '',
      address: '',
      city: '',
      relationship: 'PRIMARY',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (adherent: Adherent) => {
    setSelectedAdherent(adherent);
    reset({
      insurerId: adherent.insurerId,
      nationalId: adherent.nationalId,
      firstName: adherent.firstName,
      lastName: adherent.lastName,
      dateOfBirth: adherent.dateOfBirth.split('T')[0],
      gender: adherent.gender,
      phone: adherent.phone || '',
      email: adherent.email || '',
      address: adherent.address || '',
      city: adherent.city || '',
      relationship: adherent.relationship,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (formData: Record<string, string>) => {
    try {
      if (selectedAdherent) {
        await updateAdherent.mutateAsync({ id: selectedAdherent.id, data: formData });
      } else {
        await createAdherent.mutateAsync(formData as Parameters<typeof createAdherent.mutateAsync>[0]);
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving adherent:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAdherent.mutateAsync(id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting adherent:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const columns = [
    {
      key: 'member',
      header: 'Adhérent',
      render: (adherent: Adherent) => (
        <div>
          <p className="font-medium">{adherent.firstName} {adherent.lastName}</p>
          <p className="text-sm text-muted-foreground">N° {adherent.memberNumber}</p>
        </div>
      ),
    },
    {
      key: 'nationalId',
      header: 'CIN',
      render: (adherent: Adherent) => adherent.nationalId,
    },
    {
      key: 'info',
      header: 'Informations',
      render: (adherent: Adherent) => (
        <div>
          <p className="text-sm">{formatDate(adherent.dateOfBirth)}</p>
          <p className="text-xs text-muted-foreground">{GENDER_LABELS[adherent.gender]}</p>
        </div>
      ),
    },
    {
      key: 'relationship',
      header: 'Lien',
      render: (adherent: Adherent) => (
        <Badge variant="secondary">{RELATIONSHIP_LABELS[adherent.relationship]}</Badge>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (adherent: Adherent) => (
        <div>
          {adherent.phone && <p className="text-sm">{adherent.phone}</p>}
          {adherent.city && <p className="text-xs text-muted-foreground">{adherent.city}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (adherent: Adherent) => (
        <Badge variant={adherent.isActive ? 'success' : 'destructive'}>
          {adherent.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (adherent: Adherent) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(adherent)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(adherent.id)}
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
        title="Adhérents"
        description="Gérer les adhérents et leurs ayants droit"
        action={{
          label: 'Nouvel adhérent',
          onClick: handleCreate,
        }}
      />

      {/* Search */}
      <div className="flex gap-4">
        <Input
          placeholder="Rechercher par nom, CIN ou N° adhérent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.adherents || []}
        isLoading={isLoading}
        emptyMessage="Aucun adhérent trouvé"
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
              {selectedAdherent ? 'Modifier l\'adhérent' : 'Nouvel adhérent'}
            </DialogTitle>
            <DialogDescription>
              {selectedAdherent
                ? 'Modifier les informations de l\'adhérent'
                : 'Ajouter un nouvel adhérent'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Assureur</Label>
              <Select value={selectedInsurerId} onValueChange={(v) => setValue('insurerId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un assureur" />
                </SelectTrigger>
                <SelectContent>
                  {insurersData?.insurers.map((insurer) => (
                    <SelectItem key={insurer.id} value={insurer.id}>
                      {insurer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input id="firstName" {...register('firstName', { required: true })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input id="lastName" {...register('lastName', { required: true })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nationalId">N° CIN</Label>
              <Input id="nationalId" {...register('nationalId', { required: true })} placeholder="12345678" />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date de naissance</Label>
                <Input id="dateOfBirth" type="date" {...register('dateOfBirth', { required: true })} />
              </div>
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select value={selectedGender} onValueChange={(v) => setValue('gender', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculin</SelectItem>
                    <SelectItem value="F">Féminin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lien</Label>
                <Select value={selectedRelationship} onValueChange={(v) => setValue('relationship', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" {...register('phone')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Input id="address" {...register('address')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" {...register('city')} />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createAdherent.isPending || updateAdherent.isPending}>
                {createAdherent.isPending || updateAdherent.isPending ? 'Enregistrement...' : selectedAdherent ? 'Mettre à jour' : 'Créer'}
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
              Êtes-vous sûr de vouloir supprimer cet adhérent ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteAdherent.isPending}
            >
              {deleteAdherent.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
