import { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';

export default class FlakyTestReporter implements Reporter {
    onBegin(config: any, suite: any) {
        console.log('Starting test run with Flaky Test Reporter...');
    }

    onTestEnd(test: TestCase, result: TestResult) {
        // Check for flaky/quarantine annotations
        const quarantine = test.annotations.find(a => a.type === 'quarantine');
        if (quarantine) {
            console.log(`\x1b[33m⚠️  [FLAKY DETECTED] ${test.title}\x1b[0m`);
            console.log(`   Reason: ${quarantine.description}`);
        }
    }

    onEnd(result: FullResult) {
        console.log(`Finished test run. Status: ${result.status}`);
    }
}
