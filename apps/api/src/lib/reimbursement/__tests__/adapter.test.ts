import { describe, it, expect } from 'vitest';
import {
  letterKeyValueToMillimes,
  normalizeRate,
  dbRowToGuarantee,
  baremeRowToGuarantee,
  engineResultToServiceResult,
  findSubLimitValue,
} from '../adapter';
import type { ActeResult, Guarantee } from '../types';

// ---------------------------------------------------------------------------
// findSubLimitValue — case-insensitive, variant-tolerant sub-limit lookup
// ---------------------------------------------------------------------------

describe('findSubLimitValue', () => {
  it('matches exact lowercase key', () => {
    expect(findSubLimitValue({ monture: 300000 }, 'MONTURE')).toBe(300_000);
  });

  it('matches case-insensitive key', () => {
    expect(findSubLimitValue({ Monture: 300000 }, 'MONTURE')).toBe(300_000);
  });

  it('matches "Verres (Normaux)" variant for VERRES', () => {
    expect(findSubLimitValue({ 'Verres (Normaux)': 200 }, 'VERRES')).toBe(200_000);
  });

  it('matches "Verres" for VERRES', () => {
    expect(findSubLimitValue({ Verres: 250000 }, 'VERRES')).toBe(250_000);
  });

  it('normalizes DT values (< 1000) to millimes', () => {
    expect(findSubLimitValue({ Monture: 300 }, 'MONTURE')).toBe(300_000);
    expect(findSubLimitValue({ Lentilles: 200 }, 'LENTILLES')).toBe(200_000);
  });

  it('keeps millimes values (>= 1000) as-is', () => {
    expect(findSubLimitValue({ Monture: 300000 }, 'MONTURE')).toBe(300_000);
  });

  it('returns null for unknown acte code', () => {
    expect(findSubLimitValue({ Monture: 300000 }, 'UNKNOWN')).toBeNull();
  });

  it('returns null when key not found in sub_limits', () => {
    expect(findSubLimitValue({ Monture: 300000 }, 'VERRES')).toBeNull();
  });

  it('extracts plafond_acte from rich SubLimitEntry', () => {
    expect(findSubLimitValue({ Monture: { plafond_acte: 300000, taux: 1.0 } }, 'MONTURE')).toBe(300_000);
  });

  it('handles mixed format (some number, some object)', () => {
    const subLimits = {
      Monture: 300000,
      Verres: { plafond_acte: 250000, taux: 0.9 },
    };
    expect(findSubLimitValue(subLimits, 'MONTURE')).toBe(300_000);
    expect(findSubLimitValue(subLimits, 'VERRES')).toBe(250_000);
  });

  it('returns null for rich entry without plafond_acte', () => {
    expect(findSubLimitValue({ Monture: { taux: 0.9 } }, 'MONTURE')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// letterKeyValueToMillimes
// ---------------------------------------------------------------------------

describe('letterKeyValueToMillimes', () => {
  it('converts DT values (< 50) to millimes', () => {
    expect(letterKeyValueToMillimes(0.27)).toBe(270);
    expect(letterKeyValueToMillimes(0.32)).toBe(320);
    expect(letterKeyValueToMillimes(10)).toBe(10_000);
    expect(letterKeyValueToMillimes(1.75)).toBe(1_750);
  });

  it('keeps millimes values (>= 50) as-is', () => {
    expect(letterKeyValueToMillimes(270)).toBe(270);
    expect(letterKeyValueToMillimes(1200)).toBe(1200);
    expect(letterKeyValueToMillimes(90_000)).toBe(90_000);
  });

  it('handles boundary value 50', () => {
    // 50 is treated as millimes (>= 50)
    expect(letterKeyValueToMillimes(50)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// normalizeRate
// ---------------------------------------------------------------------------

describe('normalizeRate', () => {
  it('converts 0-1 decimal rates to 0-100', () => {
    expect(normalizeRate(0.85)).toBe(85);
    expect(normalizeRate(0.90)).toBe(90);
    expect(normalizeRate(1)).toBe(100);
    expect(normalizeRate(0.5)).toBe(50);
  });

  it('keeps rates already in 0-100 range', () => {
    expect(normalizeRate(85)).toBe(85);
    expect(normalizeRate(90)).toBe(90);
    expect(normalizeRate(100)).toBe(100);
  });

  it('returns null for null input', () => {
    expect(normalizeRate(null)).toBeNull();
  });

  it('handles zero', () => {
    expect(normalizeRate(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// dbRowToGuarantee
// ---------------------------------------------------------------------------

describe('dbRowToGuarantee', () => {
  const baseRow = {
    care_type: 'pharmacie',
    reimbursement_rate: 0.9,
    is_fixed_amount: 0,
    annual_limit: 1_200_000, // millimes
    per_event_limit: null,
    daily_limit: null,
    max_days: null,
    letter_keys_json: null,
    sub_limits_json: null,
    bareme_tp_id: null,
  };

  it('converts rate from 0-1 to 0-100', () => {
    const g = dbRowToGuarantee(baseRow);
    expect(g.rate).toBe(90);
    expect(g.care_type).toBe('pharmacie');
  });

  it('preserves annual_limit in millimes', () => {
    const g = dbRowToGuarantee(baseRow);
    expect(g.annual_ceiling).toBe(1_200_000);
  });

  it('parses letter_keys_json and normalizes to millimes', () => {
    const row = {
      ...baseRow,
      care_type: 'laboratoire',
      reimbursement_rate: null,
      letter_keys_json: '{"B": 0.27, "KC": 10}',
    };
    const g = dbRowToGuarantee(row);
    expect(g.letter_keys).toEqual([
      { key: 'B', value: 270 },
      { key: 'KC', value: 10_000 },
    ]);
  });

  it('parses letter_keys_json with values already in millimes', () => {
    const row = {
      ...baseRow,
      care_type: 'actes_courants',
      reimbursement_rate: null,
      letter_keys_json: '{"PC": 1200, "AM": 1750}',
    };
    const g = dbRowToGuarantee(row);
    expect(g.letter_keys).toEqual([
      { key: 'PC', value: 1200 },
      { key: 'AM', value: 1750 },
    ]);
  });

  it('resolves hospitalisation clinique daily limit from sub_limits (acte CL)', () => {
    const row = {
      ...baseRow,
      care_type: 'hospitalisation',
      daily_limit: 50_000,
      sub_limits_json: '{"clinique": 90000, "hopital": 10000}',
    };
    const g = dbRowToGuarantee(row, { familleId: 'fa-007', acteCode: 'CL' });
    expect(g.per_day_ceiling).toBe(90_000);
  });

  it('resolves hospitalisation hopital daily limit from sub_limits (acte HP)', () => {
    const row = {
      ...baseRow,
      care_type: 'hospitalisation',
      daily_limit: 50_000,
      sub_limits_json: '{"clinique": 90000, "hopital": 10000}',
    };
    const g = dbRowToGuarantee(row, { familleId: 'fa-007', acteCode: 'HP' });
    expect(g.per_day_ceiling).toBe(10_000);
  });

  it('resolves hospitalisation with Clinique (par jour) format sub_limits', () => {
    const row = {
      ...baseRow,
      care_type: 'hospitalisation',
      daily_limit: 50_000,
      sub_limits_json: '{"Clinique (par jour)": 90000, "Hôpital (par jour)": 10000}',
    };
    const g = dbRowToGuarantee(row, { familleId: 'fa-007', acteCode: 'CL' });
    expect(g.per_day_ceiling).toBe(90_000);
  });

  it('defaults to clinique when no acte code provided', () => {
    const row = {
      ...baseRow,
      care_type: 'hospitalisation',
      daily_limit: 50_000,
      sub_limits_json: '{"clinique": 90000, "hopital": 10000}',
    };
    const g = dbRowToGuarantee(row, { familleId: 'fa-007' });
    expect(g.per_day_ceiling).toBe(90_000);
  });

  it('falls back to careType for hospitalisation_hopital (backward compat)', () => {
    const row = {
      ...baseRow,
      care_type: 'hospitalisation',
      daily_limit: 50_000,
      sub_limits_json: '{"clinique": 90000, "hopital": 10000}',
    };
    const g = dbRowToGuarantee(row, { familleId: 'fa-007', careType: 'hospitalisation_hopital' });
    expect(g.per_day_ceiling).toBe(10_000);
  });

  it('resolves SANA to sanatorium sub-limit with rich entry', () => {
    const row = {
      ...baseRow,
      care_type: 'hospitalisation',
      daily_limit: 50_000,
      sub_limits_json: JSON.stringify({
        Clinique: { plafond_jour: 120000, taux: 1.0 },
        Hopital: { plafond_jour: 45000, taux: 1.0 },
        Sanatorium: { plafond_jour: 30000, max_jours: 21, taux: 1.0 },
      }),
    };
    const g = dbRowToGuarantee(row, { familleId: 'fa-007', acteCode: 'SANA' });
    expect(g.per_day_ceiling).toBe(30_000);
    expect(g.max_days).toBe(21);
    expect(g.rate).toBe(100);
  });

  it('resolves CL with rich entry format', () => {
    const row = {
      ...baseRow,
      care_type: 'hospitalisation',
      daily_limit: 50_000,
      sub_limits_json: JSON.stringify({
        Clinique: { plafond_jour: 120000, taux: 1.0 },
        Hopital: { plafond_jour: 45000, taux: 1.0 },
      }),
    };
    const g = dbRowToGuarantee(row, { familleId: 'fa-007', acteCode: 'CL' });
    expect(g.per_day_ceiling).toBe(120_000);
  });

  it('resolves chirurgie sub-limit with rich entry', () => {
    const row = {
      ...baseRow,
      care_type: 'chirurgie',
      sub_limits_json: JSON.stringify({
        SO: { plafond_acte: 300000, taux: 1.0 },
      }),
    };
    const g = dbRowToGuarantee(row, { acteCode: 'SO' });
    expect(g.per_act_ceiling).toBe(300_000);
    expect(g.rate).toBe(100);
  });

  it('resolves pharmacie sub-limit with rich entry (ordinaire)', () => {
    const row = {
      ...baseRow,
      annual_limit: 1_200_000,
      sub_limits_json: JSON.stringify({
        ordinaire: { plafond_annuel: 800000, taux: 0.9 },
        chronique: { plafond_annuel: 1200000, taux: 0.9 },
      }),
    };
    const g = dbRowToGuarantee(row, { typeMaladie: 'ordinaire' });
    expect(g.annual_ceiling).toBe(800_000);
    expect(g.rate).toBe(90);
  });

  it('hosp rich entry: taux is never overridden, parent rate preserved', () => {
    const row = {
      ...baseRow,
      care_type: 'hospitalisation',
      reimbursement_rate: 1,
      daily_limit: null,
      sub_limits_json: JSON.stringify({
        Clinique: { taux: 0.8, plafond_jour: 90000 },
        'Hôpital': { plafond_jour: 10000 },
      }),
    };
    // Hospitalisation = forfait journalier, rate parent toujours utilisé
    const gCL = dbRowToGuarantee(row, { familleId: 'fa-007', acteCode: 'CL' });
    expect(gCL.per_day_ceiling).toBe(90_000);
    expect(gCL.rate).toBe(100); // parent rate, NOT sub-limit taux
    const gHP = dbRowToGuarantee(row, { familleId: 'fa-007', acteCode: 'HP' });
    expect(gHP.per_day_ceiling).toBe(10_000);
    expect(gHP.rate).toBe(100);
  });

  it('overrides per_act_ceiling from acte code sub-limit (exact key)', () => {
    const row = {
      ...baseRow,
      care_type: 'optique',
      sub_limits_json: '{"Monture": 300000, "Verres": 250000}',
    };
    const g = dbRowToGuarantee(row, { acteCode: 'MONTURE' });
    expect(g.per_act_ceiling).toBe(300_000);
  });

  it('overrides per_act_ceiling from acte code sub-limit (case-insensitive, DT value)', () => {
    const row = {
      ...baseRow,
      care_type: 'optique',
      sub_limits_json: '{"Monture": 300, "Verres (Normaux)": 200, "Lentilles": 150}',
    };
    // DT values (< 1000) are normalized to millimes
    const g1 = dbRowToGuarantee(row, { acteCode: 'MONTURE' });
    expect(g1.per_act_ceiling).toBe(300_000);
    const g2 = dbRowToGuarantee(row, { acteCode: 'VERRES' });
    expect(g2.per_act_ceiling).toBe(200_000);
    const g3 = dbRowToGuarantee(row, { acteCode: 'LENTILLES' });
    expect(g3.per_act_ceiling).toBe(150_000);
  });

  it('resolves pharmacy sub-limit by typeMaladie ordinaire', () => {
    const row = {
      ...baseRow,
      annual_limit: 1_200_000,
      sub_limits_json: '{"ordinaire": 800000, "chronique": 1200000}',
    };
    const g = dbRowToGuarantee(row, { typeMaladie: 'ordinaire' });
    expect(g.annual_ceiling).toBe(800_000);
  });

  it('resolves pharmacy sub-limit by typeMaladie chronique', () => {
    const row = {
      ...baseRow,
      annual_limit: 1_200_000,
      sub_limits_json: '{"ordinaire": 800000, "chronique": 1200000}',
    };
    const g = dbRowToGuarantee(row, { typeMaladie: 'chronique' });
    expect(g.annual_ceiling).toBe(1_200_000);
  });
});

// ---------------------------------------------------------------------------
// baremeRowToGuarantee
// ---------------------------------------------------------------------------

describe('baremeRowToGuarantee', () => {
  it('converts taux bareme to rate guarantee', () => {
    const g = baremeRowToGuarantee(
      { type_calcul: 'taux', valeur: 0.85, plafond_acte: null, plafond_famille_annuel: null, plafond_jour: null, max_jours: null },
      'consultation_visite',
    );
    expect(g.rate).toBe(85);
    expect(g.care_type).toBe('consultation_visite');
    expect(g.letter_keys).toEqual([]);
  });

  it('converts forfait bareme with lettre_cle to letter_key guarantee', () => {
    const g = baremeRowToGuarantee(
      { type_calcul: 'forfait', valeur: 270, plafond_acte: null, plafond_famille_annuel: null, plafond_jour: null, max_jours: null },
      'laboratoire',
      { acteLettreCle: 'B', nbrCle: 120 },
    );
    expect(g.letter_keys).toEqual([{ key: 'B', value: 270 }]);
    expect(g.rate).toBeNull();
  });

  it('forfait with lettre_cle but without nbrCle falls back to rate=100 (no letter-key guessing)', () => {
    const g = baremeRowToGuarantee(
      { type_calcul: 'forfait', valeur: 270, plafond_acte: null, plafond_famille_annuel: null, plafond_jour: null, max_jours: null },
      'laboratoire',
      { acteLettreCle: 'B' },
    );
    // Without nbrCle, should NOT create letter_keys — falls to rate=100 (apply fraisEngages directly)
    expect(g.letter_keys).toEqual([]);
    expect(g.rate).toBe(100);
  });

  it('converts forfait bareme without lettre_cle to rate=100 (fixed amount)', () => {
    const g = baremeRowToGuarantee(
      { type_calcul: 'forfait', valeur: 150_000, plafond_acte: null, plafond_famille_annuel: null, plafond_jour: null, max_jours: null },
      'frais_funeraires',
    );
    expect(g.rate).toBe(100);
    expect(g.letter_keys).toEqual([]);
  });

  it('sets per_day_ceiling for daily forfait', () => {
    const g = baremeRowToGuarantee(
      { type_calcul: 'forfait', valeur: 90_000, plafond_acte: null, plafond_famille_annuel: null, plafond_jour: 90_000, max_jours: 30 },
      'hospitalisation',
    );
    expect(g.per_day_ceiling).toBe(90_000);
    expect(g.max_days).toBe(30);
  });

  it('overrides rate from medication family', () => {
    const g = baremeRowToGuarantee(
      { type_calcul: 'taux', valeur: 0.90, plafond_acte: null, plafond_famille_annuel: null, plafond_jour: null, max_jours: null },
      'pharmacie',
      { medFamilyRate: 0.70 },
    );
    expect(g.rate).toBe(70);
  });

  it('preserves plafonds in millimes', () => {
    const g = baremeRowToGuarantee(
      { type_calcul: 'taux', valeur: 0.85, plafond_acte: 50_000, plafond_famille_annuel: 1_200_000, plafond_jour: null, max_jours: null },
      'consultation',
    );
    expect(g.per_act_ceiling).toBe(50_000);
    expect(g.annual_ceiling).toBe(1_200_000);
  });
});

// ---------------------------------------------------------------------------
// engineResultToServiceResult
// ---------------------------------------------------------------------------

describe('engineResultToServiceResult', () => {
  const baseGuarantee: Guarantee = {
    care_type: 'pharmacie',
    rate: 90,
    annual_ceiling: 1_200_000,
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
  };

  it('converts millimes result to DT', () => {
    const engineResult: ActeResult = {
      montantFacture: 50_000, // 50 DT invoiced
      montantRembourse: 45_000, // 45 DT reimbursed
      strategieAppliquee: 'rate',
      plafondLimitant: null,
      calcul: '50000 × 90% = 45000',
    };

    const result = engineResultToServiceResult(engineResult, 'taux', 0.90, baseGuarantee);
    expect(result.montantRembourse).toBe(45); // 45 DT
    expect(result.typeCalcul).toBe('taux');
    expect(result.valeurBareme).toBe(0.90);
    expect(result.plafondActeApplique).toBe(false);
    expect(result.plafondFamilleApplique).toBe(false);
    expect(result.plafondGlobalApplique).toBe(false);
  });

  it('maps per_act plafond correctly', () => {
    const engineResult: ActeResult = {
      montantFacture: 900_000,
      montantRembourse: 800_000,
      strategieAppliquee: 'rate',
      plafondLimitant: 'per_act',
      calcul: 'capped',
    };

    const g = { ...baseGuarantee, per_act_ceiling: 800_000 };
    const result = engineResultToServiceResult(engineResult, 'taux', 1, g);
    expect(result.plafondActeApplique).toBe(true);
    expect(result.montantRembourse).toBe(800);
    expect(result.details.plafondActeValeur).toBe(800);
  });

  it('maps annual_category plafond correctly', () => {
    const engineResult: ActeResult = {
      montantFacture: 200_000,
      montantRembourse: 100_000,
      strategieAppliquee: 'rate',
      plafondLimitant: 'annual_category',
      calcul: 'capped',
    };

    const result = engineResultToServiceResult(engineResult, 'taux', 0.90, baseGuarantee);
    expect(result.plafondFamilleApplique).toBe(true);
    expect(result.montantRembourse).toBe(100);
  });

  it('maps annual_global plafond correctly', () => {
    const engineResult: ActeResult = {
      montantFacture: 200_000,
      montantRembourse: 50_000,
      strategieAppliquee: 'rate',
      plafondLimitant: 'annual_global',
      calcul: 'capped',
    };

    const result = engineResultToServiceResult(engineResult, 'taux', 0.90, baseGuarantee);
    expect(result.plafondGlobalApplique).toBe(true);
    expect(result.montantRembourse).toBe(50);
  });

  it('maps sub_limit plafond to plafondActeApplique', () => {
    const engineResult: ActeResult = {
      montantFacture: 500_000,
      montantRembourse: 300_000,
      strategieAppliquee: 'rate',
      plafondLimitant: 'sub_limit',
      calcul: 'capped by sub_limit',
    };

    const result = engineResultToServiceResult(engineResult, 'taux', 1, baseGuarantee);
    expect(result.plafondActeApplique).toBe(true);
  });

  it('ensures montantRembourse is never negative', () => {
    const engineResult: ActeResult = {
      montantFacture: 0,
      montantRembourse: 0,
      strategieAppliquee: 'rate',
      plafondLimitant: null,
      calcul: '0',
    };

    const result = engineResultToServiceResult(engineResult, 'taux', 0.90, baseGuarantee);
    expect(result.montantRembourse).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BH 2025 scenario: pharmacie 90%, invoice 50 DT
// Verifies the full DB row → Engine A → service result pipeline
// ---------------------------------------------------------------------------

describe('BH 2025 scenarios via adapter converters', () => {
  it('pharmacie 90%: 50 DT invoice → 45 DT reimbursed', () => {
    const row = {
      care_type: 'pharmacie',
      reimbursement_rate: 0.9,
      is_fixed_amount: 0,
      annual_limit: 1_200_000,
      per_event_limit: null,
      daily_limit: null,
      max_days: null,
      letter_keys_json: null,
      sub_limits_json: null,
      bareme_tp_id: null,
    };

    const guarantee = dbRowToGuarantee(row);
    // Verify correct conversion
    expect(guarantee.rate).toBe(90);
    expect(guarantee.annual_ceiling).toBe(1_200_000);

    // Simulate Engine A calculation: 50_000 millimes × 90% = 45_000
    const engineResult: ActeResult = {
      montantFacture: 50_000,
      montantRembourse: 45_000,
      strategieAppliquee: 'rate',
      plafondLimitant: null,
      calcul: '50000 × 90% = 45000',
    };

    const result = engineResultToServiceResult(engineResult, 'taux', 0.9, guarantee);
    expect(result.montantRembourse).toBe(45);
  });

  it('laboratoire B120: 120 × 270 mill = 32.4 DT', () => {
    const row = {
      care_type: 'laboratoire',
      reimbursement_rate: null,
      is_fixed_amount: 0,
      annual_limit: null,
      per_event_limit: null,
      daily_limit: null,
      max_days: null,
      letter_keys_json: '{"B": 0.27}',
      sub_limits_json: null,
      bareme_tp_id: null,
    };

    const guarantee = dbRowToGuarantee(row);
    expect(guarantee.letter_keys).toEqual([{ key: 'B', value: 270 }]);

    // Engine A: 120 × 270 = 32_400 millimes
    const engineResult: ActeResult = {
      montantFacture: 50_000,
      montantRembourse: 32_400,
      strategieAppliquee: 'letter_key',
      plafondLimitant: null,
      calcul: 'min(120 × 270, 50000) = 32400',
    };

    const result = engineResultToServiceResult(engineResult, 'forfait', 32.4, guarantee);
    expect(result.montantRembourse).toBe(32.4);
  });

  it('hospitalisation clinique: 3 jours × 90 DT/j = 270 DT', () => {
    const row = {
      care_type: 'hospitalisation',
      reimbursement_rate: null,
      is_fixed_amount: 0,
      annual_limit: null,
      per_event_limit: null,
      daily_limit: 50_000, // base daily limit
      max_days: null,
      letter_keys_json: null,
      sub_limits_json: '{"clinique": 90000, "hopital": 10000}',
      bareme_tp_id: null,
    };

    const guarantee = dbRowToGuarantee(row, { familleId: 'fa-007' });
    expect(guarantee.per_day_ceiling).toBe(90_000);

    // Engine A: min(500_000, 90_000 × 3) = 270_000
    const engineResult: ActeResult = {
      montantFacture: 500_000,
      montantRembourse: 270_000,
      strategieAppliquee: 'fixed_day',
      plafondLimitant: 'per_act',
      calcul: 'min(500000, 90000 × 3) = 270000',
    };

    const result = engineResultToServiceResult(engineResult, 'forfait', 90, guarantee);
    expect(result.montantRembourse).toBe(270);
  });

  it('consultation 85%: 45 DT → 38.25 DT', () => {
    const row = {
      care_type: 'consultation_visite',
      reimbursement_rate: 0.85,
      is_fixed_amount: 0,
      annual_limit: null,
      per_event_limit: null,
      daily_limit: null,
      max_days: null,
      letter_keys_json: null,
      sub_limits_json: null,
      bareme_tp_id: null,
    };

    const guarantee = dbRowToGuarantee(row);
    expect(guarantee.rate).toBe(85);

    // Engine A: round(45_000 × 85/100) = 38_250
    const engineResult: ActeResult = {
      montantFacture: 45_000,
      montantRembourse: 38_250,
      strategieAppliquee: 'rate',
      plafondLimitant: null,
      calcul: '45000 × 85% = 38250',
    };

    const result = engineResultToServiceResult(engineResult, 'taux', 0.85, guarantee);
    expect(result.montantRembourse).toBe(38.25);
  });

  it('optique monture sub-limit: 500 DT → capped at 300 DT', () => {
    const row = {
      care_type: 'optique',
      reimbursement_rate: 1,
      is_fixed_amount: 0,
      annual_limit: null,
      per_event_limit: null,
      daily_limit: null,
      max_days: null,
      letter_keys_json: null,
      sub_limits_json: '{"Monture": 300000, "Verres": 250000}',
      bareme_tp_id: null,
    };

    const guarantee = dbRowToGuarantee(row, { acteCode: 'MONTURE' });
    expect(guarantee.per_act_ceiling).toBe(300_000); // sub-limit for monture

    // Engine A would cap at sub_limit
    const engineResult: ActeResult = {
      montantFacture: 500_000,
      montantRembourse: 300_000,
      strategieAppliquee: 'rate',
      plafondLimitant: 'sub_limit',
      calcul: 'capped by sub_limit monture',
    };

    const result = engineResultToServiceResult(engineResult, 'taux', 1, guarantee);
    expect(result.montantRembourse).toBe(300);
    expect(result.plafondActeApplique).toBe(true);
  });
});
