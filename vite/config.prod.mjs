import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    logLevel: 'warning',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser'],
                },
            },
        },
        minify: 'terser',
        terserOptions: {
            maxWorkers: 1,
            compress: { passes: 2 },
            mangle: true,
            format: { comments: false },
        },
    },
});
