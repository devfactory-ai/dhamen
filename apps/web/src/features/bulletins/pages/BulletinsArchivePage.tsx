import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { apiClient } from '@/lib/api-client';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { toast } from 'sonner';
import {
  FileText,
  Upload,
  Search,
  FileSpreadsheet,
  Archive,
  Calendar,
  Image,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
} from 'lucide-react';

// Types
interface ArchiveBulletin {
  id: string;
  bulletin_number: string;
  bulletin_date: string;
  adherent_matricule: string;
  adherent_first_name: string;
  adherent_last_name: string;
  adherent_national_id: string;
  beneficiary_name: string | null;
  provider_name: string;
  provider_specialty: string;
  care_type: string;
  total_amount: number;
  scan_url: string | null;
  scan_filename: string | null;
  batch_name: string | null;
  created_at: string;
}

interface ArchiveStats {
  total: number;
  withScans: number;
  withoutScans: number;
  byYear: Array<{
    year: string;
    count: number;
    with_scans: number;
  }>;
  recentBatches: Array<{
    id: string;
    name: string;
    created_at: string;
    bulletin_count: number;
    with_scans: number;
  }>;
}

interface ImportResult {
  batchId: string;
  imported: number;
  total: number;
  errors: string[];
}

interface UploadResult {
  uploaded: number;
  matched: number;
  total: number;
  results: Array<{
    filename: string;
    status: 'matched' | 'uploaded_no_match' | 'uploaded_no_number' | 'error';
    bulletinNumber?: string;
  }>;
}

