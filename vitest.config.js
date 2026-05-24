import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.js'],
        teardownTimeout: 10000,
        testTimeout: 30000,
        hookTimeout: 30000,
        include: ['tests/**/*.test.js'],
        maxConcurrency: 1,
        fileParallelism: false,
    },
});
