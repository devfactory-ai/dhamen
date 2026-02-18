# Spec — Portail Prestataire Unifié

## Résumé

Application web React unique qui sert les 4 types de professionnels de santé (pharmacien, médecin, laboratoire, clinique) avec des vues adaptées par rôle. Un seul codebase, un design system commun, des features activées par RBAC.

## Localisation

`apps/web/src/features/`

## Architecture

```
apps/web/src/
├── features/
│   ├── auth/                  # Login, MFA, session
│   ├── dashboard/             # Dashboard adaptatif par rôle
│   ├── pharmacy/              # Vue pharmacien
│   ├── doctor/                # Vue médecin
│   ├── lab/                   # Vue laboratoire
│   ├── clinic/                # Vue clinique
│   ├── insurer/               # Portail assureur (même app, rôle différent)
│   └── shared/                # Composants métier partagés (patient lookup, claim history)
├── components/                # Design system (Button, Input, Table, etc.)
├── hooks/                     # useAuth, useRole, useApi, useRealtime
├── lib/
│   ├── api-client.ts          # Fetch wrapper typé
│   ├── auth.ts                # JWT management
│   ├── permissions.ts         # Vérification rôle côté client
│   └── utils.ts
├── routes.tsx                 # React Router avec guards RBAC
└── App.tsx
```

## Routing par rôle

```typescript
// routes.tsx
const routes = [
  // Commun
  { path: '/login', element: <Login /> },
  { path: '/mfa', element: <MFAVerification /> },

  // Dashboard (adaptatif)
  { path: '/', element: <RoleGuard><Dashboard /></RoleGuard> },

  // Pharmacien
  { path: '/pharmacy/*', roles: ['PHARMACIST'], children: [
    { path: 'dispense', element: <PharmacyDispense /> },
    { path: 'history', element: <PharmacyHistory /> },
    { path: 'billing', element: <PharmacyBilling /> },
  ]},

  // Médecin
  { path: '/doctor/*', roles: ['DOCTOR'], children: [
    { path: 'consultations', element: <DoctorConsultations /> },
    { path: 'patients', element: <DoctorPatients /> },
  ]},

  // Labo
  { path: '/lab/*', roles: ['LAB_MANAGER'], children: [
    { path: 'results', element: <LabResults /> },
    { path: 'pending', element: <LabPending /> },
  ]},

  // Clinique
  { path: '/clinic/*', roles: ['CLINIC_ADMIN'], children: [
    { path: 'admissions', element: <ClinicAdmissions /> },
    { path: 'stays', element: <ClinicStays /> },
  ]},

  // Assureur
  { path: '/insurer/*', roles: ['INSURER_ADMIN', 'INSURER_AGENT'], children: [
    { path: 'dashboard', element: <InsurerDashboard /> },
    { path: 'claims', element: <InsurerClaims /> },
    { path: 'providers', element: <InsurerProviders /> },
    { path: 'reconciliation', element: <InsurerReconciliation /> },
    { path: 'fraud-alerts', element: <InsurerFraudAlerts /> },
  ]},
];
```

## Design system

### Tokens

```typescript
// tailwind.config.ts
colors: {
  primary: '#1B365D',      // Navy — confiance, santé
  secondary: '#2AAA8A',    // Vert menthe — validation, santé
  accent: '#F59E0B',       // Ambre — alertes
  danger: '#EF4444',       // Rouge — erreurs, fraude
  surface: '#F8FAFC',      // Fond clair
  muted: '#64748B',        // Texte secondaire
}
```

### Composants UI (packages/ui)

| Composant | Variantes | Usage |
|---|---|---|
| `Button` | primary, secondary, danger, ghost, loading | Actions |
| `Input` | text, number, search, date, password | Formulaires |
| `Select` | single, multi, searchable | Sélection |
| `Card` | default, stat, action | Conteneurs |
| `Table` | sortable, paginated, selectable | Données |
| `Badge` | success, warning, danger, info, neutral | Statuts |
| `Modal` | default, confirm, fullscreen | Dialogues |
| `Sidebar` | collapsible, role-adaptive | Navigation |
| `Toast` | success, error, warning, info | Notifications |
| `Skeleton` | card, table, text | Loading states |

## Vues par profil — Phase 1

### Pharmacien

**Dashboard** :
- KPIs : PEC du jour, nombre de délivrances, montant total, taux de rejet
- Dernières délivrances (5 récentes)
- Alertes (claims en review)

**Délivrance** (`/pharmacy/dispense`) :
1. Recherche adhérent (par ID national ou scan QR)
2. Vérification éligibilité (appel API, résultat en < 1s)
3. Saisie ordonnance (médicaments, quantités, prix)
4. Calcul PEC en live (appel tarification à chaque ajout)
5. Confirmation + signature (OTP adhérent optionnel)
6. Ticket imprimable (récapitulatif PEC / copay)

**Historique** (`/pharmacy/history`) :
- Liste délivrances avec filtres (date, statut, adhérent)
- Détail d'une délivrance
- Export CSV

**Facturation** (`/pharmacy/billing`) :
- Résumé bordereaux en attente
- Historique paiements reçus

### Médecin (Phase 1 = shell basique)

**Dashboard** :
- KPIs : consultations du jour, patients vus
- Prochains rendez-vous (shell, pas encore fonctionnel)

**Patients** (`/doctor/patients`) :
- Recherche patient par nom/ID
- Historique consultations du patient

### Laboratoire (Phase 1 = shell basique)

**Dashboard** :
- KPIs : analyses en attente, résultats envoyés
- Liste résultats récents

### Clinique (Phase 1 = shell basique)

**Dashboard** :
- KPIs : admissions en cours, lits disponibles (shell)
- Liste séjours en cours

### Assureur

**Dashboard** (`/insurer/dashboard`) :
- KPIs temps réel : claims du jour, montant PEC, taux de fraude, nombre prestataires actifs
- Graphiques : évolution claims (7j), répartition par type, top prestataires
- Alertes fraude récentes

**Claims** (`/insurer/claims`) :
- Liste avec filtres (statut, type, prestataire, date, score fraude)
- Détail claim : items, calcul PEC, score fraude, flags
- Actions : approuver, rejeter, demander justificatif

**Réseau prestataires** (`/insurer/providers`) :
- Liste prestataires conventionnés (multi-type)
- Statut : actif, suspendu, en attente
- Détail : infos, historique claims, scoring

**Réconciliation** (`/insurer/reconciliation`) :
- Liste bordereaux générés
- Détail bordereau : prestataires, montants, retenues
- Download PDF
- Action : marquer comme payé

**Alertes fraude** (`/insurer/fraud-alerts`) :
- Liste claims flaggées (score > seuil review)
- Détail : règles déclenchées, evidence, historique adhérent/prestataire
- Actions : confirmer fraude, faux positif, escalader

## État applicatif

```typescript
// TanStack Query pour les données serveur
const { data: claims } = useQuery({
  queryKey: ['claims', filters],
  queryFn: () => apiClient.get('/claims', { params: filters }),
});

// Zustand uniquement pour l'UI
interface UIStore {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  activeModal: string | null;
}
```

## Responsive

- Desktop-first (usage principal en pharmacie/cabinet)
- Breakpoints : `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`
- Sidebar collapsible sur tablette
- Tableaux horizontalement scrollables sur mobile
- Vue délivrance pharmacie optimisée tablette (usage comptoir)
