/**
 * SoinFlow Praticiens Directory Page
 *
 * Lists all conventioned practitioners with filters
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Phone, Building, Filter, X, Stethoscope, Users } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  usePraticiens,
  CONVENTIONNEMENT_LABELS,
  CONVENTIONNEMENT_COLORS,
  SPECIALITES_COMMON,
  type SantePraticien,
  type PraticiensFilters,
} from '../hooks/usePraticiens';

// Tunisian cities
const VILLES_TUNISIE = [
  'Tunis',
  'Sfax',
  'Sousse',
  'Kairouan',
  'Bizerte',
  'Gabes',
  'Ariana',
  'Gafsa',
  'Monastir',
  'Ben Arous',
  'Kasserine',
  'Medenine',
  'Nabeul',
  'Tataouine',
  'Beja',
  'Jendouba',
  'Mahdia',
  'Sidi Bouzid',
  'Tozeur',
  'Siliana',
  'Kef',
  'Kebili',
  'Zaghouan',
  'Manouba',
];

export default function SantePraticiensPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PraticiensFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isError } = usePraticiens(page, 20, {
    ...filters,
    search: search || undefined,
  });

  const praticiens = data?.data || [];
  const meta = data?.meta || { page: 1, limit: 20, total: 0, totalPages: 1 };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleFilterChange = (key: keyof PraticiensFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
    }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters = filters.spécialité || filters.ville || filters.conventionnement || search;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Annuaire Praticiens"
        description={`${meta.total} praticiens conventionnes`}
      />

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="space-y-4">
            {/* Search bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Rechercher par nom, spécialité..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit">Rechercher</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtres
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2">
                    {Object.values(filters).filter(Boolean).length + (search ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="grid gap-4 md:grid-cols-4 pt-4 border-t">
                <Select
                  value={filters.spécialité || 'all'}
                  onValueChange={(v) => handleFilterChange('spécialité', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Spécialité" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes spécialités</SelectItem>
                    {SPECIALITES_COMMON.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.ville || 'all'}
                  onValueChange={(v) => handleFilterChange('ville', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ville" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes villes</SelectItem>
                    {VILLES_TUNISIE.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.conventionnement || 'all'}
                  onValueChange={(v) => handleFilterChange('conventionnement', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Conventionnement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="conventionné">Conventionne</SelectItem>
                    <SelectItem value="partiellement">Partiellement</SelectItem>
                    <SelectItem value="non_conventionné">Non conventionne</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button type="button" variant="ghost" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Effacer filtres
                  </Button>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          Chargement...
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center text-red-700">
            Erreur lors du chargement des praticiens
          </CardContent>
        </Card>
      )}

      {/* Results grid */}
      {!isLoading && !isError && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {praticiens.map((praticien) => (
              <PraticienCard
                key={praticien.id}
                praticien={praticien}
                onSelect={() => navigate(`/sante/praticiens/${praticien.id}`)}
              />
            ))}
          </div>

          {/* Empty state */}
          {praticiens.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Building className="mx-auto h-12 w-12 opacity-20" />
                <p className="mt-4">Aucun praticien trouvé</p>
                {hasActiveFilters && (
                  <Button variant="link" onClick={clearFilters} className="mt-2">
                    Effacer les filtres
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Précédént
              </Button>
              <span className="flex items-center px-4 text-sm text-muted-foreground">
                Page {page} sur {meta.totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
              >
                Suivant
              </Button>
            </div>
          )}
        </>
      )}

      <FloatingHelp
        title="Aide - Praticiens"
        subtitle="Annuaire des praticiens conventionnes"
        tips={[
          {
            icon: <Search className="h-4 w-4 text-blue-500" />,
            title: "Rechercher un praticien",
            desc: "Recherchez par nom ou specialite dans la barre de recherche.",
          },
          {
            icon: <Filter className="h-4 w-4 text-purple-500" />,
            title: "Filtres avances",
            desc: "Filtrez par specialite, ville ou statut de conventionnement.",
          },
          {
            icon: <Stethoscope className="h-4 w-4 text-green-500" />,
            title: "Detail praticien",
            desc: "Cliquez sur une carte pour voir les details et le taux de remboursement.",
          },
          {
            icon: <Users className="h-4 w-4 text-orange-500" />,
            title: "Conventionnement",
            desc: "Le badge indique le statut : conventionne, partiellement ou non conventionne.",
          },
        ]}
      />
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function PraticienCard({
  praticien,
  onSelect,
}: {
  praticien: SantePraticien;
  onSelect: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base">
              {praticien.prenom ? `${praticien.prenom} ${praticien.nom}` : praticien.nom}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{praticien.spécialité}</p>
          </div>
          <Badge className={CONVENTIONNEMENT_COLORS[praticien.conventionnement]}>
            {CONVENTIONNEMENT_LABELS[praticien.conventionnement]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {praticien.ville && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {praticien.ville}
            {praticien.adresse && ` - ${praticien.adresse}`}
          </div>
        )}
        {praticien.téléphone && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" />
            {praticien.téléphone}
          </div>
        )}
        {praticien.tauxRemboursement && (
          <div className="text-primary font-medium">
            Remboursement: {praticien.tauxRemboursement}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

