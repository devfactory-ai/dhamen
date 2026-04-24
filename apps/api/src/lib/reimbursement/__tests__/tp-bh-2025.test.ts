/**
 * TP BH 2025 — 50 test cases from dossier/testCase.md
 * All monetary values in MILLIMES.
 */
import { describe, it, expect } from 'vitest';
import { calculateActe, calculateBulletin } from '../engine';
import type { Contract, Acte, AnnualContext, Beneficiaire, Guarantee } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ben: Beneficiaire = { id: 'ben-001', type: 'adherent', age: 35 };
const child12: Beneficiaire = { id: 'child-001', type: 'child', age: 12 };
const child18: Beneficiaire = { id: 'child-002', type: 'child', age: 18 };
const adult25: Beneficiaire = { id: 'ben-002', type: 'adherent', age: 25 };

function g(overrides: Partial<Guarantee> & { care_type: string }): Guarantee {
  return {
    rate: null,
    annual_ceiling: null,
    per_act_ceiling: null,
    per_day_ceiling: null,
    max_days: null,
    letter_keys: [],
    sub_limits: [],
    requires_prescription: false,
    requires_cnam_complement: false,
    renewal_period: '',
    age_limit: null,
    conditions: '',
    ...overrides,
  };
}

function contract(guarantees: Guarantee[]): Contract {
  return {
    id: 'bh-2025',
    annual_global_limit: 7_000_000,
    carence_days: 0,
    effective_date: '2025-01-01',
    covers_spouse: true,
    covers_children: true,
    children_max_age: 20,
    guarantees,
  };
}

function ctx(totalReimbursed = 0, byCareType: Record<string, number> = {}): AnnualContext {
  return {
    year: 2025,
    byBeneficiaire: totalReimbursed > 0 || Object.keys(byCareType).length > 0
      ? { 'ben-001': { totalReimbursed, byCareType } }
      : {},
  };
}

// ---------------------------------------------------------------------------
// Full TP BH 2025 contract
// ---------------------------------------------------------------------------

const BH_2025 = contract([
  g({ care_type: 'consultation_visite', rate: 85 }),
  g({ care_type: 'pharmacie', rate: 90, annual_ceiling: 1_200_000, requires_prescription: true }),
  g({ care_type: 'laboratoire', letter_keys: [{ key: 'B', value: 270 }, { key: 'P', value: 270 }] }),
  g({ care_type: 'orthopedie', rate: 100, per_act_ceiling: 800_000, requires_prescription: true }),
  g({ care_type: 'chirurgie_refractive', rate: 90, per_act_ceiling: 700_000 }),
  g({ care_type: 'optique', rate: 100, sub_limits: [
    { key: 'monture', value: 300_000 },
    { key: 'verres', value: 250_000 },
    { key: 'lentilles', value: 200_000 },
  ] }),
  g({ care_type: 'hospitalisation', per_day_ceiling: 90_000 }), // clinique
  g({ care_type: 'hospitalisation_hopital', per_day_ceiling: 10_000 }),
  g({ care_type: 'sanatorium', per_day_ceiling: 10_000 }),
  g({ care_type: 'actes_courants', letter_keys: [
    { key: 'PC', value: 1_200 },
    { key: 'AM', value: 1_750 },
    { key: 'AMM', value: 1_750 },
    { key: 'AMY', value: 1_750 },
    { key: 'AMO', value: 1_750 },
    { key: 'K', value: 1_500 },
  ], rate: 90 }), // rate 90% fallback for Z (radiologie)
  g({ care_type: 'chirurgie', letter_keys: [{ key: 'KC', value: 10_000 }] }),
  g({ care_type: 'chirurgie_fso', rate: 90, per_act_ceiling: 400_000 }),
  g({ care_type: 'chirurgie_usage_unique', rate: 100, per_act_ceiling: 200_000 }),
  g({ care_type: 'dentaire', letter_keys: [{ key: 'D', value: 3_000 }], annual_ceiling: 600_000 }),
  g({ care_type: 'dentaire_prothese', letter_keys: [{ key: 'D', value: 4_000 }], annual_ceiling: 700_000 }),
  g({ care_type: 'orthodontie', rate: 100, per_act_ceiling: 400_000, age_limit: 18 }),
  g({ care_type: 'accouchement', rate: 100, per_act_ceiling: 700_000 }),
  g({ care_type: 'accouchement_gemellaire', rate: 100, per_act_ceiling: 800_000 }),
  g({ care_type: 'interruption_grossesse', rate: 100, per_act_ceiling: 180_000 }),
  g({ care_type: 'cures_thermales', per_day_ceiling: 15_000, max_days: 21, requires_prescription: true }),
  g({ care_type: 'frais_funeraires', rate: 100, per_act_ceiling: 150_000 }),
  g({ care_type: 'circoncision', rate: 100, per_act_ceiling: 350_000 }),
  g({ care_type: 'transport', rate: 100, per_act_ceiling: 300_000, requires_prescription: true }),
]);

