/**
 * UndoRedoIntegration - Connects UndoRedoManager with ElementRegistry and InteractionHandler.
 *
 * This integration layer:
 * 1. Intercepts registry modifications (add, delete, property change) to push undo states
 * 2. Handles continuous operations (drag/resize) as single undo entries
 *    (records state at mousedown, pushes single entry at mouseup)
 * 3. Listens for keyboard shortcuts:
 *    - Ctrl+Z: undo
 *    - Ctrl+Y / Ctrl+Shift+Z: redo
 *    - Delete: remove selected elements
 * 4. No-ops when the respective stack is empty
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 5.8
 */
class UndoRedoIntegration {
    /**
     * @param {object} registry - An ElementRegistry instance
     * @param {object} undoRedoManager - An UndoRedoManager instance
     * @param {object} canvas - A CanvasRenderer instance (for re-rendering after undo/redo)
     * @param {object} [interactionHandler] - An InteractionHandler instance (for drag/resize hooks)
     */
    constructor(registry, undoRedoManager, canvas, interactionHandler) {
        /** @type {object} */
        this._registry = registry;
        /** @type {object} */
        this._undoRedoManager = undoRedoManager;
        /** @type {object} */
        this._canvas = canvas;
        /** @type {object|null} */
        this._interactionHandler = interactionHandler || null;

        /**
         * Snapshot captured at the start of a continuous operation (drag/resize).
         * Used to push a single undo entry when the operation completes.
         * @type {object[]|null}
         */
        this._continuousOpSnapshot = null;

        /**
         * Flag indicating whether a continuous operation is in progress.
         * While true, discrete undo pushes from registry changes are suppressed.
         * @type {boolean}
         */
        this._isContinuousOp = false;

        // Bind keyboard handler
        this._onKeyDown = this._onKeyDown.bind(this);

        // Attach keyboard listener
        document.addEventListener('keydown', this._onKeyDown);
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /**
     * Push the current registry state onto the undo stack before a modifying action.
     * Call this before add, delete, or property change operations.
     * No-ops if a continuous operation is in progress (drag/resize handles its own snapshot).
     */
    pushUndoState() {
        if (this._isContinuousOp) return;

        const currentState = this._registry.serialize();
        this._undoRedoManager.pushState(currentState);
    }

    /**
     * Perform an undo operation.
     * Restores the previous state from the undo stack.
     * No-op if the undo stack is empty.
     * @returns {boolean} True if undo was performed, false if stack was empty
     */
    undo() {
        if (!this._undoRedoManager.canUndo()) {
            return false;
        }

        const currentState = this._registry.serialize();
        const previousState = this._undoRedoManager.undo(currentState);

        if (previousState) {
            this._registry.deserialize(previousState);
            this._rerender();
            return true;
        }

        return false;
    }

    /**
     * Perform a redo operation.
     * Restores the next state from the redo stack.
     * No-op if the redo stack is empty.
     * @returns {boolean} True if redo was performed, false if stack was empty
     */
    redo() {
        if (!this._undoRedoManager.canRedo()) {
            return false;
        }

        const currentState = this._registry.serialize();
        const nextState = this._undoRedoManager.redo(currentState);

        if (nextState) {
            this._registry.deserialize(nextState);
            this._rerender();
            return true;
        }

        return false;
    }

    /**
     * Delete all currently selected elements.
     * Pushes undo state before deletion.
     * No-op if no elements are selected.
     * @returns {boolean} True if elements were deleted, false if nothing was selected
     */
    deleteSelected() {
        const selectedIds = this._registry.getSelectedIds();
        if (selectedIds.length === 0) {
            return false;
        }

        this.pushUndoState();
        this._registry.removeElements(selectedIds);
        this._rerender();
        return true;
    }

    // ─── Continuous Operation Hooks (Drag/Resize) ────────────────────────

    /**
     * Call at the start of a continuous operation (mousedown for drag/resize).
     * Captures the current state as a snapshot to be pushed as a single undo entry
     * when the operation completes.
     */
    beginContinuousOperation() {
        this._isContinuousOp = true;
        this._continuousOpSnapshot = this._registry.serialize();
    }

    /**
     * Call at the end of a continuous operation (mouseup for drag/resize).
     * Pushes the snapshot captured at the start as a single undo entry.
     * Resets the continuous operation state.
     */
    endContinuousOperation() {
        if (this._isContinuousOp && this._continuousOpSnapshot !== null) {
            this._undoRedoManager.pushState(this._continuousOpSnapshot);
        }

        this._isContinuousOp = false;
        this._continuousOpSnapshot = null;
    }

    /**
     * Check if a continuous operation is currently in progress.
     * @returns {boolean}
     */
    isContinuousOperationActive() {
        return this._isContinuousOp;
    }

    // ─── Convenience Wrappers ────────────────────────────────────────────

    /**
     * Check whether an undo operation is possible.
     * @returns {boolean}
     */
    canUndo() {
        return this._undoRedoManager.canUndo();
    }

    /**
     * Check whether a redo operation is possible.
     * @returns {boolean}
     */
    canRedo() {
        return this._undoRedoManager.canRedo();
    }

    /**
     * Destroy the integration layer and remove event listeners.
     */
    destroy() {
        document.removeEventListener('keydown', this._onKeyDown);
        this._continuousOpSnapshot = null;
        this._isContinuousOp = false;
    }

    // ─── Private: Keyboard Handler ───────────────────────────────────────

    /**
     * Handle keydown events for undo/redo/delete shortcuts.
     * - Ctrl+Z: undo
     * - Ctrl+Y: redo
     * - Ctrl+Shift+Z: redo
     * - Delete: remove selected elements
     * @param {KeyboardEvent} event
     * @private
     */
    _onKeyDown(event) {
        // Don't intercept shortcuts when user is typing in an input/textarea/contenteditable
        if (this._isEditableTarget(event.target)) {
            return;
        }

        const isCtrl = event.ctrlKey || event.metaKey;

        // Ctrl+Z: Undo
        if (isCtrl && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            this.undo();
            return;
        }

        // Ctrl+Y: Redo
        if (isCtrl && event.key === 'y') {
            event.preventDefault();
            this.redo();
            return;
        }

        // Ctrl+Shift+Z: Redo
        if (isCtrl && event.key === 'Z' && event.shiftKey) {
            event.preventDefault();
            this.redo();
            return;
        }

        // Also handle lowercase z with shift for cross-platform compatibility
        if (isCtrl && event.key === 'z' && event.shiftKey) {
            event.preventDefault();
            this.redo();
            return;
        }

        // Delete key: remove selected elements
        if (event.key === 'Delete' || event.key === 'Backspace') {
            // Only handle Backspace if not in an editable field (already checked above)
            if (event.key === 'Backspace') {
                // Extra safety: only handle Backspace when focus is on the canvas/body
                const tag = event.target.tagName.toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                    return;
                }
            }
            event.preventDefault();
            this.deleteSelected();
            return;
        }
    }

    /**
     * Check if the event target is an editable element (input, textarea, contenteditable).
     * @param {HTMLElement} target - The event target
     * @returns {boolean} True if the target is editable
     * @private
     */
    _isEditableTarget(target) {
        if (!target) return false;
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            return true;
        }
        if (target.isContentEditable) {
            return true;
        }
        return false;
    }

    // ─── Private: Re-render ──────────────────────────────────────────────

    /**
     * Re-render the canvas after an undo/redo/delete operation.
     * @private
     */
    _rerender() {
        if (this._canvas && typeof this._canvas.renderAll === 'function') {
            this._canvas.renderAll();
        }
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UndoRedoIntegration };
}
