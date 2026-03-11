// monitoring/flaky-dashboard.ts
import { FlakyTestResult } from '../detection/flaky-detector';
import { QuarantineRecord, TestQuarantineManager } from '../quarantine/test-quarantine';
import express from 'express';

export class FlakyTestDashboard {
    private app: express.Application;
    private quarantineManager: TestQuarantineManager;

    constructor(private port: number = 3001) {
        this.app = express();
        this.quarantineManager = new TestQuarantineManager();
        this.setupRoutes();
    }

    private setupRoutes(): void {
        this.app.use(express.static('public'));
        this.app.set('view engine', 'ejs');

        // Dashboard home
        this.app.get('/', async (req, res) => {
            const stats = await this.quarantineManager.getQuarantineStats();
            const activeQuarantines = await this.quarantineManager.getActiveQuarantines();

            // Get all flaky tests for complete visibility
            const detector = new (require('../detection/flaky-detector').FlakyTestDetector)();
            const allFlakyTests = await detector.getFlakyTests(10); // Show anything with >10 score

            res.render('dashboard', {
                stats,
                activeQuarantines: activeQuarantines.slice(0, 20),
                allFlakyTests: allFlakyTests.slice(0, 50),
                lastUpdated: new Date().toLocaleString()
            });
        });

        // Flaky tests list
        this.app.get('/api/flaky-tests', async (req, res) => {
            const detector = new (require('../detection/flaky-detector').FlakyTestDetector)();
            const flakyTests = await detector.getFlakyTests(30);
            res.json(flakyTests);
        });

        // Quarantine details
        this.app.get('/api/quarantine/:testId', async (req, res) => {
            const records = await this.quarantineManager.getActiveQuarantines();
            const record = records.find(r => r.testId === req.params.testId);
            res.json(record || {});
        });

        // Heal a test
        this.app.post('/api/heal/:testId', async (req, res) => {
            await this.quarantineManager.healTest(req.params.testId, 'Manual heal via dashboard');
            res.json({ success: true });
        });

        // Test history
        this.app.get('/api/history/:testId', async (req, res) => {
            // Implementation depends on your data storage
            res.json({ testId: req.params.testId, history: [] });
        });

        // Export data
        this.app.get('/api/export', async (req, res) => {
            const detector = new (require('../detection/flaky-detector').FlakyTestDetector)();
            const flakyTests = await detector.getFlakyTests(0);
            const quarantines = await this.quarantineManager.getActiveQuarantines();

            const exportData = {
                exportedAt: new Date().toISOString(),
                flakyTests,
                quarantines,
                summary: {
                    totalFlakyTests: flakyTests.length,
                    totalQuarantined: quarantines.length,
                    avgFlakyScore: flakyTests.reduce((sum: any, t: { flakyScore: any; }) => sum + t.flakyScore, 0) / flakyTests.length
                }
            };

            res.setHeader('Content-Disposition', 'attachment; filename="flaky-tests-export.json"');
            res.json(exportData);
        });
    }

    start(): void {
        this.app.listen(this.port, () => {
            console.log(`📊 Flaky Test Dashboard running at http://localhost:${this.port}`);
        });
    }
}