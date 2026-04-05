/**
 * UsersImportPage - Bulk import users from CSV file
 */
import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Upload, CheckCircle2, XCircle, AlertTriangle, Download, ChevronRight } from 'lucide-react';
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
import { ROLES } from '@dhamen/shared';

interface UserCsvRow {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
}

interface ImportResult {
  success: number;
  skipped: number;
  errors: { row: number; email: string; error: string }[];
}

interface ParsedData {
  valid: UserCsvRow[];
  invalid: { row: number; data: Record<string, string>; errors: string[] }[];
}

const CSV_TEMPLATE = `email,firstName,lastName,role,phone
admin@example.com,Ahmed,Ben Ali,INSURER_ADMIN,+216 98 123 456
agent@example.com,Fatma,Trabelsi,INSURER_AGENT,+216 55 987 654`;

export function UsersImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const parseCSV = useCallback((content: string): ParsedData => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return { valid: [], invalid: [] };

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const valid: UserCsvRow[] = [];
    const invalid: ParsedData['invalid'] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"' || char === "'") inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
        else current += char;
      }
      values.push(current.trim());

      const data: Record<string, string> = {};
      headers.forEach((header, idx) => { data[header] = values[idx] || ''; });

      const errors: string[] = [];
      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Email invalide');
      if (!data.firstName) errors.push('Prénom requis');
      if (!data.lastName) errors.push('Nom requis');
      if (!data.role || !ROLES.includes(data.role as typeof ROLES[number])) errors.push('Role invalide');

      if (errors.length > 0) {
        invalid.push({ row: i + 1, data, errors });
      } else {
        valid.push({
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          phone: data.phone || undefined,
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
    };
    reader.readAsText(selectedFile);
  }, [parseCSV]);

  const importMutation = useMutation({
    mutationFn: async (data: { users: UserCsvRow[]; skipDuplicates: boolean }) => {
      const response = await apiClient.post<ImportResult>('/users/import', data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      if (data.success > 0) toast.success(`${data.success} utilisateur(s) importé(s)`);
      if (data.errors.length > 0) toast.warning(`${data.errors.length} erreur(s)`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'import");
    },
  });

  const handleImport = () => {
    if (!parsedData || parsedData.valid.length === 0) {
      toast.error('Aucune donnée valide');
      return;
    }
    importMutation.mutate({ users: parsedData.valid, skipDuplicates });
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/users" className="hover:text-gray-900 transition-colors">Utilisateurs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Importer</span>
      </nav>
      <PageHeader title="Import d'utilisateurs" description="Importer des utilisateurs en masse depuis un fichier CSV" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Fichier CSV</CardTitle>
            <CardDescription>Sélectionnez un fichier CSV contenant les utilisateurs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />Télécharger le modèle
            </Button>

            <div className="space-y-2">
              <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
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
                  <p className="mt-2 text-sm font-medium">Cliquez pour sélectionner</p>
                  <p className="text-xs text-muted-foreground">Format CSV uniquement</p>
                </label>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="skipDuplicates">Ignorer les doublons</Label>
                <p className="text-xs text-muted-foreground">Les emails existants seront ignores</p>
              </div>
              <Switch id="skipDuplicates" checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
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
              <Button variant="outline" onClick={() => navigate('/users')}>Annuler</Button>
              <Button onClick={handleImport} disabled={!parsedData || parsedData.valid.length === 0 || importMutation.isPending}>
                {importMutation.isPending ? 'Import...' : 'Importer'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Format du fichier</CardTitle>
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
                <TableRow><TableCell className="font-mono">email</TableCell><TableCell><Badge variant="destructive">Oui</Badge></TableCell><TableCell>Email valide</TableCell></TableRow>
                <TableRow><TableCell className="font-mono">firstName</TableCell><TableCell><Badge variant="destructive">Oui</Badge></TableCell><TableCell>Texte</TableCell></TableRow>
                <TableRow><TableCell className="font-mono">lastName</TableCell><TableCell><Badge variant="destructive">Oui</Badge></TableCell><TableCell>Texte</TableCell></TableRow>
                <TableRow><TableCell className="font-mono">role</TableCell><TableCell><Badge variant="destructive">Oui</Badge></TableCell><TableCell>ADMIN, INSURER_ADMIN, etc.</TableCell></TableRow>
                <TableRow><TableCell className="font-mono">phone</TableCell><TableCell><Badge variant="outline">Non</Badge></TableCell><TableCell>Texte</TableCell></TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {parsedData && parsedData.invalid.length > 0 && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />Lignes invalides ({parsedData.invalid.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ligne</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Erreurs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.invalid.map((item) => (
                    <TableRow key={item.row}>
                      <TableCell>{item.row}</TableCell>
                      <TableCell>{item.data.email}</TableCell>
                      <TableCell>
                        <ul className="text-xs text-red-600 list-disc list-inside">
                          {item.errors.map((err, idx) => <li key={idx}>{err}</li>)}
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

      {importResult && (
        <Card className={importResult.errors.length > 0 ? 'border-amber-500' : 'border-green-500'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.errors.length === 0 ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
              Résultat de l'import
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="p-4 bg-green-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">{importResult.success}</p>
                <p className="text-sm text-green-700">Importés</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">{importResult.skipped}</p>
                <p className="text-sm text-blue-700">Ignores</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-600">{importResult.errors.length}</p>
                <p className="text-sm text-red-700">Erreurs</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => navigate('/users')}>Voir les utilisateurs</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default UsersImportPage;
