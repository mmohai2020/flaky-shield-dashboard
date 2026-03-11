import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

let dbInstance: Database | null = null;

export async function getDatabase(): Promise<Database> {
    if (dbInstance) {
        return dbInstance;
    }

    const dbDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    dbInstance = await open({
        filename: path.join(dbDir, 'flaky-shield.sqlite'),
        driver: sqlite3.Database
    });

    await initializeSchema(dbInstance);

    return dbInstance;
}

async function initializeSchema(db: Database) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS flaky_tests (
            testId TEXT PRIMARY KEY,
            testName TEXT,
            filePath TEXT,
            client TEXT,
            environment TEXT,
            flakyScore REAL,
            confidence REAL,
            failurePatterns TEXT, -- JSON array
            detectionDate TEXT,
            lastStableDate TEXT,
            consecutiveFailures INTEGER,
            totalRuns INTEGER,
            successRate REAL,
            avgDuration REAL,
            durationVariance REAL,
            detections TEXT -- JSON array of historical detections
        );

        CREATE TABLE IF NOT EXISTS quarantine_registry (
            testId TEXT PRIMARY KEY,
            testName TEXT,
            filePath TEXT,
            client TEXT,
            environment TEXT,
            quarantinedAt TEXT,
            expiresAt TEXT,
            reason TEXT,
            flakyScore REAL,
            failurePatterns TEXT, -- JSON array
            quarantineRule TEXT,
            autoHealAttempts INTEGER,
            lastHealAttempt TEXT,
            status TEXT, -- 'active', 'healed', 'expired'
            metadata TEXT -- JSON object
        );
    `);
}
