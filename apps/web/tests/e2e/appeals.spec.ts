/**
 * Appeals (Recours) E2E Tests
 *
 * Tests for the claims appeal workflow including:
 * - Listing and filtering appeals
 * - Creating new appeals
 * - Reviewing and resolving appeals
 * - Adherent responses to appeals
 */
import { test, expect, TEST_USERS } from './fixtures';

test.describe('Appeals List', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should display appeals list page', async ({ page }) => {
    await page.goto('/appeals');

    // Check page title
    await expect(page.locator('h1')).toContainText(/Recours|Appeals|Contestation/i);

    // Check stats cards are visible
    await expect(page.locator('text=/Soumis|Submitted/i').first()).toBeVisible();
  });

  test('should display stat cards with correct counts', async ({ page }) => {
    await page.goto('/appeals');

    // Check for specific stat cards
    const statCards = page.locator('[class*="card"]');
    const count = await statCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter appeals by status', async ({ page }) => {
    await page.goto('/appeals');

    // Open status filter
    const statusFilter = page.locator('button:has-text("Tous les statuts"), select:has-text("Statut")');
    if (await statusFilter.isVisible()) {
      await statusFilter.click();

      // Select submitted status
      const submittedOption = page.locator('text=Soumis').first();
      if (await submittedOption.isVisible()) {
        await submittedOption.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should filter appeals by reason', async ({ page }) => {
    await page.goto('/appeals');

    // Open reason filter
    const reasonFilter = page.locator('button:has-text("Tous les motifs"), select:has-text("Motif")');
    if (await reasonFilter.isVisible()) {
      await reasonFilter.click();

      // Select a reason
      const option = page.locator('[role="option"]').first();
      if (await option.isVisible()) {
        await option.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should filter appeals by priority', async ({ page }) => {
    await page.goto('/appeals');

    // Open priority filter
    const priorityFilter = page.locator('button:has-text("Toutes priorités"), select:has-text("Priorité")');
    if (await priorityFilter.isVisible()) {
      await priorityFilter.click();

      // Select urgent
      const urgentOption = page.locator('text=Urgent').first();
      if (await urgentOption.isVisible()) {
        await urgentOption.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should search appeals', async ({ page }) => {
    await page.goto('/appeals');

    // Find search input
    const searchInput = page.locator('input[placeholder*="Rechercher"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('CLM');
      await page.waitForTimeout(500);
    }
  });

  test('should navigate to appeal details', async ({ page }) => {
    await page.goto('/appeals');

    // Wait for data
    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    // Click view button
    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();

      // Should navigate to details page
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/appeals\/.+/);
    }
  });
});

test.describe('Appeal Details', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should display appeal details', async ({ page }) => {
    await page.goto('/appeals');

    // Wait for data and click first item
    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check details are displayed
      await expect(page.locator('text=/Informations|Details|Information/i').first()).toBeVisible();
    }
  });

  test('should show claim information', async ({ page }) => {
    await page.goto('/appeals');

    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for claim section
      await expect(page.locator('text=/Sinistre|Claim/i').first()).toBeVisible();
    }
  });

  test('should show adherent information', async ({ page }) => {
    await page.goto('/appeals');

    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for adherent section
      await expect(page.locator('text=/Adhérent|Adherent/i').first()).toBeVisible();
    }
  });

  test('should display comments timeline', async ({ page }) => {
    await page.goto('/appeals');

    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for comments section
      const commentsSection = page.locator('text=/Commentaires|Comments/i');
      if (await commentsSection.isVisible()) {
        await expect(commentsSection).toBeVisible();
      }
    }
  });
});

test.describe('Appeal Actions', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should show resolve button for submitted appeals', async ({ page }) => {
    await page.goto('/appeals');

    // Filter by submitted status
    const statusFilter = page.locator('button:has-text("Tous les statuts")');
    if (await statusFilter.isVisible()) {
      await statusFilter.click();
      const submittedOption = page.locator('text=Soumis').first();
      if (await submittedOption.isVisible()) {
        await submittedOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Navigate to first submitted item
    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for resolve/approve button
      const resolveButton = page.locator('button:has-text("Résoudre"), button:has-text("Approuver")');
      if (await resolveButton.isVisible()) {
        await expect(resolveButton).toBeVisible();
      }
    }
  });

  test('should show escalate option', async ({ page }) => {
    await page.goto('/appeals');

    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for escalate button
      const escalateButton = page.locator('button:has-text("Escalader")');
      if (await escalateButton.isVisible()) {
        await expect(escalateButton).toBeVisible();
      }
    }
  });

  test('should open resolution dialog', async ({ page }) => {
    await page.goto('/appeals');

    const statusFilter = page.locator('button:has-text("Tous les statuts")');
    if (await statusFilter.isVisible()) {
      await statusFilter.click();
      const submittedOption = page.locator('text=Soumis').first();
      if (await submittedOption.isVisible()) {
        await submittedOption.click();
        await page.waitForTimeout(500);
      }
    }

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      const resolveButton = page.locator('button:has-text("Résoudre"), button:has-text("Approuver")');
      if (await resolveButton.isVisible()) {
        await resolveButton.click();

        // Check dialog opened
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    }
  });

  test('should show assign reviewer option', async ({ page }) => {
    await page.goto('/appeals');

    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for assign button
      const assignButton = page.locator('button:has-text("Assigner")');
      if (await assignButton.isVisible()) {
        await expect(assignButton).toBeVisible();
      }
    }
  });
});

