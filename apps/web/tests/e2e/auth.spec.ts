/**
 * Authentication E2E Tests
 *
 * Tests for login, logout, MFA, and session management
 */

import { test, expect } from '@playwright/test';

// Test users
const ADMIN_USER = {
  email: 'admin@dhamen.tn',
  password: 'Admin123!@#',
};

const INSURER_USER = {
  email: 'agent@comar.tn',
  password: 'Agent123!@#',
};

const PROVIDER_USER = {
  email: 'pharmacien@pharma-centrale.tn',
  password: 'Pharma123!@#',
};

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
  });

  test.describe('Login Flow', () => {
    test('should display login page with all elements', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: /connexion/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/mot de passe/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible();
    });

    test('should show validation errors for empty fields', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('button', { name: /se connecter/i }).click();
      await expect(page.getByText(/email requis|email est requis/i)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill('invalid@test.com');
      await page.getByLabel(/mot de passe/i).fill('wrongpassword');
      await page.getByRole('button', { name: /se connecter/i }).click();
      await expect(page.getByText(/identifiants invalides|email ou mot de passe incorrect/i)).toBeVisible();
    });

    test('should login successfully as admin', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(ADMIN_USER.email);
      await page.getByLabel(/mot de passe/i).fill(ADMIN_USER.password);
      await page.getByRole('button', { name: /se connecter/i }).click();
      await expect(page).toHaveURL(/.*dashboard/);
    });

    test('should login successfully as insurer agent', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(INSURER_USER.email);
      await page.getByLabel(/mot de passe/i).fill(INSURER_USER.password);
      await page.getByRole('button', { name: /se connecter/i }).click();
      await expect(page).toHaveURL(/.*dashboard/);
    });

    test('should login successfully as provider', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(PROVIDER_USER.email);
      await page.getByLabel(/mot de passe/i).fill(PROVIDER_USER.password);
      await page.getByRole('button', { name: /se connecter/i }).click();
      await expect(page).toHaveURL(/.*dashboard/);
    });
  });

  test.describe('Logout Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(ADMIN_USER.email);
      await page.getByLabel(/mot de passe/i).fill(ADMIN_USER.password);
      await page.getByRole('button', { name: /se connecter/i }).click();
      await expect(page).toHaveURL(/.*dashboard/);
    });

    test('should logout successfully', async ({ page }) => {
      await page.getByRole('button', { name: /profil|menu/i }).click();
      await page.getByRole('menuitem', { name: /déconnexion/i }).click();
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing protected route', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/.*login/);
    });

    test('should redirect to login when accessing claims page', async ({ page }) => {
      await page.goto('/claims');
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('Role-Based Access', () => {
    test('admin should see all menu items', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(ADMIN_USER.email);
      await page.getByLabel(/mot de passe/i).fill(ADMIN_USER.password);
      await page.getByRole('button', { name: /se connecter/i }).click();
      await expect(page).toHaveURL(/.*dashboard/);
      await expect(page.getByRole('link', { name: /tableau de bord/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /sinistres/i })).toBeVisible();
    });
  });
});
