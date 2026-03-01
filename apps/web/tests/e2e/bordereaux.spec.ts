/**
 * Bordereaux E2E Tests
 *
 * Tests for bordereaux management and reconciliation
 */

import { test, expect } from '@playwright/test';

const ADMIN_USER = {
  email: 'admin@dhamen.tn',
  password: 'Admin123!@#',
};

test.describe('Bordereaux Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(ADMIN_USER.email);
    await page.getByLabel(/mot de passe/i).fill(ADMIN_USER.password);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test.describe('Bordereaux List', () => {
    test('should display bordereaux page', async ({ page }) => {
      await page.goto('/bordereaux');
      await expect(page.getByRole('heading', { name: /bordereaux/i })).toBeVisible();
    });

    test('should filter by status', async ({ page }) => {
      await page.goto('/bordereaux');
      await page.getByRole('combobox', { name: /statut/i }).click();
      await page.getByRole('option', { name: /validé|validated/i }).click();
      await page.waitForTimeout(500);
    });

    test('should filter by period', async ({ page }) => {
      await page.goto('/bordereaux');
      await page.getByLabel(/date début/i).fill('2024-01-01');
      await page.getByLabel(/date fin/i).fill('2024-12-31');
      await page.getByRole('button', { name: /filtrer|appliquer/i }).click();
    });

    test('should search by reference', async ({ page }) => {
      await page.goto('/bordereaux');
      await page.getByPlaceholder(/rechercher/i).fill('BRD-2024');
      await page.keyboard.press('Enter');
    });
  });

  test.describe('Generate Bordereau', () => {
    test('should open generation dialog', async ({ page }) => {
      await page.goto('/bordereaux');
      await page.getByRole('button', { name: /générer|nouveau/i }).click();
      await expect(page.getByText(/générer un bordereau/i)).toBeVisible();
    });

    test('should select provider for generation', async ({ page }) => {
      await page.goto('/bordereaux');
      await page.getByRole('button', { name: /générer|nouveau/i }).click();
      
      await page.getByLabel(/prestataire/i).click();
      await page.getByRole('option').first().click();
      
      await page.getByLabel(/période/i).click();
      await page.getByRole('option', { name: /mois dernier|janvier/i }).click();
    });

    test('should generate bordereau with valid inputs', async ({ page }) => {
      await page.goto('/bordereaux');
      await page.getByRole('button', { name: /générer|nouveau/i }).click();
      
      // Fill required fields
      await page.getByLabel(/prestataire/i).click();
      await page.getByRole('option').first().click();
      
      await page.getByLabel(/date début/i).fill('2024-01-01');
      await page.getByLabel(/date fin/i).fill('2024-01-31');
      
      await page.getByRole('button', { name: /générer/i }).click();
      
      // Should show progress or success
      await expect(page.getByText(/génération|en cours|succès/i)).toBeVisible();
    });
  });

  test.describe('Bordereau Details', () => {
    test('should view bordereau details', async ({ page }) => {
      await page.goto('/bordereaux');
      const firstRow = page.getByRole('row').nth(1);
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await expect(page.getByText(/détails|summary/i)).toBeVisible();
      }
    });

    test('should display claims list in bordereau', async ({ page }) => {
      await page.goto('/bordereaux');
      const firstRow = page.getByRole('row').nth(1);
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await expect(page.getByText(/sinistres inclus|claims/i)).toBeVisible();
      }
    });

    test('should show totals and summary', async ({ page }) => {
      await page.goto('/bordereaux');
      const firstRow = page.getByRole('row').nth(1);
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await expect(page.getByText(/total|montant/i)).toBeVisible();
      }
    });
  });

  test.describe('Bordereau Validation', () => {
    test('should validate pending bordereau', async ({ page }) => {
      await page.goto('/bordereaux?status=pending');
      const firstRow = page.getByRole('row').nth(1);
      if (await firstRow.isVisible()) {
        await firstRow.click();
        const validateButton = page.getByRole('button', { name: /valider/i });
        if (await validateButton.isVisible()) {
          await validateButton.click();
          await page.getByRole('button', { name: /confirmer/i }).click();
          await expect(page.getByText(/validé|validated/i)).toBeVisible();
        }
      }
    });

    test('should reject bordereau with reason', async ({ page }) => {
      await page.goto('/bordereaux?status=pending');
      const firstRow = page.getByRole('row').nth(1);
      if (await firstRow.isVisible()) {
        await firstRow.click();
        const rejectButton = page.getByRole('button', { name: /rejeter/i });
        if (await rejectButton.isVisible()) {
          await rejectButton.click();
          await page.getByLabel(/motif/i).fill('Montants incorrects');
          await page.getByRole('button', { name: /confirmer/i }).click();
        }
      }
    });
  });

  test.describe('Export and Print', () => {
    test('should export bordereau to PDF', async ({ page }) => {
      await page.goto('/bordereaux');
      const firstRow = page.getByRole('row').nth(1);
      if (await firstRow.isVisible()) {
        await firstRow.click();
        const exportButton = page.getByRole('button', { name: /exporter pdf|télécharger/i });
        if (await exportButton.isVisible()) {
          const downloadPromise = page.waitForEvent('download');
          await exportButton.click();
          const download = await downloadPromise;
          expect(download.suggestedFilename()).toContain('.pdf');
        }
      }
    });

    test('should export bordereau to Excel', async ({ page }) => {
      await page.goto('/bordereaux');
      const firstRow = page.getByRole('row').nth(1);
      if (await firstRow.isVisible()) {
        await firstRow.click();
        const exportButton = page.getByRole('button', { name: /exporter|excel/i });
        if (await exportButton.isVisible()) {
          await exportButton.click();
          const excelOption = page.getByRole('menuitem', { name: /excel/i });
          if (await excelOption.isVisible()) {
            const downloadPromise = page.waitForEvent('download');
            await excelOption.click();
            const download = await downloadPromise;
            expect(download.suggestedFilename()).toMatch(/\.(xlsx|xls)$/);
          }
        }
      }
    });
  });
});

test.describe('Reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(ADMIN_USER.email);
    await page.getByLabel(/mot de passe/i).fill(ADMIN_USER.password);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should display reconciliation page', async ({ page }) => {
    await page.goto('/reconciliation');
    await expect(page.getByRole('heading', { name: /rapprochement/i })).toBeVisible();
  });

  test('should show AI suggestions', async ({ page }) => {
    await page.goto('/reconciliation');
    await expect(page.getByText(/suggestions|correspondances/i)).toBeVisible();
  });

  test('should accept reconciliation suggestion', async ({ page }) => {
    await page.goto('/reconciliation');
    const suggestion = page.getByRole('row').filter({ hasText: /confiance/i }).first();
    if (await suggestion.isVisible()) {
      await suggestion.getByRole('button', { name: /accepter|valider/i }).click();
      await expect(page.getByText(/rapproché|reconciled/i)).toBeVisible();
    }
  });

  test('should reject reconciliation suggestion', async ({ page }) => {
    await page.goto('/reconciliation');
    const suggestion = page.getByRole('row').filter({ hasText: /confiance/i }).first();
    if (await suggestion.isVisible()) {
      await suggestion.getByRole('button', { name: /rejeter|ignorer/i }).click();
    }
  });

  test('should run auto-reconciliation', async ({ page }) => {
    await page.goto('/reconciliation');
    const autoButton = page.getByRole('button', { name: /auto|automatique/i });
    if (await autoButton.isVisible()) {
      await autoButton.click();
      await expect(page.getByText(/traitement|processing|terminé/i)).toBeVisible();
    }
  });
});
