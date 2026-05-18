import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.js'],
        environment: 'node',
        environmentMatchGlobs: [
            ['src/**/*icon-picker*.test.js', 'jsdom'],
            ['src/**/*properties-inspector*.test.js', 'jsdom'],
            ['src/**/*element-toolbar*.test.js', 'jsdom'],
            ['src/**/*undo-redo-integration*.test.js', 'jsdom'],
            ['src/**/*grid-controls*.test.js', 'jsdom']
        ]
    }
});
