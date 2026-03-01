/**
 * MfaSetupPage - MFA Setup Page
 *
 * Dedicated page for setting up two-factor authentication
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Shield, Loader2, QrCode } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface MfaSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export function MfaSetupPage() {
  const navigate = useNavigate();
  const { fetchCurrentUser } = useAuth();
  const [mfaSetupData, setMfaSetupData] = useState<MfaSetupResponse | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');

  // MFA setup mutation
  const mfaSetupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<MfaSetupResponse>('/auth/mfa/setup');
      if (!response.success) throw new Error(response.error?.message);
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
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      fetchCurrentUser();
      toast.success('Authentification a deux facteurs activee');
      navigate('/settings');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Code invalide');
    },
  });

  const handleMfaVerify = () => {
    if (mfaVerifyCode.length === 6) {
      mfaVerifyMutation.mutate(mfaVerifyCode);
    }
  };

  // Auto-start setup on mount
  if (!mfaSetupData && !mfaSetupMutation.isPending && !mfaSetupMutation.isError) {
    mfaSetupMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title="Configurer l'authentification a deux facteurs"
          description="Scannez le QR code avec votre application d'authentification"
        />
      </div>

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Configuration MFA
          </CardTitle>
          <CardDescription>
            Utilisez Google Authenticator, Authy ou une autre application compatible
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                <p className="text-muted-foreground text-center text-sm">
                  Ou entrez ce code manuellement :
                </p>
                <code className="block rounded bg-muted p-2 text-center font-mono text-sm">
                  {mfaSetupData.secret}
                </code>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mfaCode">Code de verification</Label>
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
                <p className="font-medium text-sm text-yellow-800">Codes de secours</p>
                <p className="text-xs text-yellow-700 mb-2">
                  Conservez ces codes en lieu sûr. Ils vous permettront de vous connecter si vous perdez l'accès à votre application.
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {mfaSetupData.backupCodes.map((code, i) => (
                    <code key={i} className="text-xs font-mono">{code}</code>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => navigate('/settings')}>
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
          ) : mfaSetupMutation.isError ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <p className="text-destructive">Erreur lors de la configuration</p>
              <Button onClick={() => mfaSetupMutation.mutate()}>Reessayer</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default MfaSetupPage;
