import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_LABELS } from '@dhamen/shared';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, Shield, QrCode } from 'lucide-react';

interface MfaSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

interface NotificationPreferences {
  emailClaims: boolean;
  emailBordereaux: boolean;
  emailReconciliation: boolean;
  smsClaims: boolean;
}

export function SettingsPage() {
  const { user, logout, fetchCurrentUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isMfaDialogOpen, setIsMfaDialogOpen] = useState(false);
  const [isNotificationsDialogOpen, setIsNotificationsDialogOpen] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<MfaSetupResponse | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({
    emailClaims: true,
    emailBordereaux: true,
    emailReconciliation: true,
    smsClaims: false,
  });

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

  // Profile mutation
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

  // Change password mutation
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

  // MFA setup mutation
  const mfaSetupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<MfaSetupResponse>('/auth/mfa/setup');
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
    onSuccess: (data) => {
      setMfaSetupData(data);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la configuration MFA');
    },
  });

  // MFA verify mutation
  const mfaVerifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiClient.post('/auth/mfa/verify-setup', { code });
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
    onSuccess: () => {
      fetchCurrentUser();
      setIsMfaDialogOpen(false);
      setMfaSetupData(null);
      setMfaVerifyCode('');
      toast.success('Authentification à deux facteurs activée');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Code invalide');
    },
  });

  // MFA disable mutation
  const mfaDisableMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/auth/mfa/disable');
      if (!response.success) { throw new Error(response.error?.message); }
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

  // Notification preferences mutation
  const updateNotificationsMutation = useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      const response = await apiClient.put('/users/me/notifications', prefs);
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
    onSuccess: () => {
      setIsNotificationsDialogOpen(false);
      toast.success('Préférences de notification mises à jour');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
  });

  const handleMfaToggle = () => {
    if (user?.mfaEnabled) {
      mfaDisableMutation.mutate();
    } else {
      setIsMfaDialogOpen(true);
      mfaSetupMutation.mutate();
    }
  };

  const handleMfaVerify = () => {
    if (mfaVerifyCode.length === 6) {
      mfaVerifyMutation.mutate(mfaVerifyCode);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        description="Gérer votre compte et vos préférences"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Profil</CardTitle>
                <CardDescription>Vos informations personnelles</CardDescription>
              </div>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  Modifier
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Prénom</Label>
                    <Input id="firstName" {...registerProfile('firstName')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Nom</Label>
                    <Input id="lastName" {...registerProfile('lastName')} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input id="phone" {...registerProfile('phone')} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                    Annuler
                  </Button>
                  <Button type="submit">Enregistrer</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className='flex h-16 w-16 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xl'>
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </div>
                  <div>
                    <p className='font-medium text-lg'>{user?.firstName} {user?.lastName}</p>
                    <p className='text-muted-foreground text-sm'>{user?.email}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className='text-muted-foreground text-sm'>Rôle</p>
                    <Badge variant="secondary" className="mt-1">
                      {user?.role ? ROLE_LABELS[user.role] : ''}
                    </Badge>
                  </div>
                  <div>
                    <p className='text-muted-foreground text-sm'>Téléphone</p>
                    <p className="font-medium">{user?.phone || '-'}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security Card */}
        <Card>
          <CardHeader>
            <CardTitle>Sécurité</CardTitle>
            <CardDescription>Gérer votre mot de passe et la sécurité du compte</CardDescription>
          </CardHeader>
          <CardContent>
            {isChangingPassword ? (
              <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                  <Input id="currentPassword" type="password" {...registerPassword('currentPassword')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                  <Input id="newPassword" type="password" {...registerPassword('newPassword')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                  <Input id="confirmPassword" type="password" {...registerPassword('confirmPassword')} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setIsChangingPassword(false);
                    resetPassword();
                  }}>
                    Annuler
                  </Button>
                  <Button type="submit">Changer le mot de passe</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Mot de passe</p>
                    <p className='text-muted-foreground text-sm'>Dernière modification: il y a 30 jours</p>
                  </div>
                  <Button variant="outline" onClick={() => setIsChangingPassword(true)}>
                    Changer
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Shield className={`h-5 w-5 ${user?.mfaEnabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="font-medium">Authentification à deux facteurs</p>
                      <p className='text-muted-foreground text-sm'>
                        {user?.mfaEnabled ? 'Activée - Votre compte est protégé' : 'Non activée'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={user?.mfaEnabled ? 'destructive' : 'default'}
                    onClick={handleMfaToggle}
                    disabled={mfaDisableMutation.isPending}
                  >
                    {mfaDisableMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {user?.mfaEnabled ? 'Désactiver' : 'Activer'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preferences Card */}
        <Card>
          <CardHeader>
            <CardTitle>Préférences</CardTitle>
            <CardDescription>Personnaliser votre expérience</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notifications email</p>
                  <p className='text-muted-foreground text-sm'>Recevoir des notifications par email</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsNotificationsDialogOpen(true)}>
                  Configurer
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Langue</p>
                  <p className='text-muted-foreground text-sm'>Français</p>
                </div>
                <Button variant="outline" size="sm">Changer</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Thème</p>
                  <p className='text-muted-foreground text-sm'>Système</p>
                </div>
                <Button variant="outline" size="sm">Changer</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Zone de danger</CardTitle>
            <CardDescription>Actions irréversibles sur votre compte</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Déconnexion</p>
                  <p className='text-muted-foreground text-sm'>Se déconnecter de tous les appareils</p>
                </div>
                <Button variant="outline" onClick={logout}>
                  Déconnexion
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MFA Setup Dialog */}
      <Dialog open={isMfaDialogOpen} onOpenChange={(open) => {
        setIsMfaDialogOpen(open);
        if (!open) {
          setMfaSetupData(null);
          setMfaVerifyCode('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Configurer l'authentification à deux facteurs
            </DialogTitle>
            <DialogDescription>
              Scannez le QR code avec votre application d'authentification (Google Authenticator, Authy, etc.)
            </DialogDescription>
          </DialogHeader>

          {mfaSetupMutation.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : mfaSetupData ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="rounded-lg border p-4 bg-white">
                  <QrCode className="h-48 w-48" />
                  <img
                    src={mfaSetupData.qrCode}
                    alt="QR Code MFA"
                    className="h-48 w-48"
                    style={{ display: 'none' }}
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.display = 'block';
                      (e.target as HTMLImageElement).previousElementSibling?.remove();
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className='text-muted-foreground text-center text-sm'>
                  Ou entrez ce code manuellement :
                </p>
                <code className="block rounded bg-muted p-2 text-center font-mono text-sm">
                  {mfaSetupData.secret}
                </code>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mfaCode">Code de vérification</Label>
                <Input
                  id="mfaCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaVerifyCode}
                  onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-lg tracking-widest"
                />
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <p className='font-medium text-sm text-yellow-800'>Codes de secours</p>
                <p className='text-xs text-yellow-700 mb-2'>
                  Conservez ces codes en lieu sûr. Ils vous permettront de vous connecter si vous perdez l'accès à votre application.
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {mfaSetupData.backupCodes.map((code, i) => (
                    <code key={i} className="text-xs font-mono">{code}</code>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsMfaDialogOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleMfaVerify}
                  disabled={mfaVerifyCode.length !== 6 || mfaVerifyMutation.isPending}
                >
                  {mfaVerifyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Activer
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Notifications Dialog */}
      <Dialog open={isNotificationsDialogOpen} onOpenChange={setIsNotificationsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Préférences de notification</DialogTitle>
            <DialogDescription>
              Configurez les notifications que vous souhaitez recevoir
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <p className='font-medium text-sm'>Notifications par email</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="emailClaims" className="text-sm">Nouvelles PEC</Label>
                <Switch
                  id="emailClaims"
                  checked={notificationPrefs.emailClaims}
                  onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, emailClaims: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="emailBordereaux" className="text-sm">Bordereaux</Label>
                <Switch
                  id="emailBordereaux"
                  checked={notificationPrefs.emailBordereaux}
                  onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, emailBordereaux: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="emailReconciliation" className="text-sm">Réconciliation</Label>
                <Switch
                  id="emailReconciliation"
                  checked={notificationPrefs.emailReconciliation}
                  onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, emailReconciliation: checked }))}
                />
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <p className='font-medium text-sm'>Notifications par SMS</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="smsClaims" className="text-sm">Alertes urgentes PEC</Label>
                <Switch
                  id="smsClaims"
                  checked={notificationPrefs.smsClaims}
                  onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, smsClaims: checked }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsNotificationsDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => updateNotificationsMutation.mutate(notificationPrefs)}
                disabled={updateNotificationsMutation.isPending}
              >
                {updateNotificationsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
