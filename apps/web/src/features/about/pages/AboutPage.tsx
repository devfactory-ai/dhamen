import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { Role } from "@dhamen/shared";

interface RoleGuide {
  title: string;
  description: string;
  features: string[];
}

const roleGuides: Record<string, RoleGuide> = {
  ADMIN: {
    title: "Administrateur plateforme",
    description:
      "Vous avez un acces complet a la plateforme Dhamen. Vous gerez les utilisateurs, les prestataires, les assureurs et supervisez l'ensemble des operations.",
    features: [
      "Gestion des utilisateurs et des roles",
      "Configuration des prestataires et assureurs",
      "Gestion des entreprises et contrats",
      "Supervision des prises en charge et remboursements",
      "Acces aux rapports et analytics",
      "Configuration de la plateforme",
    ],
  },
  INSURER_ADMIN: {
    title: "Administrateur assureur",
    description:
      "Vous gerez les operations de votre compagnie d'assurance sur Dhamen : adherents, contrats, bulletins de soins et remboursements.",
    features: [
      "Gestion des adherents et ayants droit",
      "Saisie et validation des bulletins de soins",
      "Suivi des remboursements et paiements",
      "Gestion des lots et exports",
      "Reconciliation financiere",
      "Gestion des cartes virtuelles",
    ],
  },
  INSURER_AGENT: {
    title: "Agent assureur",
    description:
      "Vous saisissez et traitez les bulletins de soins des adherents. Vous verifiez l'eligibilite et suivez les remboursements.",
    features: [
      "Recherche et consultation des adherents",
      "Saisie des bulletins de soins",
      "Validation des bulletins",
      "Historique des remboursements",
      "Consultation des contrats",
    ],
  },
  PHARMACIST: {
    title: "Pharmacien",
    description:
      "Vous verifiez l'eligibilite des adherents et soumettez les prises en charge pour les dispensations pharmaceutiques.",
    features: [
      "Verification de l'eligibilite des adherents",
      "Soumission des prises en charge",
      "Verification des cartes virtuelles",
      "Suivi des bordereaux de paiement",
    ],
  },
  DOCTOR: {
    title: "Medecin",
    description:
      "Vous verifiez l'eligibilite des patients et soumettez les prises en charge pour les consultations et actes medicaux.",
    features: [
      "Verification de l'eligibilite des patients",
      "Soumission des prises en charge",
      "Demandes d'accords prealables",
      "Suivi des bordereaux",
    ],
  },
  LAB_MANAGER: {
    title: "Responsable laboratoire",
    description:
      "Vous gerez les prises en charge pour les analyses de laboratoire et suivez les remboursements.",
    features: [
      "Verification de l'eligibilite",
      "Soumission des prises en charge analyses",
      "Suivi des bordereaux",
      "Verification des cartes virtuelles",
    ],
  },
  CLINIC_ADMIN: {
    title: "Administrateur clinique",
    description:
      "Vous gerez les prises en charge hospitalieres et les demandes d'accords prealables pour votre etablissement.",
    features: [
      "Verification de l'eligibilite",
      "Soumission des prises en charge hospitalieres",
      "Demandes d'accords prealables",
      "Suivi des bordereaux",
    ],
  },
  ADHERENT: {
    title: "Adherent",
    description:
      "Vous consultez votre contrat d'assurance, suivez vos remboursements et gerez vos informations personnelles.",
    features: [
      "Consultation de votre contrat et couverture",
      "Suivi de votre consommation",
      "Historique des bulletins de soins",
      "Suivi des remboursements",
      "Gestion de vos ayants droit",
      "Carte virtuelle d'assurance",
      "Recherche de prestataires de sante",
    ],
  },
  HR: {
    title: "Responsable RH",
    description:
      "Vous gerez les adherents de votre entreprise, suivez les contrats et les remboursements de vos collaborateurs.",
    features: [
      "Tableau de bord RH",
      "Gestion des adherents de l'entreprise",
      "Suivi des contrats",
      "Suivi des remboursements",
    ],
  },
};

const defaultGuide: RoleGuide = {
  title: "Utilisateur",
  description: "Bienvenue sur la plateforme Dhamen.",
  features: ["Tableau de bord", "Rapports"],
};

export function AboutPage() {
  const { user } = useAuth();
  const guide = (user?.role && roleGuides[user.role]) || defaultGuide;

  return (
    <div className="space-y-6">
      <PageHeader
        title="A propos de Dhamen"
        description="Plateforme de tiers payant sante pour la Tunisie"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Presentation */}
        <Card>
          <CardHeader>
            <CardTitle>Qu'est-ce que Dhamen ?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">
                Dhamen (&#1590;&#1575;&#1605;&#1606;)
              </strong>{" "}
              est une plateforme digitale de gestion du tiers payant sante en
              Tunisie. Elle connecte les assureurs, les prestataires de sante et
              les adherents pour simplifier le circuit de prise en charge.
            </p>
            <p>
              La plateforme couvre l'ensemble du parcours : verification
              d'eligibilite, saisie des bulletins de soins, calcul des
              remboursements, generation des bordereaux et reconciliation
              financiere.
            </p>
          </CardContent>
        </Card>

        {/* Role-specific guide */}
        <Card>
          <CardHeader>
            <CardTitle>Votre espace : {guide.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{guide.description}</p>
            <div>
              <p className="text-sm font-medium mb-2">
                Fonctionnalites disponibles :
              </p>
              <ul className="space-y-1.5">
                {guide.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className="text-blue-600 mt-0.5">&#8226;</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Glossary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Glossaire</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  term: "Adherent",
                  def: "Personne couverte par un contrat d'assurance sante",
                },
                {
                  term: "Prestataire",
                  def: "Professionnel de sante (pharmacien, medecin, labo, clinique)",
                },
                {
                  term: "PEC",
                  def: "Prise En Charge — montant couvert par l'assureur",
                },
                {
                  term: "Ticket moderateur",
                  def: "Part restant a la charge de l'adherent",
                },
                {
                  term: "Bordereau",
                  def: "Releve periodique des PEC pour paiement assureur vers prestataire",
                },
                {
                  term: "Bulletin de soins",
                  def: "Document detaillant les actes medicaux et montants pour remboursement",
                },
                {
                  term: "Ayant droit",
                  def: "Beneficiaire rattache a l'adherent principal (conjoint, enfant)",
                },
                {
                  term: "Matricule",
                  def: "Identifiant unique de l'adherent dans le systeme",
                },
                {
                  term: "Plafond",
                  def: "Montant maximum de remboursement par periode",
                },
              ].map(({ term, def }) => (
                <div key={term} className="space-y-1">
                  <p className="text-sm font-medium">{term}</p>
                  <p className="text-xs text-muted-foreground">{def}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="text-center text-xs text-muted-foreground pt-4">
        Dhamen v1.0 — Plateforme de tiers payant sante
      </div>
    </div>
  );
}

export default AboutPage;
