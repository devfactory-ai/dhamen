/**
 * CNAM Integration Service
 *
 * Integration with Tunisia's National Health Insurance Fund (CNAM)
 * Caisse Nationale d'Assurance Maladie
 */
import type { Bindings } from '../types';
import { generateId } from '../lib/ulid';

export interface CNAMAffiliate {
  matriculeCNAM: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  regimeCNAM: 'CNSS' | 'CNRPS' | 'AUTRE';
  statutAffiliation: 'ACTIF' | 'INACTIF' | 'SUSPENDU';
  dateAffiliation: string;
  dateFinDroits?: string;
  ayantsDroit: CNAMAyantDroit[];
  couverture: CNAMCouverture;
}

export interface CNAMAyantDroit {
  type: 'CONJOINT' | 'ENFANT' | 'ASCENDANT';
  nom: string;
  prenom: string;
  dateNaissance: string;
  estCouvert: boolean;
}

export interface CNAMCouverture {
  regimeBase: boolean;
  regimeComplementaire: boolean;
  plafondAnnuel: number;
  consommationAnnuelle: number;
  tauxRemboursementBase: number;
  actesCouvertsALD?: string[]; // Affections Longue Durée
}

export interface CNAMPrestationRequest {
  matriculeAssure: string;
  matriculePrestataire: string;
  datePrestation: string;
  typePrestation: 'CONSULTATION' | 'PHARMACIE' | 'ANALYSE' | 'HOSPITALISATION' | 'AUTRES';
  actes: CNAMActe[];
  montantTotal: number;
}

export interface CNAMActe {
  codeActe: string;
  libelleActe: string;
  quantite: number;
  prixUnitaire: number;
  montantTotal: number;
}

export interface CNAMPrestationResponse {
  numeroPEC: string;
  dateValidite: string;
  montantPrisEnCharge: number;
  montantTicketModerateur: number;
  tauxRemboursement: number;
  statut: 'ACCEPTEE' | 'REFUSEE' | 'EN_ATTENTE';
  motifRefus?: string;
  codeRetour: string;
  messageRetour: string;
}

export interface CNAMRechercheAffilie {
  matricule?: string;
  cin?: string;
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
}

export class CNAMService {
  private apiBaseUrl: string;
  private apiKey: string;

  constructor(private env: Bindings) {
    // In production, these would come from environment variables
    this.apiBaseUrl = env.CNAM_API_URL || 'https://api.cnam.nat.tn/v1';
    this.apiKey = env.CNAM_API_KEY || 'demo-key';
  }

  /**
   * Verify affiliate status with CNAM
   */
  async verifyAffiliate(matricule: string): Promise<CNAMAffiliate | null> {
    const requestId = generateId('CNAM');

    try {
      // In production, make actual API call to CNAM
      // const response = await fetch(`${this.apiBaseUrl}/affilies/${matricule}`, {
      //   headers: {
      //     'Authorization': `Bearer ${this.apiKey}`,
      //     'X-Request-ID': requestId,
      //   },
      // });

      // Mock response for demo
      if (!matricule || matricule.length < 8) {
        return null;
      }

      // Simulate CNAM lookup
      const mockAffiliate: CNAMAffiliate = {
        matriculeCNAM: matricule,
        nom: 'BEN ALI',
        prenom: 'Mohamed',
        dateNaissance: '1985-03-15',
        regimeCNAM: 'CNSS',
        statutAffiliation: 'ACTIF',
        dateAffiliation: '2010-01-01',
        ayantsDroit: [
          {
            type: 'CONJOINT',
            nom: 'BEN ALI',
            prenom: 'Fatma',
            dateNaissance: '1988-07-22',
            estCouvert: true,
          },
          {
            type: 'ENFANT',
            nom: 'BEN ALI',
            prenom: 'Ahmed',
            dateNaissance: '2015-09-10',
            estCouvert: true,
          },
        ],
        couverture: {
          regimeBase: true,
          regimeComplementaire: false,
          plafondAnnuel: 5000000, // 5000 TND
          consommationAnnuelle: 1250000, // 1250 TND
          tauxRemboursementBase: 70,
        },
      };

      return mockAffiliate;
    } catch (error) {
      console.error('CNAM verification error:', error);
      throw new Error('Erreur de communication avec la CNAM');
    }
  }

