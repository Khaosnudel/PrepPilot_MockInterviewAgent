/**
 * Unit tests for Persistence module.
 * Tests save/load/export/reset functionality.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 *
 * Run with: npx vitest run src/prep_pilot/static/js/persistence.test.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { Persistence } = await import('./persistence.js');
const { ElementRegistry } = await import('./element-registry.js');

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Create a mock fetch that resolves with the given response.
 */
function mockFetch(responseData, options = {}) {
    const { ok = true, status = 200 } = options;
    return vi.fn().mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(responseData),
    });
}

/**
 * Create a mock fetch that rejects (network error).
 */
function mockFetchError(errorMessage = 'Network error') {
    return vi.fn().mockRejectedValue(new Error(errorMessage));
}

/**
 * Create a Persistence instance with common test dependencies.
 */
function createPersistence(overrides = {}) {
    const registry = new ElementRegistry();
    const canvas = { renderAll: vi.fn() };
    const showStatus = vi.fn();
    const gatherTheme = vi.fn().mockReturnValue({
        main: { colors: { background: '#0f172a' } },
    });
    const applyToEditor = vi.fn();
    const getDefaults = vi.fn().mockReturnValue({
        main: { colors: { background: '#0f172a' } },
    });

    const persistence = new Persistence({
        registry,
        canvas,
        apiBase: 'http://localhost:8000',
        showStatus,
        gatherTheme,
        applyToEditor,
        getDefaults,
        ...overrides,
    });

    return { persistence, registry, canvas, showStatus, gatherTheme, applyToEditor, getDefaults };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Persistence', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('constructor', () => {
        it('throws if no registry is provided', () => {
            expect(() => new Persistence({})).toThrow('Persistence requires an ElementRegistry instance');
        });

        it('throws if options is null', () => {
            expect(() => new Persistence(null)).toThrow();
        });

        it('creates instance with valid registry', () => {
            const registry = new ElementRegistry();
            const persistence = new Persistence({ registry });
            expect(persistence).toBeDefined();
        });
    });

    describe('save', () => {
        it('sends PUT /theme with theme data and elements', async () => {
            const { persistence, registry } = createPersistence();

            // Add an element to the registry
            registry.addElement('icon', { iconId: 'star', x: 10, y: 20, width: 32, height: 32, color: '#000', opacity: 1.0 });

            global.fetch = mockFetch({ status: 'saved' });

            const result = await persistence.save();

            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalledTimes(1);

            const [url, options] = global.fetch.mock.calls[0];
            expect(url).toBe('http://localhost:8000/theme');
            expect(options.method).toBe('PUT');

            const body = JSON.parse(options.body);
            expect(body.main).toBeDefined();
            expect(body.elements).toBeDefined();
            expect(body.elements.length).toBe(1);
            expect(body.elements[0].type).toBe('icon');
            expect(body.elements[0].iconId).toBe('star');
        });

        it('shows success message on successful save', async () => {
            const { persistence, showStatus } = createPersistence();
            global.fetch = mockFetch({ status: 'saved' });

            await persistence.save();

            expect(showStatus).toHaveBeenCalledWith(
                expect.stringContaining('Saved'),
                'success'
            );
        });

        it('shows error toast on server error (non-ok response)', async () => {
            const { persistence, registry, showStatus } = createPersistence();
            registry.addElement('icon', { iconId: 'star', x: 0, y: 0, width: 32, height: 32, color: '#000', opacity: 1.0 });

            global.fetch = mockFetch({}, { ok: false, status: 500 });

            const result = await persistence.save();

            expect(result).toBe(false);
            expect(showStatus).toHaveBeenCalledWith(
                expect.stringContaining('Save failed'),
                'error'
            );
        });

        it('shows error toast on network error and retains local state', async () => {
            const { persistence, registry, showStatus } = createPersistence();
            registry.addElement('icon', { iconId: 'star', x: 0, y: 0, width: 32, height: 32, color: '#000', opacity: 1.0 });

            global.fetch = mockFetchError('Network error');

            const result = await persistence.save();

            expect(result).toBe(false);
            expect(showStatus).toHaveBeenCalledWith(
                expect.stringContaining('Could not connect'),
                'error'
            );
            // Local state is retained
            expect(registry.getAllElements().length).toBe(1);
        });

        it('retains local state on save failure', async () => {
            const { persistence, registry } = createPersistence();
            registry.addElement('icon', { iconId: 'star', x: 50, y: 60, width: 32, height: 32, color: '#ff0000', opacity: 0.8 });
            registry.addElement('text', { content: 'Hello', x: 100, y: 100, width: 200, height: 40, fontSize: 16, fontWeight: 'normal', color: '#fff', opacity: 1.0 });

            global.fetch = mockFetch({}, { ok: false, status: 500 });

            await persistence.save();

            // All elements still in registry
            expect(registry.getAllElements().length).toBe(2);
        });
    });

    describe('load', () => {
        it('fetches GET /theme and deserializes elements to render on canvas', async () => {
            const { persistence, registry, canvas, applyToEditor } = createPersistence();

            const themeData = {
                main: { colors: { background: '#111' } },
                elements: [
                    { id: 'el-1', type: 'icon', iconId: 'star', x: 10, y: 20, width: 32, height: 32, color: '#000', opacity: 1.0, zIndex: 1 },
                    { id: 'el-2', type: 'text', content: 'Hi', x: 50, y: 50, width: 200, height: 40, fontSize: 16, fontWeight: 'normal', color: '#fff', opacity: 1.0, zIndex: 2 },
                ],
            };

            global.fetch = mockFetch(themeData);

            const result = await persistence.load();

            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/theme');
            expect(registry.getAllElements().length).toBe(2);
            expect(registry.getElement('el-1').iconId).toBe('star');
            expect(registry.getElement('el-2').content).toBe('Hi');
            expect(canvas.renderAll).toHaveBeenCalled();
            expect(applyToEditor).toHaveBeenCalledWith(themeData);
        });

        it('handles empty elements array (no previously saved data)', async () => {
            const { persistence, registry, canvas } = createPersistence();

            global.fetch = mockFetch({ elements: [] });

            const result = await persistence.load();

            expect(result).toBe(true);
            expect(registry.getAllElements().length).toBe(0);
            expect(canvas.renderAll).toHaveBeenCalled();
        });

        it('handles missing elements key (no previously saved data)', async () => {
            const { persistence, registry, canvas } = createPersistence();

            global.fetch = mockFetch({ main: { colors: {} } });

            const result = await persistence.load();

            expect(result).toBe(true);
            expect(registry.getAllElements().length).toBe(0);
            expect(canvas.renderAll).toHaveBeenCalled();
        });

        it('starts with empty canvas on network error', async () => {
            const { persistence, registry, canvas } = createPersistence();

            // Pre-populate registry to verify it gets cleared
            registry.addElement('icon', { iconId: 'test', x: 0, y: 0, width: 32, height: 32, color: '#000', opacity: 1.0 });

            global.fetch = mockFetchError('Network error');

            const result = await persistence.load();

            expect(result).toBe(false);
            expect(registry.getAllElements().length).toBe(0);
            expect(canvas.renderAll).toHaveBeenCalled();
        });

        it('starts with empty canvas on non-ok response', async () => {
            const { persistence, registry, canvas, showStatus } = createPersistence();

            global.fetch = mockFetch({}, { ok: false, status: 500 });

            const result = await persistence.load();

            expect(result).toBe(false);
            expect(showStatus).toHaveBeenCalledWith(
                expect.stringContaining('Could not load'),
                'error'
            );
        });
    });

    describe('exportJSON', () => {
        it('includes elements in exported JSON alongside theme', () => {
            const { persistence, registry } = createPersistence();

            registry.addElement('icon', { iconId: 'star', x: 10, y: 20, width: 32, height: 32, color: '#000', opacity: 1.0 });
            registry.addElement('image', { source: 'https://example.com/img.png', x: 100, y: 100, width: 200, height: 150, opacity: 1.0 });

            // Mock navigator.clipboard
            global.navigator = { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } };

            const exported = persistence.exportJSON();

            expect(exported.main).toBeDefined();
            expect(exported.elements).toBeDefined();
            expect(exported.elements.length).toBe(2);
            expect(exported.elements[0].type).toBe('icon');
            expect(exported.elements[1].type).toBe('image');
        });

        it('shows success status after export', () => {
            const { persistence, showStatus } = createPersistence();

            // Mock navigator.clipboard
            global.navigator = { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } };

            persistence.exportJSON();

            expect(showStatus).toHaveBeenCalled();
        });

        it('exports empty elements array when registry is empty', () => {
            const { persistence } = createPersistence();

            global.navigator = { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } };

            const exported = persistence.exportJSON();

            expect(exported.elements).toEqual([]);
        });

        it('works without clipboard API', () => {
            const { persistence, registry, showStatus } = createPersistence();
            registry.addElement('icon', { iconId: 'star', x: 0, y: 0, width: 32, height: 32, color: '#000', opacity: 1.0 });

            // No clipboard available
            global.navigator = {};

            const exported = persistence.exportJSON();

            expect(exported.elements.length).toBe(1);
            expect(showStatus).toHaveBeenCalledWith(
                expect.stringContaining('Export ready'),
                'success'
            );
        });
    });

    describe('reset', () => {
        it('clears all elements on confirm', () => {
            const { persistence, registry, canvas, showStatus } = createPersistence();

            registry.addElement('icon', { iconId: 'star', x: 0, y: 0, width: 32, height: 32, color: '#000', opacity: 1.0 });
            registry.addElement('text', { content: 'Hello', x: 50, y: 50, width: 200, height: 40, fontSize: 16, fontWeight: 'normal', color: '#fff', opacity: 1.0 });

            const confirmFn = vi.fn().mockReturnValue(true);

            const result = persistence.reset(confirmFn);

            expect(result).toBe(true);
            expect(confirmFn).toHaveBeenCalled();
            expect(registry.getAllElements().length).toBe(0);
            expect(canvas.renderAll).toHaveBeenCalled();
            expect(showStatus).toHaveBeenCalledWith(
                expect.stringContaining('Reset to defaults'),
                'success'
            );
        });

        it('preserves state on cancel', () => {
            const { persistence, registry, canvas, showStatus } = createPersistence();

            registry.addElement('icon', { iconId: 'star', x: 0, y: 0, width: 32, height: 32, color: '#000', opacity: 1.0 });

            const confirmFn = vi.fn().mockReturnValue(false);

            const result = persistence.reset(confirmFn);

            expect(result).toBe(false);
            expect(confirmFn).toHaveBeenCalled();
            // State preserved
            expect(registry.getAllElements().length).toBe(1);
            // Canvas not re-rendered
            expect(canvas.renderAll).not.toHaveBeenCalled();
            // No status message
            expect(showStatus).not.toHaveBeenCalled();
        });

        it('applies default theme to editor on confirm', () => {
            const { persistence, registry, applyToEditor, getDefaults } = createPersistence();

            registry.addElement('icon', { iconId: 'star', x: 0, y: 0, width: 32, height: 32, color: '#000', opacity: 1.0 });

            const confirmFn = vi.fn().mockReturnValue(true);

            persistence.reset(confirmFn);

            expect(getDefaults).toHaveBeenCalled();
            expect(applyToEditor).toHaveBeenCalledWith(getDefaults());
        });

        it('shows confirmation prompt with descriptive message', () => {
            const { persistence } = createPersistence();

            const confirmFn = vi.fn().mockReturnValue(false);

            persistence.reset(confirmFn);

            expect(confirmFn).toHaveBeenCalledWith(
                expect.stringContaining('Reset to defaults')
            );
        });
    });
});
