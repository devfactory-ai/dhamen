/**
 * Insurer Dashboard E2E Tests
 */
import { test, expect } from '@playwright/test';
import { loginAsInsurerAdmin } from './fixtures';

test.describe('Insurer Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsInsurerAdmin(page);
  });

  test.describe('KPI Cards', () => {
    test('should display main KPIs', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      // Verify KPI cards are visible
      await expect(page.locator('[data-testid="kpi-adherents-actifs"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-contrats-actifs"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-paiements-mois"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-demandes-encours"]')).toBeVisible();
    });

    test('should show numeric values in KPIs', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      const adherentsKpi = page.locator('[data-testid="kpi-adherents-actifs"]');
      await expect(adherentsKpi).toContainText(/\d+/);

      const contratsKpi = page.locator('[data-testid="kpi-contrats-actifs"]');
      await expect(contratsKpi).toContainText(/\d+/);
    });
  });

  test.describe('Period Selection', () => {
    test('should change period and refresh data', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      // Click on "Semaine" period
      await page.click('button:has-text("Semaine")');

      // Wait for data refresh
      await page.waitForResponse((response) =>
        response.url().includes('/stats') && response.status() === 200
      );

      // Verify period button is active
      await expect(page.locator('button:has-text("Semaine")')).toHaveClass(/bg-primary/);
    });

    test('should support jour, semaine, mois periods', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      await expect(page.locator('button:has-text("Jour")')).toBeVisible();
      await expect(page.locator('button:has-text("Semaine")')).toBeVisible();
      await expect(page.locator('button:has-text("Mois")')).toBeVisible();
    });
  });

  test.describe('Alerts Section', () => {
    test('should display fraud alerts if present', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      const fraudAlerts = page.locator('[data-testid="fraud-alerts"]');
      const alertsVisible = await fraudAlerts.isVisible();

      if (alertsVisible) {
        await expect(fraudAlerts).toContainText('Alertes Fraude');
        await expect(page.locator('[data-testid="fraud-alert-count"]')).toBeVisible();
      }
    });

    test('should display pending bordereaux', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      const bordereaux = page.locator('[data-testid="pending-bordereaux"]');
      const isVisible = await bordereaux.isVisible();

      if (isVisible) {
        await expect(bordereaux).toContainText('Bordereaux en Attente');
      }
    });

    test('should navigate to fraud details on click', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      const fraudLink = page.locator('[data-testid="view-fraud-alerts"]');
      if (await fraudLink.isVisible()) {
        await fraudLink.click();
        await expect(page).toHaveURL(/fraud/);
      }
    });
  });

  test.describe('Recent Claims Table', () => {
    test('should display recent claims', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      await expect(page.locator('[data-testid="recent-claims-table"]')).toBeVisible();
      await expect(page.locator('[data-testid="claim-row"]').first()).toBeVisible();
    });

    test('should show claim details on row click', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      await page.locator('[data-testid="claim-row"]').first().click();

      // Should navigate to claim details or show modal
      await expect(page.locator('[data-testid="claim-details"]')).toBeVisible();
    });

    test('should display fraud score badges', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      const fraudBadges = page.locator('[data-testid="fraud-score-badge"]');
      await expect(fraudBadges.first()).toBeVisible();
    });

    test('should display status badges', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      const statusBadges = page.locator('[data-testid="status-badge"]');
      await expect(statusBadges.first()).toBeVisible();
    });
  });

  test.describe('Performance Metrics', () => {
    test('should display monthly performance table', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      await expect(page.locator('[data-testid="performance-table"]')).toBeVisible();
      await expect(page.locator('[data-testid="performance-row"]').first()).toBeVisible();
    });

    test('should show approval rate badges', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      const approvalBadges = page.locator('[data-testid="approval-rate-badge"]');
      await expect(approvalBadges.first()).toBeVisible();
    });
  });

  test.describe('Quick Actions', () => {
    test('should display quick action cards', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      await expect(page.locator('[data-testid="action-rapports"]')).toBeVisible();
      await expect(page.locator('[data-testid="action-bordereaux"]')).toBeVisible();
      await expect(page.locator('[data-testid="action-prestataires"]')).toBeVisible();
      await expect(page.locator('[data-testid="action-parametres"]')).toBeVisible();
    });

    test('should navigate on quick action click', async ({ page }) => {
      await page.goto('/insurer/dashboard');

      await page.click('[data-testid="action-rapports"]');
      await expect(page).toHaveURL(/reports/);
    });
  });

  test.describe('Responsive Design', () => {
    test('should be responsive on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/insurer/dashboard');

      // KPIs should stack on mobile
      await expect(page.locator('[data-testid="kpi-adherents-actifs"]')).toBeVisible();

      // Table should be scrollable
      await expect(page.locator('[data-testid="recent-claims-table"]')).toBeVisible();
    });
  });
});
