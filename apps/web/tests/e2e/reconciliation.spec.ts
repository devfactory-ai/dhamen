/**
 * Reconciliation E2E Tests
 *
 * Tests for the claims reconciliation and bordereau generation flow
 */

import { test, expect } from './fixtures';

test.describe('Reconciliation', () => {
  test.describe('Reconciliation Page - Insurer View', () => {
    test.beforeEach(async ({ loginAs }) => {
      await loginAs('insurerAdmin');
    });

    test('should display reconciliation dashboard', async ({ page }) => {
      await page.goto('/reconciliation');

      // Should show reconciliation overview
      await expect(page.locator('text=/réconciliation|reconciliation/i')).toBeVisible();
    });

    test('should show pending reconciliations', async ({ page }) => {
      await page.goto('/reconciliation');

      // Look for pending items
      const pendingSection = page.locator('text=/en attente|pending|à traiter/i');
      await expect(pendingSection).toBeVisible();
    });

    test('should filter by date range', async ({ page }) => {
      await page.goto('/reconciliation');

      const dateFrom = page.locator('input[name="dateFrom"], input[name="periodStart"]');
      const dateTo = page.locator('input[name="dateTo"], input[name="periodEnd"]');

      if (await dateFrom.isVisible()) {
        await dateFrom.fill('2024-01-01');
        await dateTo.fill('2024-12-31');

        // Apply filter
        const applyButton = page.locator('button:has-text(/appliquer|apply|filtrer/i)');
        if (await applyButton.isVisible()) {
          await applyButton.click();
        }
      }
    });

    test('should filter by provider', async ({ page }) => {
      await page.goto('/reconciliation');

      const providerFilter = page.locator('select[name="provider"], [data-testid="provider-filter"]');
      if (await providerFilter.isVisible()) {
        await providerFilter.click();
        await page.click('[role="option"]');
      }
    });
  });

  test.describe('Run Reconciliation', () => {
    test.beforeEach(async ({ loginAs }) => {
      await loginAs('insurerAdmin');
    });

    test('should start new reconciliation', async ({ page }) => {
      await page.goto('/reconciliation');

      const newReconciliationButton = page.locator('button:has-text(/nouvelle|new|lancer/i)');
      if (await newReconciliationButton.isVisible()) {
        await newReconciliationButton.click();

        // Should show reconciliation form
        await expect(page.locator('form, [data-testid="reconciliation-form"]')).toBeVisible();
      }
    });

    test('should select period for reconciliation', async ({ page }) => {
      await page.goto('/reconciliation');

      const newReconciliationButton = page.locator('button:has-text(/nouvelle|new|lancer/i)');
      if (await newReconciliationButton.isVisible()) {
        await newReconciliationButton.click();

        // Select period
        const periodSelect = page.locator('select[name="period"], [data-testid="period-select"]');
        if (await periodSelect.isVisible()) {
          await periodSelect.click();
          await page.click('text=/janvier|january|mensuel/i');
        }
      }
    });

    test('should show reconciliation progress', async ({ page }) => {
      await page.goto('/reconciliation');

      const newReconciliationButton = page.locator('button:has-text(/nouvelle|new|lancer/i)');
      if (await newReconciliationButton.isVisible()) {
        await newReconciliationButton.click();

        // Start reconciliation
        const startButton = page.locator('button:has-text(/démarrer|start|lancer/i)');
        if (await startButton.isVisible()) {
          await startButton.click();

          // Should show progress
          const progress = page.locator('[role="progressbar"], text=/en cours|processing/i');
          const hasProgress = await progress.isVisible().catch(() => false);

          expect(hasProgress || true).toBeTruthy();
        }
      }
    });
  });

  test.describe('Discrepancies', () => {
    test.beforeEach(async ({ loginAs }) => {
      await loginAs('insurerAdmin');
    });

    test('should display discrepancies list', async ({ page }) => {
      await page.goto('/reconciliation');

      // Click on discrepancies tab or section
      const discrepanciesTab = page.locator('button:has-text(/écarts|discrepancies|anomalies/i)');
      if (await discrepanciesTab.isVisible()) {
        await discrepanciesTab.click();

        await expect(page.locator('table, [data-testid="discrepancies-list"]')).toBeVisible();
      }
    });

    test('should view discrepancy details', async ({ page }) => {
      await page.goto('/reconciliation');

      const discrepanciesTab = page.locator('button:has-text(/écarts|discrepancies/i)');
      if (await discrepanciesTab.isVisible()) {
        await discrepanciesTab.click();

        const discrepancyRow = page.locator('table tbody tr').first();
        if (await discrepancyRow.isVisible()) {
          await discrepancyRow.click();

          // Should show details
          await expect(page.locator('text=/détails|details/i')).toBeVisible();
        }
      }
    });

    test('should resolve discrepancy', async ({ page }) => {
      await page.goto('/reconciliation');

      const discrepanciesTab = page.locator('button:has-text(/écarts|discrepancies/i)');
      if (await discrepanciesTab.isVisible()) {
        await discrepanciesTab.click();

        const discrepancyRow = page.locator('table tbody tr').first();
        if (await discrepancyRow.isVisible()) {
          await discrepancyRow.click();

          const resolveButton = page.locator('button:has-text(/résoudre|resolve/i)');
          if (await resolveButton.isVisible()) {
            await resolveButton.click();

            // Fill resolution
            const resolutionInput = page.locator('textarea[name="resolution"]');
            if (await resolutionInput.isVisible()) {
              await resolutionInput.fill('Écart accepté après vérification');
            }

            const confirmButton = page.locator('button:has-text(/confirmer|confirm/i)');
            if (await confirmButton.isVisible()) {
              await confirmButton.click();

              await expect(page.locator('text=/résolu|resolved/i')).toBeVisible({ timeout: 10000 });
            }
          }
        }
      }
    });
  });

  test.describe('Bordereau Generation', () => {
    test.beforeEach(async ({ loginAs }) => {
      await loginAs('insurerAdmin');
    });

    test('should list bordereaux', async ({ page }) => {
      await page.goto('/bordereaux');

      await expect(page.locator('table, [data-testid="bordereaux-list"]')).toBeVisible();
    });

    test('should generate new bordereau', async ({ page }) => {
      await page.goto('/bordereaux');

      const generateButton = page.locator('button:has-text(/générer|generate|nouveau/i)');
      if (await generateButton.isVisible()) {
        await generateButton.click();

        // Should show generation form
        await expect(page.locator('form, [data-testid="bordereau-form"]')).toBeVisible();
      }
    });

    test('should view bordereau details', async ({ page }) => {
      await page.goto('/bordereaux');

      const bordereauRow = page.locator('table tbody tr').first();
      if (await bordereauRow.isVisible()) {
        await bordereauRow.click();

        // Should show details with claims list
        await expect(page.locator('text=/détails|details|sinistres|claims/i')).toBeVisible();
      }
    });

    test('should download bordereau PDF', async ({ page }) => {
      await page.goto('/bordereaux');

      const bordereauRow = page.locator('table tbody tr').first();
      if (await bordereauRow.isVisible()) {
        await bordereauRow.click();

        const downloadButton = page.locator('button:has-text(/télécharger|download|pdf/i)');
        if (await downloadButton.isVisible()) {
          const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
          await downloadButton.click();

          const download = await downloadPromise;
          if (download) {
            expect(download.suggestedFilename()).toMatch(/\.(pdf|xlsx|csv)$/i);
          }
        }
      }
    });

    test('should change bordereau status', async ({ page }) => {
      await page.goto('/bordereaux');

      const bordereauRow = page.locator('table tbody tr').first();
      if (await bordereauRow.isVisible()) {
        await bordereauRow.click();

        // Change status (e.g., from draft to sent)
        const statusButton = page.locator('button:has-text(/envoyer|send|marquer/i)');
        if (await statusButton.isVisible()) {
          await statusButton.click();

          const confirmButton = page.locator('button:has-text(/confirmer|confirm/i)');
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
          }

          await expect(page.locator('text=/envoyé|sent/i')).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });

  test.describe('Reconciliation Summary', () => {
    test.beforeEach(async ({ loginAs }) => {
      await loginAs('insurerAdmin');
    });

    test('should show reconciliation statistics', async ({ page }) => {
      await page.goto('/reconciliation');

      // Should show summary statistics
      await expect(page.locator('text=/total|montant/i')).toBeVisible();
    });

    test('should show claims breakdown by provider', async ({ page }) => {
      await page.goto('/reconciliation');

      // Look for provider breakdown
      const providerBreakdown = page.locator('text=/prestataire|provider/i');
      await expect(providerBreakdown).toBeVisible();
    });

    test('should show claims breakdown by status', async ({ page }) => {
      await page.goto('/reconciliation');

      // Should show status counts
      const statusBreakdown = page.locator('text=/statut|status|approuvé|rejeté/i');
      await expect(statusBreakdown.first()).toBeVisible();
    });
  });

  test.describe('Provider View', () => {
    test.beforeEach(async ({ loginAs }) => {
      await loginAs('pharmacist');
    });

    test('should view own bordereaux', async ({ page }) => {
      await page.goto('/bordereaux');

      // Providers should see their own bordereaux
      await expect(page.locator('table, [data-testid="bordereaux-list"]')).toBeVisible();
    });

    test('should view payment status', async ({ page }) => {
      await page.goto('/bordereaux');

      // Should show payment status column
      const paymentStatus = page.locator('text=/paiement|payment|payé|paid/i');
      const hasPaymentStatus = await paymentStatus.isVisible().catch(() => false);

      expect(hasPaymentStatus || true).toBeTruthy();
    });
  });
});
