/**
 * Unit tests for CanvasRenderer
 * Run with: npx vitest run src/prep_pilot/static/js/canvas-renderer.test.js
 *
 * Uses a lightweight DOM mock since the test environment is Node.js without jsdom.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Minimal DOM Mock ────────────────────────────────────────────────────────

class MockElement {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.childNodes = [];
        this.parentNode = null;
        this.innerHTML = '';
        this.textContent = '';
        this.classList = {
            _classes: new Set(),
            add(cls) { this._classes.add(cls); },
            remove(cls) { this._classes.delete(cls); },
            contains(cls) { return this._classes.has(cls); }
        };
        this.attributes = {};
        this.src = '';
        this.alt = '';
        this.draggable = true;
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        this.childNodes.push(child);
        return child;
    }

    remove() {
        if (this.parentNode) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx !== -1) {
                this.parentNode.children.splice(idx, 1);
                this.parentNode.childNodes.splice(idx, 1);
            }
            this.parentNode = null;
        }
    }

    querySelector(selector) {
        // Simple selector support for tests
        if (selector.startsWith('[data-element-id=')) {
            const id = selector.match(/\[data-element-id="([^"]+)"\]/)?.[1];
            return this._findByDataId(id);
        }
        if (selector === 'svg') {
            return this._findByTag('SVG');
        }
        if (selector === 'img') {
            return this._findByTag('IMG');
        }
        if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            return this._findByClass(cls);
        }
        return null;
    }

    querySelectorAll(selector) {
        if (selector.startsWith('[data-element-id=')) {
            const id = selector.match(/\[data-element-id="([^"]+)"\]/)?.[1];
            const found = this._findByDataId(id);
            return found ? [found] : [];
        }
        if (selector === '.canvas-element') {
            return this._findAllByClass('canvas-element');
        }
        return [];
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    getAttribute(name) {
        return this.attributes[name] || null;
    }

    _findByDataId(id) {
        for (const child of this.children) {
            if (child.dataset && child.dataset.elementId === id) return child;
            const found = child._findByDataId ? child._findByDataId(id) : null;
            if (found) return found;
        }
        return null;
    }

    _findByTag(tag) {
        for (const child of this.children) {
            if (child.tagName === tag) return child;
            const found = child._findByTag ? child._findByTag(tag) : null;
            if (found) return found;
        }
        return null;
    }

    _findByClass(cls) {
        for (const child of this.children) {
            if (child.classList && child.classList.contains(cls)) return child;
            const found = child._findByClass ? child._findByClass(cls) : null;
            if (found) return found;
        }
        return null;
    }

    _findAllByClass(cls) {
        const results = [];
        for (const child of this.children) {
            if (child.classList && child.classList.contains(cls)) results.push(child);
            if (child._findAllByClass) {
                results.push(...child._findAllByClass(cls));
            }
        }
        return results;
    }

    get offsetWidth() { return this._offsetWidth || 0; }
    set offsetWidth(v) { this._offsetWidth = v; }
    get offsetHeight() { return this._offsetHeight || 0; }
    set offsetHeight(v) { this._offsetHeight = v; }
    get clientWidth() { return this._clientWidth || 0; }
    set clientWidth(v) { this._clientWidth = v; }
    get clientHeight() { return this._clientHeight || 0; }
    set clientHeight(v) { this._clientHeight = v; }
}

// Mock document.createElement
const mockDocument = {
    createElement(tag) {
        return new MockElement(tag);
    }
};

vi.stubGlobal('document', mockDocument);

// Mock crypto.randomUUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
    randomUUID: () => `test-uuid-${++uuidCounter}`
});

const { ElementRegistry } = await import('./element-registry.js');
const { CanvasRenderer } = await import('./canvas-renderer.js');

describe('CanvasRenderer', () => {
    let registry;
    let overlay;
    let renderer;

    beforeEach(() => {
        registry = new ElementRegistry();
        uuidCounter = 0;
        overlay = new MockElement('div');
        overlay._offsetWidth = 800;
        overlay._offsetHeight = 600;
        renderer = new CanvasRenderer(overlay, registry);
    });

    // ─── Constructor / Overlay Init ──────────────────────────────────

    describe('constructor', () => {
        it('should set overlay to absolute positioning', () => {
            expect(overlay.style.position).toBe('absolute');
        });

        it('should set overlay to fill parent', () => {
            expect(overlay.style.width).toBe('100%');
            expect(overlay.style.height).toBe('100%');
        });

        it('should set transparent background', () => {
            expect(overlay.style.backgroundColor).toBe('transparent');
        });

        it('should set top and left to 0', () => {
            expect(overlay.style.top).toBe('0');
            expect(overlay.style.left).toBe('0');
        });
    });

    // ─── getCanvasBounds ─────────────────────────────────────────────

    describe('getCanvasBounds', () => {
        it('should return overlay dimensions', () => {
            const bounds = renderer.getCanvasBounds();
            expect(bounds.width).toBe(800);
            expect(bounds.height).toBe(600);
        });

        it('should return 0 for zero-size overlay', () => {
            const emptyOverlay = new MockElement('div');
            const emptyRenderer = new CanvasRenderer(emptyOverlay, registry);
            const bounds = emptyRenderer.getCanvasBounds();
            expect(bounds.width).toBe(0);
            expect(bounds.height).toBe(0);
        });
    });

    // ─── renderElement ───────────────────────────────────────────────

    describe('renderElement', () => {
        it('should create a DOM node for an icon element', () => {
            const el = registry.addElement('icon', {
                x: 10, y: 20, width: 32, height: 32,
                iconId: 'lucide-star', color: '#ff0000'
            });
            renderer.renderElement(el.id);
            const node = overlay.querySelector('[data-element-id="' + el.id + '"]');
            expect(node).not.toBeNull();
            expect(node.style.left).toBe('10px');
            expect(node.style.top).toBe('20px');
            expect(node.style.width).toBe('32px');
            expect(node.style.height).toBe('32px');
            expect(node.dataset.elementType).toBe('icon');
        });

        it('should create a DOM node for an image element', () => {
            const el = registry.addElement('image', {
                x: 50, y: 60, width: 200, height: 150,
                source: 'https://example.com/img.png',
                maintainAspectRatio: true
            });
            renderer.renderElement(el.id);
            const node = overlay.querySelector('[data-element-id="' + el.id + '"]');
            expect(node).not.toBeNull();
            expect(node.dataset.elementType).toBe('image');
            const img = node.querySelector('img');
            expect(img).not.toBeNull();
            expect(img.src).toBe('https://example.com/img.png');
            expect(img.style.objectFit).toBe('contain');
        });

        it('should create a DOM node for a text element', () => {
            const el = registry.addElement('text', {
                x: 30, y: 40, width: 200, height: 40,
                content: 'Hello World', fontSize: 18, fontWeight: 'bold', color: '#e2e8f0'
            });
            renderer.renderElement(el.id);
            const node = overlay.querySelector('[data-element-id="' + el.id + '"]');
            expect(node).not.toBeNull();
            expect(node.dataset.elementType).toBe('text');
            const textDiv = node.querySelector('.canvas-text-content');
            expect(textDiv).not.toBeNull();
            expect(textDiv.textContent).toBe('Hello World');
            expect(textDiv.style.fontSize).toBe('18px');
            expect(textDiv.style.fontWeight).toBe('bold');
        });

        it('should use placeholder text when content is empty', () => {
            const el = registry.addElement('text', {
                x: 0, y: 0, width: 200, height: 40, content: ''
            });
            renderer.renderElement(el.id);
            const node = overlay.querySelector('[data-element-id="' + el.id + '"]');
            const textDiv = node.querySelector('.canvas-text-content');
            expect(textDiv.textContent).toBe('Double-click to edit');
        });

        it('should update an existing node on re-render', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, width: 32, height: 32 });
            renderer.renderElement(el.id);
            // Update position
            registry.updateElement(el.id, { x: 100, y: 200 });
            renderer.renderElement(el.id);
            const node = overlay.querySelector('[data-element-id="' + el.id + '"]');
            expect(node.style.left).toBe('100px');
            expect(node.style.top).toBe('200px');
            // Should still be only one node
            const allNodes = overlay.querySelectorAll('[data-element-id="' + el.id + '"]');
            expect(allNodes.length).toBe(1);
        });

        it('should apply opacity and z-index styles', () => {
            const el = registry.addElement('icon', {
                x: 0, y: 0, width: 32, height: 32, opacity: 0.5
            });
            renderer.renderElement(el.id);
            const node = overlay.querySelector('[data-element-id="' + el.id + '"]');
            expect(node.style.opacity).toBe('0.5');
            expect(node.style.zIndex).toBe('1');
        });

        it('should do nothing for non-existent element ID', () => {
            renderer.renderElement('non-existent');
            expect(overlay.children.length).toBe(0);
        });

        it('should render image with objectFit fill when maintainAspectRatio is false', () => {
            const el = registry.addElement('image', {
                x: 0, y: 0, width: 100, height: 100,
                source: 'data:image/png;base64,abc',
                maintainAspectRatio: false
            });
            renderer.renderElement(el.id);
            const img = overlay.querySelector('img');
            expect(img.style.objectFit).toBe('fill');
        });
    });

    // ─── removeElementNode ───────────────────────────────────────────

    describe('removeElementNode', () => {
        it('should remove the DOM node for an element', () => {
            const el = registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            renderer.renderElement(el.id);
            expect(overlay.children.length).toBe(1);
            renderer.removeElementNode(el.id);
            expect(overlay.children.length).toBe(0);
        });

        it('should do nothing for non-existent element', () => {
            renderer.removeElementNode('non-existent');
            expect(overlay.children.length).toBe(0);
        });
    });

    // ─── renderAll ───────────────────────────────────────────────────

    describe('renderAll', () => {
        it('should render all elements from the registry', () => {
            registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            registry.addElement('image', { x: 50, y: 50, width: 100, height: 100, source: '' });
            registry.addElement('text', { x: 100, y: 100, width: 200, height: 40, content: 'Hi' });
            renderer.renderAll();
            const elements = overlay._findAllByClass('canvas-element');
            expect(elements.length).toBe(3);
        });

        it('should render elements in ascending z-index order', () => {
            const el1 = registry.addElement('icon', { x: 0, y: 0 }); // z=1
            const el2 = registry.addElement('image', { x: 0, y: 0, source: '' }); // z=2
            const el3 = registry.addElement('text', { x: 0, y: 0, content: '' }); // z=3

            // Move el3 to back
            registry.sendToBack(el3.id); // z=0

            renderer.renderAll();
            const nodes = overlay._findAllByClass('canvas-element');
            // DOM order should be: el3 (z=0), el1 (z=1), el2 (z=2)
            expect(nodes[0].dataset.elementId).toBe(el3.id);
            expect(nodes[1].dataset.elementId).toBe(el1.id);
            expect(nodes[2].dataset.elementId).toBe(el2.id);
        });

        it('should order same z-index elements by insertion time', () => {
            const el1 = registry.addElement('icon', { x: 0, y: 0 }); // z=1
            const el2 = registry.addElement('image', { x: 0, y: 0, source: '' }); // z=2
            const el3 = registry.addElement('text', { x: 0, y: 0, content: '' }); // z=3

            // Set all to same z-index
            registry.updateElement(el1.id, { zIndex: 5 });
            registry.updateElement(el2.id, { zIndex: 5 });
            registry.updateElement(el3.id, { zIndex: 5 });

            renderer.renderAll();
            const nodes = overlay._findAllByClass('canvas-element');
            // Same z-index: stable sort preserves insertion order (el1, el2, el3)
            expect(nodes[0].dataset.elementId).toBe(el1.id);
            expect(nodes[1].dataset.elementId).toBe(el2.id);
            expect(nodes[2].dataset.elementId).toBe(el3.id);
        });

        it('should remove nodes for elements no longer in registry', () => {
            const el1 = registry.addElement('icon', { x: 0, y: 0 });
            const el2 = registry.addElement('image', { x: 0, y: 0, source: '' });
            renderer.renderAll();
            expect(overlay.children.length).toBe(2);

            registry.removeElement(el1.id);
            renderer.renderAll();
            expect(overlay.children.length).toBe(1);
            expect(overlay._findByDataId(el1.id)).toBeNull();
        });

        it('should handle empty registry', () => {
            renderer.renderAll();
            expect(overlay.children.length).toBe(0);
        });
    });

    // ─── showHandles ─────────────────────────────────────────────────

    describe('showHandles', () => {
        it('should display selection handles around a single selected element', () => {
            const el = registry.addElement('icon', {
                x: 50, y: 60, width: 100, height: 80
            });
            renderer.showHandles([el.id]);
            const handlesContainer = overlay._findByClass('selection-handles');
            expect(handlesContainer).not.toBeNull();
            expect(handlesContainer.dataset.handlesFor).toBe(el.id);
        });

        it('should position handles container at element position and size', () => {
            const el = registry.addElement('icon', {
                x: 50, y: 60, width: 100, height: 80
            });
            renderer.showHandles([el.id]);
            const handlesContainer = overlay._findByClass('selection-handles');
            expect(handlesContainer.style.left).toBe('50px');
            expect(handlesContainer.style.top).toBe('60px');
            expect(handlesContainer.style.width).toBe('100px');
            expect(handlesContainer.style.height).toBe('80px');
        });

        it('should include a drag handle', () => {
            const el = registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            renderer.showHandles([el.id]);
            const handlesContainer = overlay._findByClass('selection-handles');
            const dragHandle = handlesContainer._findByClass('drag-handle');
            expect(dragHandle).not.toBeNull();
            expect(dragHandle.dataset.handleType).toBe('drag');
            expect(dragHandle.style.cursor).toBe('move');
        });

        it('should include 8 resize handles', () => {
            const el = registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            renderer.showHandles([el.id]);
            const handlesContainer = overlay._findByClass('selection-handles');
            const resizeHandles = handlesContainer._findAllByClass('resize-handle');
            expect(resizeHandles.length).toBe(8);
        });

        it('should set correct cursor styles on corner resize handles', () => {
            const el = registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            renderer.showHandles([el.id]);
            const handlesContainer = overlay._findByClass('selection-handles');
            const resizeHandles = handlesContainer._findAllByClass('resize-handle');

            const cursorMap = {};
            for (const h of resizeHandles) {
                cursorMap[h.dataset.handleDirection] = h.style.cursor;
            }

            expect(cursorMap['nw']).toBe('nw-resize');
            expect(cursorMap['ne']).toBe('ne-resize');
            expect(cursorMap['sw']).toBe('sw-resize');
            expect(cursorMap['se']).toBe('se-resize');
            expect(cursorMap['n']).toBe('ns-resize');
            expect(cursorMap['s']).toBe('ns-resize');
            expect(cursorMap['e']).toBe('ew-resize');
            expect(cursorMap['w']).toBe('ew-resize');
        });

        it('should include a selection border', () => {
            const el = registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            renderer.showHandles([el.id]);
            const handlesContainer = overlay._findByClass('selection-handles');
            const border = handlesContainer._findByClass('selection-border');
            expect(border).not.toBeNull();
            expect(border.style.border).toBe('2px solid #4a90d9');
        });

        it('should remove previous handles before showing new ones', () => {
            const el1 = registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            const el2 = registry.addElement('icon', { x: 100, y: 100, width: 32, height: 32 });
            renderer.showHandles([el1.id]);
            renderer.showHandles([el2.id]);
            const allHandles = overlay._findAllByClass('selection-handles');
            expect(allHandles.length).toBe(1);
            expect(allHandles[0].dataset.handlesFor).toBe(el2.id);
        });

        it('should do nothing for empty ids array', () => {
            renderer.showHandles([]);
            const handlesContainer = overlay._findByClass('selection-handles');
            expect(handlesContainer).toBeNull();
        });

        it('should do nothing for null/undefined ids', () => {
            renderer.showHandles(null);
            expect(overlay._findByClass('selection-handles')).toBeNull();
            renderer.showHandles(undefined);
            expect(overlay._findByClass('selection-handles')).toBeNull();
        });

        it('should do nothing for non-existent element ID', () => {
            renderer.showHandles(['non-existent-id']);
            expect(overlay._findByClass('selection-handles')).toBeNull();
        });

        it('should delegate to showMultiSelectBoundingBox for multiple IDs', () => {
            const el1 = registry.addElement('icon', { x: 10, y: 20, width: 30, height: 40 });
            const el2 = registry.addElement('icon', { x: 100, y: 120, width: 50, height: 60 });
            renderer.showHandles([el1.id, el2.id]);
            // Should show bounding box, not individual handles
            expect(overlay._findByClass('selection-handles')).toBeNull();
            expect(overlay._findByClass('multi-select-bbox')).not.toBeNull();
        });
    });

    // ─── hideHandles ─────────────────────────────────────────────────

    describe('hideHandles', () => {
        it('should remove all selection handles', () => {
            const el = registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            renderer.showHandles([el.id]);
            expect(overlay._findByClass('selection-handles')).not.toBeNull();
            renderer.hideHandles();
            expect(overlay._findByClass('selection-handles')).toBeNull();
        });

        it('should remove multi-select bounding boxes', () => {
            const el1 = registry.addElement('icon', { x: 10, y: 20, width: 30, height: 40 });
            const el2 = registry.addElement('icon', { x: 100, y: 120, width: 50, height: 60 });
            renderer.showMultiSelectBoundingBox([el1.id, el2.id]);
            expect(overlay._findByClass('multi-select-bbox')).not.toBeNull();
            renderer.hideHandles();
            expect(overlay._findByClass('multi-select-bbox')).toBeNull();
        });

        it('should be safe to call when no handles are displayed', () => {
            expect(() => renderer.hideHandles()).not.toThrow();
        });
    });

    // ─── showMultiSelectBoundingBox ──────────────────────────────────

    describe('showMultiSelectBoundingBox', () => {
        it('should display a combined bounding box around multiple elements', () => {
            const el1 = registry.addElement('icon', { x: 10, y: 20, width: 30, height: 40 });
            const el2 = registry.addElement('icon', { x: 100, y: 120, width: 50, height: 60 });
            renderer.showMultiSelectBoundingBox([el1.id, el2.id]);
            const bbox = overlay._findByClass('multi-select-bbox');
            expect(bbox).not.toBeNull();
        });

        it('should compute correct bounding box position and size', () => {
            const el1 = registry.addElement('icon', { x: 10, y: 20, width: 30, height: 40 });
            const el2 = registry.addElement('icon', { x: 100, y: 120, width: 50, height: 60 });
            renderer.showMultiSelectBoundingBox([el1.id, el2.id]);
            const bbox = overlay._findByClass('multi-select-bbox');
            // bbox should span from (10,20) to (150,180)
            expect(bbox.style.left).toBe('10px');
            expect(bbox.style.top).toBe('20px');
            expect(bbox.style.width).toBe('140px');  // 150 - 10
            expect(bbox.style.height).toBe('160px'); // 180 - 20
        });

        it('should use dashed border style', () => {
            const el1 = registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            const el2 = registry.addElement('icon', { x: 50, y: 50, width: 32, height: 32 });
            renderer.showMultiSelectBoundingBox([el1.id, el2.id]);
            const bbox = overlay._findByClass('multi-select-bbox');
            expect(bbox.style.border).toBe('2px dashed #4a90d9');
        });

        it('should do nothing for empty ids array', () => {
            renderer.showMultiSelectBoundingBox([]);
            expect(overlay._findByClass('multi-select-bbox')).toBeNull();
        });

        it('should do nothing for null/undefined ids', () => {
            renderer.showMultiSelectBoundingBox(null);
            expect(overlay._findByClass('multi-select-bbox')).toBeNull();
        });

        it('should skip non-existent element IDs', () => {
            const el1 = registry.addElement('icon', { x: 10, y: 20, width: 30, height: 40 });
            renderer.showMultiSelectBoundingBox([el1.id, 'non-existent']);
            const bbox = overlay._findByClass('multi-select-bbox');
            expect(bbox).not.toBeNull();
            // Should only use el1's bounds
            expect(bbox.style.left).toBe('10px');
            expect(bbox.style.top).toBe('20px');
            expect(bbox.style.width).toBe('30px');
            expect(bbox.style.height).toBe('40px');
        });

        it('should do nothing when all IDs are non-existent', () => {
            renderer.showMultiSelectBoundingBox(['fake-1', 'fake-2']);
            expect(overlay._findByClass('multi-select-bbox')).toBeNull();
        });
    });
});
