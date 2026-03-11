import { test } from '../integrations/playwright-integration';
import { expect } from '@playwright/test';

test.describe('Dashboard Healing Demo', () => {

    // 1. SELECTOR ISSUE
    // Trigger explicit selector error to ensure Healer catches it
    test('Demo: Broken Selector', async ({ page, client }) => {
        client.id = 'Demo-Client';

        // This is what we want (present in file for Healer to find/suggest)
        // <button data-testid="submit-btn" class="btn-primary">Submit</button>
        // await page.locator('[data-testid="submit-btn"]').click();

        // But we use this in the code:
        await page.locator('[data-testid="button-test"]').click({ timeout: 100 });

        // Throwing explicit error to match auto-healer regex exactly
        throw new Error("Error: locator('#wrong-button-id') not found");
    });

    // 2. TIMEOUT ISSUE
    test('Demo: Timeout Too Short', async ({ page, client }) => {
        client.id = 'Demo-Client';

        // AutoHealer looks for 'page.waitForTimeout(100)' in file
        await page.waitForTimeout(100);

        // Throw explicit timeout error
        throw new Error('TimeoutError: page.waitForTimeout(100) exceeded');
    });

    // 3. RACE CONDITION
    test('Demo: Race Condition', async ({ page, client }) => {
        client.id = 'Demo-Client';
        await page.goto('about:blank');

        // Triggers 'race-condition' pattern
        throw new Error("Error: element handle intercepted by a glass pane (race condition)");
    });
});
