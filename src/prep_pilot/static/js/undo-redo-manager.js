/**
 * UndoRedoManager - Manages state history with capped undo/redo stacks.
 *
 * Stores deep-cloned snapshots of the Element Registry state. The undo stack
 * is capped at a configurable maximum (default 50) with FIFO eviction of the
 * oldest entries when capacity is exceeded.
 *
 * Requirements: 9.1, 9.5
 */
class UndoRedoManager {
    /**
     * @param {number} [maxHistory=50] - Maximum number of undo entries to retain
     */
    constructor(maxHistory = 50) {
        /** @type {number} */
        this._maxHistory = maxHistory;
        /** @type {Array<object[]>} */
        this._undoStack = [];
        /** @type {Array<object[]>} */
        this._redoStack = [];
    }

    /**
     * Push a state snapshot onto the undo stack.
     * Deep-clones the provided state to prevent reference sharing.
     * Clears the redo stack (any redo history is invalidated by a new action).
     * Evicts the oldest entry if the stack exceeds max capacity (FIFO).
     *
     * @param {object[]} state - The Element Registry state (array of element data)
     */
    pushState(state) {
        const cloned = JSON.parse(JSON.stringify(state));
        this._undoStack.push(cloned);

        // FIFO eviction: remove oldest entries from the front when over capacity
        while (this._undoStack.length > this._maxHistory) {
            this._undoStack.shift();
        }

        // Any new action invalidates the redo history
        this._redoStack = [];
    }

    /**
     * Undo: pop the most recent state from the undo stack and return it.
     * The caller must provide the current state so it can be pushed onto the redo stack.
     *
     * @param {object[]} currentState - The current Element Registry state before undoing
     * @returns {object[]|null} The previous state to restore, or null if nothing to undo
     */
    undo(currentState) {
        if (this._undoStack.length === 0) {
            return null;
        }

        // Push current state onto redo stack (deep-clone)
        const clonedCurrent = JSON.parse(JSON.stringify(currentState));
        this._redoStack.push(clonedCurrent);

        // Pop and return the previous state from undo stack
        return this._undoStack.pop();
    }

    /**
     * Redo: pop the most recent state from the redo stack and return it.
     * The caller must provide the current state so it can be pushed onto the undo stack.
     *
     * @param {object[]} currentState - The current Element Registry state before redoing
     * @returns {object[]|null} The next state to restore, or null if nothing to redo
     */
    redo(currentState) {
        if (this._redoStack.length === 0) {
            return null;
        }

        // Push current state onto undo stack (deep-clone)
        const clonedCurrent = JSON.parse(JSON.stringify(currentState));
        this._undoStack.push(clonedCurrent);

        // Pop and return the next state from redo stack
        return this._redoStack.pop();
    }

    /**
     * Check whether an undo operation is possible.
     * @returns {boolean}
     */
    canUndo() {
        return this._undoStack.length > 0;
    }

    /**
     * Check whether a redo operation is possible.
     * @returns {boolean}
     */
    canRedo() {
        return this._redoStack.length > 0;
    }

    /**
     * Clear the redo stack. Called implicitly by pushState, but available
     * for explicit use if needed.
     */
    clearRedoStack() {
        this._redoStack = [];
    }

    /**
     * Clear both undo and redo stacks entirely.
     */
    clear() {
        this._undoStack = [];
        this._redoStack = [];
    }

    /**
     * Get the current size of the undo stack.
     * @returns {number}
     */
    get undoSize() {
        return this._undoStack.length;
    }

    /**
     * Get the current size of the redo stack.
     * @returns {number}
     */
    get redoSize() {
        return this._redoStack.length;
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UndoRedoManager };
}
