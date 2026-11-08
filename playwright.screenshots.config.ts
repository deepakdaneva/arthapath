import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** README screenshots: `npm run screenshots`. */
export default defineConfig({ ...base, testIgnore: [], testMatch: 'screenshots.spec.ts', retries: 0 });
