/**
 * Claims E2E Tests
 *
 * Tests for claims management workflows
 */

import { test, expect } from '@playwright/test';

const ADMIN_USER = {
  email: 'admin@dhamen.tn',
  password: 'Admin123!@#',
};

const INSURER_AGENT = {
  email: 'agent@comar.tn',
  password: 'Agent123!@#',
};

test.describe('Claims Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(ADMIN_USER.email);
    await page.getByLabel(/mot de passe/i).fill(ADMIN_USER.password);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test.describe('Claims List', () => {
    test('should display claims list page', async ({ page }) => {
      await page.goto('/claims');
      await expect(page.getByRole('heading', { name: /sinistres/i })).toBeVisible();
      await expect(page.getByRole('table')).toBeVisible();
    });

    test('should filter claims by status', async ({ page }) => {
      await page.goto('/claims');
      await page.getByRole('combobox', { name: /statut/i }).click();
      await page.getByRole('option', { name: /en attente/i }).click();
      await expect(page.getByText(/pending|en attente/i)).toBeVisible();
    });

    test('should search claims by reference', async ({ page }) => {
      await page.goto('/claims');
      await page.getByPlaceholder(/rechercher/i).fill('CLM-2024');
      await page.keyboard.press('Enter');
      // Wait for filtered results
      await page.waitForTimeout(500);
    });

    test('should paginate claims list', async ({ page }) => {
      await page.goto('/claims');
      const nextButton = page.getByRole('button', { name: /suivant|next/i });
      if (await nextButton.isVisible()) {
        await nextButton.click();
        await expect(page).toHaveURL(/.*page=2/);
      }
    });
  });

  test.describe('Claim Details', () => {
    test('should view claim details', async ({ page }) => {
      await page.goto('/claims');
      // Click on first claim row
      const firstRow = page.getByRole('row').nth(1);
      await firstRow.click();
      // Should show claim details
      await expect(page.getByText(/détails du sinistre|claim details/i)).toBeVisible();
    });

    test('should display claim information', async ({ page }) => {
      await page.goto('/claims');
      const firstRow = page.getByRole('row').nth(1);
      await firstRow.click();
      
      // Check for essential fields
      await expect(page.getByText(/référence/i)).toBeVisible();
      await expect(page.getByText(/montant/i)).toBeVisible();
      await expect(page.getByText(/statut/i)).toBeVisible();
      await expect(page.getByText(/adhérent/i)).toBeVisible();
    });
  });

  test.describe('Claim Actions', () => {
    test('should approve a pending claim', async ({ page }) => {
      await page.goto('/claims?status=pending');
      const firstRow = page.getByRole('row').nth(1);
      await firstRow.click();
      
      // Click approve button
      const approveButton = page.getByRole('button', { name: /approuver/i });
      if (await approveButton.isVisible()) {
        await approveButton.click();
        // Confirm dialog
        await page.getByRole('button', { name: /confirmer/i }).click();
        await expect(page.getByText(/approuvé|approved/i)).toBeVisible();
      }
    });

    test('should reject a pending claim', async ({ page }) => {
      await page.goto('/claims?status=pending');
      const firstRow = page.getByRole('row').nth(1);
      await firstRow.click();
      
      const rejectButton = page.getByRole('button', { name: /rejeter/i });
      if (await rejectButton.isVisible()) {
        await rejectButton.click();
        // Fill rejection reason
        await page.getByLabel(/motif/i).fill('Documents insuffisants');
        await page.getByRole('button', { name: /confirmer/i }).click();
        await expect(page.getByText(/rejeté|rejected/i)).toBeVisible();
      }
    });
  });

  test.describe('Create Claim', () => {
    test('should open new claim form', async ({ page }) => {
      await page.goto('/claims');
      await page.getByRole('button', { name: /nouveau sinistre|ajouter/i }).click();
      await expect(page.getByText(/nouveau sinistre/i)).toBeVisible();
    });

    test('should validate required fields', async ({ page }) => {
      await page.goto('/claims/new');
      await page.getByRole('button', { name: /soumettre|créer/i }).click();
      await expect(page.getByText(/requis|obligatoire/i)).toBeVisible();
    });

    test('should create a new claim', async ({ page }) => {
      await page.goto('/claims/new');
      
      // Fill the form
      await page.getByLabel(/adhérent/i).click();
      await page.getByRole('option').first().click();
      
      await page.getByLabel(/type de soin/i).click();
      await page.getByRole('option', { name: /consultation/i }).click();
      
      await page.getByLabel(/montant/i).fill('150');
      await page.getByLabel(/description/i).fill('Consultation médecin généraliste');
      
      await page.getByRole('button', { name: /soumettre|créer/i }).click();
      
      // Should redirect or show success
      await expect(page.getByText(/créé avec succès|created successfully/i)).toBeVisible();
    });
  });

  test.describe('Claim Export', () => {
    test('should export claims to CSV', async ({ page }) => {
      await page.goto('/claims');
      
      const exportButton = page.getByRole('button', { name: /exporter/i });
      if (await exportButton.isVisible()) {
        // Start waiting for download before clicking
        const downloadPromise = page.waitForEvent('download');
        await exportButton.click();
        await page.getByRole('menuitem', { name: /csv/i }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.csv');
      }
    });
  });
});

test.describe('Claims - Insurer Agent View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(INSURER_AGENT.email);
    await page.getByLabel(/mot de passe/i).fill(INSURER_AGENT.password);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should only see claims for their insurer', async ({ page }) => {
    await page.goto('/claims');
    // Agent should only see claims related to their insurer
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('should be able to process claims', async ({ page }) => {
    await page.goto('/claims');
    const firstRow = page.getByRole('row').nth(1);
    if (await firstRow.isVisible()) {
      await firstRow.click();
      // Should have action buttons
      const approveButton = page.getByRole('button', { name: /approuver/i });
      const rejectButton = page.getByRole('button', { name: /rejeter/i });
      expect(await approveButton.isVisible() || await rejectButton.isVisible()).toBeTruthy();
    }
  });
});
