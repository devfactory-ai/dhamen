import { describe, it, expect } from 'vitest';
import {
  calculateRemboursementActe,
  calculateRemboursementBulletin,
} from './remboursement.service';

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
    expect(result.actes[0]!.remboursementFinal).toBe(35000); // 50000 × 0.7
    expect(result.actes[1]!.remboursementFinal).toBe(64000); // 80000 × 0.8
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

    expect(result.actes[0]!.remboursementFinal).toBe(360000); // 400000 × 0.9
    expect(result.actes[0]!.plafondDepasse).toBe(false);
    expect(result.actes[1]!.remboursementBrut).toBe(80000); // 100000 × 0.8
    expect(result.actes[1]!.remboursementFinal).toBe(40000); // capped at remaining
    expect(result.actes[1]!.plafondDepasse).toBe(true);
    expect(result.totalRembourse).toBe(400000);
    expect(result.plafondRestantApres).toBe(0);
  });

  it('handles plafond exhaustion mid-bulletin', () => {
    const actes = [
      { code: 'CONS-SPE', label: 'Spécialiste', montantActe: 80000, tauxRemboursement: 0.7 },
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
      { code: 'CONS-GEN', label: 'Consultation généraliste', montantActe: 50000, tauxRemboursement: 0.7 },
    ];

    const result = calculateRemboursementBulletin(actes, 500000);

    expect(result.actes[0]!.code).toBe('CONS-GEN');
    expect(result.actes[0]!.label).toBe('Consultation généraliste');
  });
});
