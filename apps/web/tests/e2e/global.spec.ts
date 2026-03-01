/**
 * Global E2E Tests
 *
 * Core application functionality tests
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsGestionnaire, loginAsPharmacist } from './fixtures';

test.describe('Application Core', () => {
  test.describe('Navigation', () => {
    test('should load login page', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('h1')).toContainText(/Connexion|Dhamen/i);
    });

    test('should redirect unauthenticated users to login', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/login/);
    });

    test('should navigate to dashboard after login', async ({ page }) => {
      await loginAsAdmin(page);
      await expect(page).toHaveURL(/dashboard/);
    });
  });

  test.describe('Sidebar Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('should show all admin menu items', async ({ page }) => {
      await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
      await expect(page.locator('a[href="/users"]')).toBeVisible();
      await expect(page.locator('a[href="/providers"]')).toBeVisible();
      await expect(page.locator('a[href="/insurers"]')).toBeVisible();
    });

    test('should navigate to users page', async ({ page }) => {
      await page.click('a[href="/users"]');
      await expect(page).toHaveURL(/users/);
    });

    test('should collapse and expand sidebar', async ({ page }) => {
      const sidebar = page.locator('[data-testid="sidebar"]');
      const toggleButton = page.locator('[data-testid="sidebar-toggle"]');

      if (await toggleButton.isVisible()) {
        await toggleButton.click();
        // Verify sidebar is collapsed
        await expect(sidebar).toHaveClass(/collapsed/);

        await toggleButton.click();
        // Verify sidebar is expanded
        await expect(sidebar).not.toHaveClass(/collapsed/);
      }
    });
  });

  test.describe('Header', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('should display user info', async ({ page }) => {
      await expect(page.locator('[data-testid="user-name"]')).toBeVisible();
    });

    test('should show notification bell', async ({ page }) => {
      await expect(page.locator('[data-testid="notification-bell"]')).toBeVisible();
    });

    test('should open notifications panel', async ({ page }) => {
      await page.click('[data-testid="notification-bell"]');
      await expect(page.locator('[data-testid="notifications-panel"]')).toBeVisible();
    });
  });

  test.describe('Role-Based Access', () => {
    test('admin should see all menu items', async ({ page }) => {
      await loginAsAdmin(page);

      await expect(page.locator('a[href="/users"]')).toBeVisible();
      await expect(page.locator('a[href="/settings"]')).toBeVisible();
    });

    test('gestionnaire should see sante menu', async ({ page }) => {
      await loginAsGestionnaire(page);

      await expect(page.locator('a[href*="/sante"]').first()).toBeVisible();
    });

    test('pharmacist should have limited menu', async ({ page }) => {
      await loginAsPharmacist(page);

      // Should see claims but not users
      await expect(page.locator('a[href="/claims"]')).toBeVisible();
      await expect(page.locator('a[href="/users"]')).not.toBeVisible();
    });
  });

  test.describe('Logout', () => {
    test('should logout successfully', async ({ page }) => {
      await loginAsAdmin(page);

      // Open user menu
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');

      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });

    test('should clear auth state on logout', async ({ page }) => {
      await loginAsAdmin(page);

      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');

      // Try to access protected page
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/login/);
    });
  });

  test.describe('Error Handling', () => {
    test('should show 404 for invalid routes', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/invalid-route-that-does-not-exist');

      await expect(page.locator('text=/non trouvée|not found/i')).toBeVisible();
    });

    test('should show error boundary on crash', async ({ page }) => {
      await loginAsAdmin(page);

      // Force an error (would need to set up a test route that crashes)
      // This is a placeholder for actual error boundary testing
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await loginAsAdmin(page);

      // Mobile menu should be available
      await expect(page.locator('[data-testid="mobile-menu-button"]')).toBeVisible();
    });

    test('should work on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await loginAsAdmin(page);

      await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    });

    test('should work on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginAsAdmin(page);

      await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper focus management', async ({ page }) => {
      await page.goto('/login');

      // Tab through form elements
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBe('INPUT');
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await loginAsAdmin(page);

      // Check for aria-labels on interactive elements
      const buttons = page.locator('button[aria-label], button[aria-labelledby]');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Performance', () => {
    test('should load dashboard within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await loginAsAdmin(page);
      const loadTime = Date.now() - startTime;

      // Dashboard should load within 10 seconds
      expect(loadTime).toBeLessThan(10000);
    });
  });
});
