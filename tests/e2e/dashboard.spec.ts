import { test, expect } from '@playwright/test';

test.describe('Roblox Account Generator Engine - Local Dashboard E2E', () => {
  test('logs in as admin, generates candidates, and views supervised registration modal', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Roblox Account Generator Engine')).toBeVisible();

    await page.getByRole('button', { name: 'Sign In to Engine' }).click();
    await expect(page.getByText('RAGE // ACCOUNT GENERATOR ENGINE')).toBeVisible();

    await page.getByRole('button', { name: 'GENERATE CANDIDATES' }).click();
    await expect(page.getByText('SUPERVISE & REGISTER').first()).toBeVisible();

    await page.getByText('SUPERVISE & REGISTER').first().click();
    await expect(page.getByText('Human-Supervised Registration Workflow')).toBeVisible();
    await expect(page.getByText('Open Roblox.com/CreateAccount')).toBeVisible();
  });
});