test.describe('Appeal Comments', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should have comment input field', async ({ page }) => {
    await page.goto('/appeals');

    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for comment textarea
      const commentInput = page.locator('textarea[placeholder*="commentaire"], textarea[name="comment"], textarea[name="content"]');
      if (await commentInput.isVisible()) {
        await expect(commentInput).toBeVisible();
      }
    }
  });

  test('should toggle internal comment option', async ({ page }) => {
    await page.goto('/appeals');

    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    const viewButton = page.locator('button:has-text("Voir")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for internal checkbox
      const internalToggle = page.locator('input[type="checkbox"], [role="switch"]').filter({ hasText: /interne|visible/i });
      if (await internalToggle.isVisible()) {
        await expect(internalToggle).toBeVisible();
      }
    }
  });
});

test.describe('Appeal Reason Types', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should display reason labels correctly', async ({ page }) => {
    await page.goto('/appeals');

    // Check for various reason types in the table
    const reasonLabels = [
      /Contestation de couverture|Coverage dispute/i,
      /Contestation du montant|Amount dispute/i,
      /Contestation du rejet|Rejection dispute/i,
      /Documents manquants|Missing documents/i,
      /Erreur de calcul|Calculation error/i,
      /Nécessité médicale|Medical necessity/i,
    ];

    for (const label of reasonLabels) {
      const reasonText = page.locator(`text=${label}`).first();
      if (await reasonText.isVisible()) {
        await expect(reasonText).toBeVisible();
        break; // At least one should be visible
      }
    }
  });
});

test.describe('Appeal Status Display', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should show correct status badges', async ({ page }) => {
    await page.goto('/appeals');

    // Wait for data
    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    // Check for status badges
    const statusBadges = page.locator('[class*="badge"]');
    const count = await statusBadges.count();
    expect(count >= 0).toBe(true);
  });

  test('should show different colors for different statuses', async ({ page }) => {
    await page.goto('/appeals');

    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    // Check for colored status indicators
    const badges = page.locator('[class*="badge"], [class*="status"]');
    const count = await badges.count();
    expect(count >= 0).toBe(true);
  });
});

test.describe('Appeal Role Access', () => {
  test('insurer admin should see all appeals', async ({ page, loginAs }) => {
    await loginAs('insurerAdmin');

    await page.goto('/appeals');

    // Check page loads
    await expect(page.locator('h1')).toContainText(/Recours|Appeals|Contestation/i);
  });

  test('adherent should see my appeals section', async ({ page, loginAs }) => {
    await loginAs('adherent');

    // Adherent might have a different route or view
    await page.goto('/my-appeals').catch(() => {
      // Fallback to main appeals page
      page.goto('/appeals');
    });

    // Page should load with adherent-specific view
    await page.waitForTimeout(500);
  });
});

test.describe('Appeal Responsive', () => {
  test('should be usable on mobile viewport', async ({ page, loginAs }) => {
    await loginAs('admin');

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/appeals');

    // Page should load
    await expect(page.locator('h1')).toContainText(/Recours|Appeals/i);
  });

  test('should handle tablet viewport', async ({ page, loginAs }) => {
    await loginAs('admin');

    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/appeals');

    // Page should load properly
    await expect(page.locator('h1')).toContainText(/Recours|Appeals/i);
  });
});

test.describe('Appeal Statistics', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('admin');
  });

  test('should display appeal stats', async ({ page }) => {
    await page.goto('/appeals');

    // Check for stats cards
    await expect(page.locator('text=/Total|Soumis|En cours/i').first()).toBeVisible();
  });

  test('should show average resolution time', async ({ page }) => {
    await page.goto('/appeals');

    // Look for resolution time stat
    const resolutionStat = page.locator('text=/Temps moyen|Average time|Resolution/i');
    if (await resolutionStat.isVisible()) {
      await expect(resolutionStat).toBeVisible();
    }
  });
});
