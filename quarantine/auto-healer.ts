// quarantine/auto-healer.ts
import { QuarantineRecord } from './test-quarantine';

export interface HealResult {
    success: boolean;
    message: string;
    confidence: number; // 0-100
    suggestedFix?: string;
    appliedFix?: string;
    testCode?: string;
}

export class AutoHealer {
    async attemptHeal(record: QuarantineRecord, error: string): Promise<HealResult> {
        console.log(`[AutoHealer] Attempting to heal ${record.testName} with error: ${error}`);
        // Analyze error and attempt to suggest/apply fixes
        const analysis = this.analyzeError(error, record);
        console.log(`[AutoHealer] Analysis pattern: ${analysis.pattern}`);

        switch (analysis.pattern) {
            case 'selector-not-found':
                return await this.healSelectorIssue(record, error, analysis);
            case 'timeout':
                return await this.healTimeoutIssue(record, error, analysis);
            case 'network-error':
                return await this.healNetworkIssue(record, error, analysis);
            case 'race-condition':
                return await this.healRaceCondition(record, error, analysis);
            default:
                console.log(`[AutoHealer] No pattern match for ${analysis.pattern}`);
                return {
                    success: false,
                    message: 'No auto-healing pattern detected',
                    confidence: 0
                };
        }
    }

    private analyzeError(error: string, record: QuarantineRecord): ErrorAnalysis {
        const lowerError = error.toLowerCase();

        if (lowerError.includes('timeout') || lowerError.includes('exceeded')) {
            return { pattern: 'timeout', element: this.extractElement(error) };
        }

        if (lowerError.includes('selector') || lowerError.includes('locator') ||
            lowerError.includes('not found')) {
            return { pattern: 'selector-not-found', element: this.extractElement(error) };
        }

        if (lowerError.includes('network') || lowerError.includes('failed') ||
            lowerError.includes('fetch')) {
            return { pattern: 'network-error', url: this.extractUrl(error) };
        }

        if (lowerError.includes('wait') || lowerError.includes('expect') ||
            lowerError.includes('state')) {
            return { pattern: 'race-condition', element: this.extractElement(error) };
        }

        return { pattern: 'unknown' };
    }

