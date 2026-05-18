/**
 * ElementRegistry - Central state store for all placed elements in the UI Editor.
 * 
 * Manages element CRUD, selection state, z-index ordering, serialization,
 * and snapshot/restore for undo/redo support.
 */
class ElementRegistry {
    constructor() {
        /** @type {Map<string, object>} */
        this._elements = new Map();
        /** @type {Set<string>} */
        this._selection = new Set();
        /** @type {Array<function>} */
        this._changeListeners = [];
        /** @type {number} */
        this._nextZIndex = 1;
        /** @type {string[]} insertion order tracking */
        this._insertionOrder = [];
    }

    // ─── Element CRUD ────────────────────────────────────────────────────

    /**
     * Add a new element to the registry.
     * @param {string} type - Element type: 'icon', 'image', or 'text'
     * @param {object} properties - Element properties (x, y, width, height, etc.)
     * @returns {object} The created element with generated ID and auto-assigned z-index
     */
    addElement(type, properties) {
        const id = crypto.randomUUID();
        const zIndex = this._getNextZIndex();

        const element = {
            id,
            type,
            x: 0,
            y: 0,
            width: 32,
            height: 32,
            opacity: 1.0,
            ...properties,
            zIndex
        };

        this._elements.set(id, element);
        this._insertionOrder.push(id);
        this._notifyChange();
        return element;
    }

    /**
     * Remove a single element by ID.
     * @param {string} id - Element ID to remove
     */
    removeElement(id) {
        if (this._elements.has(id)) {
            this._elements.delete(id);
            this._selection.delete(id);
            this._insertionOrder = this._insertionOrder.filter(eid => eid !== id);
            this._notifyChange();
        }
    }

    /**
     * Remove multiple elements by IDs (batch deletion).
     * @param {string[]} ids - Array of element IDs to remove
     */
    removeElements(ids) {
        let changed = false;
        for (const id of ids) {
            if (this._elements.has(id)) {
                this._elements.delete(id);
                this._selection.delete(id);
                changed = true;
            }
        }
        if (changed) {
            this._insertionOrder = this._insertionOrder.filter(eid => this._elements.has(eid));
            this._notifyChange();
        }
    }

    /**
     * Update an element's properties (partial update).
     * @param {string} id - Element ID
     * @param {object} properties - Properties to merge into the element
     */
    updateElement(id, properties) {
        const element = this._elements.get(id);
        if (element) {
            // Don't allow overwriting id or type
            const { id: _id, type: _type, ...safeProps } = properties;
            Object.assign(element, safeProps);
            this._notifyChange();
        }
    }

    /**
     * Get a single element by ID.
     * @param {string} id - Element ID
     * @returns {object|null} The element or null if not found
     */
    getElement(id) {
        return this._elements.get(id) || null;
    }

    /**
     * Get all elements as an array.
     * @returns {object[]} All elements in the registry
     */
    getAllElements() {
        return Array.from(this._elements.values());
    }

    /**
     * Get all currently selected elements.
     * @returns {object[]} Array of selected elements
     */
    getSelectedElements() {
        return Array.from(this._selection)
            .map(id => this._elements.get(id))
            .filter(Boolean);
    }

    // ─── Selection State ─────────────────────────────────────────────────

    /**
     * Select a single element (deselects all others).
     * @param {string} id - Element ID to select
     */
    selectElement(id) {
        if (this._elements.has(id)) {
            this._selection.clear();
            this._selection.add(id);
            this._notifyChange();
        }
    }

    /**
     * Add an element to the current selection (multi-select).
     * @param {string} id - Element ID to add to selection
     */
    addToSelection(id) {
        if (this._elements.has(id)) {
            this._selection.add(id);
            this._notifyChange();
        }
    }

    /**
     * Remove an element from the current selection.
     * @param {string} id - Element ID to remove from selection
     */
    removeFromSelection(id) {
        if (this._selection.delete(id)) {
            this._notifyChange();
        }
    }

    /**
     * Clear all selection.
     */
    clearSelection() {
        if (this._selection.size > 0) {
            this._selection.clear();
            this._notifyChange();
        }
    }

    /**
     * Get the set of selected element IDs.
     * @returns {string[]} Array of selected element IDs
     */
    getSelection() {
        return Array.from(this._selection);
    }

    /**
     * Alias for getSelection (matches design interface).
     * @returns {string[]} Array of selected element IDs
     */
    getSelectedIds() {
        return this.getSelection();
    }

    /**
     * Set the selection to a specific set of IDs.
     * @param {string[]} ids - Array of element IDs to select
     */
    setSelection(ids) {
        this._selection.clear();
        for (const id of ids) {
            if (this._elements.has(id)) {
                this._selection.add(id);
            }
        }
        this._notifyChange();
    }

    // ─── Z-Index Operations ──────────────────────────────────────────────

    /**
     * Get the maximum z-index among all elements.
     * @returns {number} Maximum z-index, or 0 if registry is empty
     */
    getMaxZIndex() {
        if (this._elements.size === 0) return 0;
        let max = -Infinity;
        for (const el of this._elements.values()) {
            if (el.zIndex > max) max = el.zIndex;
        }
        return max;
    }

    /**
     * Get the minimum z-index among all elements.
     * @returns {number} Minimum z-index, or 0 if registry is empty
     */
    getMinZIndex() {
        if (this._elements.size === 0) return 0;
        let min = Infinity;
        for (const el of this._elements.values()) {
            if (el.zIndex < min) min = el.zIndex;
        }
        return min;
    }

