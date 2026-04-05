/**
 * SoinFlow Fraud Detection Page
 *
 * Fraud alerts dashboard, investigation, and pattern detection
 */
import { useState } from 'react';
import {
  AlertTriangle,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Shield,
  TrendingUp,
  Users,
  FileWarning,
  Brain,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useFraudStats,
  useFraudAlerts,
  useFraudAlert,
  useStartInvestigation,
  useResolveFraudAlert,
  useFraudPatterns,
  getScoreColor,
  FRAUD_NIVEAU_LABELS,
  FRAUD_NIVEAU_COLORS,
  FRAUD_STATUT_LABELS,
  FRAUD_STATUT_COLORS,
  type FraudAlert,
} from '../hooks/useFraud';
import { formatMontant } from '../hooks/useStats';
import { useToast } from '@/stores/toast';

const NIVEAU_CHART_COLORS = {
  faible: '#fbbf24',
  moyen: '#f97316',
  eleve: '#ef4444',
  critique: '#991b1b',
};

export function SanteFraudPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [niveauFilter, setNiveauFilter] = useState<string>('all');
  const [statutFilter, setStatutFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null);
  const [showInvestigateDialog, setShowInvestigateDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);

  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading } = useFraudStats();
  const { data: alertsData, isLoading: alertsLoading, refetch } = useFraudAlerts({
    niveau: niveauFilter !== 'all' ? niveauFilter : undefined,
    statut: statutFilter !== 'all' ? statutFilter : undefined,
  });
  const { data: patterns } = useFraudPatterns();
  const startInvestigation = useStartInvestigation();
  const resolveAlert = useResolveFraudAlert();

  const alerts = alertsData?.alerts || [];

  const handleInvestigate = async (alertId: string) => {
    try {
      await startInvestigation.mutateAsync(alertId);
      toast({ title: 'Investigation démarrée', variant: 'success' });
      setShowInvestigateDialog(false);
      refetch();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur',
        variant: 'destructive',
      });
    }
  };

  const handleResolve = async (resolution: 'confirmée' | 'rejetée', notes: string) => {
    if (!selectedAlert) return;
    try {
      await resolveAlert.mutateAsync({
        alertId: selectedAlert.id,
        resolution,
        notes,
      });
      toast({ title: `Alerte ${resolution}`, variant: 'success' });
      setShowResolveDialog(false);
      setSelectedAlert(null);
      refetch();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur',
        variant: 'destructive',
      });
    }
  };

  // Prepare chart data
  const niveauChartData = stats ? [
    { name: 'Faible', value: stats.parNiveau.faible, color: NIVEAU_CHART_COLORS.faible },
    { name: 'Moyen', value: stats.parNiveau.moyen, color: NIVEAU_CHART_COLORS.moyen },
    { name: 'Élevé', value: stats.parNiveau.eleve, color: NIVEAU_CHART_COLORS.eleve },
    { name: 'Critique', value: stats.parNiveau.critique, color: NIVEAU_CHART_COLORS.critique },
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detection Fraude"
        description="Surveillance et investigation des anomalies"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">
            <Shield className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Alertes ({stats?.nouvelles || 0})
          </TabsTrigger>
          <TabsTrigger value="patterns">
            <Brain className="h-4 w-4 mr-2" />
            Patterns
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {statsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Alertes</p>
                        <p className="text-3xl font-bold">{stats?.totalAlertes || 0}</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Nouvelles</p>
                        <p className="text-3xl font-bold text-blue-600">{stats?.nouvelles || 0}</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <FileWarning className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Score Moyen</p>
                        <p className={`text-3xl font-bold ${getScoreColor(stats?.scoreMoyen || 0)}`}>
                          {(stats?.scoreMoyen || 0).toFixed(0)}
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                        <TrendingUp className="h-6 w-6 text-orange-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Montant Suspect</p>
                        <p className="text-2xl font-bold text-red-600 font-mono">
                          {formatMontant(stats?.montantSuspect || 0)}
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                        <Shield className="h-6 w-6 text-red-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Répartition par niveau</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={niveauChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {niveauChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Tendance des alertes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats?.tendance || []}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                          <YAxis />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="alertes"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Critical Alerts */}
              <Card>
                <CardHeader>
                  <CardTitle>Alertes critiques récentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {alerts
                      .filter((a) => a.niveau === 'critique' || a.niveau === 'élevé')
                      .slice(0, 5)
                      .map((alert) => (
                        <AlertRow
                          key={alert.id}
                          alert={alert}
                          onView={() => {
                            setSelectedAlert(alert);
                            setShowInvestigateDialog(true);
                          }}
                        />
                      ))}
                    {alerts.filter((a) => a.niveau === 'critique' || a.niveau === 'élevé').length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        Aucune alerte critique
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <Select value={niveauFilter} onValueChange={setNiveauFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous niveaux</SelectItem>
                    {Object.entries(FRAUD_NIVEAU_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statutFilter} onValueChange={setStatutFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous statuts</SelectItem>
                    {Object.entries(FRAUD_STATUT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Alerts List */}
          {alertsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : alerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aucune alerte trouvée
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onInvestigate={() => {
                    setSelectedAlert(alert);
                    setShowInvestigateDialog(true);
                  }}
                  onResolve={() => {
                    setSelectedAlert(alert);
                    setShowResolveDialog(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Patterns Tab */}
        <TabsContent value="patterns" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {patterns?.map((pattern) => (
              <Card key={pattern.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-600" />
                    {pattern.nom}
                  </CardTitle>
                  <CardDescription>{pattern.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Occurrences</p>
                      <p className="text-lg font-bold">{pattern.occurrences}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Montant total</p>
                      <p className="text-lg font-bold font-mono">{formatMontant(pattern.montantTotal)}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">Praticiens impliqués:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pattern.praticiens.slice(0, 3).map((p, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{p}</Badge>
                      ))}
                      {pattern.praticiens.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{pattern.praticiens.length - 3}</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!patterns || patterns.length === 0) && (
              <Card className="col-span-2">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Aucun pattern détecté
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Investigation Dialog */}
      <InvestigateDialog
        open={showInvestigateDialog}
        onClose={() => setShowInvestigateDialog(false)}
        alert={selectedAlert}
        onInvestigate={handleInvestigate}
        isLoading={startInvestigation.isPending}
      />

      {/* Resolve Dialog */}
      <ResolveDialog
        open={showResolveDialog}
        onClose={() => setShowResolveDialog(false)}
        alert={selectedAlert}
        onResolve={handleResolve}
        isLoading={resolveAlert.isPending}
      />
    </div>
  );
}

// Alert Row Component
function AlertRow({ alert, onView }: { alert: FraudAlert; onView: () => void }) {
  return (
    <div
      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
      onClick={onView}
    >
      <div className="flex items-center gap-4">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
          alert.niveau === 'critique' ? 'bg-red-200' : 'bg-orange-100'
        }`}>
          <AlertTriangle className={`h-5 w-5 ${
            alert.niveau === 'critique' ? 'text-red-700' : 'text-orange-600'
          }`} />
        </div>
        <div>
          <p className="font-medium">{alert.demande?.numéro || alert.demandeId.slice(0, 8)}</p>
          <p className="text-sm text-muted-foreground">
            Score: <span className={getScoreColor(alert.score)}>{alert.score}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge className={FRAUD_NIVEAU_COLORS[alert.niveau]}>
          {FRAUD_NIVEAU_LABELS[alert.niveau]}
        </Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

// Alert Card Component
function AlertCard({
  alert,
  onInvestigate,
  onResolve,
}: {
  alert: FraudAlert;
  onInvestigate: () => void;
  onResolve: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={FRAUD_NIVEAU_COLORS[alert.niveau]}>
                {FRAUD_NIVEAU_LABELS[alert.niveau]}
              </Badge>
              <Badge className={FRAUD_STATUT_COLORS[alert.statut]}>
                {FRAUD_STATUT_LABELS[alert.statut]}
              </Badge>
              <span className={`text-lg font-bold ${getScoreColor(alert.score)}`}>
                Score: {alert.score}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Demande</p>
                <p className="font-medium">{alert.demande?.numéro || alert.demandeId.slice(0, 8)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Montant</p>
                <p className="font-medium font-mono">
                  {alert.demande?.montant ? formatMontant(alert.demande.montant) : '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Praticien</p>
                <p className="font-medium">{alert.demande?.praticienNom || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Adhérent</p>
                <p className="font-medium">{alert.demande?.adhérentNom || '-'}</p>
              </div>
            </div>

            {alert.règlesActivees.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground mb-1">Règles activées:</p>
                <div className="flex flex-wrap gap-1">
                  {alert.règlesActivees.map((rule, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {rule.nom} (+{rule.impactScore})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {alert.analyseIA && (
              <div className="mt-3 p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-purple-800">
                  <Brain className="h-4 w-4" />
                  <span>Analyse IA (confiance: {alert.analyseIA.confidence}%)</span>
                </div>
                <p className="text-sm mt-1">{alert.analyseIA.reasoning}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 ml-4">
            {alert.statut === 'nouvelle' && (
              <Button size="sm" onClick={onInvestigate}>
                <Eye className="h-4 w-4 mr-1" />
                Investiguer
              </Button>
            )}
            {alert.statut === 'en_investigation' && (
              <Button size="sm" onClick={onResolve}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Résoudre
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Investigation Dialog
function InvestigateDialog({
  open,
  onClose,
  alert,
  onInvestigate,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  alert: FraudAlert | null;
  onInvestigate: (alertId: string) => void;
  isLoading: boolean;
}) {
  if (!alert) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Démarrer l'investigation</DialogTitle>
          <DialogDescription>
            Alerte {alert.demande?.numéro || alert.id.slice(0, 8)} - Score: {alert.score}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg">
            <h4 className="font-medium text-red-800 mb-2">Règles déclenchées</h4>
            {alert.règlesActivees.map((rule, i) => (
              <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{rule.nom}</span>
                <span className="text-red-600">+{rule.impactScore}</span>
              </div>
            ))}
          </div>

          {alert.analyseIA && (
            <div className="p-4 bg-purple-50 rounded-lg">
              <h4 className="font-medium text-purple-800 mb-2">Analyse IA</h4>
              <p className="text-sm">{alert.analyseIA.reasoning}</p>
              <div className="flex gap-2 mt-2">
                {alert.analyseIA.flags.map((flag, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{flag}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => onInvestigate(alert.id)} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Démarrer l'investigation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Resolve Dialog
function ResolveDialog({
  open,
  onClose,
  alert,
  onResolve,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  alert: FraudAlert | null;
  onResolve: (resolution: 'confirmée' | 'rejetée', notes: string) => void;
  isLoading: boolean;
}) {
  const [resolution, setResolution] = useState<'confirmée' | 'rejetée'>('rejetée');
  const [notes, setNotes] = useState('');

  if (!alert) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Résoudre l'alerte</DialogTitle>
          <DialogDescription>
            Alerte {alert.demande?.numéro || alert.id.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Décision</Label>
            <div className="flex gap-2 mt-2">
              <Button
                variant={resolution === 'rejetée' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setResolution('rejetée')}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Fausse alerte
              </Button>
              <Button
                variant={resolution === 'confirmée' ? 'destructive' : 'outline'}
                className="flex-1"
                onClick={() => setResolution('confirmée')}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Fraude confirmée
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Justification de la décision..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            variant={resolution === 'confirmée' ? 'destructive' : 'default'}
            onClick={() => onResolve(resolution, notes)}
            disabled={isLoading || !notes}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SanteFraudPage;
