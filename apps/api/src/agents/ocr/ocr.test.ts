/**
 * OCR Agent Tests
 */
import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  parseDate,
  detectCareType,
  calculateConfidence,
  validateExtractedData,
  parseLineItems,
} from './ocr.rules';
import type { BulletinExtractedData } from './ocr.types';

describe('OCR Rules', () => {
  describe('parseAmount', () => {
    it('parses Tunisian TND format', () => {
      expect(parseAmount('50,000 TND')).toBe(50000);
      expect(parseAmount('50.000 TND')).toBe(50000);
      expect(parseAmount('50 TND')).toBe(50000);
      expect(parseAmount('50TND')).toBe(50000);
      expect(parseAmount('50 DT')).toBe(50000);
    });

    it('parses amounts already in millimes', () => {
      expect(parseAmount('50000')).toBe(50000);
      expect(parseAmount('150')).toBe(150);
      expect(parseAmount('1500')).toBe(1500);
    });

    it('handles decimal amounts', () => {
      expect(parseAmount('50,500')).toBe(50500);
      expect(parseAmount('50.500')).toBe(50500);
    });

    it('returns null for invalid input', () => {
      expect(parseAmount('')).toBeNull();
      expect(parseAmount('abc')).toBeNull();
    });

    it('handles space-separated thousands', () => {
      expect(parseAmount('1 000')).toBe(1000);
    });
  });

  describe('parseDate', () => {
    it('parses ISO format', () => {
      expect(parseDate('2024-03-15')).toBe('2024-03-15');
    });

    it('parses DD/MM/YYYY format', () => {
      expect(parseDate('15/03/2024')).toBe('2024-03-15');
      expect(parseDate('5/3/2024')).toBe('2024-03-05');
    });

    it('parses DD-MM-YYYY format', () => {
      expect(parseDate('15-03-2024')).toBe('2024-03-15');
    });

    it('parses French month names', () => {
      expect(parseDate('15 mars 2024')).toBe('2024-03-15');
      expect(parseDate('1 janvier 2024')).toBe('2024-01-01');
      expect(parseDate('25 decembre 2024')).toBe('2024-12-25');
    });

    it('returns null for invalid dates', () => {
      expect(parseDate('')).toBeNull();
      expect(parseDate('invalid')).toBeNull();
    });
  });

  describe('detectCareType', () => {
    it('detects pharmacie', () => {
      expect(detectCareType('Pharmacie Centrale')).toBe('pharmacie');
      expect(detectCareType('medicament doliprane')).toBe('pharmacie');
      expect(detectCareType('ordonnance')).toBe('pharmacie');
    });

    it('detects consultation', () => {
      expect(detectCareType('Consultation Dr. Ahmed')).toBe('consultation');
      expect(detectCareType('Visite medicale')).toBe('consultation');
      expect(detectCareType('docteur')).toBe('consultation');
    });

    it('detects laboratoire', () => {
      expect(detectCareType('Laboratoire Pasteur')).toBe('laboratoire');
      expect(detectCareType('Analyses sang')).toBe('laboratoire');
      expect(detectCareType('biologie medicale')).toBe('laboratoire');
    });

    it('detects optique', () => {
      expect(detectCareType('Lunettes et verres')).toBe('optique');
      expect(detectCareType('opticien')).toBe('optique');
      expect(detectCareType('monture')).toBe('optique');
    });

    it('detects dentaire', () => {
      expect(detectCareType('Cabinet dentaire')).toBe('dentaire');
      expect(detectCareType('soins dentaires')).toBe('dentaire');
      expect(detectCareType('dentiste')).toBe('dentaire');
    });

    it('detects hospitalisation', () => {
      expect(detectCareType('Clinique El Manar')).toBe('hospitalisation');
      expect(detectCareType('hopital')).toBe('hospitalisation');
      expect(detectCareType('sejour')).toBe('hospitalisation');
    });

    it('returns undefined for unknown types', () => {
      expect(detectCareType('random text')).toBeUndefined();
      expect(detectCareType('')).toBeUndefined();
    });
  });

  describe('calculateConfidence', () => {
    it('calculates high confidence for complete data', () => {
      const data: Partial<BulletinExtractedData> = {
        dateSoin: '2024-03-15',
        typeSoin: 'pharmacie',
        montantTotal: 50000,
        praticien: { nom: 'Pharmacie Centrale', specialite: 'Pharmacie' },
        lignes: [
          { libelle: 'Doliprane', quantite: 1, prixUnitaire: 5000, montantTotal: 5000 },
          { libelle: 'Paracetamol', quantite: 2, prixUnitaire: 3000, montantTotal: 6000 },
          { libelle: 'Amoxicilline', quantite: 1, prixUnitaire: 8000, montantTotal: 8000 },
          { libelle: 'Augmentin', quantite: 1, prixUnitaire: 12000, montantTotal: 12000 },
        ],
        adherentNom: 'Mohamed Ben Ahmed',
      };
      // With 4 line items (20 points max), all other fields complete
      expect(calculateConfidence(data)).toBe(1);
    });

    it('calculates 0% for empty data', () => {
      const data: Partial<BulletinExtractedData> = {};
      expect(calculateConfidence(data)).toBe(0);
    });

    it('calculates partial confidence', () => {
      const data: Partial<BulletinExtractedData> = {
        montantTotal: 50000,
        typeSoin: 'pharmacie',
      };
      const confidence = calculateConfidence(data);
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThan(1);
    });
  });

  describe('validateExtractedData', () => {
    it('validates future date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const data: BulletinExtractedData = {
        dateSoin: futureDate.toISOString().split('T')[0],
        montantTotal: 50000,
        lignes: [],
        confidence: 1,
        warnings: [],
      };

      const validated = validateExtractedData(data);
      expect(validated.dateSoin).toBeUndefined();
      expect(validated.warnings).toContain('Date de soin dans le futur');
    });

    it('warns for very old dates', () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);
      const data: BulletinExtractedData = {
        dateSoin: oldDate.toISOString().split('T')[0],
        montantTotal: 50000,
        lignes: [],
        confidence: 1,
        warnings: [],
      };

      const validated = validateExtractedData(data);
      expect(validated.warnings).toContain('Date de soin tres ancienne (> 1 an)');
    });

    it('warns for invalid amounts', () => {
      const data: BulletinExtractedData = {
        montantTotal: 0,
        lignes: [],
        confidence: 1,
        warnings: [],
      };

      const validated = validateExtractedData(data);
      expect(validated.warnings).toContain('Montant total invalide ou non detecte');
    });

    it('warns for suspicious high amounts', () => {
      const data: BulletinExtractedData = {
        montantTotal: 15000000, // 15,000 TND
        lignes: [],
        confidence: 1,
        warnings: [],
      };

      const validated = validateExtractedData(data);
      expect(validated.warnings).toContain('Montant total anormalement eleve');
    });

    it('warns when line items dont match total', () => {
      const data: BulletinExtractedData = {
        montantTotal: 50000,
        lignes: [
          { libelle: 'Item 1', quantite: 1, prixUnitaire: 20000, montantTotal: 20000 },
        ],
        confidence: 1,
        warnings: [],
      };

      const validated = validateExtractedData(data);
      expect(validated.warnings).toContain('Total des lignes ne correspond pas au montant total');
    });

    it('reduces confidence based on warnings', () => {
      const data: BulletinExtractedData = {
        montantTotal: 0,
        lignes: [],
        confidence: 1,
        warnings: [],
      };

      const validated = validateExtractedData(data);
      expect(validated.confidence).toBeLessThanOrEqual(0.7);
    });
  });

  describe('parseLineItems', () => {
    it('extracts drug items from text', () => {
      const text = `
        Doliprane 1000mg    10,000 TND
        Paracetamol 500mg    5,000 TND
        Random text
      `;

      const items = parseLineItems(text);
      expect(items.length).toBe(2);
      expect(items[0]?.montantTotal).toBe(10000);
      expect(items[1]?.montantTotal).toBe(5000);
    });

    it('extracts medical act items', () => {
      const text = `
        Consultation      25,000 TND
        Analyse sang      15,000 TND
      `;

      const items = parseLineItems(text);
      expect(items.length).toBe(2);
    });

    it('returns empty array for no matches', () => {
      const text = 'Random text without drugs or acts';
      const items = parseLineItems(text);
      expect(items.length).toBe(0);
    });
  });
});
