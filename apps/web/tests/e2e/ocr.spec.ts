/**
 * OCR Feature E2E Tests
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsGestionnaire } from './fixtures';

test.describe('OCR Document Processing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGestionnaire(page);
  });

  test.describe('Single Document Processing', () => {
    test('should process an ordonnance document', async ({ page }) => {
      await page.goto('/sante/documents');

      // Click upload button
      await page.click('button:has-text("Scanner un document")');

      // Select document type
      await page.selectOption('[name="documentType"]', 'ordonnance');

      // Upload file (mock)
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'ordonnance.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-image-data'),
      });

      // Wait for OCR processing
      await expect(page.locator('[data-testid="ocr-result"]')).toBeVisible({ timeout: 30000 });

      // Verify extracted fields
      await expect(page.locator('[data-testid="patient-name"]')).toBeVisible();
      await expect(page.locator('[data-testid="medecin-name"]')).toBeVisible();
      await expect(page.locator('[data-testid="medicaments-list"]')).toBeVisible();

      // Verify confidence score
      await expect(page.locator('[data-testid="confidence-score"]')).toBeVisible();
    });

    test('should process a facture document', async ({ page }) => {
      await page.goto('/sante/documents');

      await page.click('button:has-text("Scanner un document")');
      await page.selectOption('[name="documentType"]', 'facture');

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'facture.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('fake-pdf-data'),
      });

      await expect(page.locator('[data-testid="ocr-result"]')).toBeVisible({ timeout: 30000 });

      // Verify invoice fields
      await expect(page.locator('[data-testid="montant-total"]')).toBeVisible();
      await expect(page.locator('[data-testid="emetteur"]')).toBeVisible();
    });

    test('should verify carte assurance', async ({ page }) => {
      await page.goto('/sante/documents');

      await page.click('button:has-text("Vérifier une carte")');

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'carte.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-card-image'),
      });

      await expect(page.locator('[data-testid="verification-result"]')).toBeVisible({ timeout: 30000 });

      // Verify card holder info
      await expect(page.locator('[data-testid="assure-nom"]')).toBeVisible();
      await expect(page.locator('[data-testid="matricule"]')).toBeVisible();
    });
  });

  test.describe('Batch Processing', () => {
    test('should process multiple documents', async ({ page }) => {
      await page.goto('/sante/documents');

      await page.click('button:has-text("Traitement par lot")');

      // Upload multiple files
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles([
        { name: 'doc1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake1') },
        { name: 'doc2.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake2') },
        { name: 'doc3.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake3') },
      ]);

      // Start batch processing
      await page.click('button:has-text("Traiter")');

      // Wait for results
      await expect(page.locator('[data-testid="batch-results"]')).toBeVisible({ timeout: 60000 });

      // Verify summary
      await expect(page.locator('[data-testid="batch-summary"]')).toContainText('3');
    });
  });

  test.describe('OCR Validation', () => {
    test('should show validation warnings for low confidence', async ({ page }) => {
      await page.goto('/sante/documents');

      // Simulate low confidence result
      await page.click('button:has-text("Scanner un document")');

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'blurry.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('blurry-image'),
      });

      await expect(page.locator('[data-testid="validation-warning"]')).toBeVisible({ timeout: 30000 });
    });

    test('should allow manual correction of extracted data', async ({ page }) => {
      await page.goto('/sante/documents');

      await page.click('button:has-text("Scanner un document")');

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'ordonnance.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-image'),
      });

      await expect(page.locator('[data-testid="ocr-result"]')).toBeVisible({ timeout: 30000 });

      // Edit extracted field
      await page.click('[data-testid="edit-patient-name"]');
      await page.fill('[data-testid="patient-name-input"]', 'Nom Corrigé');
      await page.click('button:has-text("Sauvegarder")');

      await expect(page.locator('[data-testid="patient-name"]')).toContainText('Nom Corrigé');
    });
  });

  test.describe('OCR Statistics', () => {
    test('should display OCR stats for admin', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/sante/documents/stats');

      await expect(page.locator('[data-testid="total-processed"]')).toBeVisible();
      await expect(page.locator('[data-testid="average-confidence"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-rate"]')).toBeVisible();
      await expect(page.locator('[data-testid="by-type-chart"]')).toBeVisible();
    });
  });
});