  /**
   * Search for affiliate by various criteria
   */
  async searchAffiliate(criteria: CNAMRechercheAffilie): Promise<CNAMAffiliate[]> {
    const requestId = generateId('CNAM');

    try {
      // In production, make actual API call
      // Mock search results
      const results: CNAMAffiliate[] = [];

      if (criteria.matricule) {
        const affiliate = await this.verifyAffiliate(criteria.matricule);
        if (affiliate) {
          results.push(affiliate);
        }
      }

      return results;
    } catch (error) {
      console.error('CNAM search error:', error);
      throw new Error('Erreur de recherche CNAM');
    }
  }

  /**
   * Request authorization for care (PEC - Prise En Charge)
   */
  async requestPEC(request: CNAMPrestationRequest): Promise<CNAMPrestationResponse> {
    const requestId = generateId('PEC');

    try {
      // Validate affiliate first
      const affiliate = await this.verifyAffiliate(request.matriculeAssure);

      if (!affiliate) {
        return {
          numeroPEC: '',
          dateValidite: '',
          montantPrisEnCharge: 0,
          montantTicketModerateur: request.montantTotal,
          tauxRemboursement: 0,
          statut: 'REFUSEE',
          motifRefus: 'Assuré non trouvé dans le fichier CNAM',
          codeRetour: 'ERR_001',
          messageRetour: 'Matricule invalide ou assuré non affilié',
        };
      }

      if (affiliate.statutAffiliation !== 'ACTIF') {
        return {
          numeroPEC: '',
          dateValidite: '',
          montantPrisEnCharge: 0,
          montantTicketModerateur: request.montantTotal,
          tauxRemboursement: 0,
          statut: 'REFUSEE',
          motifRefus: `Affiliation ${affiliate.statutAffiliation.toLowerCase()}`,
          codeRetour: 'ERR_002',
          messageRetour: 'Droits suspendus ou inactifs',
        };
      }

      // Check coverage limits
      const restantPlafond = affiliate.couverture.plafondAnnuel - affiliate.couverture.consommationAnnuelle;

      if (restantPlafond <= 0) {
        return {
          numeroPEC: '',
          dateValidite: '',
          montantPrisEnCharge: 0,
          montantTicketModerateur: request.montantTotal,
          tauxRemboursement: 0,
          statut: 'REFUSEE',
          motifRefus: 'Plafond annuel atteint',
          codeRetour: 'ERR_003',
          messageRetour: 'Plafond de couverture épuisé pour l\'année en cours',
        };
      }

      // Calculate coverage
      const tauxRemboursement = affiliate.couverture.tauxRemboursementBase;
      let montantPrisEnCharge = Math.floor(request.montantTotal * (tauxRemboursement / 100));

      // Cap at remaining limit
      if (montantPrisEnCharge > restantPlafond) {
        montantPrisEnCharge = restantPlafond;
      }

      const montantTicketModerateur = request.montantTotal - montantPrisEnCharge;

      // Generate PEC number
      const numeroPEC = `PEC-${new Date().getFullYear()}-${requestId.slice(-8)}`;
      const dateValidite = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      return {
        numeroPEC,
        dateValidite,
        montantPrisEnCharge,
        montantTicketModerateur,
        tauxRemboursement,
        statut: 'ACCEPTEE',
        codeRetour: 'OK',
        messageRetour: 'Prise en charge accordée',
      };
    } catch (error) {
      console.error('CNAM PEC error:', error);
      return {
        numeroPEC: '',
        dateValidite: '',
        montantPrisEnCharge: 0,
        montantTicketModerateur: request.montantTotal,
        tauxRemboursement: 0,
        statut: 'REFUSEE',
        motifRefus: 'Erreur technique',
        codeRetour: 'ERR_999',
        messageRetour: 'Erreur de communication avec la CNAM',
      };
    }
  }

