import { test } from '../integrations/playwright-integration';
import { expect } from '@playwright/test';

// Seed some randomness to simulate flakiness
// High probability of failure for demonstration
const isFlaky = (probability = 0.8) => Math.random() < probability;

test.describe('Flaky Scenarios', () => {

    // Scenario 0: Healable Timeout
    // Trigger auto-heal by using a hardcoded timeout that is too short
    test('Healable: Short Warning', async ({ page, client }) => {
        client.id = 'Client-Healable';
        await page.goto('about:blank');

        // AutoHealer looks for 'page.waitForTimeout(100)' in file
        await page.waitForTimeout(100);

        if (true) throw new Error('TimeoutError: page.waitForTimeout(100) exceeded');
    });

    // Scenario 00: Healable Selector
    // Trigger auto-heal by simulating a Playwright-style selector error
    test('Healable: Broken Selector', async ({ page, client }) => {
        client.id = 'Client-Healable';
        await page.goto('about:blank');

        // AutoHealer looks for this line in the file:
        // page.locator('button[old-id]')

        // Throw error matching: /locator\(['"](.*?)['"]\)/
        throw new Error("Error: locator('button[old-id]').click(): element not visible");
    });

    // Scenario 1: Timeout Flakiness
    // Simulates a slow backend response that occasionally exceeds the timeout
    test('Scenario: Slow Backend Response (Timeout)', async ({ page, client }) => {
        client.id = 'Client-Timeout';
        await page.goto('about:blank');

        const isSlow = isFlaky(0.7);
        // If slow, delay 2000ms. If fast, delay 100ms.
        // Test timeout is default (usually 30s) but we can simulate a specific wait timeout
        const processingTime = isSlow ? 2000 : 100;

        console.log(`[Timeout Test] Processing time: ${processingTime}ms`);
        await page.waitForTimeout(processingTime);

        // Simulating a strict performance requirement of 500ms
        if (processingTime > 500) {
            throw new Error('Timeout: Backend response exceeded 500ms SLA');
        }
    });

    // Scenario 2: Selector/Locator Issues
    // Simulates dynamic DOM where an element might be missing or ID changes
    test('Scenario: Dynamic DOI (Selector Not Found)', async ({ page, client }) => {
        client.id = 'Client-DOM';
        await page.goto('about:blank');

        if (isFlaky(0.6)) {
            // Simulate missing element
            throw new Error('Locator: button[data-testid="submit-order"] not found after 5000ms');
        }
        // Pass
    });

    // Scenario 3: Network Stability
    // Simulates intermittent network failures (500s or connection refused)
    test('Scenario: Flaky API (Network Error)', async ({ page, client }) => {
        client.id = 'Client-Network';
        await page.goto('about:blank');

        if (isFlaky(0.5)) {
            throw new Error('Network Error: POST /api/v1/checkout failed - Connection reset by peer');
        }
    });

    // Scenario 4: Race Conditions
    // Simulates UI state not being ready
    test('Scenario: UI State Race Condition', async ({ page, client }) => {
        client.id = 'Client-Race';
        await page.goto('about:blank');

        // Simulate a race where we try to click before a listener is attached
        if (isFlaky(0.4)) {
            throw new Error('Error: Click intercepted by glass pane (race condition)');
        }
    });

    // Scenario 5: Stable Test
    // Control group
    test('Scenario: Stable Login', async ({ page, client }) => {
        client.id = 'Client-Stable';
        await page.goto('about:blank');
        // Always passes
        expect(true).toBe(true);
    });
});

test.describe('Authentication', () => {
    test('Login should succeed', async ({ page }) => {
        await page.goto('about:blank');
        // mostly passing
    });
});
