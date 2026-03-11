import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
    console.log('Global Teardown: Cleaning up...');
}

export default globalTeardown;
