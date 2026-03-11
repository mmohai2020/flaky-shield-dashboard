// quarantine/auto-healer.ts
import { QuarantineRecord } from './test-quarantine';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';

export interface HealResult {
    success: boolean;
    message: string;
    confidence: number; // 0-100
    suggestedFix?: string;
    appliedFix?: string;
    testCode?: string;
}

export class AutoHealer {
    private ai: GoogleGenAI | null = null;

    constructor() {
        if (process.env.GEMINI_API_KEY) {
            this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        } else {
            console.warn('[AutoHealer] GEMINI_API_KEY not found. AI auto-healing is disabled.');
        }
    }

    async attemptHeal(record: QuarantineRecord, error: string): Promise<HealResult> {
        console.log(`[AutoHealer] Attempting to heal ${record.testName} using AI...`);

        if (!this.ai) {
            return {
                success: false,
                message: 'Gemini API key is not configured. Cannot perform AI auto-healing.',
                confidence: 0
            };
        }

        const testCode = await this.readTestFile(record.filePath);
        if (!testCode) {
            return {
                success: false,
                message: `Could not read test file: ${record.filePath}`,
                confidence: 0
            };
        }

        const prompt = `
You are an expert SDET (Software Development Engineer in Test) specializing in Playwright and TypeScript.
A flaky test has failed. Please analyze the test code and the error message, and provide the fixed test code.

### Error Message:
${error}

### Original Test Code:
\`\`\`typescript
${testCode}
\`\`\`

### Instructions:
1. Identify the root cause of the flakiness (e.g., race condition, missing wait, bad selector, timeout).
2. Fix the original test code. Often, this requires adding \`await page.waitForLoadState('networkidle')\`, \`waitForTimeout\`, fixing locators, or adding \`expect(locator).toBeVisible()\`.
3. Return ONLY the complete, fixed TypeScript code.
4. DO NOT include any markdown formatting (like \`\`\`typescript), text explanations, or diffs. Output JUST the raw code.
`;

        try {
            console.log(`[AutoHealer] Sending request to Gemini...`);
            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            // Clean up the output in case the model ignored "no markdown" instruction
            let fixedCode = response.text || '';
            fixedCode = fixedCode.trim();
            if (fixedCode.startsWith('\`\`\`typescript')) {
                fixedCode = fixedCode.substring(13).trim();
            } else if (fixedCode.startsWith('\`\`\`ts')) {
                fixedCode = fixedCode.substring(5).trim();
            } else if (fixedCode.startsWith('\`\`\`')) {
                fixedCode = fixedCode.substring(3).trim();
            }
            if (fixedCode.endsWith('\`\`\`')) {
                fixedCode = fixedCode.substring(0, fixedCode.length - 3).trim();
            }

            return {
                success: true,
                message: 'AI successfully analyzed and proposed a fix for the test.',
                confidence: 85,
                suggestedFix: 'AI generated fix from Gemini',
                testCode: fixedCode
            };

        } catch (e: any) {
            console.error(`[AutoHealer] Gemini API error:`, e.message);
            return {
                success: false,
                message: `AI healing failed: ${e.message}`,
                confidence: 0
            };
        }
    }

    private async readTestFile(filePath: string): Promise<string | null> {
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch {
            return null;
        }
    }
}