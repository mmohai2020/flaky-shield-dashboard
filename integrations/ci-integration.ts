// integrations/ci-integration.ts
import { TestQuarantineManager } from '../quarantine/test-quarantine';
import { FlakyTestDetector } from '../detection/flaky-detector';

export class CIIntegration {
    constructor(
        private quarantineManager: TestQuarantineManager,
        private flakyDetector: FlakyTestDetector
    ) { }

    async generateCIRreport(): Promise<CIReport> {
        const quarantineStats = await this.quarantineManager.getQuarantineStats();
        const flakyTests = await this.flakyDetector.getFlakyTests(30);

        return {
            timestamp: new Date().toISOString(),
            environment: process.env.TEST_ENV || 'ci',
            buildNumber: process.env.BUILD_NUMBER || 'unknown',
            commitHash: process.env.COMMIT_HASH || 'unknown',
            quarantine: quarantineStats,
            flakyTests: flakyTests.length,
            highRiskFlakyTests: flakyTests.filter(t => t.flakyScore >= 70).length,
            recommendations: this.generateRecommendations(quarantineStats, flakyTests)
        };
    }

    private generateRecommendations(
        stats: any,
        flakyTests: any[]
    ): string[] {
        const recommendations: string[] = [];

        if (stats.active > 10) {
            recommendations.push('🚨 High number of quarantined tests. Consider pausing feature development to address stability.');
        }

        if (stats.active > 0) {
            recommendations.push('⚠️ Some tests are quarantined. Review them before merging to main.');
        }

        const highRisk = flakyTests.filter(t => t.flakyScore >= 70);
        if (highRisk.length > 0) {
            recommendations.push(`🔴 ${highRisk.length} high-risk flaky tests detected. Priority fix required.`);
        }

        const selectorIssues = flakyTests.filter(t =>
            t.failurePatterns.some((p: any) => p.type === 'selector')
        );
        if (selectorIssues.length > 0) {
            recommendations.push(`🎯 ${selectorIssues.length} tests have selector issues. Consider adding data-testids.`);
        }

        return recommendations;
    }

    async failBuildIfUnstable(): Promise<boolean> {
        const stats = await this.quarantineManager.getQuarantineStats();
        const flakyTests = await this.flakyDetector.getFlakyTests(70); // High-risk only

        // Fail build if too many high-risk flaky tests
        if (flakyTests.length > 5) {
            console.error(`❌ Build failed: ${flakyTests.length} high-risk flaky tests detected`);
            return false;
        }

        // Fail build if quarantine rate is too high
        const quarantineRate = (stats.active / (stats.total || 1)) * 100;
        if (quarantineRate > 20) { // More than 20% tests quarantined
            console.error(`❌ Build failed: ${quarantineRate.toFixed(1)}% of tests are quarantined`);
            return false;
        }

        return true;
    }

    async generateGitHubComment(): Promise<string> {
        const report = await this.generateCIRreport();

        return `
## 🧪 Test Stability Report

### 📊 Summary
- **Build Status**: ${report.recommendations.length > 0 ? '⚠️ Needs Attention' : '✅ Stable'}
- **Quarantined Tests**: ${report.quarantine.active} active
- **Flaky Tests**: ${report.flakyTests} detected
- **High Risk**: ${report.highRiskFlakyTests} tests

### 🚨 Recommendations
${report.recommendations.map(r => `- ${r}`).join('\n')}

### 📈 Metrics
\`\`\`json
${JSON.stringify({
            quarantine_rate: `${((report.quarantine.active / (report.quarantine.total || 1)) * 100).toFixed(1)}%`,
            avg_flaky_score: report.quarantine.averageFlakyScore.toFixed(1),
            by_client: report.quarantine.byClient,
            by_environment: report.quarantine.byEnvironment
        }, null, 2)}
\`\`\`

*Report generated at ${report.timestamp}*
    `;
    }
}

interface CIReport {
    timestamp: string;
    environment: string;
    buildNumber: string;
    commitHash: string;
    quarantine: any;
    flakyTests: number;
    highRiskFlakyTests: number;
    recommendations: string[];
}