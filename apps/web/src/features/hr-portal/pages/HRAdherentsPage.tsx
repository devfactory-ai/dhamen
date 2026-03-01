import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Upload, Download, Search, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { toCSV, downloadCSV, type ExportColumn } from '@/lib/export-utils';
import { useToast } from '@/stores/toast';

interface Adherent {
  id: string;
  first_name: string;
  last_name: string;
  national_id_encrypted: string;
  date_of_birth: string;
  gender: string;
  phone_encrypted: string;
  email: string | null;
  city: string | null;
  contract_number: string | null;
  created_at: string;
}

export function HRAdherentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data: adherents, isLoading } = useQuery({
    queryKey: ['hr-adherents', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const response = await apiClient.get<{ data: Adherent[] }>(
        `/companies/${user.companyId}/adherents`
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.data || [];
    },
    enabled: !!user?.companyId,
  });

  const filteredAdherents = adherents?.filter((a) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      a.first_name.toLowerCase().includes(search) ||
      a.last_name.toLowerCase().includes(search) ||
      a.email?.toLowerCase().includes(search) ||
      a.city?.toLowerCase().includes(search)
    );
  });

  const exportColumns: ExportColumn<Adherent>[] = [
    { key: 'first_name', header: 'Prénom' },
    { key: 'last_name', header: 'Nom' },
    { key: 'email', header: 'Email' },
    { key: 'city', header: 'Ville' },
    { key: 'contract_number', header: 'N° Contrat' },
    { key: 'date_of_birth', header: 'Date de naissance' },
  ];

  const handleExportCSV = () => {
    if (!adherents?.length) {
      toast({ title: 'Aucun adhérent a exporter', variant: 'destructive' });
      return;
    }
    setIsExporting(true);
    try {
      const csv = toCSV(adherents, exportColumns);
      downloadCSV(csv, 'adherents-entreprise');
      toast({ title: `${adherents.length} adhérents exportés`, variant: 'success' });
    } catch {
      toast({ title: "Erreur lors de l'export", variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Adhérent',
      render: (adherent: Adherent) => (
        <div>
          <p className="font-medium">{adherent.first_name} {adherent.last_name}</p>
          {adherent.email && (
            <p className="text-sm text-muted-foreground">{adherent.email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'city',
      header: 'Ville',
      render: (adherent: Adherent) => adherent.city || '-',
    },
    {
      key: 'contract',
      header: 'Contrat',
      render: (adherent: Adherent) => (
        adherent.contract_number ? (
          <Badge variant="secondary">{adherent.contract_number}</Badge>
        ) : (
          <Badge variant="outline">Aucun contrat</Badge>
        )
      ),
    },
    {
      key: 'dob',
      header: 'Date de naissance',
      render: (adherent: Adherent) => (
        adherent.date_of_birth
          ? new Date(adherent.date_of_birth).toLocaleDateString('fr-TN')
          : '-'
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (adherent: Adherent) => (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/hr/adherents/${adherent.id}`)}>
          Voir
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Adhérents de l'entreprise"
          description="Gérer les salaries couverts par votre contrat groupe"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Export...' : 'Exporter CSV'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/hr/adherents/import')}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={() => navigate('/hr/adherents/new')}>
            <UserPlus className="mr-2 h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Search and Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, email, ville..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Total adhérents</span>
            <span className="text-xl font-bold">{adherents?.length || 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Avec contrat</span>
            <span className="text-xl font-bold text-green-600">
              {adherents?.filter((a) => a.contract_number).length || 0}
            </span>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={filteredAdherents || []}
        isLoading={isLoading}
        emptyMessage="Aucun adhérent trouvé"
      />
    </div>
  );
}

export default HRAdherentsPage;
