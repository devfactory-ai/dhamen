/**
 * SoinFlow Praticiens Directory Page
 *
 * Lists all conventioned practitioners with filters
 */
import { useState } from 'react';
import { Search, MapPin, Phone, Mail, Building, Filter, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  usePraticiens,
  usePraticienById,
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PraticiensFilters>({});
  const [selectedPraticienId, setSelectedPraticienId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isError } = usePraticiens(page, 20, {
    ...filters,
    search: search || undefined,
  });

  const { data: selectedPraticien } = usePraticienById(selectedPraticienId);

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

  const hasActiveFilters = filters.specialite || filters.ville || filters.conventionnement || search;

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
                  placeholder="Rechercher par nom, specialite..."
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
                  value={filters.specialite || 'all'}
                  onValueChange={(v) => handleFilterChange('specialite', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Specialite" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes specialites</SelectItem>
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
                    <SelectItem value="conventionne">Conventionne</SelectItem>
                    <SelectItem value="partiellement">Partiellement</SelectItem>
                    <SelectItem value="non_conventionne">Non conventionne</SelectItem>
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
                onSelect={() => setSelectedPraticienId(praticien.id)}
              />
            ))}
          </div>

          {/* Empty state */}
          {praticiens.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Building className="mx-auto h-12 w-12 opacity-20" />
                <p className="mt-4">Aucun praticien trouve</p>
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
                Precedent
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedPraticienId} onOpenChange={() => setSelectedPraticienId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Praticien</DialogTitle>
          </DialogHeader>
          {selectedPraticien && (
            <PraticienDetail praticien={selectedPraticien} />
          )}
        </DialogContent>
      </Dialog>
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
            <p className="text-sm text-muted-foreground">{praticien.specialite}</p>
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
        {praticien.telephone && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" />
            {praticien.telephone}
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

function PraticienDetail({ praticien }: { praticien: SantePraticien }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {praticien.prenom ? `${praticien.prenom} ${praticien.nom}` : praticien.nom}
          </h3>
          <p className="text-muted-foreground">{praticien.specialite}</p>
        </div>
        <Badge className={CONVENTIONNEMENT_COLORS[praticien.conventionnement]}>
          {CONVENTIONNEMENT_LABELS[praticien.conventionnement]}
        </Badge>
      </div>

      {/* Contact */}
      <div className="space-y-3">
        {praticien.adresse && (
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p>{praticien.adresse}</p>
              {praticien.codePostal && praticien.ville && (
                <p className="text-muted-foreground">
                  {praticien.codePostal} {praticien.ville}
                </p>
              )}
            </div>
          </div>
        )}

        {praticien.telephone && (
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <a href={`tel:${praticien.telephone}`} className="text-primary hover:underline">
              {praticien.telephone}
            </a>
          </div>
        )}

        {praticien.email && (
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <a href={`mailto:${praticien.email}`} className="text-primary hover:underline">
              {praticien.email}
            </a>
          </div>
        )}
      </div>

      {/* Details */}
      {(praticien.tauxRemboursement || praticien.horaires) && (
        <div className="border-t pt-4 space-y-2">
          {praticien.tauxRemboursement && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taux de remboursement</span>
              <span className="font-medium">{praticien.tauxRemboursement}%</span>
            </div>
          )}
          {praticien.horaires && (
            <div>
              <span className="text-muted-foreground">Horaires</span>
              <p className="mt-1">{praticien.horaires}</p>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      <div className="border-t pt-4">
        <Badge variant={praticien.estActif ? 'success' : 'secondary'}>
          {praticien.estActif ? 'Actif' : 'Inactif'}
        </Badge>
      </div>
    </div>
  );
}
