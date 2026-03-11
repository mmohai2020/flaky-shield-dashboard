
import { AutoHealer } from './quarantine/auto-healer';
import { QuarantineRecord } from './quarantine/test-quarantine';

async function testHealer() {
    const healer = new AutoHealer();
    const filePath = 'd:\\flaky-test-dashboard\\tests\\healing-demo.spec.ts';

    console.log(`Checking file: ${filePath}`);

    const record: QuarantineRecord = {
        testId: 'test-demo',
        testName: 'Demo: Broken Selector',
        filePath: filePath,
        client: 'Demo-Client',
        environment: 'uat',
        quarantinedAt: new Date(),
        reason: 'debug',
        flakyScore: 50,
        status: 'active',
        autoHealAttempts: 1,
        failurePatterns: [],
        quarantineRule: 'debug',
        metadata: {}
    };

    // Case 1: Selector
    const selectorError = "Error: locator('#wrong-button-id') not found";
    console.log(`\n--- Case 1: Selector Error ---`);
    console.log(`Input Error: ${selectorError}`);
    const result1 = await healer.attemptHeal(record, selectorError);
    console.log(JSON.stringify(result1, null, 2));

    // Case 2: Timeout
    const timeoutError = "TimeoutError: page.waitForTimeout(100) exceeded";
    console.log(`\n--- Case 2: Timeout Error ---`);
    console.log(`Input Error: ${timeoutError}`);
    const result2 = await healer.attemptHeal(record, timeoutError);
    console.log(JSON.stringify(result2, null, 2));
}

testHealer().catch(console.error);
