// detection/flaky-detector.ts
import { TestInfo, TestStatus } from '@playwright/test';
import { ClientConfig } from '../utils/client-factory';

export interface FlakyTestResult {
    testId: string;
    testName: string;
    filePath: string;
    client: string;
    environment: string;
    flakyScore: number; // 0-100, higher = more flaky
    confidence: number; // 0-100, confidence in detection
    failurePatterns: FailurePattern[];
    detectionDate: Date;
    lastStableDate?: Date;
    consecutiveFailures: number;
    totalRuns: number;
    successRate: number;
    avgDuration: number;
    durationVariance: number; // High variance indicates flakiness
}

export interface FailurePattern {
    type: 'timeout' | 'selector' | 'network' | 'race-condition' | 'data-issue';
    description: string;
    evidence: string[];
    probability: number;
}

export interface FlakinessMetrics {
    testId: string;
    runHistory: RunHistory[];
    failureClusters: FailureCluster[];
    timingAnomalies: TimingAnomaly[];
    retrySuccessRate: number;
}

interface RunHistory {
    timestamp: Date;
    status: TestStatus;
    duration: number;
    retryNumber: number;
    error?: string;
    stackTrace?: string;
    screenshot?: string;
    video?: string;
    browser?: string;
    os?: string;
}

interface FailureCluster {
    pattern: string;
    count: number;
    firstOccurrence: Date;
    lastOccurrence: Date;
}

interface TimingAnomaly {
    expectedDuration: number;
    actualDuration: number;
    deviation: number;
    timestamp: Date;
}

export class FlakyTestDetector {
    private testHistory: Map<string, RunHistory[]> = new Map();
    private readonly MIN_RUNS_FOR_ANALYSIS = 1;
    private readonly FLAKY_THRESHOLD = 30; // Score >= 30 = flaky

    async analyzeTestRun(
        testInfo: TestInfo,
        client: ClientConfig,
        runHistory: RunHistory
    ): Promise<FlakyTestResult | null> {

        const testId = this.generateTestId(testInfo, client);
        const history = this.getTestHistory(testId);
        history.push(runHistory);

        // Only analyze after sufficient runs
        if (history.length < this.MIN_RUNS_FOR_ANALYSIS) {
            return null;
        }

        const flakinessMetrics = await this.calculateFlakinessMetrics(testId, history);
        const flakyScore = this.calculateFlakyScore(flakinessMetrics);

        if (flakyScore >= this.FLAKY_THRESHOLD) {
            const failurePatterns = await this.identifyFailurePatterns(testId, history);

            return {
                testId,
                testName: testInfo.title,
                filePath: testInfo.file,
                client: client.id,
                environment: process.env.TEST_ENV || 'uat',
                flakyScore,
                confidence: this.calculateConfidence(history.length, flakinessMetrics),
                failurePatterns,
                detectionDate: new Date(),
                consecutiveFailures: this.countConsecutiveFailures(history),
                totalRuns: history.length,
                successRate: this.calculateSuccessRate(history),
                avgDuration: this.calculateAverageDuration(history),
                durationVariance: this.calculateDurationVariance(history)
            };
        }

        return null;
    }

    private generateTestId(testInfo: TestInfo, client: ClientConfig): string {
        return `${client.id}:${testInfo.file}:${testInfo.title}:${testInfo.line}`;
    }

    private getTestHistory(testId: string): RunHistory[] {
        if (!this.testHistory.has(testId)) {
            this.testHistory.set(testId, []);
        }
        return this.testHistory.get(testId)!;
    }

    private async calculateFlakinessMetrics(
        testId: string,
        history: RunHistory[]
    ): Promise<FlakinessMetrics> {
        const recentHistory = history.slice(-50); // Last 50 runs

        return {
            testId,
            runHistory: recentHistory,
            failureClusters: this.identifyFailureClusters(recentHistory),
            timingAnomalies: this.detectTimingAnomalies(recentHistory),
            retrySuccessRate: this.calculateRetrySuccessRate(recentHistory)
        };
    }

    private calculateFlakyScore(metrics: FlakinessMetrics): number {
        let score = 0;

        // 1. Success rate penalty (40% weight)
        const successRate = this.calculateSuccessRate(metrics.runHistory);
        score += (100 - successRate) * 0.4;

        // 2. Retry success bonus penalty (20% weight)
        if (metrics.retrySuccessRate > 70) {
            score += 20; // Tests that pass on retry are often flaky
        }

        // 3. Timing variance penalty (20% weight)
        const avgDuration = metrics.runHistory.reduce((sum, r) => sum + r.duration, 0) / metrics.runHistory.length;
        const variance = metrics.runHistory.reduce((sum, r) => sum + Math.pow(r.duration - avgDuration, 2), 0) / metrics.runHistory.length;
        const stdDev = Math.sqrt(variance);
        const cv = (stdDev / avgDuration) * 100; // Coefficient of variation

        if (cv > 50) score += 20;
        else if (cv > 30) score += 10;

        // 4. Failure clustering penalty (20% weight)
        if (metrics.failureClusters.length > 0) {
            score += Math.min(20, metrics.failureClusters.length * 5);
        }

        return Math.min(100, score);
    }

