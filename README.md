# FlakyShield Dashboard

FlakyShield is an intelligent test quarantine and auto-healing dashboard built on top of Playwright. It detects flaky tests, automatically quarantines them to prevent CI/CD pipeline blocking, and uses **Google's Gemini AI** to automatically write and apply real code fixes to your test files.

## 🌟 Features

*   **Real-time Flaky Detection**: Intercepts Playwright test results and detects patterns (Timeouts, Broken Selectors, Network Issues).
*   **Intelligent Quarantine**: Automatically puts flaky tests in "Quarantine" mode, preventing them from failing your main build pipelines.
*   **AI Auto-Healing (Gemini)**: Instead of generic retries, the system securely passes the test failure logs and source code to the Gemini AI (`gemini-2.5-flash`), which writes dynamic Playwright TypeScript fixes directly to the underlying `.spec.ts` file!
*   **Interactive Dashboard**: A sleek Node.js/Express UI to monitor System Health, view quarantined tests, and trigger manual heals.

## 🏗️ Architecture

1.  **Playwright Fixtures (`integrations/playwright-integration.ts`)**: Custom hooks that intercept `recordTestFailure`.
2.  **Detection Engine (`detection/flaky-detector.ts`)**: Calculates flakiness scores and maps errors to known patterns.
3.  **Quarantine Registry (`quarantine/test-quarantine.ts`)**: A SQLite database (`data/flaky-shield.sqlite`) that tracks test statuses (`active`, `healed`).
4.  **AutoHealer (`quarantine/auto-healer.ts`)**: The Gemini LLM broker. It reads the raw test code, appends the stack trace, and applies the AI-generated code fixes.
5.  **Dashboard API (`monitoring/flaky-dashboard.ts`)**: The web UI backend serving metrics and managing manual "Try Heal" requests.

## 🚀 Getting Started

Follow these steps to clone the repository, run the dashboard, and see the Auto-Healing AI in action locally.

### 1. Clone the repository

```bash
git clone https://github.com/mmohai2020/flaky-shield-dashboard.git
cd flaky-test-dashboard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the AI Engine

FlakyShield requires a Gemini API key to operate the Auto-Healing logic.

1.  Create a `.env` file in the root directory:
    ```bash
    cp .env.example .env # If an example exists, or just create a new file
    ```
2.  Add your Google Gemini API Key:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    ```

### 4. Run the Dashboard

To view the interactive UI, start the Express server:

```bash
npm start
```

The dashboard will be available at `http://localhost:3001`.

### 5. Simulate Flaky Tests and Auto-Healing

To see the system actually detect, quarantine, and AI-heal tests:

```bash
npm run test:flaky
```

**What happens?**
1.  Playwright will run the `tests/flaky-simulation.spec.ts` suite.
2.  Tests intentionally fail to simulate broken locators and timeouts.
3.  The system records these failures in the SQLite registry and quarantines them.
4.  **Auto-Healer Triggers**: In the background, the system securely sends the failures to Gemini.
5.  Gemini responds with valid TypeScript replacements, and the system rewrites the `flaky-simulation.spec.ts` file immediately.
6.  The database status flips to `healed`.
7.  Check you Web Dashboard to see the "Auto-Healed" counter go up!

## 🛠️ Manual Healing via Dashboard

If a test fails but requires manual approval before applying the AI fix:
1. Open the Dashboard at `http://localhost:3001`.
2. Find the offending test under **Active Quarantines**.
3. Click the **Try Heal** button. 
8. The backend will look up the pre-computed Gemini fix and apply it. The table will refresh and the test will turn green!

## 🔌 Integration Guide

Do you already have a Playwright test suite and want FlakyShield to watch and auto-heal your native tests? 

Integrating is seamless because FlakyShield is built as a **Playwright Fixture Extension**. You do not need to rewrite your tests; you just need to change where your `test` object is imported from!

1. **Move your tests** into this repository (or copy the FlakyShield core folders `integrations/`, `detection/`, and `quarantine/` into your existing repo).
2. **Update your imports**. Open your existing `.spec.ts` files. 
3. Change the standard Playwright import:
   ```typescript
   // ❌ Remove this:
   // import { test, expect } from '@playwright/test';
   ```
   To use the FlakyShield extended fixture:
   ```typescript
   // ✅ Define this instead (adjust the relative path to your integration folder):
   import { test } from '../integrations/playwright-integration';
   import { expect } from '@playwright/test';
   ```
4. **That's it!** The `integrations/playwright-integration.ts` file automatically attaches the `flakyTestHooks`. Every time your test cases run, passing or failing, the hooks will intercept the results, stream them to the SQLite `flaky-shield.sqlite` database, and trigger the Gemini AI Auto-Healer exactly as described above.
