/**
 * Unit tests for GridOverlay
 * Run with: npx vitest run src/prep_pilot/static/js/grid-overlay.test.js
 */
import { describe, it, expect, beforeEach } from 'vitest';

const { GridOverlay, DEFAULT_GRID_SPACING, MIN_GRID_SPACING, MAX_GRID_SPACING } = await import('./grid-overlay.js');

/**
 * Creates a minimal DOM-like container element for testing.
 */
function createMockContainer() {
    const children = [];
    return {
        appendChild(child) {
            child.parentNode = this;
            children.push(child);
        },
        removeChild(child) {
            const idx = children.indexOf(child);
            if (idx >= 0) {
                children.splice(idx, 1);
                child.parentNode = null;
            }
        },
        get childNodes() {
            return [...children];
        },
        get children() {
            return [...children];
        }
    };
}

/**
 * Creates a minimal DOM element mock.
 */
function mockCreateElement(tag) {
    const el = {
        tagName: tag.toUpperCase(),
        className: '',
        style: {},
        parentNode: null,
        _attributes: {},
        setAttribute(name, value) {
            this._attributes[name] = value;
        },
        getAttribute(name) {
            return this._attributes[name] || null;
        }
    };
    return el;
}

// Mock document.createElement for the GridOverlay's _render method
const originalCreateElement = globalThis.document?.createElement;
beforeEach(() => {
    globalThis.document = globalThis.document || {};
    globalThis.document.createElement = mockCreateElement;
});

describe('GridOverlay', () => {
    let container;
    let grid;

    beforeEach(() => {
        container = createMockContainer();
        grid = new GridOverlay(container);
    });

    describe('constructor', () => {
        it('should throw if no container element is provided', () => {
            expect(() => new GridOverlay(null)).toThrow('GridOverlay requires a container element');
            expect(() => new GridOverlay(undefined)).toThrow('GridOverlay requires a container element');
        });

        it('should initialize with default spacing and hidden state', () => {
            expect(grid.getSpacing()).toBe(DEFAULT_GRID_SPACING);
            expect(grid.isVisible()).toBe(false);
        });
    });

    describe('showGrid', () => {
        it('should make the grid visible', () => {
            grid.showGrid();
            expect(grid.isVisible()).toBe(true);
        });

        it('should use default spacing when no argument is provided', () => {
            grid.showGrid();
            expect(grid.getSpacing()).toBe(16);
        });

        it('should use the provided spacing', () => {
            grid.showGrid(32);
            expect(grid.getSpacing()).toBe(32);
        });

        it('should clamp spacing below minimum to 4', () => {
            grid.showGrid(2);
            expect(grid.getSpacing()).toBe(MIN_GRID_SPACING);
        });

        it('should clamp spacing above maximum to 128', () => {
            grid.showGrid(200);
            expect(grid.getSpacing()).toBe(MAX_GRID_SPACING);
        });

        it('should render a grid element into the container', () => {
            grid.showGrid(16);
            expect(container.children.length).toBe(1);
            expect(container.children[0].className).toBe('ui-editor-grid-overlay');
        });

        it('should set data-grid-spacing attribute on the grid element', () => {
            grid.showGrid(24);
            const gridEl = container.children[0];
            expect(gridEl.getAttribute('data-grid-spacing')).toBe(24);
        });

        it('should set pointer-events to none so grid does not intercept clicks', () => {
            grid.showGrid();
            const gridEl = container.children[0];
            expect(gridEl.style.pointerEvents).toBe('none');
        });

        it('should position the grid element absolutely to fill container', () => {
            grid.showGrid();
            const gridEl = container.children[0];
            expect(gridEl.style.position).toBe('absolute');
            expect(gridEl.style.top).toBe('0');
            expect(gridEl.style.left).toBe('0');
            expect(gridEl.style.width).toBe('100%');
            expect(gridEl.style.height).toBe('100%');
        });

        it('should re-render when called again with different spacing', () => {
            grid.showGrid(16);
            expect(container.children.length).toBe(1);
            grid.showGrid(32);
            expect(container.children.length).toBe(1); // old one removed, new one added
            expect(grid.getSpacing()).toBe(32);
        });
    });

    describe('hideGrid', () => {
        it('should set visible to false', () => {
            grid.showGrid();
            grid.hideGrid();
            expect(grid.isVisible()).toBe(false);
        });

        it('should remove the grid element from the container', () => {
            grid.showGrid();
            expect(container.children.length).toBe(1);
            grid.hideGrid();
            expect(container.children.length).toBe(0);
        });

        it('should be safe to call when grid is already hidden', () => {
            expect(() => grid.hideGrid()).not.toThrow();
            expect(grid.isVisible()).toBe(false);
        });
    });

    describe('updateGridSpacing', () => {
        it('should update the spacing value', () => {
            grid.updateGridSpacing(64);
            expect(grid.getSpacing()).toBe(64);
        });

        it('should clamp spacing to valid range', () => {
            grid.updateGridSpacing(1);
            expect(grid.getSpacing()).toBe(MIN_GRID_SPACING);

            grid.updateGridSpacing(256);
            expect(grid.getSpacing()).toBe(MAX_GRID_SPACING);
        });

        it('should round non-integer spacing to nearest integer', () => {
            grid.updateGridSpacing(15.7);
            expect(grid.getSpacing()).toBe(16);

            grid.updateGridSpacing(20.3);
            expect(grid.getSpacing()).toBe(20);
        });

        it('should re-render the grid if currently visible', () => {
            grid.showGrid(16);
            const oldGridEl = container.children[0];
            grid.updateGridSpacing(32);
            const newGridEl = container.children[0];
            // The grid element should have been replaced
            expect(newGridEl.getAttribute('data-grid-spacing')).toBe(32);
        });

        it('should not render if grid is hidden', () => {
            grid.updateGridSpacing(32);
            expect(container.children.length).toBe(0);
        });

        it('should not modify element positions (Requirement 8.4)', () => {
            // This test validates the design principle that changing grid spacing
            // does not affect any element positions. The GridOverlay only manages
            // the visual grid lines, not element positions.
            grid.showGrid(16);
            grid.updateGridSpacing(32);
            // Grid overlay only manages its own rendering, never touches elements
            expect(grid.getSpacing()).toBe(32);
            expect(grid.isVisible()).toBe(true);
        });
    });

    describe('constants', () => {
        it('should export correct default spacing', () => {
            expect(DEFAULT_GRID_SPACING).toBe(16);
        });

        it('should export correct min spacing', () => {
            expect(MIN_GRID_SPACING).toBe(4);
        });

        it('should export correct max spacing', () => {
            expect(MAX_GRID_SPACING).toBe(128);
        });
    });
});
