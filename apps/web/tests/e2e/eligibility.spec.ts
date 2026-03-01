/**
 * Eligibility E2E Tests
 *
 * Tests for eligibility verification workflows
 */

import { test, expect } from '@playwright/test';

const PROVIDER_USER = {
  email: 'pharmacien@pharma-centrale.tn',
  password: 'Pharma123!@#',
};

test.describe('Eligibility Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(PROVIDER_USER.email);
    await page.getByLabel(/mot de passe/i).fill(PROVIDER_USER.password);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test.describe('Quick Eligibility Check', () => {
    test('should display eligibility page', async ({ page }) => {
      await page.goto('/eligibility');
      await expect(page.getByRole('heading', { name: /éligibilité|eligibility/i })).toBeVisible();
    });

    test('should search adherent by number', async ({ page }) => {
      await page.goto('/eligibility');
      await page.getByPlaceholder(/numéro adhérent|adherent number/i).fill('ADH-2024-001');
      await page.getByRole('button', { name: /vérifier|check/i }).click();
      await page.waitForTimeout(1000);
    });

    test('should search adherent by CIN', async ({ page }) => {
      await page.goto('/eligibility');
      await page.getByPlaceholder(/cin/i).fill('12345678');
      await page.getByRole('button', { name: /vérifier|check/i }).click();
      await page.waitForTimeout(1000);
    });

    test('should display eligibility result', async ({ page }) => {
      await page.goto('/eligibility');
      await page.getByPlaceholder(/numéro adhérent/i).fill('ADH-2024-001');
      await page.getByRole('button', { name: /vérifier/i }).click();
      
      // Should show result (eligible or not)
      await expect(page.getByText(/éligible|non éligible|eligible|not eligible/i)).toBeVisible();
    });

    test('should show coverage details when eligible', async ({ page }) => {
      await page.goto('/eligibility');
      await page.getByPlaceholder(/numéro adhérent/i).fill('ADH-2024-001');
      await page.getByRole('button', { name: /vérifier/i }).click();
      
      const coverageSection = page.getByText(/couverture|coverage/i);
      if (await coverageSection.isVisible()) {
        await expect(page.getByText(/taux|rate|%/i)).toBeVisible();
      }
    });

    test('should show reason when not eligible', async ({ page }) => {
      await page.goto('/eligibility');
      await page.getByPlaceholder(/numéro adhérent/i).fill('INVALID-001');
      await page.getByRole('button', { name: /vérifier/i }).click();
      
      // Should show error or reason
      await expect(page.getByText(/non trouvé|expiré|invalide|not found|expired/i)).toBeVisible();
    });
  });

  test.describe('Eligibility by Care Type', () => {
    test('should check eligibility for consultation', async ({ page }) => {
      await page.goto('/eligibility');
      await page.getByPlaceholder(/numéro adhérent/i).fill('ADH-2024-001');
      await page.getByLabel(/type de soin/i).click();
      await page.getByRole('option', { name: /consultation/i }).click();
      await page.getByRole('button', { name: /vérifier/i }).click();
    });

    test('should check eligibility for pharmacy', async ({ page }) => {
      await page.goto('/eligibility');
      await page.getByPlaceholder(/numéro adhérent/i).fill('ADH-2024-001');
      await page.getByLabel(/type de soin/i).click();
      await page.getByRole('option', { name: /pharmacie/i }).click();
      await page.getByRole('button', { name: /vérifier/i }).click();
    });

    test('should check eligibility for hospitalization', async ({ page }) => {
      await page.goto('/eligibility');
      await page.getByPlaceholder(/numéro adhérent/i).fill('ADH-2024-001');
      await page.getByLabel(/type de soin/i).click();
      await page.getByRole('option', { name: /hospitalisation/i }).click();
      await page.getByRole('button', { name: /vérifier/i }).click();
    });
  });

  test.describe('QR Code Scan', () => {
    test('should have QR scan option', async ({ page }) => {
      await page.goto('/eligibility');
      await expect(page.getByRole('button', { name: /scanner|qr/i })).toBeVisible();
    });
  });

  test.describe('Eligibility History', () => {
    test('should show recent checks', async ({ page }) => {
      await page.goto('/eligibility');
      await expect(page.getByText(/récent|historique|history/i)).toBeVisible();
    });
  });
});
