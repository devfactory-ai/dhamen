import { describe, expect, it } from 'vitest';
import {
  calculateRemboursementActe,
  calculateRemboursementBulletin,
  calculerRemboursement,
  mettreAJourPlafonds,
} from './remboursement.service';

// ---------------------------------------------------------------------------
// Legacy tests (unchanged)
// ---------------------------------------------------------------------------

describe('calculateRemboursementActe', () => {
  it('calculates simple reimbursement without exceeding plafond', () => {
    const result = calculateRemboursementActe(100000, 0.7, 500000);

    expect(result.remboursementBrut).toBe(70000);
    expect(result.remboursementFinal).toBe(70000);
    expect(result.plafondDepasse).toBe(false);
  });

  it('caps reimbursement at remaining plafond', () => {
    const result = calculateRemboursementActe(100000, 0.8, 50000);

    expect(result.remboursementBrut).toBe(80000);
    expect(result.remboursementFinal).toBe(50000);
    expect(result.plafondDepasse).toBe(true);
  });

  it('returns 0 when plafond is exhausted', () => {
    const result = calculateRemboursementActe(100000, 0.7, 0);

    expect(result.remboursementBrut).toBe(70000);
    expect(result.remboursementFinal).toBe(0);
    expect(result.plafondDepasse).toBe(true);
  });

  it('handles zero montant', () => {
    const result = calculateRemboursementActe(0, 0.7, 500000);

    expect(result.remboursementBrut).toBe(0);
    expect(result.remboursementFinal).toBe(0);
    expect(result.plafondDepasse).toBe(false);
  });

  it('handles zero taux', () => {
    const result = calculateRemboursementActe(100000, 0, 500000);

    expect(result.remboursementBrut).toBe(0);
    expect(result.remboursementFinal).toBe(0);
    expect(result.plafondDepasse).toBe(false);
  });

  it('handles taux at 100%', () => {
    const result = calculateRemboursementActe(100000, 1, 500000);

    expect(result.remboursementBrut).toBe(100000);
    expect(result.remboursementFinal).toBe(100000);
    expect(result.plafondDepasse).toBe(false);
  });
});

describe('calculateRemboursementBulletin', () => {
  it('calculates total for multiple acts', () => {
    const actes = [
      { code: 'CONS-GEN', label: 'Consultation', montantActe: 50000, tauxRemboursement: 0.7 },
      { code: 'ANALYSE', label: 'Analyses', montantActe: 80000, tauxRemboursement: 0.8 },
    ];

    const result = calculateRemboursementBulletin(actes, 500000);

    expect(result.actes).toHaveLength(2);
    expect(result.actes[0]!.remboursementFinal).toBe(35000); // 50000 * 0.7
    expect(result.actes[1]!.remboursementFinal).toBe(64000); // 80000 * 0.8
    expect(result.totalRembourse).toBe(99000);
    expect(result.plafondRestantApres).toBe(401000); // 500000 - 99000
  });

  it('decrements plafond progressively across acts', () => {
    const actes = [
      { code: 'HOSP', label: 'Hospitalisation', montantActe: 400000, tauxRemboursement: 0.9 },
      { code: 'PHARMA', label: 'Pharmacie', montantActe: 100000, tauxRemboursement: 0.8 },
    ];

    // plafond 400000: first act takes 360000, leaves 40000 for second
    const result = calculateRemboursementBulletin(actes, 400000);

    expect(result.actes[0]!.remboursementFinal).toBe(360000); // 400000 * 0.9
    expect(result.actes[0]!.plafondDepasse).toBe(false);
    expect(result.actes[1]!.remboursementBrut).toBe(80000); // 100000 * 0.8
    expect(result.actes[1]!.remboursementFinal).toBe(40000); // capped at remaining
    expect(result.actes[1]!.plafondDepasse).toBe(true);
    expect(result.totalRembourse).toBe(400000);
    expect(result.plafondRestantApres).toBe(0);
  });

  it('handles plafond exhaustion mid-bulletin', () => {
    const actes = [
      { code: 'CONS-SPE', label: 'Specialiste', montantActe: 80000, tauxRemboursement: 0.7 },
      { code: 'RADIO', label: 'Radio', montantActe: 60000, tauxRemboursement: 0.8 },
      { code: 'PHARMA', label: 'Pharmacie', montantActe: 50000, tauxRemboursement: 0.8 },
    ];

    // plafond 80000: first takes 56000, second takes 24000 (capped), third gets 0
    const result = calculateRemboursementBulletin(actes, 80000);

    expect(result.actes[0]!.remboursementFinal).toBe(56000);
    expect(result.actes[1]!.remboursementFinal).toBe(24000); // capped: 80000-56000
    expect(result.actes[2]!.remboursementFinal).toBe(0);
    expect(result.actes[2]!.plafondDepasse).toBe(true);
    expect(result.totalRembourse).toBe(80000);
    expect(result.plafondRestantApres).toBe(0);
  });

  it('preserves act code and label in results', () => {
    const actes = [
      {
        code: 'CONS-GEN',
        label: 'Consultation generaliste',
        montantActe: 50000,
        tauxRemboursement: 0.7,
      },
    ];

    const result = calculateRemboursementBulletin(actes, 500000);

    expect(result.actes[0]!.code).toBe('CONS-GEN');
    expect(result.actes[0]!.label).toBe('Consultation generaliste');
  });
});

