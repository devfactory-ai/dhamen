/**
 * Workflows E2E Tests
 *
 * Tests for the SoinFlow workflow management module
 */
import { test, expect } from './fixtures';

test.describe('SoinFlow Workflows', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('admin');
  });

  test('should display workflows page', async ({ page }) => {
    await page.goto('/sante/workflows');

    // Check page title
    await expect(page.locator('h1')).toContainText('Workflows en attente');

    // Check stats cards are visible
    await expect(page.locator('text=Total')).toBeVisible();
    await expect(page.locator('text=Demandes d\'info')).toBeVisible();
    await expect(page.locator('text=Escalades')).toBeVisible();
    await expect(page.locator('text=Validations')).toBeVisible();
  });

  test('should show tabs for filtering workflow types', async ({ page }) => {
    await page.goto('/sante/workflows');

    // Check tabs are visible
    await expect(page.locator('button[role="tab"]:has-text("Tous")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Infos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Escalades")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Validations")')).toBeVisible();
  });

  test('should filter workflows by type when clicking tabs', async ({ page }) => {
    await page.goto('/sante/workflows');

    // Click on Escalades tab
    await page.click('button[role="tab"]:has-text("Escalades")');

    // Tab should be active
    await expect(page.locator('button[role="tab"]:has-text("Escalades")')).toHaveAttribute(
      'data-state',
      'active'
    );
  });

  test('should open workflow action dialog when clicking Traiter', async ({ page }) => {
    await page.goto('/sante/workflows');

    // Wait for data to load
    await page.waitForSelector('[data-testid="workflow-card"]', { timeout: 10000 }).catch(() => {
      // No workflows might be available
    });

    // If there are workflows, click on action button
    const actionButton = page.locator('button:has-text("Traiter")').first();
    if (await actionButton.isVisible()) {
      await actionButton.click();

      // Check dialog opened
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    }
  });

  test('should show loading spinner while fetching workflows', async ({ page }) => {
    // Intercept the API call to add delay
    await page.route('**/sante/workflows/pending/my', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    await page.goto('/sante/workflows');

    // Check loading spinner is visible
    await expect(page.locator('.animate-spin')).toBeVisible();
  });

  test('should show empty state when no workflows', async ({ page }) => {
    // Mock empty response
    await page.route('**/sante/workflows/pending/my', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    await page.goto('/sante/workflows');

    // Wait for loading to complete
    await page.waitForSelector('text=Aucun workflow en attente', { timeout: 10000 });

    // Check empty state is visible
    await expect(page.locator('text=Aucun workflow en attente')).toBeVisible();
  });
});

test.describe('Workflow Info Request', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('admin');
  });

  test('should show info request form in dialog', async ({ page }) => {
    // Mock workflow data with info_request type
    await page.route('**/sante/workflows/pending/my', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'wf_001',
              demandeId: 'dem_001',
              type: 'info_request',
              status: 'in_progress',
              currentStep: 1,
              steps: [
                {
                  id: 'step_001',
                  stepNumber: 1,
                  type: 'info_request',
                  status: 'in_progress',
                  requiredAction: 'Fournir documents manquants',
                },
              ],
              metadata: { reason: 'Documents incomplets' },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              demande: { numero: 'DEM-2024-001', montant: 150000, typeSoin: 'CONSULTATION' },
            },
          ],
        }),
      });
    });

    await page.goto('/sante/workflows');

    // Click action button
    await page.click('button:has-text("Traiter")');

    // Check dialog title
    await expect(page.locator('[role="dialog"]')).toContainText('Valider les informations');

    // Check textarea is visible
    await expect(page.locator('textarea')).toBeVisible();

    // Check buttons are visible
    await expect(page.locator('button:has-text("Annuler")')).toBeVisible();
    await expect(page.locator('button:has-text("Confirmer")')).toBeVisible();
  });
});

