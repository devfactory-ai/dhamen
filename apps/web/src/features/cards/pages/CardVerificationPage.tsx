/**
 * Card Vérification Page
 *
 * Page for providers to verify adhérent cards via QR scan or card number
 */

import { useState, useEffect, useRef } from 'react';
import { QrCode, CreditCard, Camera, Loader2, ScanLine } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { PageHeader } from '../../../components/ui/page-header';
import { CardVerificationResult } from '../components/CardVerificationResult';
import { useVerifyCard, type VerificationResult } from '../hooks/useCards';
import { useToast } from '../../../stores/toast';

type VerificationMode = 'choice' | 'qr' | 'manual';

export default function CardVerificationPage() {
  const [mode, setMode] = useState<VerificationMode>('choice');
  const [cardNumber, setCardNumber] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const verifyCard = useVerifyCard();
  const { toast } = useToast();

  // Cleanup camera on unmount or mode change
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        startScanning();
      }
    } catch (err) {
      setCameraError('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
      console.error('Camera error:', err);
    }
  };

  const startScanning = () => {
    // In a real implementation, you would use a QR code library like jsQR
    // For now, we'll show a simulated scanning interface
    scanIntervalRef.current = window.setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');

        if (ctx && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          // Here you would use jsQR to scan the canvas
          // const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // const code = jsQR(imageData.data, imageData.width, imageData.height);
          // if (code) { handleQRCodeScanned(code.data); }
        }
      }
    }, 500);
  };

  const handleQRCodeScanned = async (qrData: string) => {
    stopCamera();

    try {
      const result = await verifyCard.mutateAsync({ qrCodeData: qrData });
      setResult(result);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur de vérification';
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleManualVerify = async () => {
    if (!cardNumber.trim()) {
      toast({
        title: 'Erreur',
        description: 'Veuillez saisir un numéro de carte',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await verifyCard.mutateAsync({ cardNumber: cardNumber.trim() });
      setResult(result);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur de vérification';
      setResult({
        valid: false,
        reason: errorMessage,
      });
    }
  };

  const handleReset = () => {
    setResult(null);
    setCardNumber('');
    setMode('choice');
    stopCamera();
  };

  // Demo QR code verification (for testing without camera)
  const handleDemoVerify = async () => {
    const demoQrData = JSON.stringify({
      token: 'demo_token_12345',
      timestamp: Date.now(),
      signature: 'demo_signature',
    });
    await handleQRCodeScanned(demoQrData);
  };

  if (result) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Vérification de carte"
          description="Résultat de la verification"
        />
        <CardVerificationResult
          valid={result.valid}
          card={result.card}
          reason={result.reason}
          verificationId={result.verificationId}
          onReset={handleReset}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vérification de carte"
        description="Vérifiez l'éligibilité d'un adhérent via sa carte virtuelle"
      />

      {mode === 'choice' && (
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Card
            className="cursor-pointer hover:border-cyan-500 hover:shadow-lg transition-all"
            onClick={() => setMode('qr')}
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto rounded-full bg-cyan-100 p-4 mb-4">
                <QrCode className="h-12 w-12 text-cyan-600" />
              </div>
              <CardTitle>Scanner QR Code</CardTitle>
              <CardDescription>
                Scannez le QR code affiché sur l'application mobile de l'adhérent
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button className="w-full bg-cyan-600 hover:bg-cyan-700">
                <Camera className="mr-2 h-4 w-4" />
                Ouvrir la caméra
              </Button>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-cyan-500 hover:shadow-lg transition-all"
            onClick={() => setMode('manual')}
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto rounded-full bg-emerald-100 p-4 mb-4">
                <CreditCard className="h-12 w-12 text-emerald-600" />
              </div>
              <CardTitle>Saisie manuelle</CardTitle>
              <CardDescription>
                Entrez manuellement le numéro de carte de l'adhérent
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button variant="outline" className="w-full">
                Saisir le numéro
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {mode === 'qr' && (
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Scanner le QR Code
            </CardTitle>
            <CardDescription>
              Positionnez le QR code de l'adhérent devant la caméra
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-square bg-gray-900 rounded-lg overflow-hidden mb-4">
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4 text-center">
                  <Camera className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-red-400">{cameraError}</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={startCamera}
                  >
                    Réessayer
                  </Button>
                </div>
              ) : scanning ? (
                <>
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Scan overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative w-64 h-64 border-2 border-cyan-500 rounded-lg">
                      <ScanLine className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-cyan-500 animate-pulse" />
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-500 rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-500 rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-500 rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-500 rounded-br-lg" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <Camera className="h-16 w-16 mb-4 opacity-50" />
                  <Button onClick={startCamera}>
                    Démarrer la caméra
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  stopCamera();
                  setMode('choice');
                }}
              >
                Annuler
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setMode('manual')}
              >
                Saisie manuelle
              </Button>
            </div>

            {/* Demo button for testing */}
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground text-center mb-2">
                Mode démonstration
              </p>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleDemoVerify}
                disabled={verifyCard.isPending}
              >
                {verifyCard.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Simuler un scan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === 'manual' && (
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Saisie du numéro de carte
            </CardTitle>
            <CardDescription>
              Entrez le numéro de carte au format DHM-XXXX-XXXX-XXXX
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Input
                  placeholder="DHM-XXXX-XXXX-XXXX"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.toUpperCase())}
                  className="text-center font-mono text-lg tracking-wider"
                  maxLength={18}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCardNumber('');
                    setMode('choice');
                  }}
                >
                  Annuler
                </Button>
                <Button
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                  onClick={handleManualVerify}
                  disabled={verifyCard.isPending || !cardNumber.trim()}
                >
                  {verifyCard.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Vérifier
                </Button>
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="link"
                  className="w-full text-cyan-600"
                  onClick={() => setMode('qr')}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  Scanner un QR code à la place
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
