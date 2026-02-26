/**
 * SoinFlow E2E Tests
 *
 * Tests for the SoinFlow health reimbursement module
 */
import { test, expect, TEST_USERS } from './fixtures';

test.describe('SoinFlow Demandes', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    // Login as SOIN_GESTIONNAIRE or ADMIN
    await loginAs('admin');
  });

  test('should display demandes list page', async ({ page }) => {
    await page.goto('/sante/demandes');

    // Check page title
    await expect(page.locator('h1')).toContainText('Demandes SoinFlow');

    // Check stats cards are visible
    await expect(page.locator('text=Total')).toBeVisible();
    await expect(page.locator('text=A traiter')).toBeVisible();
    await expect(page.locator('text=Montant demande')).toBeVisible();
  });

  test('should filter demandes by status', async ({ page }) => {
    await page.goto('/sante/demandes');

    // Open status filter
    await page.click('button:has-text("Statut")');

    // Select a status (e.g., Soumise)
    await page.click('text=Soumise');

    // Wait for filter to apply
    await page.waitForResponse((response) =>
      response.url().includes('/sante/demandes') && response.status() === 200
    );

    // Check URL has filter applied
    await expect(page).toHaveURL(/statut=soumise/);
  });

  test('should open demande details dialog', async ({ page }) => {
    await page.goto('/sante/demandes');

    // Wait for data to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {
      // No demandes might be available
    });

    // If there are demandes, click on details button
    const detailsButton = page.locator('button:has-text("Details")').first();
    if (await detailsButton.isVisible()) {
      await detailsButton.click();

      // Check dialog opened
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    }
  });
});

test.describe('SoinFlow Bordereaux', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should display bordereaux list page', async ({ page }) => {
    await page.goto('/sante/bordereaux');

    // Check page title
    await expect(page.locator('h1')).toContainText('Bordereaux SoinFlow');

    // Check generate button is visible
    await expect(page.locator('button:has-text("Generer bordereau")')).toBeVisible();

    // Check stats cards
    await expect(page.locator('text=Total')).toBeVisible();
    await expect(page.locator('text=Demandes')).toBeVisible();
    await expect(page.locator('text=Montant total')).toBeVisible();
  });

  test('should open create bordereau dialog', async ({ page }) => {
    await page.goto('/sante/bordereaux');

    // Click generate button
    await page.click('button:has-text("Generer bordereau")');

    // Check dialog opened
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('text=Generer un bordereau')).toBeVisible();

    // Check form fields
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.locator('input[type="date"]').last()).toBeVisible();
  });

  test('should filter bordereaux by status', async ({ page }) => {
    await page.goto('/sante/bordereaux');

    // Open status filter
    await page.click('button:has-text("Statut")');

    // Select a status
    await page.click('text=Genere');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Check URL has filter
    await expect(page).toHaveURL(/statut=genere/);
  });
});

test.describe('SoinFlow Paiements', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should display paiements list page', async ({ page }) => {
    await page.goto('/sante/paiements');

    // Check page title
    await expect(page.locator('h1')).toContainText('Paiements SoinFlow');

    // Check stats cards
    await expect(page.locator('text=Total')).toBeVisible();
    await expect(page.locator('text=Montant total')).toBeVisible();
    await expect(page.locator('text=En attente')).toBeVisible();
    await expect(page.locator('text=Payes')).toBeVisible();
  });

  test('should filter paiements by status', async ({ page }) => {
    await page.goto('/sante/paiements');

    // Open status filter
    await page.click('button:has-text("Statut")');

    // Select a status
    await page.click('text=En attente');

    // Wait for filter
    await page.waitForTimeout(500);

    // Check URL has filter
    await expect(page).toHaveURL(/statut=en_attente/);
  });

  test('should show checkbox for batch selection', async ({ page }) => {
    await page.goto('/sante/paiements');

    // Wait for table
    await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});

    // Check header checkbox exists
    const headerCheckbox = page.locator('thead input[type="checkbox"]');
    await expect(headerCheckbox).toBeVisible();
  });

  test('should open batch dialog when items selected', async ({ page }) => {
    await page.goto('/sante/paiements');

    // Wait for data
    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    // Check if there are selectable rows
    const rowCheckbox = page.locator('tbody input[type="checkbox"]').first();

    if (await rowCheckbox.isVisible()) {
      // Select the row
      await rowCheckbox.click();

      // Check batch button appears
      const batchButton = page.locator('button:has-text("Traiter")');
      if (await batchButton.isVisible()) {
        await batchButton.click();

        // Check dialog opens
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        await expect(page.locator('text=Traitement par lot')).toBeVisible();
      }
    }
  });
});

test.describe('SoinFlow Navigation', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should navigate between SoinFlow pages', async ({ page }) => {
    // Start at dashboard
    await page.goto('/dashboard');

    // Navigate to demandes
    await page.click('text=Demandes Sante');
    await expect(page).toHaveURL('/sante/demandes');

    // Navigate to bordereaux
    await page.click('text=Bordereaux Sante');
    await expect(page).toHaveURL('/sante/bordereaux');

    // Navigate to paiements
    await page.click('text=Paiements Sante');
    await expect(page).toHaveURL('/sante/paiements');
  });

  test('should show SoinFlow menu items for admin', async ({ page }) => {
    await page.goto('/dashboard');

    // Check all SoinFlow menu items are visible
    await expect(page.locator('text=Demandes Sante')).toBeVisible();
    await expect(page.locator('text=Bordereaux Sante')).toBeVisible();
    await expect(page.locator('text=Paiements Sante')).toBeVisible();
  });
});

test.describe('SoinFlow Responsive', () => {
  test('should be usable on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/sante/demandes');

    // Page should load
    await expect(page.locator('h1')).toContainText('Demandes');

    // Stats should be visible
    await expect(page.locator('text=Total')).toBeVisible();
  });

  test('should handle tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/sante/bordereaux');

    // Page should load properly
    await expect(page.locator('h1')).toContainText('Bordereaux');

    // Generate button should be visible
    await expect(page.locator('button:has-text("Generer")')).toBeVisible();
  });
});
