/**
 * SanteReportsPage - Advanced Reports Generation
 *
 * PDF/Excel/CSV report generation interface
 */
import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import { toast } from 'sonner';
import {
  useReportTemplates,
  useGeneratedReports,
  useReportStats,
  useGenerateReport,
  downloadReport,
  formatFileSize,
  REPORT_CATEGORIE_LABELS,
  REPORT_FORMAT_LABELS,
  type ReportTemplate,
  type GeneratedReport,
} from '../hooks/useReports';
import { useQueryClient } from '@tanstack/react-query';
import { FloatingHelp } from '@/components/ui/floating-help';
import { FileText, Download, Filter, Clock } from 'lucide-react';

export function SanteReportsPage() {
  const [activeTab, setActiveTab] = useState('templates');
  const [selectedCatégorie, setSelectedCatégorie] = useState<string>('all');
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [generateParams, setGenerateParams] = useState<Record<string, unknown>>({});
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');

  const queryClient = useQueryClient();
  const { data: templates, isLoading: templatesLoading } = useReportTemplates(
    selectedCatégorie === 'all' ? undefined : selectedCatégorie || undefined
  );
  const { data: reportsData, isLoading: reportsLoading } = useGeneratedReports();
  const { data: stats } = useReportStats();
  const generateReport = useGenerateReport();

  const handleOpenGenerate = (template: ReportTemplate) => {
    setSelectedTemplate(template);
    setSelectedFormat(template.formats[0] || 'pdf');
    // Initialize params with defaults
    const defaults: Record<string, unknown> = {};
    for (const param of template.parametres) {
      if (param.defaultValue !== undefined) {
        defaults[param.code] = param.defaultValue;
      }
    }
    setGenerateParams(defaults);
    setGenerateDialogOpen(true);
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) return;

    // Validate required params
    for (const param of selectedTemplate.parametres) {
      if (param.required && !generateParams[param.code]) {
        toast.error(`Le champ "${param.label}" est requis`);
        return;
      }
    }

    try {
      await generateReport.mutateAsync({
        templateId: selectedTemplate.id,
        format: selectedFormat,
        parametres: generateParams,
      });
      toast.success('Rapport en cours de generation');
      setGenerateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
      setActiveTab('history');
    } catch {
      toast.error('Erreur lors de la génération du rapport');
    }
  };

  const handleDownload = async (report: GeneratedReport) => {
    if (report.statut !== 'termine' || !report.fileUrl) {
      toast.error('Le rapport n\'est pas encore disponible');
      return;
    }
    try {
      const extension = report.format === 'excel' ? 'xlsx' : report.format;
      await downloadReport(report.id, `${report.templateNom}_${report.id}.${extension}`);
      toast.success('Téléchargement démarré');
    } catch {
      toast.error('Erreur lors du téléchargement');
    }
  };

  // Catégories count
  const catégoriesCount = useMemo(() => {
    if (!templates) return {};
    const counts: Record<string, number> = {};
    for (const t of templates) {
      counts[t.catégorie] = (counts[t.catégorie] || 0) + 1;
    }
    return counts;
  }, [templates]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Rapports Avancés"
        description="Générez des rapports PDF, Excel et CSV"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total générés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalGenerated || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rapports PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.parFormat.pdf || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rapports Excel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.parFormat.excel || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rapports CSV
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.parFormat.csv || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates">Modèles de rapports</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Label>Catégorie:</Label>
            <Select value={selectedCatégorie} onValueChange={setSelectedCatégorie}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Toutes les catégories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {Object.entries(REPORT_CATEGORIE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label} ({catégoriesCount[key] || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Templates Grid */}
          {templatesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-5 w-32 bg-muted rounded" />
                    <div className="h-4 w-48 bg-muted rounded mt-2" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-20 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates?.map((template) => (
                <Card key={template.id} className="hover:border-primary transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{template.nom}</CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                      </div>
                      <Badge variant="outline">
                        {REPORT_CATEGORIE_LABELS[template.catégorie]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Formats disponibles */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Formats:</span>
                        {template.formats.map((format) => (
                          <Badge key={format} variant="secondary" className="text-xs">
                            {REPORT_FORMAT_LABELS[format]}
                          </Badge>
                        ))}
                      </div>

                      {/* Parameters count */}
                      <div className="text-sm text-muted-foreground">
                        {template.parametres.length} paramètre(s)
                        {template.parametres.some((p) => p.required) && (
                          <span className="text-red-500"> *</span>
                        )}
                      </div>

                      {/* Generate button */}
                      <Button
                        className="w-full"
                        onClick={() => handleOpenGenerate(template)}
                      >
                        Générer ce rapport
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {reportsLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <DataTable
                  columns={[
                    {
                      header: 'Rapport',
                      accessorKey: 'templateNom',
                      cell: ({ row }) => (
                        <div>
                          <div className="font-medium">{row.original.templateNom}</div>
                          <div className="text-sm text-muted-foreground">
                            ID: {row.original.id}
                          </div>
                        </div>
                      ),
                    },
                    {
                      header: 'Format',
                      accessorKey: 'format',
                      cell: ({ row }) => (
                        <Badge
                          variant="outline"
                          className={
                            row.original.format === 'pdf'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : row.original.format === 'excel'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }
                        >
                          {REPORT_FORMAT_LABELS[row.original.format]}
                        </Badge>
                      ),
                    },
                    {
                      header: 'Statut',
                      accessorKey: 'statut',
                      cell: ({ row }) => {
                        const statut = row.original.statut;
                        return (
                          <Badge
                            variant={
                              statut === 'termine'
                                ? 'default'
                                : statut === 'erreur'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {statut === 'en_cours'
                              ? 'En cours...'
                              : statut === 'termine'
                              ? 'Termine'
                              : 'Erreur'}
                          </Badge>
                        );
                      },
                    },
                    {
                      header: 'Taille',
                      accessorKey: 'fileSize',
                      cell: ({ row }) => formatFileSize(row.original.fileSize),
                    },
                    {
                      header: 'Date',
                      accessorKey: 'createdAt',
                      cell: ({ row }) => {
                        const date = new Date(row.original.createdAt);
                        return date.toLocaleDateString('fr-TN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      },
                    },
                    {
                      header: 'Actions',
                      id: 'actions',
                      cell: ({ row }) => (
                        <Button
                          size="sm"
                          variant={row.original.statut === 'termine' ? 'default' : 'secondary'}
                          disabled={row.original.statut !== 'termine'}
                          onClick={() => handleDownload(row.original)}
                        >
                          Télécharger
                        </Button>
                      ),
                    },
                  ]}
                  data={reportsData?.reports || []}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Generate Dialog */}
      <GenerateReportDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        template={selectedTemplate}
        format={selectedFormat}
        onFormatChange={setSelectedFormat}
        params={generateParams}
        onParamsChange={setGenerateParams}
        onGenerate={handleGenerate}
        isGenerating={generateReport.isPending}
      />

      <FloatingHelp
        title="Aide - Rapports"
        subtitle="Generation de rapports PDF, Excel et CSV"
        tips={[
          {
            icon: <FileText className="h-4 w-4 text-blue-500" />,
            title: "Modeles de rapports",
            desc: "Choisissez un modele parmi les categories disponibles et configurez les parametres.",
          },
          {
            icon: <Filter className="h-4 w-4 text-purple-500" />,
            title: "Filtrer par categorie",
            desc: "Utilisez le filtre par categorie pour trouver rapidement le modele souhaite.",
          },
          {
            icon: <Download className="h-4 w-4 text-green-500" />,
            title: "Telecharger un rapport",
            desc: "Une fois genere, telechargez le rapport depuis l'onglet Historique.",
          },
          {
            icon: <Clock className="h-4 w-4 text-orange-500" />,
            title: "Historique des rapports",
            desc: "Consultez l'historique pour retrouver et re-telecharger vos rapports precedents.",
          },
        ]}
      />
    </div>
  );
}

interface GenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ReportTemplate | null;
  format: 'pdf' | 'excel' | 'csv';
  onFormatChange: (format: 'pdf' | 'excel' | 'csv') => void;
  params: Record<string, unknown>;
  onParamsChange: (params: Record<string, unknown>) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

function GenerateReportDialog({
  open,
  onOpenChange,
  template,
  format,
  onFormatChange,
  params,
  onParamsChange,
  onGenerate,
  isGenerating,
}: GenerateReportDialogProps) {
  if (!template) return null;

  const updateParam = (code: string, value: unknown) => {
    onParamsChange({ ...params, [code]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Générer: {template.nom}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Format selection */}
          <div className="space-y-2">
            <Label>Format du rapport</Label>
            <div className="flex gap-2">
              {template.formats.map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant={format === f ? 'default' : 'outline'}
                  onClick={() => onFormatChange(f)}
                  className="flex-1"
                >
                  {f === 'pdf' && '📄 '}
                  {f === 'excel' && '📊 '}
                  {f === 'csv' && '📋 '}
                  {REPORT_FORMAT_LABELS[f]}
                </Button>
              ))}
            </div>
          </div>

          {/* Dynamic parameters */}
          {template.parametres.map((param) => (
            <div key={param.code} className="space-y-2">
              <Label>
                {param.label}
                {param.required && <span className="text-red-500"> *</span>}
              </Label>

              {param.type === 'date' && (
                <Input
                  type="date"
                  value={(params[param.code] as string) || ''}
                  onChange={(e) => updateParam(param.code, e.target.value)}
                />
              )}

              {param.type === 'dateRange' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Du</Label>
                    <Input
                      type="date"
                      value={
                        ((params[param.code] as { start?: string })?.start as string) || ''
                      }
                      onChange={(e) =>
                        updateParam(param.code, {
                          ...(params[param.code] as object),
                          start: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Au</Label>
                    <Input
                      type="date"
                      value={((params[param.code] as { end?: string })?.end as string) || ''}
                      onChange={(e) =>
                        updateParam(param.code, {
                          ...(params[param.code] as object),
                          end: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {param.type === 'select' && param.options && (
                <Select
                  value={(params[param.code] as string) || ''}
                  onValueChange={(value) => updateParam(param.code, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Sélectionner ${param.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {param.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {param.type === 'multiSelect' && param.options && (
                <div className="flex flex-wrap gap-2">
                  {param.options.map((opt) => {
                    const selected = ((params[param.code] as string[]) || []).includes(
                      opt.value
                    );
                    return (
                      <Badge
                        key={opt.value}
                        variant={selected ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const current = (params[param.code] as string[]) || [];
                          if (selected) {
                            updateParam(
                              param.code,
                              current.filter((v) => v !== opt.value)
                            );
                          } else {
                            updateParam(param.code, [...current, opt.value]);
                          }
                        }}
                      >
                        {opt.label}
                      </Badge>
                    );
                  })}
                </div>
              )}

              {param.type === 'text' && (
                <Input
                  value={(params[param.code] as string) || ''}
                  onChange={(e) => updateParam(param.code, e.target.value)}
                  placeholder={param.label}
                />
              )}

              {param.type === 'number' && (
                <Input
                  type="number"
                  value={(params[param.code] as number) || ''}
                  onChange={(e) => updateParam(param.code, Number(e.target.value))}
                  placeholder={param.label}
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generation en cours...' : 'Générer le rapport'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SanteReportsPage;
