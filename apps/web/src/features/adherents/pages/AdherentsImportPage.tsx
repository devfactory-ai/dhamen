/**
 * AdhérentsImportPage - Bulk import adhérents from CSV file
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Upload, CheckCircle2, XCircle, AlertTriangle, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { FilePreview } from '@/components/ui/file-preview';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { RELATIONSHIP, GENDER } from '@dhamen/shared';

interface ImportResult {
  success: number;
  skipped: number;
  errors: { row: number; nationalId: string; error: string }[];
}

interface ParsedData {
  valid: AdhérentCsvRow[];
  invalid: { row: number; data: Record<string, string>; errors: string[] }[];
}

const CSV_HEADERS = ['nationalId', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'phone', 'email', 'address', 'city'];

const CSV_TEMPLATE = `nationalId,firstName,lastName,dateOfBirth,gender,phone,email,address,city
12345678,Ahmed,Ben Ali,1985-03-15,M,+216 98 123 456,ahmed@email.com,123 Rue Habib Bourguiba,Tunis
87654321,Fatma,Trabelsi,1990-07-22,F,+216 55 987 654,fatma@email.com,45 Avenue Mohamed V,Sfax`;

export function AdhérentsImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const parseCSV = useCallback((content: string): ParsedData => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      return { valid: [], invalid: [] };
    }

    // Parse header row
    const headerLine = lines[0];
    if (!headerLine) return { valid: [], invalid: [] };
    const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));

    const valid: AdhérentCsvRow[] = [];
    const invalid: ParsedData['invalid'] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line (handle quoted values)
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (const char of line) {
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const data: Record<string, string> = {};
      headers.forEach((header, idx) => {
        data[header] = values[idx] || '';
      });

      const errors: string[] = [];

      // Validate required fields
      if (!data.nationalId || data.nationalId.length < 8) {
        errors.push('Numéro national invalide (min 8 caractères)');
      }
      if (!data.firstName) {
        errors.push('Prénom requis');
      }
      if (!data.lastName) {
        errors.push('Nom requis');
      }
      if (!data.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth)) {
        errors.push('Date de naissance invalide (format: YYYY-MM-DD)');
      }
      if (data.gender && !['M', 'F'].includes(data.gender)) {
        errors.push('Genre invalide (M ou F)');
      }
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push('Email invalide');
      }

      if (errors.length > 0) {
        invalid.push({ row: i + 1, data, errors });
      } else {
        // Values are guaranteed to exist after validation above
        valid.push({
          nationalId: data.nationalId!,
          firstName: data.firstName!,
          lastName: data.lastName!,
          dateOfBirth: data.dateOfBirth!,
          gender: data.gender as 'M' | 'F' | undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
        });
      }
    }

    return { valid, invalid };
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Veuillez sélectionner un fichier CSV');
      return;
    }

    setFile(selectedFile);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseCSV(content);
      setParsedData(parsed);

      if (parsed.valid.length === 0 && parsed.invalid.length === 0) {
        toast.error('Le fichier CSV est vide ou mal formaté');
      }
    };
    reader.readAsText(selectedFile);
  }, [parseCSV]);

  const importMutation = useMutation({
    mutationFn: async (data: { adhérents: AdhérentCsvRow[]; skipDuplicates: boolean }) => {
      const response = await apiClient.post<ImportResult>('/adhérents/import', data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      if (data.success > 0) {
        toast.success(`${data.success} adhérent(s) importé(s) avec succès`);
      }
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} erreur(s) lors de l'import`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'import");
    },
  });

  const handleImport = () => {
    if (!parsedData || parsedData.valid.length === 0) {
      toast.error('Aucune donnée valide à importer');
      return;
    }

    importMutation.mutate({
      adhérents: parsedData.valid,
      skipDuplicates,
    });
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'adhérents_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/adhérents')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title="Import d'adhérents"
          description="Importer des adhérents en masse depuis un fichier CSV"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Fichier CSV
            </CardTitle>
            <CardDescription>
              Sélectionnez un fichier CSV contenant les adhérents à importer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Télécharger le modèle
              </Button>
            </div>

            <div className="space-y-2">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              {file ? (
                <FilePreview
                  file={file}
                  onRemove={() => {
                    setFile(null);
                    setParsedData(null);
                    setImportResult(null);
                  }}
                />
              ) : (
                <label
                  htmlFor="csv-upload"
                  className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">
                    Cliquez pour sélectionner un fichier
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Format CSV uniquement, max 1000 lignes
                  </p>
                </label>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="skipDuplicates">Ignorer les doublons</Label>
                <p className="text-xs text-muted-foreground">
                  Les adhérents existants seront ignorés
                </p>
              </div>
              <Switch
                id="skipDuplicates"
                checked={skipDuplicates}
                onCheckedChange={setSkipDuplicates}
              />
            </div>

            {parsedData && (
              <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">{parsedData.valid.length} valides</span>
                </div>
                {parsedData.invalid.length > 0 && (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm">{parsedData.invalid.length} invalides</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate('/adhérents')}>
                Annuler
              </Button>
              <Button
                onClick={handleImport}
                disabled={!parsedData || parsedData.valid.length === 0 || importMutation.isPending}
              >
                {importMutation.isPending ? 'Import en cours...' : 'Importer'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Format Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Format du fichier</CardTitle>
            <CardDescription>
              Colonnes requises et format attendu
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colonne</TableHead>
                  <TableHead>Obligatoire</TableHead>
                  <TableHead>Format</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-sm">nationalId</TableCell>
                  <TableCell><Badge variant="destructive">Oui</Badge></TableCell>
                  <TableCell className="text-sm">Min 8 caractères</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-sm">firstName</TableCell>
                  <TableCell><Badge variant="destructive">Oui</Badge></TableCell>
                  <TableCell className="text-sm">Texte</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-sm">lastName</TableCell>
                  <TableCell><Badge variant="destructive">Oui</Badge></TableCell>
                  <TableCell className="text-sm">Texte</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-sm">dateOfBirth</TableCell>
                  <TableCell><Badge variant="destructive">Oui</Badge></TableCell>
                  <TableCell className="text-sm">YYYY-MM-DD</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-sm">gender</TableCell>
                  <TableCell><Badge variant="outline">Non</Badge></TableCell>
                  <TableCell className="text-sm">M ou F</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-sm">phone</TableCell>
                  <TableCell><Badge variant="outline">Non</Badge></TableCell>
                  <TableCell className="text-sm">Texte</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-sm">email</TableCell>
                  <TableCell><Badge variant="outline">Non</Badge></TableCell>
                  <TableCell className="text-sm">Email valide</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-sm">address</TableCell>
                  <TableCell><Badge variant="outline">Non</Badge></TableCell>
                  <TableCell className="text-sm">Texte</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-sm">city</TableCell>
                  <TableCell><Badge variant="outline">Non</Badge></TableCell>
                  <TableCell className="text-sm">Texte</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Validation Errors */}
      {parsedData && parsedData.invalid.length > 0 && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Lignes invalides ({parsedData.invalid.length})
            </CardTitle>
            <CardDescription>
              Ces lignes ne seront pas importées
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Ligne</TableHead>
                    <TableHead>Données</TableHead>
                    <TableHead>Erreurs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.invalid.map((item) => (
                    <TableRow key={item.row}>
                      <TableCell>{item.row}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.data.firstName} {item.data.lastName}
                      </TableCell>
                      <TableCell>
                        <ul className="text-xs text-red-600 list-disc list-inside">
                          {item.errors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card className={importResult.errors.length > 0 ? 'border-amber-500' : 'border-green-500'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.errors.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              Résultat de l'import
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-4 bg-green-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">{importResult.success}</p>
                <p className="text-sm text-green-700">Importés</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">{importResult.skipped}</p>
                <p className="text-sm text-blue-700">Ignorés (doublons)</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-600">{importResult.errors.length}</p>
                <p className="text-sm text-red-700">Erreurs</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="max-h-48 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Ligne</TableHead>
                      <TableHead>Numéro national</TableHead>
                      <TableHead>Erreur</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.errors.map((err, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{err.row}</TableCell>
                        <TableCell className="font-mono text-sm">{err.nationalId}</TableCell>
                        <TableCell className="text-red-600 text-sm">{err.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <Button onClick={() => navigate('/adhérents')}>
                Voir les adhérents
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AdhérentsImportPage;
