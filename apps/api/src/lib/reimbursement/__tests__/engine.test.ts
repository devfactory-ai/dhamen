import { describe, it, expect } from 'vitest';
import { calculateActe, calculateBulletin } from '../engine';
import { MissingLetterKeyError, NoGuaranteeError } from '../types';
import type { Contract, Acte, AnnualContext, Beneficiaire } from '../types';

// ---------------------------------------------------------------------------
// Setup — reference contract (TP 2025 style)
// ---------------------------------------------------------------------------

const defaultBeneficiaire: Beneficiaire = {
  id: 'ben-001',
  type: 'adherent',
  age: 35,
};

function makeContract(overrides?: Partial<Contract>): Contract {
  return {
    id: 'contract-001',
    annual_global_limit: 7_000_000, // 7 000 DT
    carence_days: 0,
    effective_date: '2025-01-01',
    covers_spouse: true,
    covers_children: true,
    children_max_age: 20,
    guarantees: [
      {
        care_type: 'consultation_visite',
        rate: 85,
        letter_keys: [],
        sub_limits: [],
        annual_ceiling: null,
        per_act_ceiling: null,
        per_day_ceiling: null,
        requires_prescription: false,
        max_days: null,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: null,
        conditions: '',
      },
      {
        care_type: 'pharmacie',
        rate: 90,
        letter_keys: [],
        sub_limits: [],
        annual_ceiling: 1_200_000, // 1 200 DT
        per_act_ceiling: null,
        per_day_ceiling: null,
        requires_prescription: true,
        max_days: null,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: null,
        conditions: '',
      },
      {
        care_type: 'laboratoire',
        rate: null,
        letter_keys: [{ key: 'B', value: 270 }], // 0.270 DT per B unit
        sub_limits: [],
        annual_ceiling: null,
        per_act_ceiling: null,
        per_day_ceiling: null,
        requires_prescription: false,
        max_days: null,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: null,
        conditions: '',
      },
      {
        care_type: 'chirurgie',
        rate: null,
        letter_keys: [{ key: 'KC', value: 10_000 }], // 10 DT per KC
        sub_limits: [],
        annual_ceiling: null,
        per_act_ceiling: null,
        per_day_ceiling: null,
        requires_prescription: false,
        max_days: null,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: null,
        conditions: '',
      },
      {
        care_type: 'hospitalisation',
        rate: null,
        letter_keys: [],
        sub_limits: [],
        annual_ceiling: null,
        per_act_ceiling: null,
        per_day_ceiling: 90_000, // 90 DT/jour clinique
        requires_prescription: false,
        max_days: null,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: null,
        conditions: '',
      },
      {
        care_type: 'dentaire',
        rate: null,
        letter_keys: [{ key: 'D', value: 3_000 }], // 3 DT
        sub_limits: [],
        annual_ceiling: 600_000, // 600 DT/an
        per_act_ceiling: null,
        per_day_ceiling: null,
        requires_prescription: false,
        max_days: null,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: null,
        conditions: '',
      },
      {
        care_type: 'orthodontie',
        rate: 100,
        letter_keys: [],
        sub_limits: [],
        annual_ceiling: null,
        per_act_ceiling: 400_000, // 400 DT
        per_day_ceiling: null,
        requires_prescription: false,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: 18,
        conditions: '',
      },
      {
        care_type: 'optique',
        rate: 100,
        letter_keys: [],
        sub_limits: [
          { key: 'monture', value: 300_000 },
          { key: 'verres', value: 250_000 },
          { key: 'lentilles', value: 200_000 },
        ],
        annual_ceiling: null,
        per_act_ceiling: null,
        per_day_ceiling: null,
        requires_prescription: false,
        max_days: null,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: null,
        conditions: '',
      },
      {
        care_type: 'transport',
        rate: 100,
        letter_keys: [],
        sub_limits: [],
        annual_ceiling: null,
        per_act_ceiling: 300_000,
        per_day_ceiling: null,
        requires_prescription: false,
        max_days: null,
        requires_cnam_complement: false,
        renewal_period: '',
        age_limit: null,
        conditions: '',
      },
    ],
    ...overrides,
  };
}

function emptyContext(): AnnualContext {
  return { year: 2025, byBeneficiaire: {} };
}

