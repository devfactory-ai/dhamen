/**
 * SoinFlow Eligibility Rules Tests
 */
import { describe, it, expect } from 'vitest';
import {
  checkAdherentStatus,
  checkFormuleValidity,
  checkTypeSoinCoverage,
  checkPlafonds,
  checkPraticienNetwork,
  buildPlafondsInfo,
  evaluateSanteEligibility,
} from './sante-eligibility.rules';
import type {
  AdherentRow,
  FormuleRow,
  PraticienRow,
  PlafondConsommeRow,
} from './sante-eligibility.types';

describe('SoinFlow Eligibility Rules', () => {
  // ==========================================================================
  // checkAdherentStatus
  // ==========================================================================
  describe('checkAdherentStatus', () => {
    it('should return error if adherent is null', () => {
      const raisons = checkAdherentStatus(null);

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'ADHERENT_NON_TROUVE',
        severite: 'erreur',
      });
    });

    it('should return error if adherent is inactive', () => {
      const adherent: AdherentRow = {
        id: '1',
        first_name: 'Ahmed',
        last_name: 'Ben Ali',
        date_of_birth: '1985-01-15',
        matricule: 'MAT001',
        formule_id: 'f1',
        plafond_global: 5000,
        is_active: 0,
      };

      const raisons = checkAdherentStatus(adherent);

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'ADHERENT_INACTIF',
        severite: 'erreur',
      });
    });

    it('should return info if adherent is active', () => {
      const adherent: AdherentRow = {
        id: '1',
        first_name: 'Ahmed',
        last_name: 'Ben Ali',
        date_of_birth: '1985-01-15',
        matricule: 'MAT001',
        formule_id: 'f1',
        plafond_global: 5000,
        is_active: 1,
      };

      const raisons = checkAdherentStatus(adherent);

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'ADHERENT_ACTIF',
        severite: 'info',
      });
    });
  });

  // ==========================================================================
  // checkFormuleValidity
  // ==========================================================================
  describe('checkFormuleValidity', () => {
    it('should return error if formule is null', () => {
      const raisons = checkFormuleValidity(null, '2024-06-15');

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'FORMULE_NON_TROUVEE',
        severite: 'erreur',
      });
    });

    it('should return error if formule is inactive', () => {
      const formule: FormuleRow = {
        id: 'f1',
        code: 'FORMULE_A',
        nom: 'Formule A',
        description: 'Test',
        taux_couverture_json: '{}',
        plafonds_json: '{}',
        plafond_global: 5000,
        tarif_mensuel: 100,
        is_active: 0,
        effective_from: '2024-01-01',
        effective_to: null,
      };

      const raisons = checkFormuleValidity(formule, '2024-06-15');

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'FORMULE_EXPIREE',
        severite: 'erreur',
      });
    });

    it('should return error if date soin is before effective date', () => {
      const formule: FormuleRow = {
        id: 'f1',
        code: 'FORMULE_A',
        nom: 'Formule A',
        description: null,
        taux_couverture_json: '{}',
        plafonds_json: '{}',
        plafond_global: 5000,
        tarif_mensuel: 100,
        is_active: 1,
        effective_from: '2024-06-01',
        effective_to: null,
      };

      const raisons = checkFormuleValidity(formule, '2024-05-15');

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'FORMULE_EXPIREE',
        severite: 'erreur',
      });
    });

    it('should return info if formule is valid', () => {
      const formule: FormuleRow = {
        id: 'f1',
        code: 'FORMULE_A',
        nom: 'Formule A',
        description: null,
        taux_couverture_json: '{}',
        plafonds_json: '{}',
        plafond_global: 5000,
        tarif_mensuel: 100,
        is_active: 1,
        effective_from: '2024-01-01',
        effective_to: '2024-12-31',
      };

      const raisons = checkFormuleValidity(formule, '2024-06-15');

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'FORMULE_VALIDE',
        severite: 'info',
      });
    });
  });

  // ==========================================================================
  // checkTypeSoinCoverage
  // ==========================================================================
  describe('checkTypeSoinCoverage', () => {
    it('should return empty if formule is null', () => {
      const raisons = checkTypeSoinCoverage(null, 'consultation');
      expect(raisons).toHaveLength(0);
    });

    it('should return error if type soin is not covered', () => {
      const formule: FormuleRow = {
        id: 'f1',
        code: 'FORMULE_A',
        nom: 'Formule A',
        description: null,
        taux_couverture_json: JSON.stringify({ pharmacie: 80, consultation: 0 }),
        plafonds_json: '{}',
        plafond_global: 5000,
        tarif_mensuel: 100,
        is_active: 1,
        effective_from: '2024-01-01',
        effective_to: null,
      };

      const raisons = checkTypeSoinCoverage(formule, 'consultation');

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'TYPE_SOIN_NON_COUVERT',
        severite: 'erreur',
      });
    });

    it('should return info if type soin is covered', () => {
      const formule: FormuleRow = {
        id: 'f1',
        code: 'FORMULE_A',
        nom: 'Formule A',
        description: null,
        taux_couverture_json: JSON.stringify({ pharmacie: 80, consultation: 70 }),
        plafonds_json: '{}',
        plafond_global: 5000,
        tarif_mensuel: 100,
        is_active: 1,
        effective_from: '2024-01-01',
        effective_to: null,
      };

      const raisons = checkTypeSoinCoverage(formule, 'consultation');

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'TYPE_SOIN_COUVERT',
        severite: 'info',
      });
      expect(raisons[0]?.details).toMatchObject({
        tauxCouverture: 70,
      });
    });
  });

  // ==========================================================================
  // checkPlafonds
  // ==========================================================================
  describe('checkPlafonds', () => {
    const formule: FormuleRow = {
      id: 'f1',
      code: 'FORMULE_A',
      nom: 'Formule A',
      description: null,
      taux_couverture_json: JSON.stringify({ pharmacie: 80 }),
      plafonds_json: JSON.stringify({ pharmacie: 2000 }),
      plafond_global: 5000,
      tarif_mensuel: 100,
      is_active: 1,
      effective_from: '2024-01-01',
      effective_to: null,
    };

    it('should return empty if formule is null', () => {
      const result = checkPlafonds(null, 'pharmacie', 500, []);
      expect(result.raisons).toHaveLength(0);
      expect(result.plafondRestant).toBe(0);
    });

    it('should return error if plafond is exhausted', () => {
      const plafonds: PlafondConsommeRow[] = [
        {
          id: 'p1',
          adherent_id: 'a1',
          annee: 2024,
          type_soin: 'pharmacie',
          montant_consomme: 2000,
          montant_plafond: 2000,
        },
      ];

      const result = checkPlafonds(formule, 'pharmacie', 500, plafonds);

      expect(result.raisons).toHaveLength(1);
      expect(result.raisons[0]).toMatchObject({
        code: 'PLAFOND_ATTEINT',
        severite: 'erreur',
      });
      expect(result.plafondRestant).toBe(0);
      expect(result.montantMaxCouvert).toBe(0);
    });

    it('should return warning if partial coverage available', () => {
      const plafonds: PlafondConsommeRow[] = [
        {
          id: 'p1',
          adherent_id: 'a1',
          annee: 2024,
          type_soin: 'pharmacie',
          montant_consomme: 1800,
          montant_plafond: 2000,
        },
      ];

      const result = checkPlafonds(formule, 'pharmacie', 500, plafonds);

      expect(result.raisons).toHaveLength(1);
      expect(result.raisons[0]).toMatchObject({
        code: 'PLAFOND_PARTIEL',
        severite: 'avertissement',
      });
      expect(result.plafondRestant).toBe(200);
      expect(result.montantMaxCouvert).toBe(200);
    });

    it('should return info if full coverage available', () => {
      const plafonds: PlafondConsommeRow[] = [
        {
          id: 'p1',
          adherent_id: 'a1',
          annee: 2024,
          type_soin: 'pharmacie',
          montant_consomme: 500,
          montant_plafond: 2000,
        },
      ];

      const result = checkPlafonds(formule, 'pharmacie', 300, plafonds);

      expect(result.raisons).toHaveLength(1);
      expect(result.raisons[0]).toMatchObject({
        code: 'PLAFOND_DISPONIBLE',
        severite: 'info',
      });
      expect(result.plafondRestant).toBe(1500);
      expect(result.montantMaxCouvert).toBe(300);
    });
  });

  // ==========================================================================
  // checkPraticienNetwork
  // ==========================================================================
  describe('checkPraticienNetwork', () => {
    it('should return empty if praticien is null', () => {
      const raisons = checkPraticienNetwork(null);
      expect(raisons).toHaveLength(0);
    });

    it('should return warning if praticien is inactive', () => {
      const praticien: PraticienRow = {
        id: 'p1',
        nom: 'Dr. Ben Salem',
        prenom: 'Mohamed',
        specialite: 'generaliste',
        est_conventionne: 1,
        is_active: 0,
      };

      const raisons = checkPraticienNetwork(praticien);

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'PRATICIEN_NON_CONVENTIONNE',
        severite: 'avertissement',
      });
    });

    it('should return info if praticien is conventionné', () => {
      const praticien: PraticienRow = {
        id: 'p1',
        nom: 'Dr. Ben Salem',
        prenom: 'Mohamed',
        specialite: 'generaliste',
        est_conventionne: 1,
        is_active: 1,
      };

      const raisons = checkPraticienNetwork(praticien);

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'PRATICIEN_CONVENTIONNE',
        severite: 'info',
      });
    });

    it('should return warning if praticien is not conventionné', () => {
      const praticien: PraticienRow = {
        id: 'p1',
        nom: 'Dr. Ben Salem',
        prenom: null,
        specialite: 'generaliste',
        est_conventionne: 0,
        is_active: 1,
      };

      const raisons = checkPraticienNetwork(praticien);

      expect(raisons).toHaveLength(1);
      expect(raisons[0]).toMatchObject({
        code: 'PRATICIEN_NON_CONVENTIONNE',
        severite: 'avertissement',
      });
    });
  });

  // ==========================================================================
  // evaluateSanteEligibility
  // ==========================================================================
  describe('evaluateSanteEligibility', () => {
    it('should return eligible with 100% confidence if no errors', () => {
      const raisons = [
        { code: 'ADHERENT_ACTIF' as const, message: 'OK', severite: 'info' as const },
        { code: 'FORMULE_VALIDE' as const, message: 'OK', severite: 'info' as const },
      ];

      const result = evaluateSanteEligibility(raisons);

      expect(result.eligible).toBe(true);
      expect(result.scoreConfiance).toBe(100);
    });

    it('should return not eligible with 0% confidence if errors present', () => {
      const raisons = [
        { code: 'ADHERENT_NON_TROUVE' as const, message: 'Not found', severite: 'erreur' as const },
      ];

      const result = evaluateSanteEligibility(raisons);

      expect(result.eligible).toBe(false);
      expect(result.scoreConfiance).toBe(0);
    });

    it('should return eligible with 80% confidence if warnings present', () => {
      const raisons = [
        { code: 'ADHERENT_ACTIF' as const, message: 'OK', severite: 'info' as const },
        {
          code: 'PRATICIEN_NON_CONVENTIONNE' as const,
          message: 'Warning',
          severite: 'avertissement' as const,
        },
      ];

      const result = evaluateSanteEligibility(raisons);

      expect(result.eligible).toBe(true);
      expect(result.scoreConfiance).toBe(80);
    });
  });

  // ==========================================================================
  // buildPlafondsInfo
  // ==========================================================================
  describe('buildPlafondsInfo', () => {
    it('should return empty if formule is null', () => {
      const result = buildPlafondsInfo(null, []);
      expect(result).toHaveLength(0);
    });

    it('should build plafonds info correctly', () => {
      const formule: FormuleRow = {
        id: 'f1',
        code: 'FORMULE_A',
        nom: 'Formule A',
        description: null,
        taux_couverture_json: '{}',
        plafonds_json: JSON.stringify({ pharmacie: 2000, consultation: 1500 }),
        plafond_global: 5000,
        tarif_mensuel: 100,
        is_active: 1,
        effective_from: '2024-01-01',
        effective_to: null,
      };

      const plafonds: PlafondConsommeRow[] = [
        {
          id: 'p1',
          adherent_id: 'a1',
          annee: 2024,
          type_soin: 'pharmacie',
          montant_consomme: 500,
          montant_plafond: 2000,
        },
        {
          id: 'p2',
          adherent_id: 'a1',
          annee: 2024,
          type_soin: 'global',
          montant_consomme: 1000,
          montant_plafond: 5000,
        },
      ];

      const result = buildPlafondsInfo(formule, plafonds);

      // Should have pharmacie, consultation (from formule), and global
      expect(result.length).toBeGreaterThanOrEqual(2);

      const pharmacieInfo = result.find((p) => p.typeSoin === 'pharmacie');
      expect(pharmacieInfo).toBeDefined();
      expect(pharmacieInfo?.montantConsomme).toBe(500);
      expect(pharmacieInfo?.montantRestant).toBe(1500);
      expect(pharmacieInfo?.pourcentageUtilise).toBe(25);

      const globalInfo = result.find((p) => p.typeSoin === 'global');
      expect(globalInfo).toBeDefined();
      expect(globalInfo?.montantConsomme).toBe(1000);
      expect(globalInfo?.montantRestant).toBe(4000);
      expect(globalInfo?.pourcentageUtilise).toBe(20);
    });
  });
});
