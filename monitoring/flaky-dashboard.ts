// monitoring/flaky-dashboard.ts
import { FlakyTestResult } from '../detection/flaky-detector';
import { QuarantineRecord, TestQuarantineManager } from '../quarantine/test-quarantine';
import express from 'express';
import session from 'express-session';
import { Server } from 'socket.io';
import http from 'http';

export class FlakyTestDashboard {
    private app: express.Application;
    private server: http.Server;
    private io: Server;
    private quarantineManager: TestQuarantineManager;

    constructor(private port: number = 3001) {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.quarantineManager = new TestQuarantineManager();
        this.setupRoutes();
        this.setupSockets();
    }

    private setupSockets(): void {
        this.io.on('connection', (socket) => {
            console.log('🔌 Dashboard client connected via WebSocket');
            socket.on('disconnect', () => {
                console.log('🔌 Dashboard client disconnected');
            });
        });
    }

    private setupRoutes(): void {
        this.app.use(express.static('public'));
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
        this.app.set('view engine', 'ejs');

        this.app.use(session({
            secret: 'flaky-shield-secret',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: false } // For local dev
        }));

        const requireAuth = (req: any, res: any, next: any) => {
            if (req.session?.user) {
                next();
            } else {
                if (req.path.startsWith('/api/') && req.path !== '/api/webhook/event') {
                    res.status(401).json({ error: 'Unauthorized' });
                } else {
                    res.redirect('/login');
                }
            }
        };

        // Auth Routes
        this.app.get('/login', (req, res) => {
            res.render('login', { error: null });
        });

        this.app.post('/login', (req: any, res) => {
            const { username, password } = req.body;
            // Simple hardcoded auth
            if (username === 'admin' && password === 'flaky123') {
                req.session.user = { username };
                res.redirect('/');
            } else {
                res.render('login', { error: 'Invalid credentials' });
            }
        });

        this.app.post('/logout', (req: any, res) => {
            req.session.destroy(() => {
                res.redirect('/login');
            });
        });

        // Webhook for internal processes to notify dashboard
        this.app.post('/api/webhook/event', (req, res) => {
            const { type, payload } = req.body;
            this.io.emit(type, payload);
            res.status(200).send();
        });

        // Dashboard home
        this.app.get('/', requireAuth, async (req, res) => {
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
        this.app.get('/api/flaky-tests', requireAuth, async (req, res) => {
            const detector = new (require('../detection/flaky-detector').FlakyTestDetector)();
            const flakyTests = await detector.getFlakyTests(30);
            res.json(flakyTests);
        });

        // Quarantine details
        this.app.get('/api/quarantine/:testId', requireAuth, async (req, res) => {
            const records = await this.quarantineManager.getActiveQuarantines();
            const record = records.find(r => r.testId === req.params.testId);
            res.json(record || {});
        });

        // Heal a test
        this.app.post('/api/heal/:testId', requireAuth, async (req, res) => {
            await this.quarantineManager.healTest(req.params.testId, 'Manual heal via dashboard');
            this.io.emit('test-healed', { testId: req.params.testId });
            res.json({ success: true });
        });

        // Test history
        this.app.get('/api/history/:testId', requireAuth, async (req, res) => {
            // Implementation depends on your data storage
            res.json({ testId: req.params.testId, history: [] });
        });

        // Export data
        this.app.get('/api/export', requireAuth, async (req, res) => {
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
        this.server.listen(this.port, () => {
            console.log(`📊 Flaky Test Dashboard running at http://localhost:${this.port}`);
            console.log(`🔌 WebSocket server is active on port ${this.port}`);
        });
    }
}