    private calculateSuccessRate(history: RunHistory[]): number {
        const passed = history.filter(r => r.status === 'passed').length;
        return (passed / history.length) * 100;
    }

    private calculateRetrySuccessRate(history: RunHistory[]): number {
        const retriedTests = history.filter(r => r.retryNumber > 0);
        if (retriedTests.length === 0) return 0;

        const passedOnRetry = retriedTests.filter(r => r.status === 'passed').length;
        return (passedOnRetry / retriedTests.length) * 100;
    }

    private identifyFailureClusters(history: RunHistory[]): FailureCluster[] {
        const clusters: Map<string, FailureCluster> = new Map();

        history.forEach(run => {
            if (run.status === 'failed' && run.error) {
                const errorPattern = this.normalizeErrorMessage(run.error);

                if (!clusters.has(errorPattern)) {
                    clusters.set(errorPattern, {
                        pattern: errorPattern,
                        count: 0,
                        firstOccurrence: run.timestamp,
                        lastOccurrence: run.timestamp
                    });
                }

                const cluster = clusters.get(errorPattern)!;
                cluster.count++;
                cluster.lastOccurrence = run.timestamp;
            }
        });

        return Array.from(clusters.values()).filter(c => c.count >= 3);
    }

    private normalizeErrorMessage(error: string): string {
        // Normalize error messages for pattern matching
        let normalized = error
            .toLowerCase()
            .replace(/\d+/g, '#') // Replace numbers
            .replace(/'.*?'/g, "'*'") // Replace strings
            .replace(/".*?"/g, '"*"')
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        // Extract common patterns
        if (normalized.includes('timeout')) return 'timeout-error';
        if (normalized.includes('selector') || normalized.includes('locator')) return 'selector-not-found';
        if (normalized.includes('network') || normalized.includes('http')) return 'network-error';
        if (normalized.includes('race condition') || normalized.includes('wait')) return 'race-condition';

        return normalized.substring(0, 100); // Truncate long errors
    }

    private detectTimingAnomalies(history: RunHistory[]): TimingAnomaly[] {
        if (history.length < 5) return [];

        const durations = history.map(r => r.duration);
        const avg = durations.reduce((a, b) => a + b) / durations.length;
        const stdDev = Math.sqrt(
            durations.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / durations.length
        );

        return history
            .filter(r => Math.abs(r.duration - avg) > 3 * stdDev)
            .map(r => ({
                expectedDuration: avg,
                actualDuration: r.duration,
                deviation: r.duration - avg,
                timestamp: r.timestamp
            }));
    }

    private async identifyFailurePatterns(
        testId: string,
        history: RunHistory[]
    ): Promise<FailurePattern[]> {
        const patterns: FailurePattern[] = [];
        const failures = history.filter(r => r.status === 'failed');

        if (failures.length === 0) return patterns;

        // Analyze error patterns
        const errorAnalysis = this.analyzeErrors(failures);
        patterns.push(...errorAnalysis);

        // Analyze timing patterns
        const timingAnalysis = this.analyzeTimingPatterns(history);
        patterns.push(...timingAnalysis);

        // Analyze browser/OS patterns
        const envAnalysis = this.analyzeEnvironmentPatterns(failures);
        patterns.push(...envAnalysis);

        return patterns.sort((a, b) => b.probability - a.probability);
    }

    private analyzeErrors(failures: RunHistory[]): FailurePattern[] {
        const patterns: Map<string, FailurePattern> = new Map();

        failures.forEach(failure => {
            if (!failure.error) return;

            let patternType: FailurePattern['type'] = 'selector';
            let description = 'Unknown error pattern';
            let probability = 50;

            if (failure.error.includes('Timeout')) {
                patternType = 'timeout';
                description = 'Element timeout or page load timeout';
                probability = 70;
            } else if (failure.error.includes('locator') || failure.error.includes('selector')) {
                patternType = 'selector';
                description = 'Element not found or not interactable';
                probability = 80;
            } else if (failure.error.includes('network') || failure.error.includes('fetch')) {
                patternType = 'network';
                description = 'Network request failed or timed out';
                probability = 60;
            } else if (failure.error.includes('wait') || failure.error.includes('expect')) {
                patternType = 'race-condition';
                description = 'Race condition or timing issue';
                probability = 75;
            }

            const key = `${patternType}:${description}`;
            if (!patterns.has(key)) {
                patterns.set(key, {
                    type: patternType,
                    description,
                    evidence: [],
                    probability
                });
            }

            patterns.get(key)!.evidence.push(failure.error.substring(0, 200));
        });

        return Array.from(patterns.values());
    }

