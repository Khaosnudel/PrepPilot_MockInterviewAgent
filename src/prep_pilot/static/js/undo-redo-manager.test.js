/**
 * Unit tests for UndoRedoManager
 * Run with: npx vitest run src/prep_pilot/static/js/undo-redo-manager.test.js
 */
import { describe, it, expect, beforeEach } from 'vitest';

const { UndoRedoManager } = await import('./undo-redo-manager.js');

describe('UndoRedoManager', () => {
    let manager;

    beforeEach(() => {
        manager = new UndoRedoManager(50);
    });

    // ─── Constructor ─────────────────────────────────────────────────

    describe('constructor', () => {
        it('should initialize with empty stacks', () => {
            expect(manager.canUndo()).toBe(false);
            expect(manager.canRedo()).toBe(false);
            expect(manager.undoSize).toBe(0);
            expect(manager.redoSize).toBe(0);
        });

        it('should accept custom max history', () => {
            const small = new UndoRedoManager(5);
            for (let i = 0; i < 10; i++) {
                small.pushState([{ id: `el-${i}` }]);
            }
            expect(small.undoSize).toBe(5);
        });

        it('should default to 50 max history', () => {
            const defaultManager = new UndoRedoManager();
            for (let i = 0; i < 60; i++) {
                defaultManager.pushState([{ id: `el-${i}` }]);
            }
            expect(defaultManager.undoSize).toBe(50);
        });
    });

    // ─── pushState ───────────────────────────────────────────────────

    describe('pushState', () => {
        it('should add state to undo stack', () => {
            manager.pushState([{ id: 'a', x: 10 }]);
            expect(manager.canUndo()).toBe(true);
            expect(manager.undoSize).toBe(1);
        });

        it('should deep-clone the state (no reference sharing)', () => {
            const state = [{ id: 'a', x: 10 }];
            manager.pushState(state);
            state[0].x = 999;
            const restored = manager.undo([]);
            expect(restored[0].x).toBe(10);
        });

        it('should clear the redo stack', () => {
            manager.pushState([{ id: 'a' }]);
            manager.pushState([{ id: 'b' }]);
            // Undo to create redo entry
            manager.undo([{ id: 'c' }]);
            expect(manager.canRedo()).toBe(true);
            // Push new state should clear redo
            manager.pushState([{ id: 'd' }]);
            expect(manager.canRedo()).toBe(false);
            expect(manager.redoSize).toBe(0);
        });

        it('should handle empty state array', () => {
            manager.pushState([]);
            expect(manager.undoSize).toBe(1);
            const restored = manager.undo([{ id: 'current' }]);
            expect(restored).toEqual([]);
        });
    });

    // ─── FIFO eviction ───────────────────────────────────────────────

    describe('FIFO eviction', () => {
        it('should evict oldest entries when exceeding max capacity', () => {
            const small = new UndoRedoManager(3);
            small.pushState([{ id: 'state-1' }]);
            small.pushState([{ id: 'state-2' }]);
            small.pushState([{ id: 'state-3' }]);
            expect(small.undoSize).toBe(3);

            // Push one more, oldest (state-1) should be evicted
            small.pushState([{ id: 'state-4' }]);
            expect(small.undoSize).toBe(3);

            // Undo should get state-4, state-3, state-2 (not state-1)
            const s4 = small.undo([]);
            expect(s4[0].id).toBe('state-4');
            const s3 = small.undo([]);
            expect(s3[0].id).toBe('state-3');
            const s2 = small.undo([]);
            expect(s2[0].id).toBe('state-2');
            // No more to undo
            expect(small.canUndo()).toBe(false);
        });

        it('should never exceed max capacity', () => {
            const small = new UndoRedoManager(5);
            for (let i = 0; i < 100; i++) {
                small.pushState([{ id: `el-${i}` }]);
            }
            expect(small.undoSize).toBe(5);
        });

        it('should evict from the front (oldest first)', () => {
            const small = new UndoRedoManager(2);
            small.pushState([{ id: 'first' }]);
            small.pushState([{ id: 'second' }]);
            small.pushState([{ id: 'third' }]);
            // Only 'second' and 'third' should remain
            const top = small.undo([]);
            expect(top[0].id).toBe('third');
            const next = small.undo([]);
            expect(next[0].id).toBe('second');
            expect(small.canUndo()).toBe(false);
        });
    });

    // ─── undo ────────────────────────────────────────────────────────

    describe('undo', () => {
        it('should return null when undo stack is empty', () => {
            const result = manager.undo([{ id: 'current' }]);
            expect(result).toBeNull();
        });

        it('should return the previous state', () => {
            manager.pushState([{ id: 'a', x: 10 }]);
            manager.pushState([{ id: 'a', x: 20 }]);
            const result = manager.undo([{ id: 'a', x: 30 }]);
            expect(result[0].x).toBe(20);
        });

        it('should push current state onto redo stack', () => {
            manager.pushState([{ id: 'a', x: 10 }]);
            manager.undo([{ id: 'a', x: 20 }]);
            expect(manager.canRedo()).toBe(true);
            expect(manager.redoSize).toBe(1);
        });

        it('should deep-clone current state when pushing to redo', () => {
            manager.pushState([{ id: 'a', x: 10 }]);
            const current = [{ id: 'a', x: 20 }];
            manager.undo(current);
            current[0].x = 999;
            const redone = manager.redo([]);
            expect(redone[0].x).toBe(20);
        });

        it('should support multiple sequential undos', () => {
            manager.pushState([{ id: 'a', x: 1 }]);
            manager.pushState([{ id: 'a', x: 2 }]);
            manager.pushState([{ id: 'a', x: 3 }]);

            const r1 = manager.undo([{ id: 'a', x: 4 }]);
            expect(r1[0].x).toBe(3);
            const r2 = manager.undo([{ id: 'a', x: 3 }]);
            expect(r2[0].x).toBe(2);
            const r3 = manager.undo([{ id: 'a', x: 2 }]);
            expect(r3[0].x).toBe(1);
            expect(manager.canUndo()).toBe(false);
        });
    });

    // ─── redo ────────────────────────────────────────────────────────

    describe('redo', () => {
        it('should return null when redo stack is empty', () => {
            const result = manager.redo([{ id: 'current' }]);
            expect(result).toBeNull();
        });

        it('should return the next state after undo', () => {
            manager.pushState([{ id: 'a', x: 10 }]);
            manager.pushState([{ id: 'a', x: 20 }]);
            manager.undo([{ id: 'a', x: 20 }]); // undo to x:20, current was x:20
            const result = manager.redo([{ id: 'a', x: 10 }]);
            expect(result[0].x).toBe(20);
        });

        it('should push current state onto undo stack', () => {
            manager.pushState([{ id: 'a', x: 10 }]);
            manager.undo([{ id: 'a', x: 20 }]);
            const undoSizeBefore = manager.undoSize;
            manager.redo([{ id: 'a', x: 10 }]);
            expect(manager.undoSize).toBe(undoSizeBefore + 1);
        });

        it('should deep-clone current state when pushing to undo', () => {
            manager.pushState([{ id: 'a', x: 10 }]);
            manager.undo([{ id: 'a', x: 20 }]);
            const current = [{ id: 'a', x: 10 }];
            manager.redo(current);
            current[0].x = 999;
            const undone = manager.undo([]);
            expect(undone[0].x).toBe(10);
        });
    });

    // ─── undo/redo round-trip ────────────────────────────────────────

    describe('undo/redo round-trip', () => {
        it('should restore original state after undo then redo', () => {
            const s0 = [{ id: 'a', x: 0, y: 0 }];
            const s1 = [{ id: 'a', x: 100, y: 200 }];

            manager.pushState(s0);
            // After action, state is s1
            const undone = manager.undo(s1);
            expect(undone).toEqual(s0);

            const redone = manager.redo(s0);
            expect(redone).toEqual(s1);
        });

        it('should handle multiple undo/redo cycles', () => {
            manager.pushState([{ id: 'a', x: 1 }]);
            manager.pushState([{ id: 'a', x: 2 }]);
            manager.pushState([{ id: 'a', x: 3 }]);

            // Current state is x:4
            let current = [{ id: 'a', x: 4 }];

            // Undo 3 times
            current = manager.undo(current); // returns x:3
            expect(current[0].x).toBe(3);
            current = manager.undo(current); // returns x:2
            expect(current[0].x).toBe(2);
            current = manager.undo(current); // returns x:1
            expect(current[0].x).toBe(1);

            // Redo 3 times
            current = manager.redo(current); // returns x:2
            expect(current[0].x).toBe(2);
            current = manager.redo(current); // returns x:3
            expect(current[0].x).toBe(3);
            current = manager.redo(current); // returns x:4
            expect(current[0].x).toBe(4);

            expect(manager.canRedo()).toBe(false);
        });
    });

    // ─── canUndo / canRedo ───────────────────────────────────────────

    describe('canUndo / canRedo', () => {
        it('canUndo should be false initially', () => {
            expect(manager.canUndo()).toBe(false);
        });

        it('canUndo should be true after pushState', () => {
            manager.pushState([]);
            expect(manager.canUndo()).toBe(true);
        });

        it('canRedo should be false initially', () => {
            expect(manager.canRedo()).toBe(false);
        });

        it('canRedo should be true after undo', () => {
            manager.pushState([]);
            manager.undo([]);
            expect(manager.canRedo()).toBe(true);
        });

        it('canRedo should be false after pushState clears redo', () => {
            manager.pushState([{ id: 'a' }]);
            manager.undo([{ id: 'b' }]);
            expect(manager.canRedo()).toBe(true);
            manager.pushState([{ id: 'c' }]);
            expect(manager.canRedo()).toBe(false);
        });
    });

    // ─── clearRedoStack ──────────────────────────────────────────────

    describe('clearRedoStack', () => {
        it('should clear the redo stack', () => {
            manager.pushState([{ id: 'a' }]);
            manager.undo([{ id: 'b' }]);
            expect(manager.canRedo()).toBe(true);
            manager.clearRedoStack();
            expect(manager.canRedo()).toBe(false);
        });
    });

    // ─── clear ───────────────────────────────────────────────────────

    describe('clear', () => {
        it('should clear both stacks', () => {
            manager.pushState([{ id: 'a' }]);
            manager.pushState([{ id: 'b' }]);
            manager.undo([{ id: 'c' }]);
            expect(manager.canUndo()).toBe(true);
            expect(manager.canRedo()).toBe(true);
            manager.clear();
            expect(manager.canUndo()).toBe(false);
            expect(manager.canRedo()).toBe(false);
            expect(manager.undoSize).toBe(0);
            expect(manager.redoSize).toBe(0);
        });
    });

    // ─── undoSize / redoSize ─────────────────────────────────────────

    describe('undoSize / redoSize', () => {
        it('should track undo stack size', () => {
            expect(manager.undoSize).toBe(0);
            manager.pushState([]);
            expect(manager.undoSize).toBe(1);
            manager.pushState([]);
            expect(manager.undoSize).toBe(2);
            manager.undo([]);
            expect(manager.undoSize).toBe(1);
        });

        it('should track redo stack size', () => {
            expect(manager.redoSize).toBe(0);
            manager.pushState([]);
            manager.undo([]);
            expect(manager.redoSize).toBe(1);
            manager.redo([]);
            expect(manager.redoSize).toBe(0);
        });
    });
});
