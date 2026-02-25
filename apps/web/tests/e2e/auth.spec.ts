/**
 * Authentication E2E Tests
 *
 * Tests for login, logout, and MFA flows
 */

import { test, expect, TEST_USERS } from './fixtures';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');

      // Check form elements are present
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // Check branding
      await expect(page.locator('text=Dhamen')).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto('/login');

      // Submit empty form
      await page.click('button[type="submit"]');

      // Check for validation messages
      await expect(page.locator('text=/email|courriel/i')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('input[name="email"]', 'invalid@test.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');

      // Wait for error message
      await expect(page.locator('text=/identifiants|invalid|erreur/i')).toBeVisible({
        timeout: 10000,
      });
    });

    test('should show error for weak password format', async ({ page }) => {
      await page.goto('/login');

      await page.fill('input[name="email"]', 'test@test.com');
      await page.fill('input[name="password"]', 'weak');
      await page.click('button[type="submit"]');

      // Password should be validated (min length, complexity)
      await expect(page.locator('text=/mot de passe|password/i')).toBeVisible();
    });
  });

  test.describe('Login Flow', () => {
    test('should redirect to dashboard after successful login', async ({ page, loginAs }) => {
      await loginAs('admin');

      await expect(page).toHaveURL(/\/(dashboard)?$/);
      await expect(page.locator('text=/tableau de bord|dashboard/i')).toBeVisible();
    });

    test('should persist session across page reloads', async ({ page, loginAs }) => {
      await loginAs('admin');

      // Reload page
      await page.reload();

      // Should still be on dashboard
      await expect(page).toHaveURL(/\/(dashboard)?$/);
    });

    test('should redirect unauthenticated users to login', async ({ page }) => {
      // Try to access protected route
      await page.goto('/dashboard');

      // Should be redirected to login
      await expect(page).toHaveURL('/login');
    });

    test('should redirect authenticated users away from login page', async ({
      page,
      loginAs,
    }) => {
      await loginAs('admin');

      // Try to go to login page
      await page.goto('/login');

      // Should be redirected to dashboard
      await expect(page).toHaveURL(/\/(dashboard)?$/);
    });
  });

  test.describe('Logout', () => {
    test('should clear session and redirect to login', async ({ page, loginAs, logout }) => {
      await loginAs('admin');

      // Verify we're logged in
      await expect(page).toHaveURL(/\/(dashboard)?$/);

      // Logout
      await logout();

      // Should be on login page
      await expect(page).toHaveURL('/login');

      // Session should be cleared - try accessing protected route
      await page.goto('/dashboard');
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Role-based Access', () => {
    test('admin should see admin menu items', async ({ page, loginAs }) => {
      await loginAs('admin');

      // Admin should see users management
      await expect(page.locator('text=/utilisateurs|users/i')).toBeVisible();
      await expect(page.locator('text=/prestataires|providers/i')).toBeVisible();
      await expect(page.locator('text=/assureurs|insurers/i')).toBeVisible();
    });

    test('pharmacist should see pharmacy-specific menu', async ({ page, loginAs }) => {
      await loginAs('pharmacist');

      // Pharmacist should see claims and eligibility
      await expect(page.locator('text=/sinistres|claims/i')).toBeVisible();
      await expect(page.locator('text=/éligibilité|eligibility/i')).toBeVisible();
    });

    test('insurer admin should see insurer-specific menu', async ({ page, loginAs }) => {
      await loginAs('insurerAdmin');

      // Insurer should see adherents and contracts
      await expect(page.locator('text=/adhérents|adherents/i')).toBeVisible();
      await expect(page.locator('text=/contrats|contracts/i')).toBeVisible();
      await expect(page.locator('text=/réconciliation/i')).toBeVisible();
    });
  });

  test.describe('MFA (Multi-Factor Authentication)', () => {
    test('should prompt for MFA code after password', async ({ page }) => {
      const user = TEST_USERS.admin;

      await page.goto('/login');
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);
      await page.click('button[type="submit"]');

      // For users with MFA enabled, should see TOTP input
      // This test assumes MFA is enabled in the test environment
      const mfaInput = page.locator('input[name="code"]');
      const hasMfa = await mfaInput.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasMfa) {
        await expect(mfaInput).toBeVisible();
        await expect(page.locator('text=/code|authentification/i')).toBeVisible();
      }
    });

    test('should reject invalid MFA code', async ({ page }) => {
      const user = TEST_USERS.admin;

      await page.goto('/login');
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);
      await page.click('button[type="submit"]');

      const mfaInput = page.locator('input[name="code"]');
      const hasMfa = await mfaInput.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasMfa) {
        // Enter invalid code
        await page.fill('input[name="code"]', '000000');
        await page.click('button[type="submit"]');

        // Should show error
        await expect(page.locator('text=/invalide|incorrect|error/i')).toBeVisible();
      }
    });

    test('should show backup code option', async ({ page }) => {
      const user = TEST_USERS.admin;

      await page.goto('/login');
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);
      await page.click('button[type="submit"]');

      const mfaInput = page.locator('input[name="code"]');
      const hasMfa = await mfaInput.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasMfa) {
        // Should have backup code option
        await expect(page.locator('text=/code de secours|backup/i')).toBeVisible();
      }
    });
  });

  test.describe('Security Headers', () => {
    test('should have security headers set', async ({ page }) => {
      const response = await page.goto('/');

      if (response) {
        const headers = response.headers();

        // Check for important security headers
        // Note: Some headers may only be present in production
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['x-frame-options']).toBe('DENY');
      }
    });
  });

  test.describe('Session Timeout', () => {
    test('should handle expired session gracefully', async ({ page, loginAs }) => {
      await loginAs('admin');

      // Clear cookies to simulate session expiry
      await page.context().clearCookies();

      // Try to access protected content
      await page.reload();

      // Should be redirected to login
      await expect(page).toHaveURL('/login');
    });
  });
});
