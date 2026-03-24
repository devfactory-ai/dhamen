import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_LABELS } from '@dhamen/shared';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Loader2, Shield, ShieldCheck, Lock, ChevronRight,
  Camera, Settings2, Sun, Moon, Monitor, AlertTriangle, UserRound,
} from 'lucide-react';

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout, fetchCurrentUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const queryClient = useQueryClient();

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
  } = useForm({
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phone: user?.phone || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
  } = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onProfileSubmit = (data: { firstName: string; lastName: string; phone: string }) => {
    updateProfileMutation.mutate(data);
  };

  const onPasswordSubmit = async (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    changePasswordMutation.mutate(data);
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; phone: string }) => {
      const response = await apiClient.put<{ user: unknown }>('/users/me', data);
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
    onSuccess: () => {
      fetchCurrentUser();
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setIsEditing(false);
      toast.success('Profil mis à jour avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour du profil');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiClient.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
    onSuccess: () => {
      setIsChangingPassword(false);
      resetPassword();
      toast.success('Mot de passe changé avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors du changement de mot de passe');
    },
  });

  const mfaDisableMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/auth/mfa/disable');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      fetchCurrentUser();
      toast.success('Authentification à deux facteurs désactivée');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la désactivation');
    },
  });

  const handleMfaToggle = () => {
    if (user?.mfaEnabled) {
      mfaDisableMutation.mutate();
    } else {
      navigate('/settings/mfa');
    }
  };

  const roleLabel = user?.role ? ROLE_LABELS[user.role] : '';

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gérer votre compte, vos préférences de notification et la sécurité de votre accès.
        </p>
      </div>

      {/* Top row: Profile + Security */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          {/* Card header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 text-gray-500" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Profil</h2>
                <p className="text-sm text-gray-500">Vos informations personnelles</p>
              </div>
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Modifier
              </button>
            )}
          </div>

          {isEditing ? (
            <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-xs font-medium uppercase tracking-wide text-gray-500">Prénom</Label>
                  <Input id="firstName" {...registerProfile('firstName')} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs font-medium uppercase tracking-wide text-gray-500">Nom</Label>
                  <Input id="lastName" {...registerProfile('lastName')} className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium uppercase tracking-wide text-gray-500">Téléphone</Label>
                <Input id="phone" {...registerProfile('phone')} className="rounded-xl" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition-all disabled:opacity-50"
                >
                  {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Avatar section */}
              <div className="flex items-center gap-4 rounded-2xl bg-gray-50 p-5 mb-5">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-800 to-blue-950 text-xl font-bold text-white">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </div>
                  <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm">
                    <Camera className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">{user?.firstName} {user?.lastName}</p>
                  <p className="text-sm text-blue-600">{user?.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white uppercase tracking-wide">
                      {roleLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-600 uppercase tracking-wide">
                      Actif
                    </span>
                  </div>
                </div>
              </div>

              {/* Role + Phone row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Rôle</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{roleLabel}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Téléphone</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{user?.phone || '—'}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Security Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          {/* Card header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sécurité</h2>
              <p className="text-sm text-gray-500">Gérer votre mot de passe et l'accès</p>
            </div>
          </div>

          {isChangingPassword ? (
            <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword" className="text-xs font-medium uppercase tracking-wide text-gray-500">Mot de passe actuel</Label>
                <Input id="currentPassword" type="password" {...registerPassword('currentPassword')} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword" className="text-xs font-medium uppercase tracking-wide text-gray-500">Nouveau mot de passe</Label>
                <Input id="newPassword" type="password" {...registerPassword('newPassword')} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-xs font-medium uppercase tracking-wide text-gray-500">Confirmer le mot de passe</Label>
                <Input id="confirmPassword" type="password" {...registerPassword('confirmPassword')} className="rounded-xl" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsChangingPassword(false); resetPassword(); }}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition-all disabled:opacity-50"
                >
                  {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Changer le mot de passe
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {/* Password row */}
              <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
                <Lock className="h-5 w-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Mot de passe</p>
                  <p className="text-xs text-gray-500">Dernière modification : il y a 30 jours</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsChangingPassword(true)}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Changer
                </button>
              </div>

              {/* MFA row */}
              <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
                <ShieldCheck className="h-5 w-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Authentification à deux facteurs</p>
                  <p className="text-xs text-gray-500">Sécurisez davantage votre compte</p>
                </div>
                <button
                  type="button"
                  onClick={handleMfaToggle}
                  disabled={mfaDisableMutation.isPending}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    user?.mfaEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  } ${mfaDisableMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      user?.mfaEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Sessions row */}
              <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 cursor-pointer hover:bg-gray-100 transition-colors">
                <Monitor className="h-5 w-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Sessions actives</p>
                  <p className="text-xs text-gray-500">Appareils connectés actuellement</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Preferences + Danger Zone */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Preferences Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3 mb-6">
            <Settings2 className="h-5 w-5 text-teal-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Préférences</h2>
              <p className="text-sm text-gray-500">Personnalisez votre expérience</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Notifications */}
            <div className="flex items-center justify-between pb-5 border-b border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-900">Notifications email</p>
                <p className="text-xs text-gray-500">Recevoir les alertes de nouveaux contrats</p>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notificationsEnabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                >
                  {notificationsEnabled && (
                    <svg className="h-3 w-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
              </button>
            </div>

            {/* Language */}
            <div className="flex items-center justify-between pb-5 border-b border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-900">Langue</p>
                <p className="text-xs text-gray-500">Langue d'affichage de l'interface</p>
              </div>
              <div className="relative">
                <select className="appearance-none rounded-xl border border-gray-300 bg-white py-2 pl-4 pr-8 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Theme */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Thème</p>
                <p className="text-xs text-gray-500">Mode clair, sombre ou système</p>
              </div>
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  className="rounded-lg p-2 text-gray-500 hover:bg-white hover:shadow-sm transition-all"
                  title="Clair"
                >
                  <Sun className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-gray-500 hover:bg-white hover:shadow-sm transition-all"
                  title="Sombre"
                >
                  <Moon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-white p-2 text-gray-900 shadow-sm"
                  title="Système"
                >
                  <Monitor className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone Card */}
        <div className="rounded-2xl border border-red-200 bg-red-50/30 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-red-600">Zone de danger</h2>
              <p className="text-sm text-gray-500">Actions irréversibles sur votre compte</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Logout row */}
            <div className="flex items-center justify-between rounded-xl bg-white border border-red-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Déconnexion</p>
                <p className="text-xs text-gray-500">Se déconnecter de tous les appareils</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Déconnexion
              </button>
            </div>

            {/* Delete account row */}
            <div className="flex items-center justify-between rounded-xl bg-red-50 border border-red-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-red-600">Supprimer le compte</p>
                <p className="text-xs text-gray-500">Cette action est définitive et supprimera vos données</p>
              </div>
              <button
                type="button"
                onClick={() => toast.error('Contactez un administrateur pour supprimer votre compte')}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
