/**
 * CNAM Integration E2E Tests
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsGestionnaire, loginAsPharmacist } from './fixtures';

test.describe('CNAM Integration', () => {
  test.describe('Affiliate Verification', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsGestionnaire(page);
    });

    test('should verify active CNAM affiliate', async ({ page }) => {
      await page.goto('/eligibility');

      // Enter matricule
      await page.fill('[data-testid="matricule-input"]', '12345678A');
      await page.click('button:has-text("Vérifier CNAM")');

      // Wait for result
      await expect(page.locator('[data-testid="cnam-result"]')).toBeVisible({ timeout: 10000 });

      // Verify affiliate info
      await expect(page.locator('[data-testid="affiliate-status"]')).toContainText('ACTIF');
      await expect(page.locator('[data-testid="regime"]')).toBeVisible();
      await expect(page.locator('[data-testid="couverture"]')).toBeVisible();
    });

    test('should show error for invalid matricule', async ({ page }) => {
      await page.goto('/eligibility');

      await page.fill('[data-testid="matricule-input"]', 'INVALID');
      await page.click('button:has-text("Vérifier CNAM")');

      await expect(page.locator('[data-testid="error-message"]')).toContainText('non trouvé');
    });

    test('should display ayants-droit', async ({ page }) => {
      await page.goto('/eligibility');

      await page.fill('[data-testid="matricule-input"]', '12345678A');
      await page.click('button:has-text("Vérifier CNAM")');

      await expect(page.locator('[data-testid="cnam-result"]')).toBeVisible();

      // Check for beneficiaries
      await page.click('button:has-text("Ayants-droit")');
      await expect(page.locator('[data-testid="ayants-droit-list"]')).toBeVisible();
    });
  });

  test.describe('PEC Requests', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsPharmacist(page);
    });

    test('should request PEC for pharmacy', async ({ page }) => {
      await page.goto('/claims/new');

      // Fill claim form
      await page.fill('[data-testid="matricule-assure"]', '12345678A');
      await page.selectOption('[data-testid="type-prestation"]', 'PHARMACIE');

      // Add medications
      await page.click('button:has-text("Ajouter médicament")');
      await page.fill('[data-testid="code-acte-0"]', 'PARACETAMOL');
      await page.fill('[data-testid="quantite-0"]', '2');
      await page.fill('[data-testid="prix-0"]', '5.000');

      // Request PEC
      await page.click('button:has-text("Demander PEC")');

      // Verify PEC response
      await expect(page.locator('[data-testid="pec-result"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="pec-status"]')).toContainText('ACCEPTEE');
      await expect(page.locator('[data-testid="numero-pec"]')).toBeVisible();
      await expect(page.locator('[data-testid="montant-pris-en-charge"]')).toBeVisible();
    });

    test('should show rejection for inactive affiliate', async ({ page }) => {
      await page.goto('/claims/new');

      await page.fill('[data-testid="matricule-assure"]', 'INACTIVE123');
      await page.selectOption('[data-testid="type-prestation"]', 'PHARMACIE');

      await page.click('button:has-text("Demander PEC")');

      await expect(page.locator('[data-testid="pec-status"]')).toContainText('REFUSEE');
      await expect(page.locator('[data-testid="motif-refus"]')).toBeVisible();
    });

    test('should handle plafond exceeded', async ({ page }) => {
      await page.goto('/claims/new');

      await page.fill('[data-testid="matricule-assure"]', '12345678A');
      await page.selectOption('[data-testid="type-prestation"]', 'HOSPITALISATION');

      // Add high-value claim
      await page.fill('[data-testid="montant-total"]', '10000.000');

      await page.click('button:has-text("Demander PEC")');

      // Should show partial coverage or warning
      await expect(page.locator('[data-testid="pec-result"]')).toBeVisible();
    });
  });

  test.describe('Tarification', () => {
    test('should lookup tarif for act code', async ({ page }) => {
      await loginAsGestionnaire(page);
      await page.goto('/tarification');

      await page.fill('[data-testid="code-acte"]', 'C');
      await page.click('button:has-text("Rechercher")');

      await expect(page.locator('[data-testid="tarif-result"]')).toBeVisible();
      await expect(page.locator('[data-testid="libelle-acte"]')).toContainText('Consultation');
      await expect(page.locator('[data-testid="tarif-conventionne"]')).toBeVisible();
      await expect(page.locator('[data-testid="tarif-remboursement"]')).toBeVisible();
    });

    test('should check medication formulary', async ({ page }) => {
      await loginAsPharmacist(page);
      await page.goto('/tarification/medicaments');

      await page.fill('[data-testid="code-dci"]', 'PARACETAMOL');
      await page.click('button:has-text("Vérifier")');

      await expect(page.locator('[data-testid="medicament-result"]')).toBeVisible();
      await expect(page.locator('[data-testid="est-rembourse"]')).toContainText('Oui');
      await expect(page.locator('[data-testid="taux-remboursement"]')).toBeVisible();
    });
  });

  test.describe('Providers Directory', () => {
    test('should list contracted providers', async ({ page }) => {
      await loginAsGestionnaire(page);
      await page.goto('/cnam/providers');

      await expect(page.locator('[data-testid="providers-table"]')).toBeVisible();
      await expect(page.locator('[data-testid="provider-row"]').first()).toBeVisible();
    });

    test('should filter providers by region', async ({ page }) => {
      await loginAsGestionnaire(page);
      await page.goto('/cnam/providers');

      await page.selectOption('[data-testid="region-filter"]', 'Tunis');
      await page.click('button:has-text("Filtrer")');

      const rows = page.locator('[data-testid="provider-row"]');
      await expect(rows.first()).toBeVisible();
    });

    test('should filter providers by specialty', async ({ page }) => {
      await loginAsGestionnaire(page);
      await page.goto('/cnam/providers');

      await page.selectOption('[data-testid="type-filter"]', 'MEDECIN');
      await page.click('button:has-text("Filtrer")');

      await expect(page.locator('[data-testid="providers-table"]')).toBeVisible();
    });
  });

  test.describe('CNAM Statistics', () => {
    test('should display integration stats', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/cnam/stats');

      await expect(page.locator('[data-testid="total-verifications"]')).toBeVisible();
      await expect(page.locator('[data-testid="total-pec"]')).toBeVisible();
      await expect(page.locator('[data-testid="taux-acceptation"]')).toBeVisible();
      await expect(page.locator('[data-testid="montant-total"]')).toBeVisible();
    });
  });
});
