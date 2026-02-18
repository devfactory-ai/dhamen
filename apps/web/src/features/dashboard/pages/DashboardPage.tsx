import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks/useAuth';

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {trend && (
          <p className={`mt-1 text-xs ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.positive ? '+' : ''}
            {trend.value} vs mois dernier
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  );
}

function MoneyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

const recentClaims = [
  { id: '01HXYZ123', patient: 'Mohamed Ben Ali', amount: '125.500 TND', status: 'approved', time: 'Il y a 5 min' },
  { id: '01HXYZ124', patient: 'Fatma Trabelsi', amount: '45.000 TND', status: 'pending', time: 'Il y a 12 min' },
  { id: '01HXYZ125', patient: 'Ahmed Khelifi', amount: '230.000 TND', status: 'approved', time: 'Il y a 25 min' },
  { id: '01HXYZ126', patient: 'Sonia Mbarki', amount: '78.500 TND', status: 'rejected', time: 'Il y a 45 min' },
  { id: '01HXYZ127', patient: 'Karim Bouazizi', amount: '156.750 TND', status: 'approved', time: 'Il y a 1h' },
];

const statusLabels: Record<string, { label: string; className: string }> = {
  approved: { label: 'Approuvé', className: 'bg-green-100 text-green-800' },
  pending: { label: 'En attente', className: 'bg-yellow-100 text-yellow-800' },
  rejected: { label: 'Rejeté', className: 'bg-red-100 text-red-800' },
};

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bienvenue, {user?.firstName} {user?.lastName}
        </h1>
        <p className="text-muted-foreground">
          Voici un aperçu de votre activité aujourd'hui.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="PEC du jour"
          value="47"
          description="Prises en charge traitées"
          icon={ClaimsIcon}
          trend={{ value: '12%', positive: true }}
        />
        <StatCard
          title="Montant total"
          value="12,450 TND"
          description="Valeur des PEC du jour"
          icon={MoneyIcon}
          trend={{ value: '8%', positive: true }}
        />
        <StatCard
          title="Adhérents servis"
          value="38"
          description="Patients uniques"
          icon={UsersIcon}
        />
        <StatCard
          title="Taux d'approbation"
          value="94%"
          description="PEC approuvées"
          icon={CheckIcon}
          trend={{ value: '2%', positive: true }}
        />
      </div>

      {/* Recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent claims */}
        <Card>
          <CardHeader>
            <CardTitle>Dernières PEC</CardTitle>
            <CardDescription>Les 5 dernières prises en charge traitées</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentClaims.map((claim) => (
                <div key={claim.id} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{claim.patient}</p>
                    <p className="text-xs text-muted-foreground">
                      {claim.id} • {claim.time}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{claim.amount}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusLabels[claim.status].className}`}
                    >
                      {statusLabels[claim.status].label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions rapides</CardTitle>
            <CardDescription>Accès rapide aux fonctions principales</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ClaimsIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Nouvelle PEC</p>
                  <p className="text-xs text-muted-foreground">Créer une prise en charge</p>
                </div>
              </button>
              <button className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <UsersIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Vérifier éligibilité</p>
                  <p className="text-xs text-muted-foreground">Consulter les droits</p>
                </div>
              </button>
              <button className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <MoneyIcon className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Mes bordereaux</p>
                  <p className="text-xs text-muted-foreground">Consulter les paiements</p>
                </div>
              </button>
              <button className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <CheckIcon className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium">Rapports</p>
                  <p className="text-xs text-muted-foreground">Statistiques d'activité</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
