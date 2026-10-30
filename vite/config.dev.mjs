import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    server: {
        port: 5180,
        host: true,
        watch: {
            // The file-observation layer writes through a temporary sibling
            // directory; watching it makes chokidar throw EBUSY on Windows.
            ignored: ['**/*.tmpdir/**', '**/node_modules/**', '**/.git/**'],
        },
    },
});
