// debug-healer.ts
import 'dotenv/config';
import { TestQuarantineManager } from './quarantine/test-quarantine';
import { getDatabase } from './db/database';

async function run() {
    console.log('Starting Auto-Healer Test...');
    const db = await getDatabase();
    const row = await db.get("SELECT testId, testName FROM quarantine_registry WHERE testName LIKE '%Broken Selector%'");
    
    if (!row) {
        console.error('No quarantined test found matching "Broken Selector".');
        return;
    }

    console.log(`Found test to heal: ${row.testName} (${row.testId})`);
    
    const qm = new TestQuarantineManager();
    await qm.healTest(row.testId, 'Manual heal via CLI');
    console.log('Heal process completed.');
}

run().catch(console.error);
