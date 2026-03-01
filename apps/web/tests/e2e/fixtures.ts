/**
 * E2E Test Fixtures
 *
 * Shared test data and utilities for Playwright tests
 */

import { test as base, Page, expect } from '@playwright/test';

// Test user credentials
export const TEST_USERS = {
  admin: {
    email: 'admin@dhamen.tn',
    password: 'Admin123!@#',
    role: 'ADMIN',
    requiresMfa: true,
  },
  insurerAdmin: {
    email: 'insurer.admin@comar.tn',
    password: 'Insurer123!@#',
    role: 'INSURER_ADMIN',
    requiresMfa: true,
  },
  pharmacist: {
    email: 'pharmacien@pharmacie-centrale.tn',
    password: 'Pharma123!@#',
    role: 'PHARMACIST',
    requiresMfa: true,
  },
  doctor: {
    email: 'medecin@clinique-carthage.tn',
    password: 'Doctor123!@#',
    role: 'DOCTOR',
    requiresMfa: true,
  },
  adherent: {
    email: 'adherent@gmail.com',
    password: 'Adherent123!',
    role: 'ADHERENT',
    requiresMfa: false,
  },
  soinGestionnaire: {
    email: 'gestionnaire@soinflow.tn',
    password: 'Soin123!@#',
    role: 'SOIN_GESTIONNAIRE',
    requiresMfa: true,
  },
  soinAgent: {
    email: 'agent@soinflow.tn',
    password: 'Agent123!@#',
    role: 'SOIN_AGENT',
    requiresMfa: false,
  },
} as const;

// Test adherent data for eligibility checks
export const TEST_ADHERENT = {
  id: 'adh_01HXYZ123456789',
  firstName: 'Mohamed',
  lastName: 'Ben Ali',
  nationalId: '12345678',
  dateOfBirth: '1985-03-15',
  contractNumber: 'CTR-2024-001',
  insurerId: 'ins_comar',
};

// Test claim data
export const TEST_CLAIM = {
  careType: 'PHARMACY',
  amount: 50000, // 50 TND in millimes
  items: [
    {
      code: 'MED001',
      name: 'Doliprane 1000mg',
      quantity: 2,
      unitPrice: 15000, // 15 TND
    },
    {
      code: 'MED002',
      name: 'Amoxicilline 500mg',
      quantity: 1,
      unitPrice: 20000, // 20 TND
    },
  ],
};

// Extended test type with authentication helpers
type AuthFixtures = {
  loginAs: (userType: keyof typeof TEST_USERS) => Promise<void>;
  logout: () => Promise<void>;
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  loginAs: async ({ page }, use) => {
    const loginAs = async (userType: keyof typeof TEST_USERS) => {
      const user = TEST_USERS[userType];

      await page.goto('/login');
      await page.waitForSelector('input[name="email"]');

      // Fill login form
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);
      await page.click('button[type="submit"]');

      // Handle MFA if required
      if (user.requiresMfa) {
        // Wait for MFA prompt
        await page.waitForSelector('input[name="code"]', { timeout: 5000 }).catch(() => {
          // If MFA not prompted, user might not have it enabled in test env
        });

        // In E2E tests, we use a test TOTP secret that generates predictable codes
        // For real tests, you'd need to either:
        // 1. Disable MFA in test environment
        // 2. Use a predictable TOTP secret
        // 3. Mock the TOTP verification endpoint
      }

      // Wait for redirect to dashboard
      await page.waitForURL(/\/(dashboard)?$/);
    };

    await use(loginAs);
  },

  logout: async ({ page }, use) => {
    const logout = async () => {
      // Click user menu and logout
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.waitForURL('/login');
    };

    await use(logout);
  },

  authenticatedPage: async ({ page, loginAs }, use) => {
    // Login as admin by default
    await loginAs('admin');
    await use(page);
  },
});

export { expect } from '@playwright/test';

// Helper functions for direct login (simpler approach)
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USERS.admin.email);
  await page.fill('input[name="password"]', TEST_USERS.admin.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });
}

export async function loginAsInsurerAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USERS.insurerAdmin.email);
  await page.fill('input[name="password"]', TEST_USERS.insurerAdmin.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });
}

export async function loginAsGestionnaire(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USERS.soinGestionnaire.email);
  await page.fill('input[name="password"]', TEST_USERS.soinGestionnaire.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });
}

export async function loginAsPharmacist(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USERS.pharmacist.email);
  await page.fill('input[name="password"]', TEST_USERS.pharmacist.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });
}

export async function loginAsDoctor(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USERS.doctor.email);
  await page.fill('input[name="password"]', TEST_USERS.doctor.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });
}

export async function loginAsAgent(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USERS.soinAgent.email);
  await page.fill('input[name="password"]', TEST_USERS.soinAgent.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });
}
