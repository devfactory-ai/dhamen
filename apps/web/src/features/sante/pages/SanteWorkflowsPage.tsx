/**
 * SoinFlow Workflows Management Page
 *
 * Page for managing pending workflows: info requests, escalations, validations
 */

import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  usePendingWorkflows,
  useSubmitInfoResponse,
  useResolveEscalation,
  useSubmitValidation,
  WORKFLOW_TYPE_LABELS,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  formatWorkflowDate,
  type Workflow,
} from '../hooks/useWorkflows';
import { useToast } from '@/stores/toast';
import { FloatingHelp } from '@/components/ui/floating-help';
import { Clock, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

export function SanteWorkflowsPage() {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [activeTab, setActiveTab] = useState<Workflow['type'] | 'all'>('all');
  const { toast } = useToast();

  const { data: workflows, isLoading, refetch } = usePendingWorkflows();
  const submitInfoResponse = useSubmitInfoResponse();
  const resolveEscalation = useResolveEscalation();
  const submitValidation = useSubmitValidation();

  // Filter workflows by type
  const filteredWorkflows = workflows?.filter((w) => {
    if (activeTab === 'all') return true;
    return w.type === activeTab;
  }) || [];

  // Group by type for stats
  const infoRequests = workflows?.filter((w) => w.type === 'info_request') || [];
  const escalations = workflows?.filter((w) => w.type === 'escalation') || [];
  const validations = workflows?.filter((w) => w.type === 'multi_validation') || [];

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows en attente"
        description="Gérer les demandes d'information, escalades et validations"
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{workflows?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Demandes d'info</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-blue-600">{infoRequests.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Escalades</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-orange-600">{escalations.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">Validations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl text-purple-600">{validations.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="all">Tous ({workflows?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="info_request">Infos ({infoRequests.length})</TabsTrigger>
          <TabsTrigger value="escalation">Escalades ({escalations.length})</TabsTrigger>
          <TabsTrigger value="multi_validation">Validations ({validations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Aucun workflow en attente</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  onAction={() => setSelectedWorkflow(workflow)}
                  formatAmount={formatAmount}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <FloatingHelp
        title="Aide - Workflows"
        subtitle="Gestion des workflows en attente"
        tips={[
          {
            icon: <Clock className="h-4 w-4 text-blue-500" />,
            title: "Demandes d'information",
            desc: "Repondez aux demandes d'info complementaire pour debloquer le traitement.",
          },
          {
            icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
            title: "Escalades",
            desc: "Les escalades necessitent une decision : approuver, rejeter ou retourner.",
          },
          {
            icon: <CheckCircle className="h-4 w-4 text-green-500" />,
            title: "Validations multi-niveaux",
            desc: "Certaines demandes requierent plusieurs niveaux de validation selon le montant.",
          },
          {
            icon: <RefreshCw className="h-4 w-4 text-purple-500" />,
            title: "Priorite des workflows",
            desc: "Traitez en priorite les workflows avec un delai limite proche.",
          },
        ]}
      />

      {/* Action Dialog */}
      <WorkflowActionDialog
        workflow={selectedWorkflow}
        onClose={() => setSelectedWorkflow(null)}
        onSubmitInfoResponse={async (data) => {
          try {
            await submitInfoResponse.mutateAsync(data);
            toast({ title: 'Réponse soumise', variant: 'success' });
            setSelectedWorkflow(null);
            refetch();
          } catch (error) {
            toast({
              title: 'Erreur',
              description: error instanceof Error ? error.message : 'Erreur inconnue',
              variant: 'destructive',
            });
          }
        }}
        onResolveEscalation={async (data) => {
          try {
            await resolveEscalation.mutateAsync(data);
            toast({ title: 'Escalade résolue', variant: 'success' });
            setSelectedWorkflow(null);
            refetch();
          } catch (error) {
            toast({
              title: 'Erreur',
              description: error instanceof Error ? error.message : 'Erreur inconnue',
              variant: 'destructive',
            });
          }
        }}
        onSubmitValidation={async (data) => {
          try {
            await submitValidation.mutateAsync(data);
            toast({ title: 'Validation soumise', variant: 'success' });
            setSelectedWorkflow(null);
            refetch();
          } catch (error) {
            toast({
              title: 'Erreur',
              description: error instanceof Error ? error.message : 'Erreur inconnue',
              variant: 'destructive',
            });
          }
        }}
        isLoading={
          submitInfoResponse.isPending ||
          resolveEscalation.isPending ||
          submitValidation.isPending
        }
      />
    </div>
  );
}

// Workflow Card Component
function WorkflowCard({
  workflow,
  onAction,
  formatAmount,
}: {
  workflow: Workflow;
  onAction: () => void;
  formatAmount: (amount: number) => string;
}) {
  const currentStep = workflow.steps.find((s) => s.stepNumber === workflow.currentStep);
  const priority = workflow.metadata.priority as string | undefined;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-full px-2 py-1 text-xs ${WORKFLOW_STATUS_COLORS[workflow.status]}`}>
                {WORKFLOW_TYPE_LABELS[workflow.type]}
              </span>
              {priority && (
                <span className={`rounded-full px-2 py-1 text-xs ${PRIORITY_COLORS[priority]}`}>
                  {PRIORITY_LABELS[priority]}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Demande</p>
                <p className="font-medium">{workflow.demande?.numéro || workflow.demandeId.slice(0, 8)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Montant</p>
                <p className="font-medium">
                  {workflow.demande?.montant ? formatAmount(workflow.demande.montant) : '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Créé le</p>
                <p className="font-medium">{formatWorkflowDate(workflow.createdAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Action requise</p>
                <p className="font-medium">{currentStep?.requiredAction || '-'}</p>
              </div>
            </div>

            {workflow.type === 'escalation' && workflow.metadata.reason && (
              <div className="mt-2 p-2 bg-muted rounded text-sm">
                <p className="text-muted-foreground">Raison:</p>
                <p>{workflow.metadata.reason as string}</p>
              </div>
            )}

            {currentStep?.dueDate && (
              <div className="mt-2 text-sm text-orange-600">
                Delai: {formatWorkflowDate(currentStep.dueDate)}
              </div>
            )}
          </div>

          <Button onClick={onAction}>Traiter</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Action Dialog Component
function WorkflowActionDialog({
  workflow,
  onClose,
  onSubmitInfoResponse,
  onResolveEscalation,
  onSubmitValidation,
  isLoading,
}: {
  workflow: Workflow | null;
  onClose: () => void;
  onSubmitInfoResponse: (data: { workflowId: string; message: string; documents?: string[] }) => Promise<void>;
  onResolveEscalation: (data: {
    workflowId: string;
    action: 'approve' | 'reject' | 'return';
    notes: string;
    newStatus?: string;
  }) => Promise<void>;
  onSubmitValidation: (data: { workflowId: string; approved: boolean; notes: string }) => Promise<void>;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    message: '',
    notes: '',
    action: 'approve' as 'approve' | 'reject' | 'return',
    approved: true,
    newStatus: '',
  });

  if (!workflow) return null;

  const handleSubmit = async () => {
    if (workflow.type === 'info_request') {
      await onSubmitInfoResponse({
        workflowId: workflow.id,
        message: formData.message,
      });
    } else if (workflow.type === 'escalation') {
      await onResolveEscalation({
        workflowId: workflow.id,
        action: formData.action,
        notes: formData.notes,
        newStatus: formData.newStatus || undefined,
      });
    } else if (workflow.type === 'multi_validation') {
      await onSubmitValidation({
        workflowId: workflow.id,
        approved: formData.approved,
        notes: formData.notes,
      });
    }
  };

  return (
    <Dialog open={!!workflow} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {workflow.type === 'info_request' && 'Valider les informations'}
            {workflow.type === 'escalation' && 'Résoudre l\'escalade'}
            {workflow.type === 'multi_validation' && 'Validation niveau ' + workflow.currentStep}
          </DialogTitle>
          <DialogDescription>
            Demande: {workflow.demande?.numéro || workflow.demandeId.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info from workflow */}
          {workflow.metadata.reason && (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">Raison</p>
              <p className="font-medium">{workflow.metadata.reason as string}</p>
            </div>
          )}

          {/* Info Request Form */}
          {workflow.type === 'info_request' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Message de validation</Label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Commentaire sur les informations reçues..."
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Escalation Form */}
          {workflow.type === 'escalation' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Décision</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={formData.action === 'approve' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setFormData({ ...formData, action: 'approve' })}
                  >
                    Approuver
                  </Button>
                  <Button
                    type="button"
                    variant={formData.action === 'reject' ? 'destructive' : 'outline'}
                    className="flex-1"
                    onClick={() => setFormData({ ...formData, action: 'reject' })}
                  >
                    Rejeter
                  </Button>
                  <Button
                    type="button"
                    variant={formData.action === 'return' ? 'secondary' : 'outline'}
                    className="flex-1"
                    onClick={() => setFormData({ ...formData, action: 'return' })}
                  >
                    Retourner
                  </Button>
                </div>
              </div>

              {formData.action !== 'return' && (
                <div className="space-y-2">
                  <Label>Nouveau statut</Label>
                  <Select
                    value={formData.newStatus}
                    onValueChange={(v) => setFormData({ ...formData, newStatus: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approuvee">Approuvee</SelectItem>
                      <SelectItem value="rejetée">Rejetee</SelectItem>
                      <SelectItem value="en_examen">En examen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notes sur votre décision..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Validation Form */}
          {workflow.type === 'multi_validation' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 p-4 text-sm">
                <p>
                  Niveau de validation: <strong>{workflow.currentStep}</strong> sur{' '}
                  <strong>{workflow.steps.length}</strong>
                </p>
                {workflow.demande?.montant && (
                  <p className="mt-1">
                    Montant: <strong>{(workflow.demande.montant / 1000).toFixed(3)} TND</strong>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Décision</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={formData.approved ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setFormData({ ...formData, approved: true })}
                  >
                    Valider
                  </Button>
                  <Button
                    type="button"
                    variant={!formData.approved ? 'destructive' : 'outline'}
                    className="flex-1"
                    onClick={() => setFormData({ ...formData, approved: false })}
                  >
                    Rejeter
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Justification de votre décision..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Traitement...' : 'Confirmer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
