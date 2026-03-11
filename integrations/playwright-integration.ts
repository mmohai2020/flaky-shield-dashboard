// integrations/playwright-integration.ts
import { test as base, TestInfo, TestStatus } from '@playwright/test';
import { FlakyTestDetector, FlakyTestResult } from '../detection/flaky-detector';
import { TestQuarantineManager } from '../quarantine/test-quarantine';
import { ClientConfig } from '../utils/client-factory';

export const test = base.extend<{
    flakyDetector: FlakyTestDetector;
    quarantineManager: TestQuarantineManager;
    skipFlakyTests: boolean;
    client: ClientConfig;
    flakyTestHooks: void;
}>({
    client: async ({ }, use) => {
        // Default client for testing
        const client = { id: 'default', name: 'Default Client' };
        await use(client);
    },

    flakyDetector: async ({ }, use) => {
        const detector = new FlakyTestDetector();
        await use(detector);
    },

    quarantineManager: async ({ }, use) => {
        const manager = new TestQuarantineManager();
        await use(manager);
    },

    skipFlakyTests: [process.env.SKIP_FLAKY_TESTS === 'true', { option: true }],

    flakyTestHooks: [async ({ page, quarantineManager, flakyDetector, client }, use, testInfo) => {
        // Before Test Logic
        const testId = `${client.id}:${testInfo.file}:${testInfo.title}:${testInfo.line}`;

        // Skip if quarantined
        if (await quarantineManager.shouldSkipTest(testId)) {
            testInfo.skip();
        }

        await use();

        // After Test Logic
        const duration = testInfo.duration;

        // Record test run
        const runHistory = {
            timestamp: new Date(),
            status: testInfo.status || 'skipped',
            duration,
            retryNumber: testInfo.retry,
            error: testInfo.error?.message,
            stackTrace: testInfo.error?.stack,
            screenshot: testInfo.attachments.find(a => a.name === 'screenshot')?.path,
            video: testInfo.attachments.find(a => a.name === 'video')?.path,
            browser: process.env.BROWSER || 'chromium',
            os: process.platform
        };

        // Analyze for flakiness
        const flakyResult = await flakyDetector.analyzeTestRun(testInfo, client, runHistory);

        if (flakyResult) {
            // Save flaky test result
            await flakyDetector.saveFlakyTestResult(flakyResult);

            // Evaluate for quarantine
            const quarantineRecord = await quarantineManager.evaluateTest(flakyResult);

            if (quarantineRecord) {
                testInfo.annotations.push({
                    type: 'quarantine',
                    description: `Quarantined: ${quarantineRecord.reason}`
                });
            }
        }

        // Update quarantine manager with test result
        if (testInfo.status === 'passed') {
            await quarantineManager.recordTestSuccess(testId);
        } else if (testInfo.status === 'failed') {
            await quarantineManager.recordTestFailure(testId, testInfo.error?.message || 'Unknown error');
        }
    }, { auto: true }],

    // Override page fixture to add flaky test handling
    page: async ({ page, quarantineManager, client }, use, testInfo) => {
        // ... (existing page fixture logic) ...
        const testId = `${client.id}:${testInfo.file}:${testInfo.title}:${testInfo.line}`;

        if (await quarantineManager.shouldSkipTest(testId)) {
            testInfo.skip();
            return;
        }

        if (await quarantineManager.shouldRetryOnly(testId)) {
            testInfo.annotations.push({
                type: 'quarantine',
                description: 'retry-only mode'
            });
        }

        const originalGoto = page.goto.bind(page);
        page.goto = async function (url: string, options?: any) {
            try {
                return await originalGoto(url, options);
            } catch (error) {
                await recordTestFailure(testInfo, client, error as Error, page);
                throw error;
            }
        };

        await use(page);
    }
});

// Helper to record test failures with more context
async function recordTestFailure(
    testInfo: TestInfo,
    client: ClientConfig,
    error: Error,
    page: any
): Promise<void> {
    try {
        // Take screenshot on failure
        const screenshot = await page.screenshot({
            path: `failure-screenshots/${testInfo.title}-${Date.now()}.png`,
            fullPage: true
        });

        // Capture console logs
        const consoleLogs = await page.evaluate(() => {
            return JSON.stringify(performance.getEntriesByType('resource'));
        });

        // Capture network requests
        const networkLogs = page.request._impl._request._url;

        // Save failure context
        const fs = require('fs');
        const failureData = {
            test: testInfo.title,
            client: client.id,
            environment: process.env.TEST_ENV,
            timestamp: new Date().toISOString(),
            error: error.message,
            stackTrace: error.stack,
            url: page.url(),
            screenshot: screenshot.toString('base64'),
            consoleLogs: JSON.parse(consoleLogs),
            networkRequests: networkLogs
        };

        fs.writeFileSync(
            `failure-context/${testInfo.title}-${Date.now()}.json`,
            JSON.stringify(failureData, null, 2)
        );

    } catch (e) {
        console.warn('Failed to capture failure context:', e);
    }
}