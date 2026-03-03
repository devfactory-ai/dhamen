/**
 * Pre-Authorization Details Page
 * View and manage a single pre-authorization request
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  usePreAuthorization,
  useApprovePreAuth,
  useRejectPreAuth,
  useReviewPreAuth,
  useRequestInfoPreAuth,
  useCancelPreAuth,
  useAddPreAuthComment,
  getCareTypeLabel,
  getPreAuthStatusLabel,
  getPreAuthStatusVariant,
  getPreAuthActionLabel,
  type PreAuthHistory,
  type PreAuthStatus,
} from '../hooks/usePreAuthorizations';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  FileText,
  User,
  Building2,
  Calendar,
  Stethoscope,
  AlertTriangle,
  Send,
} from 'lucide-react';

export function PreAuthorizationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: preAuth, isLoading } = usePreAuthorization(id || '');
  const approvePreAuth = useApprovePreAuth();
  const rejectPreAuth = useRejectPreAuth();
  const reviewPreAuth = useReviewPreAuth();
  const requestInfo = useRequestInfoPreAuth();
  const cancelPreAuth = useCancelPreAuth();
  const addComment = useAddPreAuthComment();

  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Form states
  const [approvedAmount, setApprovedAmount] = useState('');
  const [validityStartDate, setValidityStartDate] = useState('');
  const [validityEndDate, setValidityEndDate] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [requestedInfo, setRequestedInfo] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isPartialApproval, setIsPartialApproval] = useState(false);

  const isAgent = ['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user?.role || '');
  const canApprove = ['INSURER_ADMIN', 'ADMIN'].includes(user?.role || '');
  const canReview = isAgent && preAuth && ['pending', 'under_review', 'additional_info', 'medical_review'].includes(preAuth.status);
  const canCancel = preAuth && !['rejected', 'cancelled', 'used'].includes(preAuth.status);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const handleApprove = async () => {
    if (!id || !approvedAmount || !validityStartDate || !validityEndDate) return;

    await approvePreAuth.mutateAsync({
      id,
      approvedAmount: parseFloat(approvedAmount) * 1000, // Convert to millimes
      validityStartDate,
      validityEndDate,
      decisionNotes,
      isPartial: isPartialApproval,
    });
    setShowApproveDialog(false);
    resetForms();
  };

  const handleReject = async () => {
    if (!id || !decisionReason) return;

    await rejectPreAuth.mutateAsync({
      id,
      decisionReason,
      decisionNotes,
    });
    setShowRejectDialog(false);
    resetForms();
  };

  const handleRequestInfo = async () => {
    if (!id || !requestedInfo) return;

    await requestInfo.mutateAsync({
      id,
      requestedInfo,
    });
    setShowInfoDialog(false);
    setRequestedInfo('');
  };

  const handleCancel = async () => {
    if (!id || !cancelReason) return;

    await cancelPreAuth.mutateAsync({
      id,
      reason: cancelReason,
    });
    setShowCancelDialog(false);
    setCancelReason('');
  };

  const handleStartReview = async () => {
    if (!id) return;
    await reviewPreAuth.mutateAsync({
      id,
      status: 'under_review',
    });
  };

  const handleAddComment = async () => {
    if (!id || !newComment.trim()) return;

    await addComment.mutateAsync({
      id,
      comment: newComment,
      isInternal: false,
    });
    setNewComment('');
  };

  const resetForms = () => {
    setApprovedAmount('');
    setValidityStartDate('');
    setValidityEndDate('');
    setDecisionNotes('');
    setDecisionReason('');
    setIsPartialApproval(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Clock className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!preAuth) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Demande non trouvée</p>
        <Button variant="link" onClick={() => navigate('/pre-authorizations')}>
          Retour à la liste
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/pre-authorizations')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={`Accord préalable ${preAuth.authorization_number || preAuth.id.slice(0, 8)}`}
          description={`${getCareTypeLabel(preAuth.care_type)} - ${preAuth.procedure_description}`}
        />
        <div className="ml-auto flex items-center gap-2">
          {preAuth.is_emergency === 1 && (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Urgence
            </Badge>
          )}
          <Badge variant={getPreAuthStatusVariant(preAuth.status)}>
            {getPreAuthStatusLabel(preAuth.status)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Care Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Détails du soin
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-sm">Type de soin</p>
                <p className="font-medium">{getCareTypeLabel(preAuth.care_type)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Code acte</p>
                <p className="font-medium">{preAuth.procedure_code || '-'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-muted-foreground text-sm">Description</p>
                <p className="font-medium">{preAuth.procedure_description}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Code diagnostic (CIM-10)</p>
                <p className="font-medium">{preAuth.diagnosis_code || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Diagnostic</p>
                <p className="font-medium">{preAuth.diagnosis_description || '-'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-muted-foreground text-sm">Justification médicale</p>
                <p className="font-medium">{preAuth.medical_justification}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Médecin prescripteur</p>
                <p className="font-medium">{preAuth.prescribing_doctor || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Date de prescription</p>
                <p className="font-medium">
                  {preAuth.prescription_date
                    ? new Date(preAuth.prescription_date).toLocaleDateString('fr-TN')
                    : '-'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Financial */}
          <Card>
            <CardHeader>
              <CardTitle>Informations financières</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-sm">Montant estimé</p>
                <p className="font-bold text-lg">{formatAmount(preAuth.estimated_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Montant approuvé</p>
                <p className="font-bold text-lg text-green-600">
                  {formatAmount(preAuth.approved_amount)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Taux de couverture</p>
                <p className="font-bold text-lg">
                  {preAuth.coverage_rate !== null ? `${preAuth.coverage_rate}%` : '-'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Validity */}
          {(preAuth.validity_start_date || preAuth.validity_end_date) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Période de validité
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-sm">Date de début</p>
                  <p className="font-medium">
                    {preAuth.validity_start_date
                      ? new Date(preAuth.validity_start_date).toLocaleDateString('fr-TN')
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Date de fin</p>
                  <p className="font-medium">
                    {preAuth.validity_end_date
                      ? new Date(preAuth.validity_end_date).toLocaleDateString('fr-TN')
                      : '-'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Decision */}
          {(preAuth.decision_reason || preAuth.decision_notes) && (
            <Card>
              <CardHeader>
                <CardTitle>Décision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {preAuth.decision_reason && (
                  <div>
                    <p className="text-muted-foreground text-sm">Motif</p>
                    <p className="font-medium">{preAuth.decision_reason}</p>
                  </div>
                )}
                {preAuth.decision_notes && (
                  <div>
                    <p className="text-muted-foreground text-sm">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{preAuth.decision_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* History / Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Historique
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {preAuth.history.map((entry: PreAuthHistory) => (
                  <div key={entry.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="bg-primary h-3 w-3 rounded-full" />
                      <div className="bg-border h-full w-px" />
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">
                          {getPreAuthActionLabel(entry.action)}
                          {entry.new_status && ` - ${getPreAuthStatusLabel(entry.new_status as PreAuthStatus)}`}
                        </p>
                        <span className="text-muted-foreground text-xs">
                          {formatDate(entry.created_at)}
                        </span>
                      </div>
                      {entry.comment && (
                        <p className="text-muted-foreground text-sm mt-1">{entry.comment}</p>
                      )}
                      {entry.user_name && (
                        <p className="text-muted-foreground text-xs mt-1">
                          Par {entry.user_name}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Add Comment */}
          {isAgent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Ajouter un commentaire
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Votre commentaire..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || addComment.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          {isAgent && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {preAuth.status === 'pending' && (
                  <Button className="w-full" onClick={handleStartReview}>
                    <Clock className="mr-2 h-4 w-4" />
                    Commencer l'examen
                  </Button>
                )}
                {canApprove && canReview && (
                  <>
                    <Button
                      className="w-full"
                      variant="default"
                      onClick={() => {
                        setApprovedAmount((preAuth.estimated_amount / 1000).toString());
                        const today = new Date();
                        setValidityStartDate(today.toISOString().split('T')[0] || '');
                        const endDate = new Date(today);
                        endDate.setDate(endDate.getDate() + 30);
                        setValidityEndDate(endDate.toISOString().split('T')[0] || '');
                        setShowApproveDialog(true);
                      }}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approuver
                    </Button>
                    <Button
                      className="w-full"
                      variant="destructive"
                      onClick={() => setShowRejectDialog(true)}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Rejeter
                    </Button>
                  </>
                )}
                {canReview && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setShowInfoDialog(true)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Demander des infos
                  </Button>
                )}
                {canCancel && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    Annuler la demande
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Adherent Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Adhérent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-muted-foreground text-sm">Nom</p>
                <p className="font-medium">{preAuth.adherent_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">N° adhérent</p>
                <p className="font-medium">{preAuth.adherent_number}</p>
              </div>
              {preAuth.adherent_email && (
                <div>
                  <p className="text-muted-foreground text-sm">Email</p>
                  <p className="font-medium">{preAuth.adherent_email}</p>
                </div>
              )}
              {preAuth.adherent_phone && (
                <div>
                  <p className="text-muted-foreground text-sm">Téléphone</p>
                  <p className="font-medium">{preAuth.adherent_phone}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Provider Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Prestataire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-muted-foreground text-sm">Nom</p>
                <p className="font-medium">{preAuth.provider_name}</p>
              </div>
              {preAuth.provider_specialty && (
                <div>
                  <p className="text-muted-foreground text-sm">Spécialité</p>
                  <p className="font-medium">{preAuth.provider_specialty}</p>
                </div>
              )}
              {preAuth.provider_address && (
                <div>
                  <p className="text-muted-foreground text-sm">Adresse</p>
                  <p className="font-medium">{preAuth.provider_address}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle>Dates clés</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-muted-foreground text-sm">Créé le</p>
                <p className="font-medium">{formatDate(preAuth.created_at)}</p>
              </div>
              {preAuth.submitted_at && (
                <div>
                  <p className="text-muted-foreground text-sm">Soumis le</p>
                  <p className="font-medium">{formatDate(preAuth.submitted_at)}</p>
                </div>
              )}
              {preAuth.reviewed_at && (
                <div>
                  <p className="text-muted-foreground text-sm">Examiné le</p>
                  <p className="font-medium">{formatDate(preAuth.reviewed_at)}</p>
                </div>
              )}
              {preAuth.decided_at && (
                <div>
                  <p className="text-muted-foreground text-sm">Décidé le</p>
                  <p className="font-medium">{formatDate(preAuth.decided_at)}</p>
                </div>
              )}
              {preAuth.requested_care_date && (
                <div>
                  <p className="text-muted-foreground text-sm">Date de soin souhaitée</p>
                  <p className="font-medium">
                    {new Date(preAuth.requested_care_date).toLocaleDateString('fr-TN')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          {preAuth.documents && preAuth.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {preAuth.documents.map((doc: string, index: number) => (
                    <li key={index}>
                      <a
                        href={doc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm hover:underline"
                      >
                        Document {index + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approuver la demande</DialogTitle>
            <DialogDescription>
              Définissez les conditions d'approbation de cette demande d'accord préalable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="approvedAmount">Montant approuvé (TND)</Label>
              <Input
                id="approvedAmount"
                type="number"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                placeholder="Montant en TND"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPartial"
                checked={isPartialApproval}
                onChange={(e) => setIsPartialApproval(e.target.checked)}
              />
              <Label htmlFor="isPartial">Approbation partielle</Label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="validityStart">Date de début</Label>
                <Input
                  id="validityStart"
                  type="date"
                  value={validityStartDate}
                  onChange={(e) => setValidityStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="validityEnd">Date de fin</Label>
                <Input
                  id="validityEnd"
                  type="date"
                  value={validityEndDate}
                  onChange={(e) => setValidityEndDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes (optionnel)</Label>
              <Textarea
                id="notes"
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Notes concernant l'approbation..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleApprove} disabled={approvePreAuth.isPending}>
              {approvePreAuth.isPending ? 'En cours...' : 'Approuver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription>
              Indiquez le motif du rejet de cette demande d'accord préalable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejectReason">Motif du rejet *</Label>
              <Input
                id="rejectReason"
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                placeholder="Motif principal du rejet"
              />
            </div>
            <div>
              <Label htmlFor="rejectNotes">Notes complémentaires (optionnel)</Label>
              <Textarea
                id="rejectNotes"
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Détails supplémentaires..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!decisionReason || rejectPreAuth.isPending}
            >
              {rejectPreAuth.isPending ? 'En cours...' : 'Rejeter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Info Dialog */}
      <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander des informations</DialogTitle>
            <DialogDescription>
              Précisez les informations complémentaires nécessaires au traitement de la demande.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="requestedInfo">Informations demandées *</Label>
              <Textarea
                id="requestedInfo"
                value={requestedInfo}
                onChange={(e) => setRequestedInfo(e.target.value)}
                placeholder="Décrivez les informations ou documents nécessaires..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInfoDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleRequestInfo}
              disabled={!requestedInfo || requestInfo.isPending}
            >
              {requestInfo.isPending ? 'En cours...' : 'Envoyer la demande'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler la demande</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. La demande sera marquée comme annulée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cancelReason">Motif de l'annulation *</Label>
              <Textarea
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Raison de l'annulation..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Retour
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={!cancelReason || cancelPreAuth.isPending}
            >
              {cancelPreAuth.isPending ? 'En cours...' : 'Confirmer l\'annulation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
