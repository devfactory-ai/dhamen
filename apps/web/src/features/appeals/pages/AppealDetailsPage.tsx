/**
 * Appeal Details Page
 * View and manage a single appeal
 */

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  useAppeal,
  useUpdateAppealStatus,
  useResolveAppeal,
  useAddAppealComment,
  useWithdrawAppeal,
  getAppealReasonLabel,
  getAppealStatusLabel,
  getAppealStatusVariant,
  type AppealStatus,
} from '../hooks/useAppeals';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useToast } from '@/stores/toast';
import {
  ChevronRight,
  Clock,
  User,
  FileText,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Send,
} from 'lucide-react';

export function AppealDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const { data: appeal, isLoading } = useAppeal(id || '');
  const updateStatus = useUpdateAppealStatus();
  const resolveAppeal = useResolveAppeal();
  const addComment = useAddAppealComment();
  const withdrawAppeal = useWithdrawAppeal();

  const [newComment, setNewComment] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolution, setResolution] = useState({
    status: 'approved' as 'approved' | 'partially_approved' | 'rejected',
    resolutionType: 'full_reversal',
    resolutionNotes: '',
    resolutionAmount: undefined as number | undefined,
  });

  const isAgent = ['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user?.role || '');
  const isAdmin = ['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user?.role || '');
  const isAdherent = user?.role === 'ADHERENT';

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

  const handleStatusChange = async (newStatus: AppealStatus) => {
    if (!id) return;
    try {
      await updateStatus.mutateAsync({ id, status: newStatus });
      addToast({ type: 'success', message: 'Statut mis à jour' });
    } catch {
      addToast({ type: 'error', message: 'Erreur lors de la mise à jour' });
    }
  };

  const handleAddComment = async () => {
    if (!id || !newComment.trim()) return;
    try {
      await addComment.mutateAsync({
        id,
        content: newComment,
        commentType: isAdherent ? 'adherent_message' : isInternalNote ? 'internal_note' : 'agent_message',
        isVisibleToAdherent: !isInternalNote,
      });
      setNewComment('');
      addToast({ type: 'success', message: 'Commentaire ajouté' });
    } catch {
      addToast({ type: 'error', message: 'Erreur lors de l\'ajout du commentaire' });
    }
  };

  const handleResolve = async () => {
    if (!id) return;
    try {
      await resolveAppeal.mutateAsync({
        id,
        ...resolution,
      });
      setResolveDialogOpen(false);
      addToast({ type: 'success', message: 'Recours résolu' });
    } catch {
      addToast({ type: 'error', message: 'Erreur lors de la résolution' });
    }
  };

  const handleWithdraw = async () => {
    if (!id) return;
    if (!confirm('Êtes-vous sûr de vouloir retirer ce recours ?')) return;
    try {
      await withdrawAppeal.mutateAsync(id);
      addToast({ type: 'success', message: 'Recours retiré' });
      navigate('/appeals');
    } catch {
      addToast({ type: 'error', message: 'Erreur lors du retrait' });
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Chargement...</div>;
  }

  if (!appeal) {
    return <div className="p-8 text-center">Recours non trouvé</div>;
  }

  const canResolve =
    isAdmin && !['approved', 'partially_approved', 'rejected', 'withdrawn'].includes(appeal.status);
  const canWithdraw =
    isAdherent &&
    appeal.adherent_id === user?.id &&
    !['approved', 'partially_approved', 'rejected', 'withdrawn'].includes(appeal.status);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/appeals" className="hover:text-gray-900 transition-colors">Recours</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <PageHeader
        title={`Recours #${appeal.id.slice(0, 8)}`}
        description={`Sinistre: ${appeal.claim_reference || appeal.claim_id}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Appeal Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Détails du recours</CardTitle>
                <Badge variant={getAppealStatusVariant(appeal.status)}>
                  {getAppealStatusLabel(appeal.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-muted-foreground text-sm">Motif</Label>
                  <p className="font-medium">{getAppealReasonLabel(appeal.reason)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Priorité</Label>
                  <p className="font-medium capitalize">{appeal.priority}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Date de soumission</Label>
                  <p className="font-medium">{formatDate(appeal.submitted_at)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Gestionnaire</Label>
                  <p className="font-medium">{appeal.reviewer_name || 'Non assigné'}</p>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-muted-foreground text-sm">Description</Label>
                <p className="mt-1 whitespace-pre-wrap">{appeal.description}</p>
              </div>

              {appeal.documents && appeal.documents.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground text-sm">Documents joints</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {appeal.documents.map((doc, idx) => (
                        <a
                          key={idx}
                          href={doc}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-sm hover:bg-gray-200"
                        >
                          <FileText className="h-4 w-4" />
                          Document {idx + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {appeal.resolution_notes && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground text-sm">Résolution</Label>
                    <div className="mt-1 rounded-lg bg-gray-50 p-3">
                      <p className="font-medium">
                        {appeal.resolution_type === 'full_reversal'
                          ? 'Annulation complète'
                          : appeal.resolution_type === 'partial_reversal'
                            ? 'Annulation partielle'
                            : appeal.resolution_type === 'amount_adjustment'
                              ? 'Ajustement du montant'
                              : appeal.resolution_type}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">{appeal.resolution_notes}</p>
                      {appeal.resolution_amount !== null && (
                        <p className="mt-2 font-medium text-green-600">
                          Nouveau montant approuvé: {formatAmount(appeal.resolution_amount)}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Comments / Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Historique et commentaires
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {appeal.comments && appeal.comments.length > 0 ? (
                  appeal.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`rounded-lg border p-3 ${
                        comment.comment_type === 'internal_note'
                          ? 'border-yellow-200 bg-yellow-50'
                          : comment.comment_type === 'adherent_message'
                            ? 'border-blue-200 bg-blue-50'
                            : 'bg-gray-50'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {comment.user_name || 'Utilisateur'}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatDate(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-sm">{comment.content}</p>
                      {comment.comment_type === 'internal_note' && (
                        <span className="mt-1 inline-block rounded bg-yellow-200 px-1 text-xs">
                          Note interne
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center text-sm">Aucun commentaire</p>
                )}

                {/* Add Comment */}
                {!['approved', 'partially_approved', 'rejected', 'withdrawn'].includes(
                  appeal.status
                ) && (
                  <div className="mt-4 space-y-2">
                    <Textarea
                      placeholder="Ajouter un commentaire..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      {isAgent && (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={isInternalNote}
                            onChange={(e) => setIsInternalNote(e.target.checked)}
                          />
                          Note interne (non visible par l'adhérent)
                        </label>
                      )}
                      <Button
                        size="sm"
                        onClick={handleAddComment}
                        disabled={!newComment.trim() || addComment.isPending}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Envoyer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Claim Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sinistre associé</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Référence</span>
                <span className="font-medium">{appeal.claim_reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{appeal.claim_care_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant demandé</span>
                <span className="font-medium">{formatAmount(appeal.claim_amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant approuvé</span>
                <span className="font-medium">
                  {formatAmount(appeal.claim_approved_amount || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statut sinistre</span>
                <Badge variant="outline">{appeal.claim_status}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Adherent Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Adhérent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{appeal.adherent_name}</p>
              <p className="text-muted-foreground">{appeal.adherent_number}</p>
              <p className="text-muted-foreground">{appeal.adherent_email}</p>
            </CardContent>
          </Card>

          {/* Actions */}
          {isAgent && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!['approved', 'partially_approved', 'rejected', 'withdrawn'].includes(
                  appeal.status
                ) && (
                  <>
                    <Select
                      value={appeal.status}
                      onValueChange={(v) => handleStatusChange(v as AppealStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Changer le statut" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submitted">Soumis</SelectItem>
                        <SelectItem value="under_review">En cours d'examen</SelectItem>
                        <SelectItem value="additional_info_requested">Info demandée</SelectItem>
                        <SelectItem value="escalated">Escaladé</SelectItem>
                      </SelectContent>
                    </Select>

                    {canResolve && (
                      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
                        <DialogTrigger asChild>
                          <Button className="w-full">Résoudre le recours</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Résoudre le recours</DialogTitle>
                            <DialogDescription>
                              Prenez une décision finale sur ce recours.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Décision</Label>
                              <Select
                                value={resolution.status}
                                onValueChange={(v) =>
                                  setResolution((prev) => ({
                                    ...prev,
                                    status: v as typeof resolution.status,
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="approved">
                                    <span className="flex items-center gap-2">
                                      <CheckCircle className="h-4 w-4 text-green-500" />
                                      Approuver
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="partially_approved">
                                    <span className="flex items-center gap-2">
                                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                      Approuver partiellement
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="rejected">
                                    <span className="flex items-center gap-2">
                                      <XCircle className="h-4 w-4 text-red-500" />
                                      Rejeter
                                    </span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Type de résolution</Label>
                              <Select
                                value={resolution.resolutionType}
                                onValueChange={(v) =>
                                  setResolution((prev) => ({ ...prev, resolutionType: v }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="full_reversal">Annulation complète</SelectItem>
                                  <SelectItem value="partial_reversal">
                                    Annulation partielle
                                  </SelectItem>
                                  <SelectItem value="amount_adjustment">
                                    Ajustement du montant
                                  </SelectItem>
                                  <SelectItem value="coverage_clarification">
                                    Clarification couverture
                                  </SelectItem>
                                  <SelectItem value="no_change">Pas de changement</SelectItem>
                                  <SelectItem value="other">Autre</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {(resolution.status === 'approved' ||
                              resolution.status === 'partially_approved') && (
                              <div className="space-y-2">
                                <Label>Nouveau montant approuvé (optionnel)</Label>
                                <Input
                                  type="number"
                                  placeholder="Montant en millimes"
                                  value={resolution.resolutionAmount || ''}
                                  onChange={(e) =>
                                    setResolution((prev) => ({
                                      ...prev,
                                      resolutionAmount: e.target.value
                                        ? Number(e.target.value)
                                        : undefined,
                                    }))
                                  }
                                />
                              </div>
                            )}

                            <div className="space-y-2">
                              <Label>Notes de résolution</Label>
                              <Textarea
                                placeholder="Expliquez votre décision..."
                                value={resolution.resolutionNotes}
                                onChange={(e) =>
                                  setResolution((prev) => ({
                                    ...prev,
                                    resolutionNotes: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setResolveDialogOpen(false)}
                            >
                              Annuler
                            </Button>
                            <Button
                              onClick={handleResolve}
                              disabled={!resolution.resolutionNotes || resolveAppeal.isPending}
                            >
                              Confirmer
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Withdraw for adherent */}
          {canWithdraw && (
            <Card>
              <CardContent className="pt-6">
                <Button variant="destructive" className="w-full" onClick={handleWithdraw}>
                  Retirer mon recours
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Chronologie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Soumis le</span>
                <span>{formatDate(appeal.submitted_at)}</span>
              </div>
              {appeal.reviewed_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Examen débuté</span>
                  <span>{formatDate(appeal.reviewed_at)}</span>
                </div>
              )}
              {appeal.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Résolu le</span>
                  <span>{formatDate(appeal.resolved_at)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
