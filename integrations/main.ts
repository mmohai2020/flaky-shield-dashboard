// main.ts - Integration point
import 'dotenv/config';
import { FlakyTestDashboard } from '../monitoring/flaky-dashboard';
import { CIIntegration } from './ci-integration';
import { FlakyTestDetector } from '../detection/flaky-detector';
import { TestQuarantineManager } from '../quarantine/test-quarantine';

// Initialize systems
const flakyDetector = new FlakyTestDetector();
const quarantineManager = new TestQuarantineManager();
const ciIntegration = new CIIntegration(quarantineManager, flakyDetector);

// Export for use in tests
export {
    flakyDetector,
    quarantineManager,
    ciIntegration
};

// Start dashboard (if not in CI)
if (!process.env.CI && process.env.START_DASHBOARD === 'true') {
    const dashboard = new FlakyTestDashboard(3001);
    dashboard.start();
}

// CI/CD integration
if (process.env.CI) {
    async function ciWorkflow() {
        const report = await ciIntegration.generateCIRreport();
        console.log('📋 CI Test Stability Report:');
        console.log(JSON.stringify(report, null, 2));

        // Fail build if unstable
        const buildStable = await ciIntegration.failBuildIfUnstable();
        if (!buildStable) {
            process.exit(1);
        }

        // Generate GitHub comment
        if (process.env.GITHUB_ACTIONS) {
            const comment = await ciIntegration.generateGitHubComment();
            const fs = require('fs');
            fs.writeFileSync(process.env.GITHUB_STEP_SUMMARY, comment);
        }
    }

    ciWorkflow().catch(console.error);
}