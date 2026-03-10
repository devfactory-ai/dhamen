/**
 * OCR Utils Tests
 */
import { describe, it, expect } from 'vitest';
import { mergeOcrResults } from './ocr-utils';
import type { OCRExtractedData } from './ocr-utils';

describe('mergeOcrResults', () => {
  it('returns empty result for no inputs', () => {
    const result = mergeOcrResults([]);
    expect(result.montantTotal).toBe(0);
    expect(result.lignes).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('returns unchanged result for single page', () => {
    const single: OCRExtractedData = {
      dateSoin: '2025-01-15',
      typeSoin: 'pharmacie',
      montantTotal: 50000,
      praticien: { nom: 'Dr. Ben Ali' },
      lignes: [{ libelle: 'Doliprane', montantTotal: 5000 }],
      confidence: 0.85,
      warnings: [],
    };
    const result = mergeOcrResults([single]);
    expect(result).toBe(single);
  });

  it('concatenates line items from multiple pages', () => {
    const page1: OCRExtractedData = {
      montantTotal: 10000,
      lignes: [{ libelle: 'Item A', montantTotal: 10000 }],
      confidence: 0.9,
      warnings: [],
    };
    const page2: OCRExtractedData = {
      montantTotal: 20000,
      lignes: [
        { libelle: 'Item B', montantTotal: 12000 },
        { libelle: 'Item C', montantTotal: 8000 },
      ],
      confidence: 0.8,
      warnings: [],
    };
    const result = mergeOcrResults([page1, page2]);
    expect(result.lignes).toHaveLength(3);
    expect(result.lignes[0].libelle).toBe('Item A');
    expect(result.lignes[1].libelle).toBe('Item B');
    expect(result.lignes[2].libelle).toBe('Item C');
  });

  it('sums montantTotal across pages', () => {
    const page1: OCRExtractedData = {
      montantTotal: 15000,
      lignes: [],
      confidence: 0.9,
      warnings: [],
    };
    const page2: OCRExtractedData = {
      montantTotal: 25000,
      lignes: [],
      confidence: 0.8,
      warnings: [],
    };
    const result = mergeOcrResults([page1, page2]);
    expect(result.montantTotal).toBe(40000);
  });

  it('uses minimum confidence across pages', () => {
    const page1: OCRExtractedData = {
      montantTotal: 10000,
      lignes: [],
      confidence: 0.95,
      warnings: [],
    };
    const page2: OCRExtractedData = {
      montantTotal: 20000,
      lignes: [],
      confidence: 0.6,
      warnings: [],
    };
    const page3: OCRExtractedData = {
      montantTotal: 5000,
      lignes: [],
      confidence: 0.85,
      warnings: [],
    };
    const result = mergeOcrResults([page1, page2, page3]);
    expect(result.confidence).toBe(0.6);
  });

  it('takes patient info from first page that has it', () => {
    const page1: OCRExtractedData = {
      dateSoin: '2025-03-01',
      typeSoin: 'pharmacie',
      montantTotal: 10000,
      praticien: { nom: 'Pharmacie Centrale' },
      lignes: [],
      confidence: 0.9,
      warnings: [],
    };
    const page2: OCRExtractedData = {
      montantTotal: 20000,
      lignes: [],
      confidence: 0.8,
      warnings: [],
    };
    const result = mergeOcrResults([page1, page2]);
    expect(result.dateSoin).toBe('2025-03-01');
    expect(result.typeSoin).toBe('pharmacie');
    expect(result.praticien?.nom).toBe('Pharmacie Centrale');
  });

  it('concatenates warnings from all pages', () => {
    const page1: OCRExtractedData = {
      montantTotal: 10000,
      lignes: [],
      confidence: 0.7,
      warnings: ['Warning A'],
    };
    const page2: OCRExtractedData = {
      montantTotal: 20000,
      lignes: [],
      confidence: 0.8,
      warnings: ['Warning B', 'Warning C'],
    };
    const result = mergeOcrResults([page1, page2]);
    expect(result.warnings).toEqual(['Warning A', 'Warning B', 'Warning C']);
  });

  it('merges fieldConfidences using minimum per field', () => {
    const page1: OCRExtractedData = {
      montantTotal: 10000,
      lignes: [],
      confidence: 0.9,
      fieldConfidences: { dateSoin: 1.0, montantTotal: 0.8 },
      warnings: [],
    };
    const page2: OCRExtractedData = {
      montantTotal: 20000,
      lignes: [],
      confidence: 0.8,
      fieldConfidences: { dateSoin: 0.6, montantTotal: 0.9, lignes: 0.7 },
      warnings: [],
    };
    const result = mergeOcrResults([page1, page2]);
    expect(result.fieldConfidences?.dateSoin).toBe(0.6);
    expect(result.fieldConfidences?.montantTotal).toBe(0.8);
    expect(result.fieldConfidences?.lignes).toBe(0.7);
  });
});