    private async healSelectorIssue(
        record: QuarantineRecord,
        error: string,
        analysis: ErrorAnalysis
    ): Promise<HealResult> {
        // Read the test file
        const testCode = await this.readTestFile(record.filePath);
        if (!testCode) {
            return {
                success: false,
                message: 'Could not read test file',
                confidence: 0
            };
        }

        // Find the problematic selector
        const selectorMatch = error.match(/locator\(['"](.*?)['"]\)/) ||
            error.match(/getBy.*?\(['"](.*?)['"]\)/);

        if (!selectorMatch) {
            return {
                success: false,
                message: 'Could not extract selector from error',
                confidence: 10
            };
        }

        const oldSelector = selectorMatch[1];
        const suggestions = this.generateSelectorSuggestions(oldSelector, testCode);

        if (suggestions.length === 0) {
            return {
                success: false,
                message: 'No alternative selectors suggested',
                confidence: 5
            };
        }

        // Try to apply the first suggestion
        const newSelector = suggestions[0];
        const healedCode = testCode.replace(oldSelector, newSelector);

        return {
            success: true,
            message: `Suggested selector fix: ${oldSelector} → ${newSelector}`,
            confidence: 90,
            suggestedFix: `Replace selector '${oldSelector}' with '${newSelector}'`,
            testCode: healedCode
        };
    }

    private async healTimeoutIssue(
        record: QuarantineRecord,
        error: string,
        analysis: ErrorAnalysis
    ): Promise<HealResult> {
        const testCode = await this.readTestFile(record.filePath);
        if (!testCode) {
            return {
                success: false,
                message: 'Could not read test file',
                confidence: 0
            };
        }

        // Look for waitForTimeout or low timeouts
        const timeoutPatterns = [
            { regex: /page\.waitForTimeout\((\d+)\)/, default: 5000 },
            { regex: /page\.waitForSelector\(.*?,.*?timeout:\s*(\d+)/, default: 30000 },
            { regex: /expect\(.*?\)\.toBeVisible\(.*?timeout:\s*(\d+)/, default: 10000 }
        ];

        const suggestions: string[] = [];

        timeoutPatterns.forEach(pattern => {
            const match = testCode.match(pattern.regex);
            if (match) {
                const currentTimeout = parseInt(match[1]);
                if (currentTimeout < pattern.default) {
                    const newTimeout = Math.min(currentTimeout * 2, pattern.default);
                    suggestions.push(`Increase timeout from ${currentTimeout} to ${newTimeout}`);
                }
            }
        });

        if (suggestions.length === 0) {
            // Add explicit wait if none exists
            suggestions.push('Add page.waitForTimeout(2000) before the failing action');
        }

        return {
            success: true,
            message: `Timeout issue detected. Suggestions: ${suggestions.join('; ')}`,
            confidence: 90,
            suggestedFix: suggestions[0]
        };
    }

    private async healRaceCondition(
        record: QuarantineRecord,
        error: string,
        analysis: ErrorAnalysis
    ): Promise<HealResult> {
        const testCode = await this.readTestFile(record.filePath);
        if (!testCode) {
            return {
                success: false,
                message: 'Could not read test file',
                confidence: 0
            };
        }

        // Look for patterns that suggest race conditions
        const fixes = [
            'Add await page.waitForLoadState("networkidle") before action',
            'Use expect(locator).toBeVisible() before interacting',
            'Add await page.waitForSelector() before clicking',
            'Use Promise.all() for parallel actions that should complete together'
        ];

        return {
            success: true,
            message: 'Race condition detected. Consider adding explicit waits.',
            confidence: 65,
            suggestedFix: fixes[0]
        };
    }

    private async healNetworkIssue(
        record: QuarantineRecord,
        error: string,
        analysis: ErrorAnalysis
    ): Promise<HealResult> {
        // Network issues are often environmental
        return {
            success: true,
            message: 'Network issue detected. Consider retrying or adding network idle wait.',
            confidence: 50,
            suggestedFix: 'Add page.waitForLoadState("networkidle") before the test step'
        };
    }

    private generateSelectorSuggestions(oldSelector: string, testCode: string): string[] {
        const suggestions: string[] = [];

        // Suggestion 1: Add data-testid if not present
        if (!oldSelector.includes('data-testid')) {
            const elementType = this.guessElementType(oldSelector);
            suggestions.push(`[data-testid="${elementType}-test"]`);
        }

        // Suggestion 2: Use role-based selector
        if (oldSelector.includes('button') || oldSelector.includes('btn')) {
            suggestions.push(`role=button[name*="${this.extractText(oldSelector)}"]`);
        }

        // Suggestion 3: More specific CSS selector
        if (oldSelector.startsWith('.') || oldSelector.startsWith('#')) {
            const parentContext = this.findParentContext(testCode, oldSelector);
            if (parentContext) {
                suggestions.push(`${parentContext} ${oldSelector}`);
            }
        }

        // Suggestion 4: XPath fallback (last resort)
        if (oldSelector.includes('text=')) {
            const text = oldSelector.replace('text=', '').replace(/['"]/g, '');
            suggestions.push(`xpath=//*[contains(text(), "${text}")]`);
        }

        return suggestions;
    }

    private async readTestFile(filePath: string): Promise<string | null> {
        try {
            const fs = require('fs').promises;
            return await fs.readFile(filePath, 'utf8');
        } catch {
            return null;
        }
    }

    private extractElement(error: string): string | null {
        const match = error.match(/Locator: (.*?)(?:\n|$)/) ||
            error.match(/selector: (.*?)(?:\n|$)/);
        return match ? match[1] : null;
    }

    private extractUrl(error: string): string | null {
        const match = error.match(/https?:\/\/[^\s]+/);
        return match ? match[0] : null;
    }

    private extractText(selector: string): string {
        const match = selector.match(/['"](.*?)['"]/);
        return match ? match[1] : 'element';
    }

    private guessElementType(selector: string): string {
        if (selector.includes('button')) return 'button';
        if (selector.includes('input')) return 'input';
        if (selector.includes('link') || selector.includes('a[')) return 'link';
        if (selector.includes('div')) return 'div';
        return 'element';
    }

    private findParentContext(code: string, selector: string): string | null {
        // Simple heuristic to find parent context
        const lines = code.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(selector)) {
                // Look backwards for a container
                for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                    if (lines[j].includes('page.locator') || lines[j].includes('getBy')) {
                        const parentMatch = lines[j].match(/['"](.*?)['"]/);
                        if (parentMatch) return parentMatch[1];
                    }
                }
            }
        }
        return null;
    }
}

interface ErrorAnalysis {
    pattern: 'selector-not-found' | 'timeout' | 'network-error' | 'race-condition' | 'unknown';
    element?: string | null;
    url?: string | null;
}