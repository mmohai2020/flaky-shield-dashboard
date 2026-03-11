import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
    console.log('Global Setup: Initializing test environment...');
}

export default globalSetup;