    private analyzeTimingPatterns(history: RunHistory[]): FailurePattern[] {
        const patterns: FailurePattern[] = [];
        const anomalies = this.detectTimingAnomalies(history);

        if (anomalies.length > history.length * 0.2) { // More than 20% anomalies
            patterns.push({
                type: 'race-condition',
                description: 'High timing variance suggests race conditions',
                evidence: anomalies.map(a => `Deviation: ${a.deviation}ms`),
                probability: 65
            });
        }

        return patterns;
    }

    private analyzeEnvironmentPatterns(failures: RunHistory[]): FailurePattern[] {
        const patterns: FailurePattern[] = [];

        // Group by browser
        const byBrowser = new Map<string, number>();
        failures.forEach(f => {
            const browser = f.browser || 'unknown';
            byBrowser.set(browser, (byBrowser.get(browser) || 0) + 1);
        });

        byBrowser.forEach((count, browser) => {
            if (count / failures.length > 0.8) { // 80%+ failures on one browser
                patterns.push({
                    type: 'selector',
                    description: `Browser-specific issue: ${browser}`,
                    evidence: [`${count} failures on ${browser}`],
                    probability: 85
                });
            }
        });

        return patterns;
    }

    private calculateConfidence(totalRuns: number, metrics: FlakinessMetrics): number {
        let confidence = Math.min(100, totalRuns * 2); // 2% per run, max 100%

        // Increase confidence with more failure patterns
        if (metrics.failureClusters.length > 0) {
            confidence = Math.min(100, confidence + 20);
        }

        // Increase confidence with timing anomalies
        if (metrics.timingAnomalies.length > 0) {
            confidence = Math.min(100, confidence + 15);
        }

        return confidence;
    }

    private countConsecutiveFailures(history: RunHistory[]): number {
        let consecutive = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].status === 'failed') {
                consecutive++;
            } else {
                break;
            }
        }
        return consecutive;
    }

    private calculateAverageDuration(history: RunHistory[]): number {
        const passedTests = history.filter(r => r.status === 'passed');
        if (passedTests.length === 0) return 0;

        return passedTests.reduce((sum, r) => sum + r.duration, 0) / passedTests.length;
    }

    private calculateDurationVariance(history: RunHistory[]): number {
        const avg = this.calculateAverageDuration(history);
        if (history.length < 2) return 0;

        const variance = history.reduce((sum, r) => sum + Math.pow(r.duration - avg, 2), 0) / history.length;
        return variance;
    }

    async saveFlakyTestResult(result: FlakyTestResult): Promise<void> {
        const db = this.getDatabase();
        await db.collection('flaky_tests').updateOne(
            { testId: result.testId },
            { $set: result, $push: { detections: { date: new Date(), score: result.flakyScore } } },
            { upsert: true }
        );
    }

    async getFlakyTests(threshold: number = 30): Promise<FlakyTestResult[]> {
        const db = this.getDatabase();
        return await db.collection('flaky_tests')
            .find({ flakyScore: { $gte: threshold } })
            .sort({ flakyScore: -1 })
            .toArray();
    }

    private getDatabase() {
        // Implementation depends on your DB (MongoDB, SQLite, etc.)
        // For simplicity, using a file-based approach
        const fs = require('fs');
        const path = require('path');

        const dbPath = path.join(__dirname, '../data/flaky-history.db.json');
        if (!fs.existsSync(dbPath)) {
            fs.writeFileSync(dbPath, JSON.stringify({ flaky_tests: [] }));
        }

        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        return {
            collection: (name: string) => ({
                find: (query: any) => ({
                    sort: (sort: any) => ({
                        toArray: () => data[name]?.filter((item: any) =>
                            Object.keys(query).every(key => {
                                if (key === 'flakyScore' && query[key].$gte) {
                                    return item[key] >= query[key].$gte;
                                }
                                return item[key] === query[key];
                            })
                        ) || []
                    })
                }),
                updateOne: async (filter: any, update: any, options: any) => {
                    const collection = data[name] || [];
                    const index = collection.findIndex((item: any) =>
                        Object.keys(filter).every(key => item[key] === filter[key])
                    );

                    if (index === -1 && options.upsert) {
                        collection.push(update.$set);
                    } else if (index !== -1) {
                        collection[index] = { ...collection[index], ...update.$set };
                        if (update.$push) {
                            Object.keys(update.$push).forEach(key => {
                                if (!collection[index][key]) collection[index][key] = [];
                                collection[index][key].push(update.$push[key]);
                            });
                        }
                    }

                    data[name] = collection;
                    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
                }
            })
        };
    }
}