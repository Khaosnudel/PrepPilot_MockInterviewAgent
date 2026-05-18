/**
 * Unit tests for UndoRedoIntegration
 * Run with: npx vitest run src/prep_pilot/static/js/undo-redo-integration.test.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock crypto.randomUUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
    randomUUID: () => `test-uuid-${++uuidCounter}`
});

const { UndoRedoIntegration } = await import('./undo-redo-integration.js');
const { UndoRedoManager } = await import('./undo-redo-manager.js');
const { ElementRegistry } = await import('./element-registry.js');

// Mock CanvasRenderer with minimal interface
function createMockCanvas() {
    return {
        renderAll: vi.fn(),
        renderElement: vi.fn(),
        getCanvasBounds: () => ({ width: 800, height: 600 })
    };
}

describe('UndoRedoIntegration', () => {
    let registry;
    let undoManager;
    let canvas;
    let integration;

    beforeEach(() => {
        uuidCounter = 0;
        registry = new ElementRegistry();
        undoManager = new UndoRedoManager(50);
        canvas = createMockCanvas();
        integration = new UndoRedoIntegration(registry, undoManager, canvas);
    });

    afterEach(() => {
        integration.destroy();
    });

    // ─── pushUndoState ───────────────────────────────────────────────

    describe('pushUndoState', () => {
        it('should push current registry state onto undo stack', () => {
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            integration.pushUndoState();
            expect(undoManager.canUndo()).toBe(true);
            expect(undoManager.undoSize).toBe(1);
        });

        it('should not push state during a continuous operation', () => {
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            integration.beginContinuousOperation();
            integration.pushUndoState();
            expect(undoManager.undoSize).toBe(0);
            integration.endContinuousOperation();
        });

        it('should push empty state when registry is empty', () => {
            integration.pushUndoState();
            expect(undoManager.canUndo()).toBe(true);
        });
    });

    // ─── undo ────────────────────────────────────────────────────────

    describe('undo', () => {
        it('should restore previous state', () => {
            // State S0: one element at x:10
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star', width: 32, height: 32 });
            integration.pushUndoState();

            // Modify: move element
            const elements = registry.getAllElements();
            registry.updateElement(elements[0].id, { x: 100 });

            // Undo should restore x:10
            const result = integration.undo();
            expect(result).toBe(true);

            const restored = registry.getAllElements();
            expect(restored.length).toBe(1);
            expect(restored[0].x).toBe(10);
        });

        it('should return false when undo stack is empty', () => {
            const result = integration.undo();
            expect(result).toBe(false);
        });

        it('should re-render canvas after undo', () => {
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            integration.pushUndoState();
            registry.addElement('text', { content: 'hello' });

            integration.undo();
            expect(canvas.renderAll).toHaveBeenCalled();
        });

        it('should no-op when stack is empty (Requirement 9.6)', () => {
            const elementsBefore = registry.getAllElements();
            const result = integration.undo();
            expect(result).toBe(false);
            expect(registry.getAllElements()).toEqual(elementsBefore);
        });
    });

    // ─── redo ────────────────────────────────────────────────────────

    describe('redo', () => {
        it('should restore next state after undo', () => {
            // State S0: empty
            integration.pushUndoState();

            // State S1: one element
            const el = registry.addElement('icon', { x: 50, y: 60, iconId: 'heart', width: 32, height: 32 });

            // Undo back to S0
            integration.undo();
            expect(registry.getAllElements().length).toBe(0);

            // Redo back to S1
            const result = integration.redo();
            expect(result).toBe(true);
            expect(registry.getAllElements().length).toBe(1);
            expect(registry.getAllElements()[0].x).toBe(50);
        });

        it('should return false when redo stack is empty', () => {
            const result = integration.redo();
            expect(result).toBe(false);
        });

        it('should re-render canvas after redo', () => {
            integration.pushUndoState();
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            integration.undo();
            canvas.renderAll.mockClear();

            integration.redo();
            expect(canvas.renderAll).toHaveBeenCalled();
        });

        it('should no-op when stack is empty (Requirement 9.7)', () => {
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            const elementsBefore = registry.getAllElements().map(e => ({ ...e }));
            const result = integration.redo();
            expect(result).toBe(false);
        });
    });

    // ─── deleteSelected ──────────────────────────────────────────────

    describe('deleteSelected', () => {
        it('should delete selected elements and push undo state', () => {
            const el1 = registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            const el2 = registry.addElement('text', { x: 50, y: 60, content: 'hello' });
            registry.setSelection([el1.id]);

            const result = integration.deleteSelected();
            expect(result).toBe(true);
            expect(registry.getAllElements().length).toBe(1);
            expect(registry.getAllElements()[0].id).toBe(el2.id);
            expect(undoManager.canUndo()).toBe(true);
        });

        it('should return false when nothing is selected', () => {
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            const result = integration.deleteSelected();
            expect(result).toBe(false);
        });

        it('should be undoable', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star', width: 32, height: 32 });
            registry.setSelection([el.id]);

            integration.deleteSelected();
            expect(registry.getAllElements().length).toBe(0);

            integration.undo();
            expect(registry.getAllElements().length).toBe(1);
        });

        it('should re-render canvas after delete', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            registry.setSelection([el.id]);
            canvas.renderAll.mockClear();

            integration.deleteSelected();
            expect(canvas.renderAll).toHaveBeenCalled();
        });
    });

    // ─── Continuous Operations ───────────────────────────────────────

    describe('continuous operations (drag/resize)', () => {
        it('should record state at begin and push single entry at end', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star', width: 32, height: 32 });

            // Begin drag
            integration.beginContinuousOperation();
            expect(integration.isContinuousOperationActive()).toBe(true);

            // Simulate multiple intermediate moves (no undo pushes)
            registry.updateElement(el.id, { x: 30 });
            registry.updateElement(el.id, { x: 50 });
            registry.updateElement(el.id, { x: 70 });

            // End drag - should push single undo entry
            integration.endContinuousOperation();
            expect(integration.isContinuousOperationActive()).toBe(false);
            expect(undoManager.undoSize).toBe(1);

            // Undo should restore to state before drag (x:10)
            integration.undo();
            const restored = registry.getElement(el.id);
            expect(restored.x).toBe(10);
        });

        it('should suppress discrete pushUndoState calls during continuous op', () => {
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });

            integration.beginContinuousOperation();
            integration.pushUndoState(); // should be suppressed
            integration.pushUndoState(); // should be suppressed
            integration.endContinuousOperation();

            // Only the continuous op snapshot should be on the stack
            expect(undoManager.undoSize).toBe(1);
        });

        it('should handle begin without end gracefully', () => {
            registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            integration.beginContinuousOperation();
            expect(integration.isContinuousOperationActive()).toBe(true);
            // Destroy should clean up
            integration.destroy();
            expect(integration.isContinuousOperationActive()).toBe(false);
        });

        it('should handle end without begin gracefully', () => {
            // Should not throw or push anything
            integration.endContinuousOperation();
            expect(undoManager.undoSize).toBe(0);
        });
    });

    // ─── Keyboard Shortcuts ──────────────────────────────────────────

    describe('keyboard shortcuts', () => {
        function dispatchKeydown(key, options = {}) {
            const event = new KeyboardEvent('keydown', {
                key,
                ctrlKey: options.ctrlKey || false,
                shiftKey: options.shiftKey || false,
                metaKey: options.metaKey || false,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);
            return event;
        }

        it('Ctrl+Z should trigger undo', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star', width: 32, height: 32 });
            integration.pushUndoState();
            registry.updateElement(el.id, { x: 100 });

            dispatchKeydown('z', { ctrlKey: true });

            const restored = registry.getElement(el.id);
            expect(restored.x).toBe(10);
        });

        it('Ctrl+Y should trigger redo', () => {
            integration.pushUndoState();
            const el = registry.addElement('icon', { x: 50, y: 60, iconId: 'heart', width: 32, height: 32 });

            integration.undo(); // undo the add
            expect(registry.getAllElements().length).toBe(0);

            dispatchKeydown('y', { ctrlKey: true });
            expect(registry.getAllElements().length).toBe(1);
        });

        it('Ctrl+Shift+Z should trigger redo', () => {
            integration.pushUndoState();
            const el = registry.addElement('icon', { x: 50, y: 60, iconId: 'heart', width: 32, height: 32 });

            integration.undo();
            expect(registry.getAllElements().length).toBe(0);

            dispatchKeydown('z', { ctrlKey: true, shiftKey: true });
            expect(registry.getAllElements().length).toBe(1);
        });

        it('Delete key should remove selected elements', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            registry.setSelection([el.id]);

            dispatchKeydown('Delete');

            expect(registry.getAllElements().length).toBe(0);
            expect(undoManager.canUndo()).toBe(true);
        });

        it('Ctrl+Z should no-op when undo stack is empty', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });
            const xBefore = registry.getElement(el.id).x;

            dispatchKeydown('z', { ctrlKey: true });

            expect(registry.getElement(el.id).x).toBe(xBefore);
        });

        it('Ctrl+Y should no-op when redo stack is empty', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star' });

            dispatchKeydown('y', { ctrlKey: true });

            // Nothing should change
            expect(registry.getAllElements().length).toBe(1);
        });

        it('should not intercept shortcuts when target is an input element', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star', width: 32, height: 32 });
            integration.pushUndoState();
            registry.updateElement(el.id, { x: 100 });

            // Create an input element and dispatch event from it
            const input = document.createElement('input');
            document.body.appendChild(input);

            const event = new KeyboardEvent('keydown', {
                key: 'z',
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            });
            input.dispatchEvent(event);

            // Should NOT have undone (x should still be 100)
            expect(registry.getElement(el.id).x).toBe(100);

            document.body.removeChild(input);
        });
    });

    // ─── canUndo / canRedo ───────────────────────────────────────────

    describe('canUndo / canRedo', () => {
        it('canUndo should delegate to UndoRedoManager', () => {
            expect(integration.canUndo()).toBe(false);
            integration.pushUndoState();
            expect(integration.canUndo()).toBe(true);
        });

        it('canRedo should delegate to UndoRedoManager', () => {
            expect(integration.canRedo()).toBe(false);
            integration.pushUndoState();
            integration.undo();
            expect(integration.canRedo()).toBe(true);
        });
    });

    // ─── destroy ─────────────────────────────────────────────────────

    describe('destroy', () => {
        it('should remove keyboard listener after destroy', () => {
            const el = registry.addElement('icon', { x: 10, y: 20, iconId: 'star', width: 32, height: 32 });
            integration.pushUndoState();
            registry.updateElement(el.id, { x: 100 });

            integration.destroy();

            // Ctrl+Z should no longer work
            const event = new KeyboardEvent('keydown', {
                key: 'z',
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);

            expect(registry.getElement(el.id).x).toBe(100);
        });

        it('should reset continuous operation state', () => {
            integration.beginContinuousOperation();
            integration.destroy();
            expect(integration.isContinuousOperationActive()).toBe(false);
        });
    });
});