  /**
   * Get tarification for an act (NGAP/CCAM codes)
   */
  async getTarif(codeActe: string): Promise<{
    code: string;
    libelle: string;
    tarifConventionne: number;
    tarifRemboursement: number;
    coefficientK?: number;
  } | null> {
    // Mock tarification data
    const tarifs: Record<string, { libelle: string; tarif: number; coef?: number }> = {
      'C': { libelle: 'Consultation', tarif: 25000 },
      'CS': { libelle: 'Consultation Spécialiste', tarif: 45000 },
      'V': { libelle: 'Visite à domicile', tarif: 35000 },
      'K': { libelle: 'Acte chirurgical (coef)', tarif: 2300, coef: 1 },
      'KC': { libelle: 'Chirurgie', tarif: 2300, coef: 1 },
      'B': { libelle: 'Biologie', tarif: 270 },
      'AMI': { libelle: 'Acte infirmier', tarif: 3150 },
      'AMK': { libelle: 'Acte de kinésithérapie', tarif: 2100 },
    };

    const acte = tarifs[codeActe.toUpperCase()];
    if (!acte) {
      return null;
    }

    return {
      code: codeActe.toUpperCase(),
      libelle: acte.libelle,
      tarifConventionne: acte.tarif,
      tarifRemboursement: Math.floor(acte.tarif * 0.7), // 70% base
      coefficientK: acte.coef,
    };
  }

  /**
   * Submit reimbursement claim to CNAM
   */
  async submitClaim(data: {
    numeroPEC: string;
    matriculeAssure: string;
    actes: CNAMActe[];
    montantTotal: number;
    justificatifs?: string[];
  }): Promise<{
    numeroRemboursement: string;
    statut: 'SOUMIS' | 'EN_TRAITEMENT' | 'REMBOURSE' | 'REJETE';
    montantRembourse?: number;
    dateTraitement?: string;
    message: string;
  }> {
    const claimId = generateId('RMB');

    // In production, submit to CNAM API
    return {
      numeroRemboursement: `RMB-${new Date().getFullYear()}-${claimId.slice(-8)}`,
      statut: 'SOUMIS',
      message: 'Demande de remboursement soumise avec succès. Délai de traitement: 5-7 jours ouvrables.',
    };
  }

  /**
   * Get list of contracted healthcare providers
   */
  async getProvidersConventionnes(params: {
    region?: string;
    specialite?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    providers: Array<{
      matricule: string;
      nom: string;
      adresse: string;
      region: string;
      specialite?: string;
      type: string;
      conventionneCNAM: boolean;
    }>;
    total: number;
  }> {
    // Mock data
    const providers = [
      {
        matricule: 'PRV-001',
        nom: 'Pharmacie Centrale',
        adresse: 'Avenue Habib Bourguiba, Tunis',
        region: 'Tunis',
        type: 'PHARMACIE',
        conventionneCNAM: true,
      },
      {
        matricule: 'PRV-002',
        nom: 'Dr. Ahmed Mrad',
        adresse: 'Rue de la Liberté, Sfax',
        region: 'Sfax',
        specialite: 'Médecine Générale',
        type: 'MEDECIN',
        conventionneCNAM: true,
      },
      {
        matricule: 'PRV-003',
        nom: 'Laboratoire Bio-Test',
        adresse: 'Centre Urbain Nord, Tunis',
        region: 'Tunis',
        type: 'LABORATOIRE',
        conventionneCNAM: true,
      },
    ];

    return {
      providers,
      total: providers.length,
    };
  }

  /**
   * Check if a medication is on the CNAM formulary
   */
  async checkMedicament(codeDCI: string): Promise<{
    estRembourse: boolean;
    tauxRemboursement: number;
    prixReference: number;
    conditions?: string;
  } | null> {
    // Mock medication lookup
    const medicaments: Record<string, { taux: number; prix: number; conditions?: string }> = {
      'PARACETAMOL': { taux: 65, prix: 2500 },
      'AMOXICILLINE': { taux: 65, prix: 8500 },
      'OMEPRAZOLE': { taux: 65, prix: 12000 },
      'METFORMINE': { taux: 100, prix: 15000, conditions: 'Diabète' },
      'INSULINE': { taux: 100, prix: 45000, conditions: 'Diabète' },
      'ATORVASTATINE': { taux: 65, prix: 25000 },
    };

    const med = medicaments[codeDCI.toUpperCase()];
    if (!med) {
      return null;
    }

    return {
      estRembourse: true,
      tauxRemboursement: med.taux,
      prixReference: med.prix,
      conditions: med.conditions,
    };
  }
}
