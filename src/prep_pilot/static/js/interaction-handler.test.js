/**
 * Tests for InteractionHandler - Task 5.1
 * Tests mouse event listeners and click/shift-click selection logic.
 *
 * Requirements: 3.1, 3.7, 5.1, 5.2, 5.3, 5.4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock DOM Setup ──────────────────────────────────────────────────────────

// Mock document globally before importing the module
globalThis.document = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
};

// Mock cancelAnimationFrame and requestAnimationFrame
globalThis.cancelAnimationFrame = vi.fn();
globalThis.requestAnimationFrame = vi.fn((cb) => {
    cb();
    return 1;
});

function createMockOverlay() {
    const listeners = {};
    return {
        style: {},
        offsetWidth: 800,
        offsetHeight: 600,
        clientWidth: 800,
        clientHeight: 600,
        dataset: {},
        parentElement: null,
        addEventListener: vi.fn((event, handler) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(handler);
        }),
        removeEventListener: vi.fn((event, handler) => {
            if (listeners[event]) {
                listeners[event] = listeners[event].filter(h => h !== handler);
            }
        }),
        _listeners: listeners
    };
}

function createMockCanvas(overlay) {
    return {
        _overlay: overlay,
        getCanvasBounds: vi.fn(() => ({ width: 800, height: 600 })),
        renderElement: vi.fn(),
        showHandles: vi.fn(),
        hideHandles: vi.fn(),
        showMultiSelectBoundingBox: vi.fn()
    };
}

function createMockRegistry() {
    const elements = new Map();
    const selection = new Set();

    return {
        _elements: elements,
        _selection: selection,
        addElement(type, props) {
            const id = `elem-${elements.size + 1}`;
            const el = { id, type, x: 0, y: 0, width: 32, height: 32, opacity: 1.0, zIndex: elements.size + 1, ...props };
            elements.set(id, el);
            return el;
        },
        getElement(id) {
            return elements.get(id) || null;
        },
        getAllElements() {
            return Array.from(elements.values());
        },
        getSelectedIds() {
            return Array.from(selection);
        },
        selectElement(id) {
            selection.clear();
            if (elements.has(id)) {
                selection.add(id);
            }
        },
        addToSelection(id) {
            if (elements.has(id)) {
                selection.add(id);
            }
        },
        removeFromSelection(id) {
            selection.delete(id);
        },
        clearSelection() {
            selection.clear();
        },
        updateElement(id, props) {
            const el = elements.get(id);
            if (el) {
                Object.assign(el, props);
            }
        },
        setSelection(ids) {
            selection.clear();
            for (const id of ids) {
                if (elements.has(id)) {
                    selection.add(id);
                }
            }
        }
    };
}

function createClickEvent(target, options = {}) {
    return {
        target: target || {},
        clientX: options.clientX || 0,
        clientY: options.clientY || 0,
        shiftKey: options.shiftKey || false,
        preventDefault: vi.fn()
    };
}

// ─── Import Module ───────────────────────────────────────────────────────────

const { InteractionHandler } = await import('./interaction-handler.js');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InteractionHandler', () => {
    let overlay;
    let canvas;
    let registry;
    let handler;

    beforeEach(() => {
        vi.clearAllMocks();
        overlay = createMockOverlay();
        canvas = createMockCanvas(overlay);
        registry = createMockRegistry();
        handler = new InteractionHandler(canvas, registry);
    });

    describe('constructor', () => {
        it('should attach click and mousedown listeners to the overlay', () => {
            expect(overlay.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
            expect(overlay.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
        });

        it('should attach mousemove and mouseup listeners to document', () => {
            expect(document.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
            expect(document.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
        });
    });

    describe('handleClick - element selection (Req 5.1)', () => {
        it('should select a single element when clicked', () => {
            const el = registry.addElement('icon', { x: 100, y: 100 });
            const target = { dataset: { elementId: el.id }, parentElement: overlay };

            handler.handleClick(createClickEvent(target));

            expect(registry.getSelectedIds()).toEqual([el.id]);
        });

        it('should deselect other elements when clicking a new element', () => {
            const el1 = registry.addElement('icon', { x: 100, y: 100 });
            const el2 = registry.addElement('icon', { x: 200, y: 200 });

            // Select first element
            registry.selectElement(el1.id);
            expect(registry.getSelectedIds()).toEqual([el1.id]);

            // Click second element
            const target = { dataset: { elementId: el2.id }, parentElement: overlay };
            handler.handleClick(createClickEvent(target));

            expect(registry.getSelectedIds()).toEqual([el2.id]);
        });

        it('should show handles when an element is selected', () => {
            const el = registry.addElement('icon', { x: 100, y: 100 });
            const target = { dataset: { elementId: el.id }, parentElement: overlay };

            handler.handleClick(createClickEvent(target));

            expect(canvas.showHandles).toHaveBeenCalledWith([el.id]);
        });
    });

    describe('handleClick - deselect on empty area (Req 5.4)', () => {
        it('should deselect all elements when clicking empty area', () => {
            const el = registry.addElement('icon', { x: 100, y: 100 });
            registry.selectElement(el.id);

            // Click on overlay itself (no data-element-id in the target chain)
            // Simulate clicking directly on the overlay
            handler.handleClick(createClickEvent(overlay));

            expect(registry.getSelectedIds()).toEqual([]);
        });

        it('should hide handles when clicking empty area', () => {
            const el = registry.addElement('icon', { x: 100, y: 100 });
            registry.selectElement(el.id);

            handler.handleClick(createClickEvent(overlay));

            expect(canvas.hideHandles).toHaveBeenCalled();
        });
    });

    describe('handleShiftClick - multi-select toggle (Req 5.2, 5.3)', () => {
        it('should add an unselected element to selection on shift-click', () => {
            const el1 = registry.addElement('icon', { x: 100, y: 100 });
            const el2 = registry.addElement('icon', { x: 200, y: 200 });

            // Select first element
            registry.selectElement(el1.id);

            // Shift-click second element
            const target = { dataset: { elementId: el2.id }, parentElement: overlay };
            handler.handleShiftClick(createClickEvent(target, { shiftKey: true }));

            const selected = registry.getSelectedIds();
            expect(selected).toContain(el1.id);
            expect(selected).toContain(el2.id);
        });

        it('should remove a selected element from selection on shift-click', () => {
            const el1 = registry.addElement('icon', { x: 100, y: 100 });
            const el2 = registry.addElement('icon', { x: 200, y: 200 });

            // Select both elements
            registry.selectElement(el1.id);
            registry.addToSelection(el2.id);
            expect(registry.getSelectedIds().length).toBe(2);

            // Shift-click first element to deselect it
            const target = { dataset: { elementId: el1.id }, parentElement: overlay };
            handler.handleShiftClick(createClickEvent(target, { shiftKey: true }));

            expect(registry.getSelectedIds()).toEqual([el2.id]);
        });

        it('should not change selection when shift-clicking empty area', () => {
            const el = registry.addElement('icon', { x: 100, y: 100 });
            registry.selectElement(el.id);

            handler.handleShiftClick(createClickEvent(overlay, { shiftKey: true }));

            expect(registry.getSelectedIds()).toEqual([el.id]);
        });

        it('should show multi-select bounding box when multiple elements selected', () => {
            const el1 = registry.addElement('icon', { x: 100, y: 100 });
            const el2 = registry.addElement('icon', { x: 200, y: 200 });

            registry.selectElement(el1.id);

            const target = { dataset: { elementId: el2.id }, parentElement: overlay };
            handler.handleShiftClick(createClickEvent(target, { shiftKey: true }));

            expect(canvas.showMultiSelectBoundingBox).toHaveBeenCalledWith(
                expect.arrayContaining([el1.id, el2.id])
            );
        });
    });

    describe('_onClick delegation', () => {
        it('should delegate to handleClick for normal clicks', () => {
            const el = registry.addElement('icon', { x: 100, y: 100 });
            const target = { dataset: { elementId: el.id }, parentElement: overlay };

            handler._onClick(createClickEvent(target));

            expect(registry.getSelectedIds()).toEqual([el.id]);
        });

        it('should delegate to handleShiftClick when shift key is held', () => {
            const el1 = registry.addElement('icon', { x: 100, y: 100 });
            const el2 = registry.addElement('icon', { x: 200, y: 200 });

            registry.selectElement(el1.id);

            const target = { dataset: { elementId: el2.id }, parentElement: overlay };
            handler._onClick(createClickEvent(target, { shiftKey: true }));

            const selected = registry.getSelectedIds();
            expect(selected).toContain(el1.id);
            expect(selected).toContain(el2.id);
        });

        it('should suppress click after drag with movement', () => {
            // Simulate that a drag just ended with movement
            handler._suppressClick = true;

            const el = registry.addElement('icon', { x: 100, y: 100 });
            const target = { dataset: { elementId: el.id }, parentElement: overlay };

            handler._onClick(createClickEvent(target));

            // Should not have selected anything because click was suppressed
            expect(registry.getSelectedIds()).toEqual([]);
        });
    });

    describe('_getElementIdFromEvent', () => {
        it('should find element ID from direct target', () => {
            const target = { dataset: { elementId: 'test-id' }, parentElement: overlay };
            const event = createClickEvent(target);

            const id = handler._getElementIdFromEvent(event);
            expect(id).toBe('test-id');
        });

        it('should find element ID from parent node (event delegation)', () => {
            const parent = { dataset: { elementId: 'parent-id' }, parentElement: overlay };
            const child = { dataset: {}, parentElement: parent };
            const event = createClickEvent(child);

            const id = handler._getElementIdFromEvent(event);
            expect(id).toBe('parent-id');
        });

        it('should return null when clicking on overlay (empty area)', () => {
            const event = createClickEvent(overlay);

            const id = handler._getElementIdFromEvent(event);
            expect(id).toBeNull();
        });

        it('should traverse multiple levels to find element ID', () => {
            const grandparent = { dataset: { elementId: 'gp-id' }, parentElement: overlay };
            const parent = { dataset: {}, parentElement: grandparent };
            const child = { dataset: {}, parentElement: parent };
            const event = createClickEvent(child);

            const id = handler._getElementIdFromEvent(event);
            expect(id).toBe('gp-id');
        });
    });

    describe('snapToGrid', () => {
        it('should return the value unchanged when snap is disabled', () => {
            handler.setSnapEnabled(false);
            expect(handler.snapToGrid(17)).toBe(17);
        });

        it('should snap to nearest grid increment when enabled', () => {
            handler.setSnapEnabled(true);
            handler.setGridSpacing(16);
            expect(handler.snapToGrid(17)).toBe(16);
            expect(handler.snapToGrid(24)).toBe(32);
            expect(handler.snapToGrid(8)).toBe(16);
        });

        it('should snap to 0 for values near 0', () => {
            handler.setSnapEnabled(true);
            handler.setGridSpacing(16);
            expect(handler.snapToGrid(7)).toBe(0);
        });

        it('should handle exact grid values', () => {
            handler.setSnapEnabled(true);
            handler.setGridSpacing(16);
            expect(handler.snapToGrid(32)).toBe(32);
            expect(handler.snapToGrid(0)).toBe(0);
        });
    });

    describe('setGridSpacing', () => {
        it('should accept valid spacing values (4-128)', () => {
            handler.setGridSpacing(32);
            handler.setSnapEnabled(true);
            expect(handler.snapToGrid(48)).toBe(32);
        });

        it('should reject spacing below 4', () => {
            handler.setGridSpacing(16);
            handler.setGridSpacing(2); // should be rejected
            handler.setSnapEnabled(true);
            // Still using 16
            expect(handler.snapToGrid(24)).toBe(32);
        });

        it('should reject spacing above 128', () => {
            handler.setGridSpacing(16);
            handler.setGridSpacing(200); // should be rejected
            handler.setSnapEnabled(true);
            // Still using 16
            expect(handler.snapToGrid(24)).toBe(32);
        });

        it('should accept boundary values 4 and 128', () => {
            handler.setSnapEnabled(true);

            handler.setGridSpacing(4);
            expect(handler.snapToGrid(5)).toBe(4);

            handler.setGridSpacing(128);
            expect(handler.snapToGrid(100)).toBe(128);
        });
    });

    describe('destroy', () => {
        it('should remove event listeners from overlay', () => {
            handler.destroy();
            expect(overlay.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
            expect(overlay.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
        });

        it('should remove event listeners from document', () => {
            handler.destroy();
            expect(document.removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
            expect(document.removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
        });
    });
});