test.describe('Workflow Escalation', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('admin');
  });

  test('should show escalation form with decision buttons', async ({ page }) => {
    // Mock workflow data with escalation type
    await page.route('**/sante/workflows/pending/my', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'wf_002',
              demandeId: 'dem_002',
              type: 'escalation',
              status: 'in_progress',
              currentStep: 1,
              steps: [
                {
                  id: 'step_002',
                  stepNumber: 1,
                  type: 'approval',
                  status: 'in_progress',
                  requiredAction: 'Approuver ou rejeter',
                },
              ],
              metadata: { reason: 'Montant eleve', priority: 'high' },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              demande: { numero: 'DEM-2024-002', montant: 5000000, typeSoin: 'HOSPITALISATION' },
            },
          ],
        }),
      });
    });

    await page.goto('/sante/workflows');

    // Click Escalades tab
    await page.click('button[role="tab"]:has-text("Escalades")');

    // Click action button
    await page.click('button:has-text("Traiter")');

    // Check dialog title
    await expect(page.locator('[role="dialog"]')).toContainText('Resoudre l\'escalade');

    // Check decision buttons are visible
    await expect(page.locator('button:has-text("Approuver")')).toBeVisible();
    await expect(page.locator('button:has-text("Rejeter")')).toBeVisible();
    await expect(page.locator('button:has-text("Retourner")')).toBeVisible();
  });
});

test.describe('Workflow Multi-Validation', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('admin');
  });

  test('should show validation form with approve/reject buttons', async ({ page }) => {
    // Mock workflow data with multi_validation type
    await page.route('**/sante/workflows/pending/my', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'wf_003',
              demandeId: 'dem_003',
              type: 'multi_validation',
              status: 'in_progress',
              currentStep: 2,
              steps: [
                {
                  id: 'step_003a',
                  stepNumber: 1,
                  type: 'approval',
                  status: 'completed',
                  requiredAction: 'Validation niveau 1',
                  completedAt: new Date().toISOString(),
                },
                {
                  id: 'step_003b',
                  stepNumber: 2,
                  type: 'approval',
                  status: 'in_progress',
                  requiredAction: 'Validation niveau 2',
                },
              ],
              metadata: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              demande: { numero: 'DEM-2024-003', montant: 2500000, typeSoin: 'LABORATOIRE' },
            },
          ],
        }),
      });
    });

    await page.goto('/sante/workflows');

    // Click Validations tab
    await page.click('button[role="tab"]:has-text("Validations")');

    // Click action button
    await page.click('button:has-text("Traiter")');

    // Check dialog title contains validation level
    await expect(page.locator('[role="dialog"]')).toContainText('Validation niveau');

    // Check validation level info is visible
    await expect(page.locator('[role="dialog"]')).toContainText('2');

    // Check decision buttons are visible
    await expect(page.locator('button:has-text("Valider")')).toBeVisible();
    await expect(page.locator('button:has-text("Rejeter")')).toBeVisible();
  });
});

test.describe('Workflows Navigation', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('admin');
  });

  test('should navigate to workflows from sidebar', async ({ page }) => {
    await page.goto('/dashboard');

    // Click on Workflows in sidebar
    await page.click('text=Workflows');
    await expect(page).toHaveURL('/sante/workflows');
  });

  test('should show workflows menu for SOIN_GESTIONNAIRE role', async ({ page, loginAs }) => {
    await loginAs('soinGestionnaire');
    await page.goto('/dashboard');

    // Check Workflows menu item is visible
    await expect(page.locator('text=Workflows')).toBeVisible();
  });
});

test.describe('Workflows Responsive', () => {
  test('should be usable on mobile viewport', async ({ page, loginAs }) => {
    await loginAs('admin');

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/sante/workflows');

    // Page should load
    await expect(page.locator('h1')).toContainText('Workflows');

    // Tabs should be visible and scrollable
    await expect(page.locator('button[role="tab"]:has-text("Tous")')).toBeVisible();
  });

  test('should handle tablet viewport', async ({ page, loginAs }) => {
    await loginAs('admin');

    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/sante/workflows');

    // Page should load properly
    await expect(page.locator('h1')).toContainText('Workflows');

    // Stats cards should be visible
    await expect(page.locator('text=Total')).toBeVisible();
  });
});