function contextWithUsage(
  benId: string,
  totalReimbursed: number,
  byCareType: Record<string, number> = {},
): AnnualContext {
  return {
    year: 2025,
    byBeneficiaire: {
      [benId]: { totalReimbursed, byCareType },
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Consultation spécialiste (régime pourcentage)
// ---------------------------------------------------------------------------
describe('Test 1 — Consultation (rate strategy)', () => {
  it('should reimburse 85% of 80 DT', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'consultation_visite',
      montant: 80_000,
      date: '2025-03-15',
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, emptyContext());

    expect(result.strategieAppliquee).toBe('rate');
    expect(result.montantRembourse).toBe(68_000);
    expect(result.plafondLimitant).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Analyses B40 (régime coefficient — LE CAS BUGGÉ)
// ---------------------------------------------------------------------------
describe('Test 2 — Analyses B40 (letter_key strategy)', () => {
  it('should use coefficient × B value, NOT percentage of invoice', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'laboratoire',
      letter_key: 'B',
      coefficient: 40,
      montant: 150_000, // labo facture 150 DT — irrelevant for letter_key
      date: '2025-03-15',
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, emptyContext());

    expect(result.strategieAppliquee).toBe('letter_key');
    expect(result.montantRembourse).toBe(40 * 270); // 10 800 millimes = 10.8 DT
    expect(result.calcul).toContain('40 × 270');
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Analyses sans coefficient (doit lever une erreur)
// ---------------------------------------------------------------------------
describe('Test 3 — Analyses without letter_key', () => {
  it('should throw NoStrategyError when no letter_key and no rate', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'laboratoire',
      montant: 150_000,
      date: '2025-03-15',
      beneficiaire: defaultBeneficiaire,
    };

    expect(() => calculateActe(acte, contract, emptyContext())).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Pharmacie simple
// ---------------------------------------------------------------------------
describe('Test 4 — Pharmacie (rate strategy)', () => {
  it('should reimburse 90% of 32.026 DT', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'pharmacie',
      montant: 32_026,
      date: '2025-03-15',
      has_prescription: true,
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, emptyContext());

    expect(result.strategieAppliquee).toBe('rate');
    expect(result.montantRembourse).toBe(28_823); // Math.round(32026 × 0.9)
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Pharmacie dépassant le plafond catégorie
// ---------------------------------------------------------------------------
describe('Test 5 — Pharmacie ceiling (annual_category)', () => {
  it('should cap at remaining annual category ceiling', () => {
    const contract = makeContract();
    const ctx = contextWithUsage('ben-001', 1_190_000, { pharmacie: 1_190_000 });
    const acte: Acte = {
      care_type: 'pharmacie',
      montant: 100_000,
      date: '2025-03-15',
      has_prescription: true,
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, ctx);

    // 100_000 × 90% = 90_000 brut, but only 10_000 remaining
    expect(result.montantRembourse).toBe(10_000);
    expect(result.plafondLimitant).toBe('annual_category');
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Bulletin réel (multi-actes)
// ---------------------------------------------------------------------------
describe('Test 6 — Full bulletin calculation', () => {
  it('should calculate correctly across multiple actes', () => {
    const contract = makeContract();
    const actes: Acte[] = [
      {
        care_type: 'laboratoire',
        letter_key: 'B',
        coefficient: 8,
        montant: 150_000,
        date: '2025-03-15',
        beneficiaire: defaultBeneficiaire,
      },
      {
        care_type: 'consultation_visite',
        montant: 80_000,
        date: '2025-03-15',
        beneficiaire: defaultBeneficiaire,
      },
      {
        care_type: 'pharmacie',
        montant: 32_026,
        date: '2025-03-15',
        has_prescription: true,
        beneficiaire: defaultBeneficiaire,
      },
    ];
    const result = calculateBulletin(actes, contract, emptyContext());

    expect(result.actes[0]!.montantRembourse).toBe(8 * 270); // 2 160
    expect(result.actes[1]!.montantRembourse).toBe(68_000);
    expect(result.actes[2]!.montantRembourse).toBe(28_823);
    expect(result.totalRembourse).toBe(2_160 + 68_000 + 28_823); // 98 983
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Hospitalisation clinique 3 jours
// ---------------------------------------------------------------------------
describe('Test 7 — Hospitalisation (fixed_day strategy)', () => {
  it('should calculate daily ceiling × jours', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'hospitalisation',
      jours: 3,
      montant: 1_500_000,
      date: '2025-03-15',
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, emptyContext());

    expect(result.strategieAppliquee).toBe('fixed_day');
    expect(result.montantRembourse).toBe(270_000); // 3 × 90 000
  });
});

// ---------------------------------------------------------------------------
// Test 8 — Chirurgie KC50
// ---------------------------------------------------------------------------
describe('Test 8 — Chirurgie KC50 (letter_key strategy)', () => {
  it('should use coefficient × KC value', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'chirurgie',
      letter_key: 'KC',
      coefficient: 50,
      montant: 800_000,
      date: '2025-03-15',
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, emptyContext());

    expect(result.strategieAppliquee).toBe('letter_key');
    expect(result.montantRembourse).toBe(500_000); // 50 × 10 000
  });
});

// ---------------------------------------------------------------------------
// Test 9 — Optique sous-plafond monture
// ---------------------------------------------------------------------------
describe('Test 9 — Optique sub_limit monture', () => {
  it('should cap at sub_limit for monture', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'optique',
      sub_limit_key: 'monture',
      montant: 500_000,
      date: '2025-03-15',
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, emptyContext());

    // 100% of 500_000 = 500_000, capped at sub_limit 300_000
    expect(result.montantRembourse).toBe(300_000);
    expect(result.plafondLimitant).toBe('sub_limit');
  });
});

// ---------------------------------------------------------------------------
// Test 10 — Orthodontie refusée pour adulte
// ---------------------------------------------------------------------------
describe('Test 10 — Orthodontie refused (age)', () => {
  it('should reject when age exceeds age_limit', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'orthodontie',
      montant: 500_000,
      date: '2025-03-15',
      beneficiaire: { id: 'ben-001', type: 'adherent', age: 25 },
    };
    const result = calculateActe(acte, contract, emptyContext());

    expect(result.montantRembourse).toBe(0);
    expect(result.rejetRaison).toContain('age >= age_limit (18)');
  });
});

// ---------------------------------------------------------------------------
// Test 11 — Orthodontie acceptée pour enfant
// ---------------------------------------------------------------------------
describe('Test 11 — Orthodontie accepted (child)', () => {
  it('should accept and cap at per_act_ceiling', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'orthodontie',
      montant: 500_000,
      date: '2025-03-15',
      beneficiaire: { id: 'child-001', type: 'child', age: 12 },
    };
    const result = calculateActe(acte, contract, emptyContext());

    // 100% of 500_000 = 500_000, capped at per_act 400_000
    expect(result.montantRembourse).toBe(400_000);
    expect(result.plafondLimitant).toBe('per_act');
  });
});

// ---------------------------------------------------------------------------
// Test 12 — Plafond global annuel (7 000 DT)
// ---------------------------------------------------------------------------
describe('Test 12 — Global annual ceiling', () => {
  it('should cap at remaining global ceiling', () => {
    const contract = makeContract();
    const ctx = contextWithUsage('ben-001', 6_950_000);
    const acte: Acte = {
      care_type: 'consultation_visite',
      montant: 100_000,
      date: '2025-03-15',
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, ctx);

    // 85% of 100_000 = 85_000 brut, but only 50_000 remaining globally
    expect(result.montantRembourse).toBe(50_000);
    expect(result.plafondLimitant).toBe('annual_global');
  });
});

// ---------------------------------------------------------------------------
// Test 13 — Carence pas respectée
// ---------------------------------------------------------------------------
describe('Test 13 — Carence period', () => {
  it('should reject when within carence period', () => {
    const contract = makeContract({
      effective_date: '2025-06-01',
      carence_days: 30,
    });
    const acte: Acte = {
      care_type: 'consultation_visite',
      montant: 80_000,
      date: '2025-06-15',
      beneficiaire: defaultBeneficiaire,
    };
    const result = calculateActe(acte, contract, emptyContext());

    expect(result.montantRembourse).toBe(0);
    expect(result.rejetRaison).toBe('within_carence_period');
  });
});

// ---------------------------------------------------------------------------
// Test 14 — care_type sans guarantee
// ---------------------------------------------------------------------------
describe('Test 14 — Unknown care_type', () => {
  it('should throw NoGuaranteeError', () => {
    const contract = makeContract();
    const acte: Acte = {
      care_type: 'acupuncture',
      montant: 100_000,
      date: '2025-03-15',
      beneficiaire: defaultBeneficiaire,
    };

    expect(() => calculateActe(acte, contract, emptyContext())).toThrow(
      NoGuaranteeError,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 15 — Cumul multi-bulletins pharmacie
// ---------------------------------------------------------------------------
describe('Test 15 — Cumulative pharmacy across bulletins', () => {
  it('should track cumulative annual ceiling correctly', () => {
    const contract = makeContract();
    const makePharmacyActe = (): Acte => ({
      care_type: 'pharmacie',
      montant: 500_000,
      date: '2025-03-15',
      has_prescription: true,
      beneficiaire: defaultBeneficiaire,
    });

    // Bulletin 1: 500_000 × 90% = 450_000
    const ctx1 = emptyContext();
    const r1 = calculateBulletin([makePharmacyActe()], contract, ctx1);
    expect(r1.actes[0]!.montantRembourse).toBe(450_000);

    // Bulletin 2: cumul = 450_000, same result
    const ctx2 = contextWithUsage('ben-001', 450_000, { pharmacie: 450_000 });
    const r2 = calculateBulletin([makePharmacyActe()], contract, ctx2);
    expect(r2.actes[0]!.montantRembourse).toBe(450_000);

    // Bulletin 3: cumul = 900_000, remaining = 300_000
    const ctx3 = contextWithUsage('ben-001', 900_000, { pharmacie: 900_000 });
    const r3 = calculateBulletin([makePharmacyActe()], contract, ctx3);
    expect(r3.actes[0]!.montantRembourse).toBe(300_000);
    expect(r3.actes[0]!.plafondLimitant).toBe('annual_category');
  });
});