function BulletinsArchivePage() {
  const queryClient = useQueryClient();
  const { selectedCompany } = useAgentContext();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const scansInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState('stats');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchYear, setSearchYear] = useState<string>('');
  const [hasScans, setHasScans] = useState<string>('');
  const isIndividualMode = selectedCompany?.id === '__INDIVIDUAL__';
  const [currentPage, setCurrentPage] = useState(1);

  // Import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState('');
  const [importYear, setImportYear] = useState('2026');

  // Upload state
  const [scanFiles, setScanFiles] = useState<File[]>([]);
  const [targetBatchId, setTargetBatchId] = useState('');

  // Fetch archive stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['archive-stats', selectedCompany?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCompany) params.append('companyId', selectedCompany.id);
      const response = await apiClient.get(`/bulletins-soins/archive/stats?${params}`);
      return response.data as ArchiveStats;
    },
  });

  // Search archived bulletins
  const { data: searchResults, isLoading: searchLoading, refetch: doSearch } = useQuery({
    queryKey: ['archive-search', searchQuery, searchYear, hasScans, isIndividualMode, currentPage, selectedCompany?.id],
    queryFn: async () => {
      const response = await apiClient.get('/bulletins-soins/archive/search', {
        params: {
          q: searchQuery || undefined,
          year: searchYear || undefined,
          hasScans: hasScans || undefined,
          contractType: isIndividualMode ? 'individual' : undefined,
          companyId: selectedCompany?.id || undefined,
          page: currentPage,
          limit: 20,
        },
      });
      return response;
    },
    enabled: activeTab === 'search',
  });

  // Import CSV mutation
  const importCsv = useMutation({
    mutationFn: async () => {
      if (!csvFile) throw new Error('Fichier CSV requis');

      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('batchName', batchName);
      formData.append('year', importYear);
      if (selectedCompany) formData.append('companyId', selectedCompany.id);

      const response = await apiClient.upload('/bulletins-soins/archive/import-csv', formData);
      return response?.data as ImportResult;
    },
    onSuccess: (data) => {
      toast.success(`Import terminé: ${data.imported} bulletins importés sur ${data.total}`);
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} erreurs rencontrées`);
      }
      queryClient.invalidateQueries({ queryKey: ['archive-stats'] });
      setCsvFile(null);
      setBatchName('');
      if (csvInputRef.current) csvInputRef.current.value = '';
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  // Upload scans mutation
  const uploadScans = useMutation({
    mutationFn: async () => {
      if (scanFiles.length === 0) throw new Error('Fichiers requis');

      const formData = new FormData();
      for (const file of scanFiles) {
        formData.append('files', file);
      }
      if (targetBatchId) {
        formData.append('batchId', targetBatchId);
      }

      const response = await apiClient.upload('/bulletins-soins/archive/upload-scans', formData);
      return response?.data as UploadResult;
    },
    onSuccess: (data) => {
      toast.success(`Upload terminé: ${data.uploaded} fichiers, ${data.matched} associés`);
      queryClient.invalidateQueries({ queryKey: ['archive-stats'] });
      queryClient.invalidateQueries({ queryKey: ['archive-search'] });
      setScanFiles([]);
      if (scansInputRef.current) scansInputRef.current.value = '';
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
    }
  };

  const handleScansSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setScanFiles(files);
  };

  const scanCoverage = stats ? Math.round((stats.withScans / (stats.total || 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Archives Bulletins"
        description="Numérisation et archivage des bulletins de soins 2024-2025"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="stats" className="gap-2">
            <Archive className="h-4 w-4" />
            Statistiques
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Import CSV
          </TabsTrigger>
          <TabsTrigger value="scans" className="gap-2">
            <Image className="h-4 w-4" />
            Upload Scans
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-2">
            <Search className="h-4 w-4" />
            Recherche
          </TabsTrigger>
        </TabsList>

        {/* Statistics Tab */}
        <TabsContent value="stats" className="space-y-6">
          {statsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : stats ? (
            <>
              {/* Overview Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Archives
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats.total.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Avec Scans
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">{stats.withScans.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Sans Scans
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-500">{stats.withoutScans.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Couverture
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{scanCoverage}%</div>
                    <Progress value={scanCoverage} className="mt-2" />
                  </CardContent>
                </Card>
              </div>

              {/* By Year */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Bulletins par Année
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats.byYear.map((yearData) => {
                      const coverage = Math.round((yearData.with_scans / (yearData.count || 1)) * 100);
                      return (
                        <div key={yearData.year} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{yearData.year}</span>
                            <span className="text-muted-foreground">
                              {yearData.count.toLocaleString()} bulletins ({coverage}% numérisés)
                            </span>
                          </div>
                          <Progress value={coverage} />
                        </div>
                      );
                    })}
                    {stats.byYear.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        Aucun bulletin archivé
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Batches */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Derniers Imports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.recentBatches.map((batch) => (
                      <div key={batch.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{batch.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(batch.created_at).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{batch.bulletin_count} bulletins</p>
                          <p className="text-sm text-muted-foreground">
                            {batch.with_scans} numérisés
                          </p>
                        </div>
                      </div>
                    ))}
                    {stats.recentBatches.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        Aucun import récent
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* Import CSV Tab */}
        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Importer fichier CSV
              </CardTitle>
              <CardDescription>
                Importez un fichier CSV contenant les données des bulletins traités.
                Format attendu: colonnes séparées par point-virgule (;)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom du lot</Label>
                  <Input
                    placeholder="Ex: Lot Janvier 2024"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Année</Label>
                  <Select value={importYear} onValueChange={setImportYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2023">2023</SelectItem>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2025">2025</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Fichier CSV</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                  onClick={() => csvInputRef.current?.click()}
                >
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvSelect}
                    className="hidden"
                  />
                  {csvFile ? (
                    <div className="space-y-2">
                      <CheckCircle className="h-10 w-10 mx-auto text-green-500" />
                      <p className="font-medium">{csvFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(csvFile.size / 1024).toFixed(1)} Ko
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p>Cliquez ou glissez un fichier CSV</p>
                      <p className="text-sm text-muted-foreground">
                        Format: Numéro Bulletin; Date Bulletin; Matricule Adhérent; ...
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCsvFile(null);
                    setBatchName('');
                    if (csvInputRef.current) csvInputRef.current.value = '';
                  }}
                  disabled={!csvFile}
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => importCsv.mutate()}
                  disabled={!csvFile || importCsv.isPending}
                >
                  {importCsv.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Importer
                    </>
                  )}
                </Button>
              </div>

              {/* Expected Format Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h4 className="font-medium text-blue-900 mb-2">Format CSV attendu</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Colonnes séparées par point-virgule (;):
                </p>
                <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
                  <li>Numéro Bulletin</li>
                  <li>Date Bulletin</li>
                  <li>Matricule Adhérent</li>
                  <li>Nom Adhérent, Prénom Adhérent</li>
                  <li>CIN</li>
                  <li>Beneficiaire, Lien Parente</li>
                  <li>Nom Praticien, Specialite</li>
                  <li>Type Soin, Description</li>
                  <li>Montant TND</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Upload Scans Tab */}
        <TabsContent value="scans" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Upload des Scans
              </CardTitle>
              <CardDescription>
                Téléchargez les scans des bulletins. Le système associera automatiquement
                les scans aux bulletins en utilisant le numéro dans le nom de fichier.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Lot cible (optionnel)</Label>
                <Select value={targetBatchId} onValueChange={setTargetBatchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les bulletins archivés" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all
                    ">Tous les lots</SelectItem>
                    {stats?.recentBatches.map((batch) => (
                      <SelectItem key={batch?.id} value={batch?.id}>
                        {batch?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fichiers scans</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                  onClick={() => scansInputRef.current?.click()}
                >
                  <input
                    ref={scansInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    onChange={handleScansSelect}
                    className="hidden"
                  />
                  {scanFiles.length > 0 ? (
                    <div className="space-y-2">
                      <CheckCircle className="h-10 w-10 mx-auto text-green-500" />
                      <p className="font-medium">{scanFiles.length} fichiers sélectionnés</p>
                      <div className="max-h-32 overflow-y-auto">
                        {scanFiles.slice(0, 5).map((file, i) => (
                          <p key={i} className="text-sm text-muted-foreground">{file.name}</p>
                        ))}
                        {scanFiles.length > 5 && (
                          <p className="text-sm text-muted-foreground">
                            ... et {scanFiles.length - 5} autres
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p>Cliquez ou glissez les fichiers scans</p>
                      <p className="text-sm text-muted-foreground">
                        Format de nommage: BS-2024-0001.pdf ou BS-2024-0001_scan.jpg
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setScanFiles([]);
                    if (scansInputRef.current) scansInputRef.current.value = '';
                  }}
                  disabled={scanFiles.length === 0}
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => uploadScans.mutate()}
                  disabled={scanFiles.length === 0 || uploadScans.isPending}
                >
                  {uploadScans.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Upload en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Uploader ({scanFiles.length} fichiers)
                    </>
                  )}
                </Button>
              </div>

              {/* Naming Convention */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                <h4 className="font-medium text-amber-900 mb-2">Convention de nommage</h4>
                <p className="text-sm text-amber-800 mb-2">
                  Pour que l'association automatique fonctionne, les fichiers doivent contenir
                  le numéro de bulletin au format: <code className="bg-amber-100 px-1 rounded">BS-AAAA-NNNN</code>
                </p>
                <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
                  <li><code>BS-2024-0001.pdf</code> - Association avec bulletin BS-2024-0001</li>
                  <li><code>BS-2024-0001_recto.jpg</code> - OK, extrait BS-2024-0001</li>
                  <li><code>scan_fevrier.pdf</code> - Uploadé mais non associé</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Rechercher dans les Archives
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <Input
                    placeholder="Rechercher (matricule, nom, numéro bulletin...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setCurrentPage(1);
                        doSearch();
                      }
                    }}
                  />
                </div>
                <Select value={searchYear} onValueChange={(v) => { setSearchYear(v); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Année" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={hasScans} onValueChange={(v) => { setHasScans(v); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Scans" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="true">Avec scan</SelectItem>
                    <SelectItem value="false">Sans scan</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={() => { setCurrentPage(1); doSearch(); }} disabled={searchLoading}>
                {searchLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Rechercher
              </Button>
            </CardContent>
          </Card>

          {/* Search Results */}
          {searchResults && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {searchResults.meta?.total || 0} résultats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={[
                    {
                      key: 'bulletin_number',
                      header: 'N° Bulletin',
                      render: (b: ArchiveBulletin) => (
                        <span className="font-mono text-sm">{b.bulletin_number}</span>
                      ),
                    },
                    {
                      key: 'bulletin_date',
                      header: 'Date',
                      render: (b: ArchiveBulletin) => (
                        <span>{b.bulletin_date ? new Date(b.bulletin_date).toLocaleDateString('fr-FR') : '-'}</span>
                      ),
                    },
                    {
                      key: 'adherent',
                      header: 'Adhérent',
                      render: (b: ArchiveBulletin) => (
                        <div>
                          <p className="font-medium">{b.adherent_first_name} {b.adherent_last_name}</p>
                          <p className="text-sm text-muted-foreground">{b.adherent_matricule}</p>
                        </div>
                      ),
                    },
                    {
                      key: 'provider_name',
                      header: 'Praticien',
                      render: (b: ArchiveBulletin) => (
                        <div>
                          <p>{b.provider_name}</p>
                          <p className="text-sm text-muted-foreground">{b.provider_specialty}</p>
                        </div>
                      ),
                    },
                    {
                      key: 'total_amount',
                      header: 'Montant',
                      render: (b: ArchiveBulletin) => (
                        <span className="font-medium">{(b.total_amount || 0).toFixed(3)} TND</span>
                      ),
                    },
                    {
                      key: 'scan_url',
                      header: 'Scan',
                      render: (b: ArchiveBulletin) => b.scan_url ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Oui
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <XCircle className="h-3 w-3 mr-1" />
                          Non
                        </Badge>
                      ),
                    },
                    {
                      key: 'actions',
                      header: '',
                      render: (b: ArchiveBulletin) => b.scan_url ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            apiClient.get<Blob>(`/bulletins-soins/archive/${b.id}/scan`, { responseType: 'blob' }).then((res) => {
                              if (res.success && res.data) {
                                window.open(URL.createObjectURL(res.data), '_blank');
                              }
                            });
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      ) : null,
                    },
                  ]}
                  data={(searchResults?.data as ArchiveBulletin[]) || []}
                  pagination={searchResults?.meta ? {
                    page: currentPage,
                    limit: searchResults?.meta?.limit ?? 20,
                    total: searchResults?.meta?.total,
                    onPageChange: setCurrentPage,
                  } : undefined}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BulletinsArchivePage;