// ---------------------------------------------------------------------------
// New contract-bareme-aware calculation tests (TASK-006)
// ---------------------------------------------------------------------------

/** Helper to create a mock D1Database for testing */
function createMockDb(responses: Record<string, unknown>) {
  const preparedStatements: Array<{ query: string; boundValues: unknown[] }> = [];

  const mockDb = {
    prepare: (query: string) => {
      const stmt = {
        query,
        boundValues: [] as unknown[],
        bind: (...values: unknown[]) => {
          stmt.boundValues = values;
          preparedStatements.push({ query, boundValues: values });
          return stmt;
        },
        first: async <T>(): Promise<T | null> => {
          // Match response by looking for key substring in query
          for (const [key, value] of Object.entries(responses)) {
            if (query.includes(key)) {
              return value as T | null;
            }
          }
          return null;
        },
        run: async () => ({ success: true, meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
    _statements: preparedStatements,
  };

  return mockDb;
}

describe('calculerRemboursement', () => {
  it('calculates taux-based reimbursement from contract bareme', async () => {
    const db = createMockDb({
      contrat_periodes: { id: 'period-1' },
      actes_referentiel: {
        id: 'acte-1',
        famille_id: 'fam-1',
        type_calcul: 'taux',
        valeur_base: null,
        taux_remboursement: 0.7,
        plafond_acte: null,
      },
      contrat_baremes: {
        type_calcul: 'taux',
        valeur: 0.9,
        plafond_acte: null,
        plafond_famille_annuel: null,
      },
      plafonds_beneficiaire: null,
    });

    const result = await calculerRemboursement(db as never, {
      adherentId: 'adh-1',
      contractId: 'ctr-1',
      acteRefId: 'acte-1',
      fraisEngages: 100000, // 100 TND in millimes
      dateSoin: '2026-03-15',
    });

    expect(result.typeCalcul).toBe('taux');
    expect(result.valeurBareme).toBe(0.9);
    expect(result.details.montantBrut).toBe(90000); // 100000 * 0.9
    expect(result.montantRembourse).toBe(90000);
    expect(result.plafondActeApplique).toBe(false);
    expect(result.plafondFamilleApplique).toBe(false);
    expect(result.plafondGlobalApplique).toBe(false);
  });

  it('calculates forfait-based reimbursement capped at forfait value', async () => {
    const db = createMockDb({
      contrat_periodes: { id: 'period-1' },
      actes_referentiel: {
        id: 'acte-c1',
        famille_id: 'fam-consult',
        type_calcul: 'forfait',
        valeur_base: 45000,
        taux_remboursement: 0.7,
        plafond_acte: null,
      },
      contrat_baremes: {
        type_calcul: 'forfait',
        valeur: 45000,
        plafond_acte: null,
        plafond_famille_annuel: null,
      },
      plafonds_beneficiaire: null,
    });

    const result = await calculerRemboursement(db as never, {
      adherentId: 'adh-1',
      contractId: 'ctr-1',
      acteRefId: 'acte-c1',
      fraisEngages: 60000, // 60 TND
      dateSoin: '2026-03-15',
    });

    // AC1: forfait = min(frais_engages, valeur_base) = min(60000, 45000) = 45000
    expect(result.typeCalcul).toBe('forfait');
    expect(result.montantRembourse).toBe(45000);
    expect(result.details.montantBrut).toBe(45000);
  });

  it('applies plafond acte when reimbursement exceeds it', async () => {
    const db = createMockDb({
      contrat_periodes: { id: 'period-1' },
      actes_referentiel: {
        id: 'acte-1',
        famille_id: 'fam-1',
        type_calcul: 'taux',
        valeur_base: null,
        taux_remboursement: 0.9,
        plafond_acte: 50000,
      },
      contrat_baremes: {
        type_calcul: 'taux',
        valeur: 0.9,
        plafond_acte: 50000,
        plafond_famille_annuel: null,
      },
      plafonds_beneficiaire: null,
    });

    const result = await calculerRemboursement(db as never, {
      adherentId: 'adh-1',
      contractId: 'ctr-1',
      acteRefId: 'acte-1',
      fraisEngages: 100000, // brut = 90000, plafond = 50000
      dateSoin: '2026-03-15',
    });

    expect(result.details.montantBrut).toBe(90000);
    expect(result.details.apresPlafondActe).toBe(50000);
    expect(result.plafondActeApplique).toBe(true);
    expect(result.montantRembourse).toBe(50000);
  });

  it('throws BAREME_NOT_FOUND when no active period exists', async () => {
    const db = createMockDb({
      contrat_periodes: null,
    });

    await expect(
      calculerRemboursement(db as never, {
        adherentId: 'adh-1',
        contractId: 'ctr-1',
        acteRefId: 'acte-1',
        fraisEngages: 100000,
        dateSoin: '2026-03-15',
      })
    ).rejects.toThrow('BAREME_NOT_FOUND');
  });

  it('throws ACTE_NOT_FOUND when acte does not exist', async () => {
    const db = createMockDb({
      contrat_periodes: { id: 'period-1' },
      actes_referentiel: null,
    });

    await expect(
      calculerRemboursement(db as never, {
        adherentId: 'adh-1',
        contractId: 'ctr-1',
        acteRefId: 'acte-unknown',
        fraisEngages: 100000,
        dateSoin: '2026-03-15',
      })
    ).rejects.toThrow('ACTE_NOT_FOUND');
  });

  it('falls back to acte defaults when no bareme in contract', async () => {
    // Mock that returns null for contrat_baremes but has acte defaults
    const queryResponses = new Map<string, unknown>();
    queryResponses.set('contrat_periodes', { id: 'period-1' });
    queryResponses.set('actes_referentiel', {
      id: 'acte-1',
      famille_id: null,
      type_calcul: 'taux',
      valeur_base: null,
      taux_remboursement: 0.7,
      plafond_acte: null,
    });
    // No bareme and no famille plafond
    queryResponses.set('contrat_baremes', null);
    queryResponses.set('plafonds_beneficiaire', null);

    const db = {
      prepare: (query: string) => {
        const stmt = {
          boundValues: [] as unknown[],
          bind: (...values: unknown[]) => {
            stmt.boundValues = values;
            return stmt;
          },
          first: async <T>(): Promise<T | null> => {
            for (const [key, value] of queryResponses.entries()) {
              if (query.includes(key)) {
                // For contrat_baremes we want null to trigger fallback
                if (key === 'contrat_baremes') return null;
                return value as T | null;
              }
            }
            return null;
          },
          run: async () => ({ success: true, meta: {} }),
        };
        return stmt;
      },
    };

    const result = await calculerRemboursement(db as never, {
      adherentId: 'adh-1',
      contractId: 'ctr-1',
      acteRefId: 'acte-1',
      fraisEngages: 100000,
      dateSoin: '2026-03-15',
    });

    // Falls back to acte.taux_remboursement = 0.7
    expect(result.typeCalcul).toBe('taux');
    expect(result.valeurBareme).toBe(0.7);
    expect(result.details.montantBrut).toBe(70000);
    expect(result.montantRembourse).toBe(70000);
  });

  it('returns 0 when fraisEngages is 0', async () => {
    const db = createMockDb({
      contrat_periodes: { id: 'period-1' },
      actes_referentiel: {
        id: 'acte-1',
        famille_id: null,
        type_calcul: 'taux',
        valeur_base: null,
        taux_remboursement: 0.9,
        plafond_acte: null,
      },
      contrat_baremes: {
        type_calcul: 'taux',
        valeur: 0.9,
        plafond_acte: null,
        plafond_famille_annuel: null,
      },
      plafonds_beneficiaire: null,
    });

    const result = await calculerRemboursement(db as never, {
      adherentId: 'adh-1',
      contractId: 'ctr-1',
      acteRefId: 'acte-1',
      fraisEngages: 0,
      dateSoin: '2026-03-15',
    });

    expect(result.montantRembourse).toBe(0);
    expect(result.details.montantBrut).toBe(0);
  });
});

describe('mettreAJourPlafonds', () => {
  it('updates both famille and global plafonds', async () => {
    const runCalls: Array<{ query: string; values: unknown[] }> = [];
    const db = {
      prepare: (query: string) => {
        const stmt = {
          bind: (...values: unknown[]) => {
            runCalls.push({ query, values });
            return stmt;
          },
          run: async () => ({ success: true, meta: {} }),
        };
        return stmt;
      },
    };

    await mettreAJourPlafonds(
      db as never,
      'adh-1',
      'ctr-1',
      2026,
      'fam-pharma',
      50000,
      'ordinaire'
    );

    // Should have 2 run calls: famille + global
    expect(runCalls).toHaveLength(2);
    expect(runCalls[0]!.query).toContain('famille_acte_id = ?');
    expect(runCalls[0]!.values[0]).toBe(50000);
    expect(runCalls[1]!.query).toContain('famille_acte_id IS NULL');
    expect(runCalls[1]!.values[0]).toBe(50000);
  });

  it('skips famille update when familleActeId is null', async () => {
    const runCalls: Array<{ query: string; values: unknown[] }> = [];
    const db = {
      prepare: (query: string) => {
        const stmt = {
          bind: (...values: unknown[]) => {
            runCalls.push({ query, values });
            return stmt;
          },
          run: async () => ({ success: true, meta: {} }),
        };
        return stmt;
      },
    };

    await mettreAJourPlafonds(db as never, 'adh-1', 'ctr-1', 2026, null, 30000);

    // Should have only 1 run call: global only
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]!.query).toContain('famille_acte_id IS NULL');
  });

  it('passes chronic type_maladie correctly', async () => {
    const runCalls: Array<{ query: string; values: unknown[] }> = [];
    const db = {
      prepare: (query: string) => {
        const stmt = {
          bind: (...values: unknown[]) => {
            runCalls.push({ query, values });
            return stmt;
          },
          run: async () => ({ success: true, meta: {} }),
        };
        return stmt;
      },
    };

    await mettreAJourPlafonds(
      db as never,
      'adh-1',
      'ctr-1',
      2026,
      'fam-pharma',
      50000,
      'chronique'
    );

    // Famille update should include 'chronique' as type_maladie
    expect(runCalls[0]!.values).toContain('chronique');
  });
});
