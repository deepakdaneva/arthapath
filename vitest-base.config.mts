import { defineConfig } from 'vitest/config';

// Picked up by the Angular unit-test builder (angular.json: "runnerConfig": true).
// Threads start faster than forked processes, and capping workers keeps runs
// stable on busy machines and small CI runners.
export default defineConfig({
  test: {
    pool: 'threads',
    maxWorkers: 2,
  },
});
