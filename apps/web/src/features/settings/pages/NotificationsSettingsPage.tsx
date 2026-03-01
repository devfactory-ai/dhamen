/**
 * NotificationsSettingsPage - Notification Préférences Page
 *
 * Dedicated page for configuring notification préférences
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Bell, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface NotificationPréférences {
  emailClaims: boolean;
  emailBordereaux: boolean;
  emailReconciliation: boolean;
  smsClaims: boolean;
}

export function NotificationsSettingsPage() {
  const navigate = useNavigate();
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPréférences>({
    emailClaims: true,
    emailBordereaux: true,
    emailReconciliation: true,
    smsClaims: false,
  });

  // Notification préférences mutation
  const updateNotificationsMutation = useMutation({
    mutationFn: async (prefs: NotificationPréférences) => {
      const response = await apiClient.put('/users/me/notifications', prefs);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Préférences de notification mises à jour');
      navigate('/settings');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title="Préférences de notification"
          description="Configurez les notifications que vous souhaitez recevoir"
        />
      </div>

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Choisissez comment vous souhaitez etre informe
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="font-medium text-sm">Notifications par email</p>
              <div className="space-y-3">
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
                  <Label htmlFor="emailReconciliation" className="text-sm">Reconciliation</Label>
                  <Switch
                    id="emailReconciliation"
                    checked={notificationPrefs.emailReconciliation}
                    onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, emailReconciliation: checked }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <p className="font-medium text-sm">Notifications par SMS</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="smsClaims" className="text-sm">Alertes urgentes PEC</Label>
                  <Switch
                    id="smsClaims"
                    checked={notificationPrefs.smsClaims}
                    onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, smsClaims: checked }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => navigate('/settings')}>
                Annuler
              </Button>
              <Button
                onClick={() => updateNotificationsMutation.mutate(notificationPrefs)}
                disabled={updateNotificationsMutation.isPending}
              >
                {updateNotificationsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Enregistrér
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default NotificationsSettingsPage;
