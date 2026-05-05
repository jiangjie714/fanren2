import { defineConfig } from 'vitest/config';

export default defineConfig({
    root: '.',
    css: {
        postcss: {},
    },
    test: {
        globals: true,
        environment: 'node',
    },
});
