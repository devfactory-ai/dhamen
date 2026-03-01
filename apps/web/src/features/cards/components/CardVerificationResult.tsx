/**
 * Card Vérification Result Component
 *
 * Displays the result of a card verification
 */

import { CheckCircle, XCircle, AlertCircle, User, Calendar, Building2, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { VirtualCardWithAdherent } from '../hooks/useCards';

interface CardVerificationResultProps {
  valid: boolean;
  card?: VirtualCardWithAdherent;
  reason?: string;
  verificationId?: string;
  onReset: () => void;
}

const reasonMessages: Record<string, string> = {
  CARD_NOT_FOUND: 'Carte non trouvée dans le système',
  CARD_EXPIRED: 'Cette carte a expiré',
  CARD_REVOKED: 'Cette carte a été révoquée',
  CARD_SUSPENDED: 'Cette carte est temporairement suspendue',
  QR_CODE_EXPIRED: 'Le QR code a expiré. Demandez à l\'adhérent de le régénérer',
  INVALID_SIGNATURE: 'Signature du QR code invalide',
  INVALID_QR_DATA: 'Format de QR code non reconnu',
  VERIFICATION_FAILED: 'La vérification a échoué',
};

export function CardVerificationResult({
  valid,
  card,
  reason,
  verificationId,
  onReset,
}: CardVerificationResultProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAge = (dateOfBirth: string) => {
    const birth = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  if (!valid) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-red-100 p-4 mb-4">
              <XCircle className="h-12 w-12 text-red-600" />
            </div>
            <h3 className="text-xl font-semibold text-red-800 mb-2">
              Vérification échouée
            </h3>
            <p className="text-red-600 mb-6">
              {reasonMessages[reason || ''] || reason || 'Une erreur est survenue'}
            </p>
            <button
              onClick={onReset}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Nouvelle vérification
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!card) return null;

  return (
    <div className="space-y-4">
      {/* Success Header */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-green-800">
                  Carte valide
                </h3>
                <p className="text-sm text-green-600">
                  Vérification #{verificationId?.slice(-8)}
                </p>
              </div>
            </div>
            <Badge className="bg-green-600 text-white text-lg px-4 py-1">
              ÉLIGIBLE
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Adhérent Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Informations adhérent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nom complet</p>
              <p className="font-semibold text-lg">
                {card.adherent.firstName} {card.adherent.lastName}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">N° Adhérent</p>
              <p className="font-mono font-semibold">{card.adherent.adhérentNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">CIN</p>
              <p className="font-mono">{card.adherent.cin}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Âge</p>
              <p>{formatAge(card.adherent.dateOfBirth)} ans</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Carte virtuelle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">N° Carte</p>
              <p className="font-mono font-semibold">{card.cardNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Statut</p>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Active
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Émise le</p>
              <p>{formatDate(card.issuedAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Expiré le</p>
              <p>{formatDate(card.expiresAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contract Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Contrat
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Assureur</p>
              <p className="font-semibold">{card.contract.insurerName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">N° Contrat</p>
              <p className="font-mono">{card.contract.contractNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Validité</p>
              <p>
                {formatDate(card.contract.startDate)} - {formatDate(card.contract.endDate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Statut contrat</p>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {card.contract.status === 'active' ? 'Actif' : card.contract.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coverage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Taux de couverture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-cyan-50 rounded-lg">
              <p className="text-2xl font-bold text-cyan-700">{card.coverage.consultation}%</p>
              <p className="text-sm text-cyan-600">Consultation</p>
            </div>
            <div className="text-center p-3 bg-emerald-50 rounded-lg">
              <p className="text-2xl font-bold text-emerald-700">{card.coverage.pharmacy}%</p>
              <p className="text-sm text-emerald-600">Pharmacie</p>
            </div>
            <div className="text-center p-3 bg-violet-50 rounded-lg">
              <p className="text-2xl font-bold text-violet-700">{card.coverage.lab}%</p>
              <p className="text-sm text-violet-600">Laboratoire</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <p className="text-2xl font-bold text-amber-700">{card.coverage.imaging}%</p>
              <p className="text-sm text-amber-600">Imagerie</p>
            </div>
            <div className="text-center p-3 bg-rose-50 rounded-lg">
              <p className="text-2xl font-bold text-rose-700">{card.coverage.hospitalization}%</p>
              <p className="text-sm text-rose-600">Hospitalisation</p>
            </div>
            <div className="text-center p-3 bg-sky-50 rounded-lg">
              <p className="text-2xl font-bold text-sky-700">{card.coverage.dental}%</p>
              <p className="text-sm text-sky-600">Dentaire</p>
            </div>
            <div className="text-center p-3 bg-indigo-50 rounded-lg">
              <p className="text-2xl font-bold text-indigo-700">{card.coverage.optical}%</p>
              <p className="text-sm text-indigo-600">Optique</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-center pt-4">
        <button
          onClick={onReset}
          className="px-8 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium"
        >
          Nouvelle vérification
        </button>
      </div>
    </div>
  );
}