    /**
     * Bring an element to the front (highest z-index + 1).
     * @param {string} id - Element ID
     */
    bringToFront(id) {
        const element = this._elements.get(id);
        if (element) {
            const maxZ = this.getMaxZIndex();
            if (element.zIndex < maxZ) {
                element.zIndex = maxZ + 1;
                this._notifyChange();
            }
        }
    }

    /**
     * Send an element to the back (lowest z-index - 1).
     * @param {string} id - Element ID
     */
    sendToBack(id) {
        const element = this._elements.get(id);
        if (element) {
            const minZ = this.getMinZIndex();
            if (element.zIndex > minZ) {
                element.zIndex = minZ - 1;
                this._notifyChange();
            }
        }
    }

    /**
     * Move an element one layer forward (swap z-index with next higher element).
     * @param {string} id - Element ID
     */
    moveForward(id) {
        const element = this._elements.get(id);
        if (!element) return;

        // Find the element with the next higher z-index
        let nextAbove = null;
        for (const el of this._elements.values()) {
            if (el.id === id) continue;
            if (el.zIndex > element.zIndex) {
                if (!nextAbove || el.zIndex < nextAbove.zIndex) {
                    nextAbove = el;
                }
            }
        }

        if (nextAbove) {
            const tempZ = element.zIndex;
            element.zIndex = nextAbove.zIndex;
            nextAbove.zIndex = tempZ;
            this._notifyChange();
        }
    }

    /**
     * Move an element one layer backward (swap z-index with next lower element).
     * @param {string} id - Element ID
     */
    moveBackward(id) {
        const element = this._elements.get(id);
        if (!element) return;

        // Find the element with the next lower z-index
        let nextBelow = null;
        for (const el of this._elements.values()) {
            if (el.id === id) continue;
            if (el.zIndex < element.zIndex) {
                if (!nextBelow || el.zIndex > nextBelow.zIndex) {
                    nextBelow = el;
                }
            }
        }

        if (nextBelow) {
            const tempZ = element.zIndex;
            element.zIndex = nextBelow.zIndex;
            nextBelow.zIndex = tempZ;
            this._notifyChange();
        }
    }

    // ─── Serialization ───────────────────────────────────────────────────

    /**
     * Serialize the registry state to a JSON-compatible array.
     * @returns {object[]} Array of element data objects
     */
    serialize() {
        // Return elements in insertion order for deterministic output
        return this._insertionOrder
            .map(id => this._elements.get(id))
            .filter(Boolean)
            .map(el => ({ ...el }));
    }

    /**
     * Deserialize a JSON array and restore the registry state.
     * Replaces all current elements.
     * @param {object[]|string} data - Array of element data objects, or JSON string
     */
    deserialize(data) {
        const elements = typeof data === 'string' ? JSON.parse(data) : data;

        this._elements.clear();
        this._selection.clear();
        this._insertionOrder = [];

        if (Array.isArray(elements)) {
            for (const el of elements) {
                if (el && el.id && el.type) {
                    this._elements.set(el.id, { ...el });
                    this._insertionOrder.push(el.id);
                }
            }
        }

        // Update next z-index tracker
        this._nextZIndex = this._elements.size > 0 ? this.getMaxZIndex() + 1 : 1;
        this._notifyChange();
    }

    // ─── Snapshot (Undo/Redo Support) ────────────────────────────────────

    /**
     * Get a deep snapshot of the current registry state for undo/redo.
     * @returns {object} Snapshot containing elements and insertion order
     */
    getSnapshot() {
        return {
            elements: this._insertionOrder
                .map(id => this._elements.get(id))
                .filter(Boolean)
                .map(el => JSON.parse(JSON.stringify(el))),
            selection: Array.from(this._selection),
            insertionOrder: [...this._insertionOrder]
        };
    }

    /**
     * Restore the registry state from a snapshot.
     * @param {object} snapshot - Snapshot previously obtained from getSnapshot()
     */
    restoreSnapshot(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.elements)) return;

        this._elements.clear();
        this._selection.clear();
        this._insertionOrder = [];

        for (const el of snapshot.elements) {
            this._elements.set(el.id, { ...el });
            this._insertionOrder.push(el.id);
        }

        if (Array.isArray(snapshot.selection)) {
            for (const id of snapshot.selection) {
                if (this._elements.has(id)) {
                    this._selection.add(id);
                }
            }
        }

        if (Array.isArray(snapshot.insertionOrder)) {
            this._insertionOrder = snapshot.insertionOrder.filter(id => this._elements.has(id));
        }

        this._nextZIndex = this._elements.size > 0 ? this.getMaxZIndex() + 1 : 1;
        this._notifyChange();
    }

    // ─── Events ──────────────────────────────────────────────────────────

    /**
     * Register a callback to be notified when the registry state changes.
     * @param {function} callback - Function called with the list of all elements
     */
    onChange(callback) {
        if (typeof callback === 'function') {
            this._changeListeners.push(callback);
        }
    }

    // ─── Private Helpers ─────────────────────────────────────────────────

    /**
     * Get the next z-index value (one above current max).
     * @returns {number}
     * @private
     */
    _getNextZIndex() {
        const maxZ = this.getMaxZIndex();
        return maxZ + 1;
    }

    /**
     * Notify all registered change listeners.
     * @private
     */
    _notifyChange() {
        const elements = this.getAllElements();
        for (const listener of this._changeListeners) {
            try {
                listener(elements);
            } catch (e) {
                console.error('ElementRegistry onChange listener error:', e);
            }
        }
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ElementRegistry };
}
