/**
 * Unit tests for ElementRegistry
 * Run with: npx vitest run src/prep_pilot/static/js/element-registry.test.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock crypto.randomUUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
    randomUUID: () => `test-uuid-${++uuidCounter}`
});

const { ElementRegistry } = await import('./element-registry.js');

describe('ElementRegistry', () => {
    let registry;

    beforeEach(() => {
        registry = new ElementRegistry();
        uuidCounter = 0;
    });

    // ─── addElement ──────────────────────────────────────────────────

    describe('addElement', () => {
        it('should create an element with a unique ID', () => {
            const el = registry.addElement('icon', { x: 10, y: 20 });
            expect(el.id).toBe('test-uuid-1');
            expect(el.type).toBe('icon');
            expect(el.x).toBe(10);
            expect(el.y).toBe(20);
        });

        it('should auto-assign z-index as max + 1', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            const el3 = registry.addElement('text', {});
            expect(el1.zIndex).toBe(1);
            expect(el2.zIndex).toBe(2);
            expect(el3.zIndex).toBe(3);
        });

        it('should apply default values for missing properties', () => {
            const el = registry.addElement('icon', {});
            expect(el.x).toBe(0);
            expect(el.y).toBe(0);
            expect(el.width).toBe(32);
            expect(el.height).toBe(32);
            expect(el.opacity).toBe(1.0);
        });

        it('should allow overriding default values', () => {
            const el = registry.addElement('image', { x: 100, y: 200, width: 150, height: 100, opacity: 0.5 });
            expect(el.x).toBe(100);
            expect(el.y).toBe(200);
            expect(el.width).toBe(150);
            expect(el.height).toBe(100);
            expect(el.opacity).toBe(0.5);
        });
    });

    // ─── removeElement ───────────────────────────────────────────────

    describe('removeElement', () => {
        it('should remove an existing element', () => {
            const el = registry.addElement('icon', {});
            registry.removeElement(el.id);
            expect(registry.getElement(el.id)).toBeNull();
            expect(registry.getAllElements()).toHaveLength(0);
        });

        it('should do nothing for non-existent ID', () => {
            registry.addElement('icon', {});
            registry.removeElement('non-existent');
            expect(registry.getAllElements()).toHaveLength(1);
        });

        it('should remove element from selection when deleted', () => {
            const el = registry.addElement('icon', {});
            registry.selectElement(el.id);
            registry.removeElement(el.id);
            expect(registry.getSelection()).toHaveLength(0);
        });
    });

    // ─── removeElements ──────────────────────────────────────────────

    describe('removeElements', () => {
        it('should remove multiple elements at once', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            const el3 = registry.addElement('text', {});
            registry.removeElements([el1.id, el3.id]);
            expect(registry.getAllElements()).toHaveLength(1);
            expect(registry.getElement(el2.id)).not.toBeNull();
        });

        it('should handle empty array', () => {
            registry.addElement('icon', {});
            registry.removeElements([]);
            expect(registry.getAllElements()).toHaveLength(1);
        });

        it('should handle non-existent IDs gracefully', () => {
            const el = registry.addElement('icon', {});
            registry.removeElements(['non-existent', el.id]);
            expect(registry.getAllElements()).toHaveLength(0);
        });
    });

    // ─── updateElement ───────────────────────────────────────────────

    describe('updateElement', () => {
        it('should partially update element properties', () => {
            const el = registry.addElement('icon', { x: 10, y: 20 });
            registry.updateElement(el.id, { x: 50, opacity: 0.7 });
            const updated = registry.getElement(el.id);
            expect(updated.x).toBe(50);
            expect(updated.y).toBe(20); // unchanged
            expect(updated.opacity).toBe(0.7);
        });

        it('should not allow overwriting id', () => {
            const el = registry.addElement('icon', {});
            registry.updateElement(el.id, { id: 'hacked' });
            expect(registry.getElement(el.id)).not.toBeNull();
            expect(registry.getElement('hacked')).toBeNull();
        });

        it('should not allow overwriting type', () => {
            const el = registry.addElement('icon', {});
            registry.updateElement(el.id, { type: 'image' });
            expect(registry.getElement(el.id).type).toBe('icon');
        });

        it('should do nothing for non-existent ID', () => {
            registry.updateElement('non-existent', { x: 100 });
            expect(registry.getAllElements()).toHaveLength(0);
        });
    });

    // ─── getElement / getAllElements / getSelectedElements ────────────

    describe('getElement', () => {
        it('should return null for non-existent ID', () => {
            expect(registry.getElement('non-existent')).toBeNull();
        });

        it('should return the element for valid ID', () => {
            const el = registry.addElement('icon', { x: 42 });
            expect(registry.getElement(el.id).x).toBe(42);
        });
    });

    describe('getAllElements', () => {
        it('should return empty array when registry is empty', () => {
            expect(registry.getAllElements()).toEqual([]);
        });

        it('should return all elements', () => {
            registry.addElement('icon', {});
            registry.addElement('image', {});
            expect(registry.getAllElements()).toHaveLength(2);
        });
    });

    describe('getSelectedElements', () => {
        it('should return empty array when nothing is selected', () => {
            registry.addElement('icon', {});
            expect(registry.getSelectedElements()).toEqual([]);
        });

        it('should return selected elements', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            registry.selectElement(el1.id);
            const selected = registry.getSelectedElements();
            expect(selected).toHaveLength(1);
            expect(selected[0].id).toBe(el1.id);
        });
    });

    // ─── Selection State ─────────────────────────────────────────────

    describe('selectElement', () => {
        it('should select a single element and deselect others', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            registry.selectElement(el1.id);
            registry.selectElement(el2.id);
            expect(registry.getSelection()).toEqual([el2.id]);
        });

        it('should not select non-existent element', () => {
            registry.selectElement('non-existent');
            expect(registry.getSelection()).toHaveLength(0);
        });
    });

    describe('addToSelection', () => {
        it('should add to existing selection', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            registry.selectElement(el1.id);
            registry.addToSelection(el2.id);
            expect(registry.getSelection()).toContain(el1.id);
            expect(registry.getSelection()).toContain(el2.id);
        });
    });

    describe('removeFromSelection', () => {
        it('should remove from selection', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            registry.selectElement(el1.id);
            registry.addToSelection(el2.id);
            registry.removeFromSelection(el1.id);
            expect(registry.getSelection()).toEqual([el2.id]);
        });

        it('should do nothing if element not in selection', () => {
            const el = registry.addElement('icon', {});
            registry.removeFromSelection(el.id);
            expect(registry.getSelection()).toHaveLength(0);
        });
    });

    describe('clearSelection', () => {
        it('should clear all selection', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            registry.selectElement(el1.id);
            registry.addToSelection(el2.id);
            registry.clearSelection();
            expect(registry.getSelection()).toHaveLength(0);
        });
    });

    // ─── Z-Index Operations ──────────────────────────────────────────

    describe('z-index operations', () => {
        it('getMaxZIndex should return 0 for empty registry', () => {
            expect(registry.getMaxZIndex()).toBe(0);
        });

        it('getMinZIndex should return 0 for empty registry', () => {
            expect(registry.getMinZIndex()).toBe(0);
        });

        it('bringToFront should set z-index to max + 1', () => {
            const el1 = registry.addElement('icon', {}); // z=1
            const el2 = registry.addElement('image', {}); // z=2
            registry.bringToFront(el1.id);
            expect(registry.getElement(el1.id).zIndex).toBe(3);
        });

        it('bringToFront should not change if already at front', () => {
            const el1 = registry.addElement('icon', {}); // z=1
            const el2 = registry.addElement('image', {}); // z=2
            registry.bringToFront(el2.id);
            expect(registry.getElement(el2.id).zIndex).toBe(2); // unchanged
        });

        it('sendToBack should set z-index to min - 1', () => {
            const el1 = registry.addElement('icon', {}); // z=1
            const el2 = registry.addElement('image', {}); // z=2
            registry.sendToBack(el2.id);
            expect(registry.getElement(el2.id).zIndex).toBe(0);
        });

        it('sendToBack should not change if already at back', () => {
            const el1 = registry.addElement('icon', {}); // z=1
            const el2 = registry.addElement('image', {}); // z=2
            registry.sendToBack(el1.id);
            expect(registry.getElement(el1.id).zIndex).toBe(1); // unchanged
        });

        it('moveForward should swap with next higher element', () => {
            const el1 = registry.addElement('icon', {}); // z=1
            const el2 = registry.addElement('image', {}); // z=2
            const el3 = registry.addElement('text', {}); // z=3
            registry.moveForward(el1.id);
            expect(registry.getElement(el1.id).zIndex).toBe(2);
            expect(registry.getElement(el2.id).zIndex).toBe(1);
        });

        it('moveForward should not change if already highest', () => {
            const el1 = registry.addElement('icon', {}); // z=1
            const el2 = registry.addElement('image', {}); // z=2
            registry.moveForward(el2.id);
            expect(registry.getElement(el2.id).zIndex).toBe(2);
        });

        it('moveBackward should swap with next lower element', () => {
            const el1 = registry.addElement('icon', {}); // z=1
            const el2 = registry.addElement('image', {}); // z=2
            const el3 = registry.addElement('text', {}); // z=3
            registry.moveBackward(el3.id);
            expect(registry.getElement(el3.id).zIndex).toBe(2);
            expect(registry.getElement(el2.id).zIndex).toBe(3);
        });

        it('moveBackward should not change if already lowest', () => {
            const el1 = registry.addElement('icon', {}); // z=1
            const el2 = registry.addElement('image', {}); // z=2
            registry.moveBackward(el1.id);
            expect(registry.getElement(el1.id).zIndex).toBe(1);
        });
    });

    // ─── Serialization ───────────────────────────────────────────────

    describe('serialize', () => {
        it('should return empty array for empty registry', () => {
            expect(registry.serialize()).toEqual([]);
        });

        it('should return all elements as plain objects', () => {
            registry.addElement('icon', { x: 10, iconId: 'lucide-star', color: '#000000' });
            registry.addElement('image', { x: 20, source: 'data:image/png;base64,abc' });
            const serialized = registry.serialize();
            expect(serialized).toHaveLength(2);
            expect(serialized[0].type).toBe('icon');
            expect(serialized[0].iconId).toBe('lucide-star');
            expect(serialized[1].type).toBe('image');
            expect(serialized[1].source).toBe('data:image/png;base64,abc');
        });

        it('should preserve insertion order', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            const el3 = registry.addElement('text', {});
            const serialized = registry.serialize();
            expect(serialized[0].id).toBe(el1.id);
            expect(serialized[1].id).toBe(el2.id);
            expect(serialized[2].id).toBe(el3.id);
        });
    });

    describe('deserialize', () => {
        it('should restore elements from array', () => {
            const data = [
                { id: 'a', type: 'icon', x: 10, y: 20, width: 32, height: 32, opacity: 1, zIndex: 1, iconId: 'star', color: '#000' },
                { id: 'b', type: 'image', x: 50, y: 60, width: 100, height: 80, opacity: 0.8, zIndex: 2, source: 'http://example.com/img.png' }
            ];
            registry.deserialize(data);
            expect(registry.getAllElements()).toHaveLength(2);
            expect(registry.getElement('a').iconId).toBe('star');
            expect(registry.getElement('b').source).toBe('http://example.com/img.png');
        });

        it('should restore from JSON string', () => {
            const data = [{ id: 'x', type: 'text', x: 0, y: 0, width: 200, height: 40, opacity: 1, zIndex: 1, content: 'Hello' }];
            registry.deserialize(JSON.stringify(data));
            expect(registry.getElement('x').content).toBe('Hello');
        });

        it('should replace existing state', () => {
            registry.addElement('icon', {});
            registry.addElement('icon', {});
            registry.deserialize([{ id: 'new', type: 'text', x: 0, y: 0, width: 100, height: 30, opacity: 1, zIndex: 1 }]);
            expect(registry.getAllElements()).toHaveLength(1);
            expect(registry.getElement('new')).not.toBeNull();
        });

        it('should clear selection on deserialize', () => {
            const el = registry.addElement('icon', {});
            registry.selectElement(el.id);
            registry.deserialize([]);
            expect(registry.getSelection()).toHaveLength(0);
        });

        it('should skip invalid entries (missing id or type)', () => {
            registry.deserialize([
                { id: 'valid', type: 'icon', x: 0, y: 0, width: 32, height: 32, opacity: 1, zIndex: 1 },
                { type: 'icon' }, // missing id
                { id: 'notype' }, // missing type
                null
            ]);
            expect(registry.getAllElements()).toHaveLength(1);
        });
    });

    // ─── Snapshot (Undo/Redo Support) ────────────────────────────────

    describe('getSnapshot / restoreSnapshot', () => {
        it('should create a deep copy of state', () => {
            const el = registry.addElement('icon', { x: 10 });
            const snapshot = registry.getSnapshot();
            registry.updateElement(el.id, { x: 999 });
            // Snapshot should not be affected
            expect(snapshot.elements[0].x).toBe(10);
        });

        it('should restore state from snapshot', () => {
            const el = registry.addElement('icon', { x: 10 });
            const snapshot = registry.getSnapshot();
            registry.updateElement(el.id, { x: 999 });
            registry.restoreSnapshot(snapshot);
            expect(registry.getElement(el.id).x).toBe(10);
        });

        it('should restore selection state', () => {
            const el1 = registry.addElement('icon', {});
            const el2 = registry.addElement('image', {});
            registry.selectElement(el1.id);
            const snapshot = registry.getSnapshot();
            registry.clearSelection();
            registry.restoreSnapshot(snapshot);
            expect(registry.getSelection()).toContain(el1.id);
        });

        it('should handle empty snapshot gracefully', () => {
            registry.addElement('icon', {});
            registry.restoreSnapshot({ elements: [], selection: [], insertionOrder: [] });
            expect(registry.getAllElements()).toHaveLength(0);
        });

        it('should handle null/invalid snapshot gracefully', () => {
            registry.addElement('icon', {});
            registry.restoreSnapshot(null);
            // Should not crash, state unchanged
            expect(registry.getAllElements()).toHaveLength(1);
        });
    });

    // ─── onChange ────────────────────────────────────────────────────

    describe('onChange', () => {
        it('should notify listeners on addElement', () => {
            const listener = vi.fn();
            registry.onChange(listener);
            registry.addElement('icon', {});
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(expect.any(Array));
        });

        it('should notify listeners on removeElement', () => {
            const el = registry.addElement('icon', {});
            const listener = vi.fn();
            registry.onChange(listener);
            registry.removeElement(el.id);
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should notify listeners on updateElement', () => {
            const el = registry.addElement('icon', {});
            const listener = vi.fn();
            registry.onChange(listener);
            registry.updateElement(el.id, { x: 50 });
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should notify listeners on selection changes', () => {
            const el = registry.addElement('icon', {});
            const listener = vi.fn();
            registry.onChange(listener);
            registry.selectElement(el.id);
            expect(listener).toHaveBeenCalled();
        });

        it('should not throw if listener throws', () => {
            registry.onChange(() => { throw new Error('bad listener'); });
            expect(() => registry.addElement('icon', {})).not.toThrow();
        });
    });
});