// ---------------------------------------------------------------------------
// 1. by_rate — Calcul par pourcentage
// ---------------------------------------------------------------------------

describe('by_rate', () => {
  it('TC-01: Consultation généraliste 45 DT → 38.250 DT', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: 45_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(38_250);
  });

  it('TC-02: Consultation spécialiste 80 DT → 68 DT', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: 80_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(68_000);
  });

  it('TC-03: Pharmacie 30 DT → 27 DT', () => {
    const r = calculateActe(
      { care_type: 'pharmacie', montant: 30_000, date: '2025-03-15', has_prescription: true, beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(27_000);
  });

  it('TC-04: Pharmacie — plafond annuel atteint → 0', () => {
    const r = calculateActe(
      { care_type: 'pharmacie', montant: 50_000, date: '2025-03-15', has_prescription: true, beneficiaire: ben },
      BH_2025, ctx(1_200_000, { pharmacie: 1_200_000 }),
    );
    expect(r.montantRembourse).toBe(0);
  });

  it('TC-05: Pharmacie — plafond presque atteint, reste 20 DT → 20 DT', () => {
    const r = calculateActe(
      { care_type: 'pharmacie', montant: 50_000, date: '2025-03-15', has_prescription: true, beneficiaire: ben },
      BH_2025, ctx(1_180_000, { pharmacie: 1_180_000 }),
    );
    expect(r.montantRembourse).toBe(20_000);
  });

  it('TC-06: Orthopédie 1000 DT → plafond 800 DT', () => {
    const r = calculateActe(
      { care_type: 'orthopedie', montant: 1_000_000, date: '2025-03-15', has_prescription: true, beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(800_000);
  });

  it('TC-07: Chirurgie réfractive 1000 DT → min(900, 700) = 700 DT', () => {
    const r = calculateActe(
      { care_type: 'chirurgie_refractive', montant: 1_000_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(700_000);
  });

  it('TC-08: Radiologie (actes_courants) 100 DT → 90 DT', () => {
    // Radiologie uses the rate fallback (90%) since no letter_key provided
    const r = calculateActe(
      { care_type: 'actes_courants', montant: 100_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(90_000);
  });

  it('TC-09: Chirurgie FSO 500 DT → min(450, 400) = 400 DT', () => {
    const r = calculateActe(
      { care_type: 'chirurgie_fso', montant: 500_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(400_000);
  });

  it('TC-10: Chirurgie matériel usage unique 300 DT → min(300, 200) = 200 DT', () => {
    const r = calculateActe(
      { care_type: 'chirurgie_usage_unique', montant: 300_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(200_000);
  });

  it('TC-11: Accouchement simple 1000 DT → 700 DT', () => {
    const r = calculateActe(
      { care_type: 'accouchement', montant: 1_000_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(700_000);
  });

  it('TC-12: Accouchement gémellaire 1000 DT → 800 DT', () => {
    const r = calculateActe(
      { care_type: 'accouchement_gemellaire', montant: 1_000_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(800_000);
  });

  it('TC-13: IVG 300 DT → 180 DT', () => {
    const r = calculateActe(
      { care_type: 'interruption_grossesse', montant: 300_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(180_000);
  });

  it('TC-14: Circoncision 500 DT → 350 DT', () => {
    const r = calculateActe(
      { care_type: 'circoncision', montant: 500_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(350_000);
  });

  it('TC-15: Transport avec ordonnance 500 DT → 300 DT', () => {
    const r = calculateActe(
      { care_type: 'transport', montant: 500_000, date: '2025-03-15', has_prescription: true, beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(300_000);
  });

  it('TC-16: Transport SANS ordonnance → rejet', () => {
    const r = calculateActe(
      { care_type: 'transport', montant: 500_000, date: '2025-03-15', has_prescription: false, beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(0);
    expect(r.rejetRaison).toBe('prescription_required');
  });
});

// ---------------------------------------------------------------------------
// 2. by_letter_key — Coefficient × valeur de lettre-clé
// ---------------------------------------------------------------------------

describe('by_letter_key', () => {
  it('TC-17: Analyses B420, facture 116.100 DT → 113.400 DT', () => {
    const r = calculateActe(
      { care_type: 'laboratoire', letter_key: 'B', coefficient: 420, montant: 116_100, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(113_400);
  });

  it('TC-18: Analyses B100, facture 20 DT → 20 DT (cap by invoice)', () => {
    const r = calculateActe(
      { care_type: 'laboratoire', letter_key: 'B', coefficient: 100, montant: 20_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(20_000);
  });

  it('TC-19: Actes courants PC×2, facture 5 DT → 2.400 DT', () => {
    const r = calculateActe(
      { care_type: 'actes_courants', letter_key: 'PC', coefficient: 2, montant: 5_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(2_400);
  });

  it('TC-20: Actes courants AMM×2, facture 10 DT → 3.500 DT', () => {
    const r = calculateActe(
      { care_type: 'actes_courants', letter_key: 'AMM', coefficient: 2, montant: 10_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(3_500);
  });

  it('TC-21: Actes techniques K×3, facture 15 DT → 4.500 DT', () => {
    const r = calculateActe(
      { care_type: 'actes_courants', letter_key: 'K', coefficient: 3, montant: 15_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(4_500);
  });

  it('TC-22: Chirurgie KC50, facture 1500 DT → 500 DT', () => {
    const r = calculateActe(
      { care_type: 'chirurgie', letter_key: 'KC', coefficient: 50, montant: 1_500_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(500_000);
  });

  it('TC-23: Dentaire soins D×80, facture 300 DT → 240 DT', () => {
    const r = calculateActe(
      { care_type: 'dentaire', letter_key: 'D', coefficient: 80, montant: 300_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(240_000);
  });

  it('TC-24: Dentaire prothèse D×100, facture 500 DT → 400 DT (D=4 DT)', () => {
    const r = calculateActe(
      { care_type: 'dentaire_prothese', letter_key: 'D', coefficient: 100, montant: 500_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(400_000);
  });

  it('TC-25: Dentaire soins — plafond 600 DT atteint → 0', () => {
    const r = calculateActe(
      { care_type: 'dentaire', letter_key: 'D', coefficient: 40, montant: 100_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(600_000, { dentaire: 600_000 }),
    );
    expect(r.montantRembourse).toBe(0);
  });

  it('TC-26: Dentaire prothèse — reste 50 DT sur plafond 700 DT → 50 DT', () => {
    const r = calculateActe(
      { care_type: 'dentaire_prothese', letter_key: 'D', coefficient: 100, montant: 500_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(650_000, { dentaire_prothese: 650_000 }),
    );
    expect(r.montantRembourse).toBe(50_000);
  });
});

// ---------------------------------------------------------------------------
// 3. fixed_daily — Forfait journalier
// ---------------------------------------------------------------------------

describe('fixed_daily', () => {
  it('TC-27: Hospitalisation clinique 5j → 450 DT', () => {
    const r = calculateActe(
      { care_type: 'hospitalisation', jours: 5, montant: 2_000_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(450_000);
  });

  it('TC-28: Hospitalisation hôpital 10j → 100 DT', () => {
    const r = calculateActe(
      { care_type: 'hospitalisation_hopital', jours: 10, montant: 500_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(100_000);
  });

  it('TC-29: Sanatorium 25j → 250 DT', () => {
    const r = calculateActe(
      { care_type: 'sanatorium', jours: 25, montant: 1_000_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(250_000);
  });

  it('TC-30: Cures thermales 10j → 150 DT', () => {
    const r = calculateActe(
      { care_type: 'cures_thermales', jours: 10, montant: 500_000, date: '2025-03-15', has_prescription: true, beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(150_000);
  });

  it('TC-31: Cures thermales 30j → plafonné à 21j → 315 DT', () => {
    const r = calculateActe(
      { care_type: 'cures_thermales', jours: 30, montant: 1_000_000, date: '2025-03-15', has_prescription: true, beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(315_000);
  });
});

// ---------------------------------------------------------------------------
// 4. fixed_amount — Forfait plat
// ---------------------------------------------------------------------------

describe('fixed_amount', () => {
  it('TC-32: Funéraires facture 200 DT → plafond 150 DT', () => {
    const r = calculateActe(
      { care_type: 'frais_funeraires', montant: 200_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(150_000);
  });

  it('TC-33: Funéraires facture 100 DT → 100 DT', () => {
    const r = calculateActe(
      { care_type: 'frais_funeraires', montant: 100_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// 5. Optique — Sous-plafonds
// ---------------------------------------------------------------------------

describe('optique sub_limits', () => {
  it('TC-34: Monture 500 DT → plafond 300 DT', () => {
    const r = calculateActe(
      { care_type: 'optique', sub_limit_key: 'monture', montant: 500_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(300_000);
  });

  it('TC-35: Verres 300 DT → plafond 250 DT', () => {
    const r = calculateActe(
      { care_type: 'optique', sub_limit_key: 'verres', montant: 300_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(250_000);
  });

  it('TC-36: Lentilles 250 DT → plafond 200 DT', () => {
    const r = calculateActe(
      { care_type: 'optique', sub_limit_key: 'lentilles', montant: 250_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(200_000);
  });

  it('TC-37: Pack monture + verres → 300 + 250 = 550 DT', () => {
    const actes: Acte[] = [
      { care_type: 'optique', sub_limit_key: 'monture', montant: 400_000, date: '2025-03-15', beneficiaire: ben },
      { care_type: 'optique', sub_limit_key: 'verres', montant: 300_000, date: '2025-03-15', beneficiaire: ben },
    ];
    const r = calculateBulletin(actes, BH_2025, ctx());
    expect(r.totalRembourse).toBe(550_000);
  });
});

// ---------------------------------------------------------------------------
// 6. Conditions d'éligibilité
// ---------------------------------------------------------------------------

describe('eligibility', () => {
  it('TC-38: ODF enfant 12 ans → 400 DT', () => {
    const r = calculateActe(
      { care_type: 'orthodontie', montant: 600_000, date: '2025-03-15', beneficiaire: child12 },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(400_000);
  });

  it('TC-39: ODF enfant 18 ans exactement → rejet (< 18 strict)', () => {
    const r = calculateActe(
      { care_type: 'orthodontie', montant: 600_000, date: '2025-03-15', beneficiaire: child18 },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(0);
  });

  it('TC-40: ODF adulte 25 ans → rejet', () => {
    const r = calculateActe(
      { care_type: 'orthodontie', montant: 600_000, date: '2025-03-15', beneficiaire: adult25 },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(0);
  });

  it('TC-41: Pharmacie sans ordonnance → rejet', () => {
    const r = calculateActe(
      { care_type: 'pharmacie', montant: 30_000, date: '2025-03-15', has_prescription: false, beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(0);
    expect(r.rejetRaison).toBe('prescription_required');
  });
});

// ---------------------------------------------------------------------------
// 7. Plafond global 7 000 DT
// ---------------------------------------------------------------------------

describe('global annual ceiling', () => {
  it('TC-42: Global largement dispo → pas de cap', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: 45_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(100_000),
    );
    expect(r.montantRembourse).toBe(38_250);
  });

  it('TC-43: Global presque atteint (reste 100 DT) → pas de cap', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: 45_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(6_900_000),
    );
    expect(r.montantRembourse).toBe(38_250);
  });

  it('TC-44: Global presque atteint (reste 10 DT) → cap 10 DT', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: 45_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(6_990_000),
    );
    expect(r.montantRembourse).toBe(10_000);
  });

  it('TC-45: Global totalement atteint → 0', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: 45_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(7_000_000),
    );
    expect(r.montantRembourse).toBe(0);
  });

  it('TC-46: Global dépassé (incohérence DB) → 0', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: 45_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(7_500_000),
    );
    expect(r.montantRembourse).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('TC-47: Facture 0 → 0', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: 0, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(0);
  });

  it('TC-48: Facture négative → rejet (validation)', () => {
    const r = calculateActe(
      { care_type: 'consultation_visite', montant: -100, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(0);
    expect(r.rejetRaison).toBe('invalid_negative_amount');
  });

  it('TC-49: Coefficient 0 → 0', () => {
    const r = calculateActe(
      { care_type: 'laboratoire', letter_key: 'B', coefficient: 0, montant: 50_000, date: '2025-03-15', beneficiaire: ben },
      BH_2025, ctx(),
    );
    expect(r.montantRembourse).toBe(0);
  });

  it('TC-50: Bulletin multi-lignes (cas MAAOUI)', () => {
    const actes: Acte[] = [
      { care_type: 'consultation_visite', montant: 45_000, date: '2025-03-15', beneficiaire: ben },
      { care_type: 'pharmacie', montant: 29_502, date: '2025-03-15', has_prescription: true, beneficiaire: ben },
      { care_type: 'actes_courants', montant: 100_000, date: '2025-03-15', beneficiaire: ben }, // radiologie 90%
      { care_type: 'laboratoire', letter_key: 'B', coefficient: 420, montant: 116_100, date: '2025-03-15', beneficiaire: ben },
    ];
    const r = calculateBulletin(actes, BH_2025, ctx());

    expect(r.actes[0]!.montantRembourse).toBe(38_250);  // 45000 × 85%
    expect(r.actes[1]!.montantRembourse).toBe(26_552);   // 29502 × 90%
    expect(r.actes[2]!.montantRembourse).toBe(90_000);   // 100000 × 90%
    expect(r.actes[3]!.montantRembourse).toBe(113_400);  // 420 × 270
    expect(r.totalRembourse).toBe(268_202);
  });
});
