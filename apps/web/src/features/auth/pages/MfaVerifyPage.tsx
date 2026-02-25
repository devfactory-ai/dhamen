import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { setTokens, setUser } from '@/lib/auth';
import type { UserPublic, AuthTokens } from '@dhamen/shared';

interface MfaVerifyResponse {
  user: UserPublic;
  tokens: AuthTokens;
}

export function MfaVerifyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mfaToken = searchParams.get('token');

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();

    // Redirect if no MFA token
    if (!mfaToken) {
      navigate('/login', { replace: true });
    }
  }, [mfaToken, navigate]);

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError(null);

    // Move to next input if value entered
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newCode.every((d) => d !== '') && newCode.join('').length === 6) {
      handleSubmit(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const pastedChars = pastedData.split('');
    const newCode = [...code];
    for (let i = 0; i < pastedChars.length; i++) {
      const char = pastedChars[i];
      if (char !== undefined) {
        newCode[i] = char;
      }
    }
    setCode(newCode);

    if (pastedData.length === 6) {
      handleSubmit(pastedData);
    } else {
      inputRefs.current[pastedData.length]?.focus();
    }
  };

  const handleSubmit = async (totpCode?: string) => {
    const codeToSubmit = totpCode || code.join('');

    if (!useBackupCode && codeToSubmit.length !== 6) {
      setError('Veuillez entrer le code à 6 chiffres');
      return;
    }

    if (useBackupCode && !backupCode.trim()) {
      setError('Veuillez entrer votre code de secours');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<MfaVerifyResponse>('/auth/mfa/verify', {
        mfaToken,
        code: useBackupCode ? undefined : codeToSubmit,
        backupCode: useBackupCode ? backupCode.trim() : undefined,
      });

      if (response.success && response.data) {
        const { user, tokens } = response.data;
        setTokens(tokens);
        setUser(user);
        navigate('/', { replace: true });
      } else if (!response.success) {
        setError(response.error?.message || 'Code invalide');
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError('Erreur de vérification. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!mfaToken) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg
              className="h-8 w-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <CardTitle className="text-2xl">Vérification en deux étapes</CardTitle>
          <CardDescription>
            {useBackupCode
              ? 'Entrez un de vos codes de secours'
              : 'Entrez le code de votre application d\'authentification'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!useBackupCode ? (
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {code.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="h-14 w-12 text-center text-2xl font-semibold"
                  aria-label={`Chiffre ${index + 1} du code`}
                  disabled={isLoading}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="backup-code" className="text-sm font-medium">
                Code de secours
              </label>
              <Input
                id="backup-code"
                type="text"
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(e.target.value);
                  setError(null);
                }}
                placeholder="XXXX-XXXX-XXXX"
                className="text-center font-mono"
                disabled={isLoading}
              />
            </div>
          )}

          {error && (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {useBackupCode && (
            <Button
              onClick={() => handleSubmit()}
              disabled={isLoading || !backupCode.trim()}
              className="w-full"
            >
              {isLoading ? 'Vérification...' : 'Vérifier'}
            </Button>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setUseBackupCode(!useBackupCode);
                setError(null);
                setCode(['', '', '', '', '', '']);
                setBackupCode('');
              }}
              className="text-sm text-primary hover:underline"
            >
              {useBackupCode
                ? 'Utiliser mon application d\'authentification'
                : 'Utiliser un code de secours'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm text-muted-foreground hover:underline"
            >
              Retour à la connexion
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
