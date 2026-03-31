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
      "Vous avez un accès complet à la plateforme E-Santé. Vous gérez les utilisateurs, les praticiens, les assureurs et supervisez l'ensemble des opérations.",
    features: [
      "Gestion des utilisateurs et des roles",
      "Configuration des praticiens et assureurs",
      "Gestion des entreprises et contrats",
      "Supervision des prises en charge et remboursements",
      "Acces aux rapports et analytics",
      "Configuration de la plateforme",
    ],
  },
  INSURER_ADMIN: {
    title: "Administrateur assureur",
    description:
      "Vous gérez les opérations de votre compagnie d'assurance sur E-Santé : adhérents, contrats, bulletins de soins et remboursements.",
    features: [
      "Gestion des adhérents et ayants droit",
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
      "Vous saisissez et traitez les bulletins de soins des adhérents. Vous vérifiez l'éligibilité et suivez les remboursements.",
    features: [
      "Recherche et consultation des adhérents",
      "Saisie des bulletins de soins",
      "Validation des bulletins",
      "Historique des remboursements",
      "Consultation des contrats",
    ],
  },
  PHARMACIST: {
    title: "Pharmacien",
    description:
      "Vous vérifiez l'éligibilité des adhérents et soumettez les prises en charge pour les dispensations pharmaceutiques.",
    features: [
      "Vérification de l'éligibilité des adhérents",
      "Soumission des prises en charge",
      "Verification des cartes virtuelles",
      "Suivi des bordereaux de paiement",
    ],
  },
  DOCTOR: {
    title: "Medecin",
    description:
      "Vous vérifiez l'éligibilité des patients et soumettez les prises en charge pour les consultations et actes médicaux.",
    features: [
      "Vérification de l'éligibilité des patients",
      "Soumission des prises en charge",
      "Demandes d'accords préalables",
      "Suivi des bordereaux",
    ],
  },
  LAB_MANAGER: {
    title: "Responsable laboratoire",
    description:
      "Vous gérez les prises en charge pour les analyses de laboratoire et suivez les remboursements.",
    features: [
      "Vérification de l'éligibilité",
      "Soumission des prises en charge analyses",
      "Suivi des bordereaux",
      "Verification des cartes virtuelles",
    ],
  },
  CLINIC_ADMIN: {
    title: "Administrateur clinique",
    description:
      "Vous gérez les prises en charge hospitalières et les demandes d'accords préalables pour votre établissement.",
    features: [
      "Vérification de l'éligibilité",
      "Soumission des prises en charge hospitalières",
      "Demandes d'accords préalables",
      "Suivi des bordereaux",
    ],
  },
  ADHERENT: {
    title: "Adhérent",
    description:
      "Vous consultez votre contrat d'assurance, suivez vos remboursements et gérez vos informations personnelles.",
    features: [
      "Consultation de votre contrat et couverture",
      "Suivi de votre consommation",
      "Historique des bulletins de soins",
      "Suivi des remboursements",
      "Gestion de vos ayants droit",
      "Carte virtuelle d'assurance",
      "Recherche de praticiens de santé",
    ],
  },
  HR: {
    title: "Responsable RH",
    description:
      "Vous gérez les adhérents de votre entreprise, suivez les contrats et les remboursements de vos collaborateurs.",
    features: [
      "Tableau de bord RH",
      "Gestion des adhérents de l'entreprise",
      "Suivi des contrats",
      "Suivi des remboursements",
    ],
  },
};

const defaultGuide: RoleGuide = {
  title: "Utilisateur",
  description: "Bienvenue sur la plateforme E-Santé.",
  features: ["Tableau de bord", "Rapports"],
};

export function AboutPage() {
  const { user } = useAuth();
  const guide = (user?.role && roleGuides[user.role]) || defaultGuide;

  return (
    <div className="space-y-6">
      <PageHeader
        title="A propos de E-Santé"
        description="Plateforme de tiers payant sante pour la Tunisie"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Presentation */}
        <Card>
          <CardHeader>
            <CardTitle>Qu'est-ce que E-Santé ?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">
                E-Santé
              </strong>{" "}
              est une plateforme digitale de gestion du tiers payant sante en
              Tunisie. Elle connecte les assureurs, les praticiens de santé et
              les adhérents pour simplifier le circuit de prise en charge.
            </p>
            <p>
              La plateforme couvre l'ensemble du parcours : verification
              d'éligibilité, saisie des bulletins de soins, calcul des
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
                Fonctionnalités disponibles :
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
                  term: "Adhérent",
                  def: "Personne couverte par un contrat d'assurance sante",
                },
                {
                  term: "Praticien",
                  def: "Professionnel de santé (médecin, pharmacien, dentiste, labo, clinique)",
                },
                {
                  term: "Bénéficiaire",
                  def: "Personne ayant reçu les soins (adhérent, conjoint ou enfant)",
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
                  def: "Relevé périodique des PEC pour paiement assureur vers praticien",
                },
                {
                  term: "Bulletin de soins",
                  def: "Document détaillant les actes médicaux et montants pour remboursement",
                },
                {
                  term: "Ayant droit",
                  def: "Beneficiaire rattache a l'adherent principal (conjoint, enfant)",
                },
                {
                  term: "Matricule",
                  def: "Identifiant unique de l'adherent dans le système",
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
        E-Santé v1.0 — Plateforme de tiers payant sante
      </div>
    </div>
  );
}

export default AboutPage;
