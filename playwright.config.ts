// playwright.config.ts - Add flaky test configuration
import { defineConfig } from '@playwright/test';

export default defineConfig({
    // ... existing config ...

    // Flaky test configuration
    use: {
        // ...
    },

    workers: 1, // Disable parallelism for file-based DB safety

    // Configure hooks
    globalSetup: './tests/global-setup.ts',
    globalTeardown: './tests/global-teardown.ts',

    // Reporter that includes flaky test detection
    reporter: [
        ['html'],
        ['json'],
        ['./integrations/flaky-test-reporter.ts'] // Custom reporter
    ]
});