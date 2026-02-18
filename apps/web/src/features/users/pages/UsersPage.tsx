import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { UserForm } from '../components/UserForm';
import { ROLE_LABELS } from '@dhamen/shared';
import type { UserPublic } from '@dhamen/shared';

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserPublic | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data, isLoading } = useUsers(page);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const handleCreate = () => {
    setSelectedUser(undefined);
    setIsDialogOpen(true);
  };

  const handleEdit = (user: UserPublic) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (formData: Record<string, unknown>) => {
    try {
      if (selectedUser) {
        await updateUser.mutateAsync({ id: selectedUser.id, data: formData });
      } else {
        await createUser.mutateAsync(formData as Parameters<typeof createUser.mutateAsync>[0]);
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUser.mutateAsync(id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Nom',
      render: (user: UserPublic) => (
        <div>
          <p className="font-medium">{user.firstName} {user.lastName}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rôle',
      render: (user: UserPublic) => (
        <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
      ),
    },
    {
      key: 'phone',
      header: 'Téléphone',
      render: (user: UserPublic) => user.phone || '-',
    },
    {
      key: 'status',
      header: 'Statut',
      render: (user: UserPublic) => (
        <Badge variant={user.isActive ? 'success' : 'destructive'}>
          {user.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (user: UserPublic) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(user)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(user.id)}
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
        title="Utilisateurs"
        description="Gérer les utilisateurs de la plateforme"
        action={{
          label: 'Nouvel utilisateur',
          onClick: handleCreate,
        }}
      />

      <DataTable
        columns={columns}
        data={data?.users || []}
        isLoading={isLoading}
        emptyMessage="Aucun utilisateur trouvé"
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
            </DialogTitle>
            <DialogDescription>
              {selectedUser
                ? 'Modifier les informations de l\'utilisateur'
                : 'Créer un nouveau compte utilisateur'}
            </DialogDescription>
          </DialogHeader>
          <UserForm
            user={selectedUser}
            onSubmit={handleSubmit}
            onCancel={() => setIsDialogOpen(false)}
            isLoading={createUser.isPending || updateUser.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
