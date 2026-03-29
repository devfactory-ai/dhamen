/**
 * Unified Providers & Practitioners Directory for Adherents
 *
 * Combines healthcare establishments (pharmacies, clinics, labs, hospitals)
 * and individual practitioners (doctors, specialists) in one searchable page
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient } from '@/lib/api-client';
import {
  Search, MapPin, Phone, Clock, Building2, Pill, Stethoscope,
  FlaskConical, Filter, X, User
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface Provider {
  id: string;
  name: string;
  type: 'PHARMACY' | 'CLINIC' | 'LABORATORY' | 'HOSPITAL';
  address: string;
  city: string;
  phone: string;
  email: string | null;
  openingHours: string | null;
  isConventioned: boolean;
  distance?: number;
}

interface Praticien {
  id: string;
  nom: string;
  prenom?: string;
  specialite: string;
  adresse?: string;
  ville?: string;
  telephone?: string;
  email?: string;
  conventionnement: 'conventionne' | 'non_conventionne' | 'partiellement';
  tauxRemboursement?: number;
  horaires?: string;
  estActif: boolean;
}

// ============================================
// Constants
// ============================================

const PROVIDER_TYPES = {
  PHARMACY: { label: 'Pharmacie', icon: Pill, color: 'bg-blue-100 text-blue-600' },
  CLINIC: { label: 'Clinique', icon: Stethoscope, color: 'bg-green-100 text-green-600' },
  LABORATORY: { label: 'Laboratoire', icon: FlaskConical, color: 'bg-purple-100 text-purple-600' },
  HOSPITAL: { label: 'Hôpital', icon: Building2, color: 'bg-orange-100 text-orange-600' },
};

const CONVENTIONNEMENT_LABELS: Record<string, string> = {
  conventionne: 'Conventionné',
  non_conventionne: 'Non conventionné',
  partiellement: 'Partiellement',
};

const CONVENTIONNEMENT_COLORS: Record<string, string> = {
  conventionne: 'bg-green-100 text-green-800',
  non_conventionne: 'bg-red-100 text-red-800',
  partiellement: 'bg-yellow-100 text-yellow-800',
};

const SPECIALITES = [
  'Médecine générale',
  'Cardiologie',
  'Dermatologie',
  'Gynécologie',
  'Ophtalmologie',
  'ORL',
  'Pédiatrie',
  'Psychiatrie',
  'Radiologie',
  'Stomatologie',
  'Kinésithérapie',
  'Dentaire',
];

const VILLES_TUNISIE = [
  'Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte', 'Gabes', 'Ariana',
  'Gafsa', 'Monastir', 'Ben Arous', 'Kasserine', 'Medenine', 'Nabeul',
  'Tataouine', 'Beja', 'Jendouba', 'Mahdia', 'Sidi Bouzid', 'Tozeur',
  'Siliana', 'Kef', 'Kebili', 'Zaghouan', 'Manouba',
];

// ============================================
// Main Component
// ============================================

export function AdherentProvidersPage() {
  const [activeTab, setActiveTab] = useState<'etablissements' | 'praticiens'>('etablissements');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trouver un praticien de santé"
        description="Recherchez des établissements et praticiens conventionnés"
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'etablissements' | 'praticiens')}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="etablissements" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Établissements
          </TabsTrigger>
          <TabsTrigger value="praticiens" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Praticiens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="etablissements" className="mt-6">
          <EtablissementsTab />
        </TabsContent>

        <TabsContent value="praticiens" className="mt-6">
          <PraticiensTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// Etablissements Tab
// ============================================

function EtablissementsTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');

  const { data: providers, isLoading } = useQuery({
    queryKey: ['adherent-providers', searchTerm, selectedType, selectedCity],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '50' };
      if (searchTerm) params.search = searchTerm;
      if (selectedType && selectedType !== 'all') params.type = selectedType;
      if (selectedCity && selectedCity !== 'all') params.city = selectedCity;

      const response = await apiClient.get<{ data: Provider[]; meta: { total: number } }>('/providers/public', { params });
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.data || [];
    },
  });

  const hasActiveFilters = searchTerm || selectedType !== 'all' || selectedCity !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedCity('all');
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {Object.entries(PROVIDER_TYPES).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Ville" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les villes</SelectItem>
                {VILLES_TUNISIE.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : providers && providers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
            <h3 className="mt-4 text-lg font-semibold">Aucun établissement trouvé</h3>
            <p className="mt-2 text-muted-foreground">
              Essayez de modifier vos critères de recherche
            </p>
            {hasActiveFilters && (
              <Button variant="link" onClick={clearFilters} className="mt-2">
                Effacer les filtres
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProviderCard({ provider }: { provider: Provider }) {
  const typeInfo = PROVIDER_TYPES[provider.type];
  const Icon = typeInfo.icon;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        <div className={`flex items-center gap-3 p-4 ${typeInfo.color}`}>
          <Icon className="h-6 w-6" />
          <span className="font-medium">{typeInfo.label}</span>
          {provider.isConventioned && (
            <Badge variant="success" className="ml-auto">
              Conventionné
            </Badge>
          )}
        </div>
        <div className="p-4 space-y-3">
          <h3 className="font-semibold">{provider.name}</h3>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{provider.address}, {provider.city}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${provider.phone}`} className="hover:underline text-primary">
              {provider.phone}
            </a>
          </div>
          {provider.openingHours && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{provider.openingHours}</span>
            </div>
          )}
          {provider.distance && (
            <div className="text-sm text-primary font-medium">
              À {provider.distance.toFixed(1)} km
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Praticiens Tab
// ============================================

function PraticiensTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedSpecialite, setSelectedSpecialite] = useState<string>('all');
  const [selectedVille, setSelectedVille] = useState<string>('all');
  const [selectedConventionnement, setSelectedConventionnement] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adherent-praticiens', page, search, selectedSpecialite, selectedVille, selectedConventionnement],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (selectedSpecialite !== 'all') params.set('specialite', selectedSpecialite);
      if (selectedVille !== 'all') params.set('ville', selectedVille);
      if (selectedConventionnement !== 'all') params.set('conventionnement', selectedConventionnement);

      const response = await apiClient.get<{
        data: Praticien[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      }>(`/sante/praticiens?${params.toString()}`);

      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  const praticiens = data?.data || [];
  const meta = data?.meta || { page: 1, limit: 20, total: 0, totalPages: 1 };

  const hasActiveFilters = search || selectedSpecialite !== 'all' || selectedVille !== 'all' || selectedConventionnement !== 'all';

  const clearFilters = () => {
    setSearch('');
    setSelectedSpecialite('all');
    setSelectedVille('all');
    setSelectedConventionnement('all');
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="space-y-4">
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
                    {[selectedSpecialite !== 'all', selectedVille !== 'all', selectedConventionnement !== 'all', search].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>

            {showFilters && (
              <div className="grid gap-4 md:grid-cols-4 pt-4 border-t">
                <Select value={selectedSpecialite} onValueChange={setSelectedSpecialite}>
                  <SelectTrigger>
                    <SelectValue placeholder="Spécialité" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes spécialités</SelectItem>
                    {SPECIALITES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedVille} onValueChange={setSelectedVille}>
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

                <Select value={selectedConventionnement} onValueChange={setSelectedConventionnement}>
                  <SelectTrigger>
                    <SelectValue placeholder="Conventionnement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="conventionne">Conventionné</SelectItem>
                    <SelectItem value="partiellement">Partiellement</SelectItem>
                    <SelectItem value="non_conventionne">Non conventionné</SelectItem>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
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

      {/* Results */}
      {!isLoading && !isError && (
        <>
          {/* Count */}
          <p className="text-sm text-muted-foreground">
            {meta.total} praticien{meta.total > 1 ? 's' : ''} trouvé{meta.total > 1 ? 's' : ''}
          </p>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {praticiens.map((praticien) => (
              <PraticienCard key={praticien.id} praticien={praticien} />
            ))}
          </div>

          {/* Empty state */}
          {praticiens.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <User className="mx-auto h-12 w-12 opacity-20" />
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
                Précédent
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
    </div>
  );
}

function PraticienCard({ praticien }: { praticien: Praticien }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base">
              {praticien.prenom ? `Dr. ${praticien.prenom} ${praticien.nom}` : `Dr. ${praticien.nom}`}
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
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${praticien.telephone}`} className="hover:underline text-primary">
              {praticien.telephone}
            </a>
          </div>
        )}
        {praticien.horaires && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {praticien.horaires}
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

export default AdherentProvidersPage;
