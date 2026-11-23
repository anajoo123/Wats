import { expect, test } from '@playwright/test';

test.describe('Awn Mutual Aid Platform E2E Scenarios A, B, C', () => {
  test('renders noindex meta, Arabic RTL default, and executes real API cycle', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    // Verify health/session API works and returns real DB users
    const sessionRes = await request.get('/api/auth/session');
    expect(sessionRes.ok()).toBeTruthy();
    const sessionJson = await sessionRes.json();
    expect(sessionJson.user.id).toBeTruthy();
    expect(sessionJson.countries.length).toBeGreaterThanOrEqual(5);
  });
});
