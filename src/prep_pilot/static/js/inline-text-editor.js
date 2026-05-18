/**
 * InlineTextEditor - Handles inline text editing for text elements on the canvas.
 *
 * On double-click of a text element, enables contenteditable mode with a visible cursor.
 * Commits text on Escape or click-outside. Restores placeholder if content is cleared.
 * Truncates content at 500 characters.
 *
 * Requirements: 10.2, 10.3, 10.5, 10.6
 */

const PLACEHOLDER_TEXT = 'Double-click to edit';
const INLINE_TEXT_MAX_LENGTH = 500;

class InlineTextEditor {
    /**
     * @param {HTMLElement} overlay - The canvas overlay element
     * @param {object} registry - An ElementRegistry instance
     * @param {object} canvas - A CanvasRenderer instance
     */
    constructor(overlay, registry, canvas) {
        /** @type {HTMLElement} */
        this._overlay = overlay;
        /** @type {object} */
        this._registry = registry;
        /** @type {object} */
        this._canvas = canvas;

        /** @type {string|null} Currently editing element ID */
        this._editingId = null;
        /** @type {HTMLElement|null} The contenteditable div currently active */
        this._editingNode = null;

        // Bind event handlers
        this._onDblClick = this._onDblClick.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onClickOutside = this._onClickOutside.bind(this);
        this._onInput = this._onInput.bind(this);

        // Attach double-click listener to the overlay
        if (this._overlay) {
            this._overlay.addEventListener('dblclick', this._onDblClick);
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /**
     * Check if inline editing is currently active.
     * @returns {boolean}
     */
    isEditing() {
        return this._editingId !== null;
    }

    /**
     * Get the ID of the element currently being edited.
     * @returns {string|null}
     */
    getEditingId() {
        return this._editingId;
    }

    /**
     * Programmatically exit editing mode and commit changes.
     */
    commitAndExit() {
        this._exitEditing();
    }

    /**
     * Destroy the editor and remove all event listeners.
     */
    destroy() {
        this._exitEditing();
        if (this._overlay) {
            this._overlay.removeEventListener('dblclick', this._onDblClick);
        }
    }

    // ─── Event Handlers ──────────────────────────────────────────────────

    /**
     * Handle double-click on the overlay. If the target is a text element,
     * enable inline editing mode.
     * @param {MouseEvent} event
     * @private
     */
    _onDblClick(event) {
        // If already editing, ignore double-clicks
        if (this._editingId) return;

        const elementId = this._getTextElementIdFromEvent(event);
        if (!elementId) return;

        const element = this._registry.getElement(elementId);
        if (!element || element.type !== 'text') return;

        event.preventDefault();
        event.stopPropagation();

        this._enterEditing(elementId);
    }

    /**
     * Handle keydown events during editing.
     * Escape exits editing mode.
     * @param {KeyboardEvent} event
     * @private
     */
    _onKeyDown(event) {
        if (!this._editingId) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this._exitEditing();
        }
    }

    /**
     * Handle clicks outside the editing element to commit and exit.
     * @param {MouseEvent} event
     * @private
     */
    _onClickOutside(event) {
        if (!this._editingId || !this._editingNode) return;

        // Check if the click is inside the editing node
        if (this._editingNode.contains(event.target)) return;

        this._exitEditing();
    }

    /**
     * Handle input events to enforce the 500-character limit.
     * @param {Event} event
     * @private
     */
    _onInput(event) {
        if (!this._editingNode) return;

        const text = this._editingNode.textContent || '';
        if (text.length > INLINE_TEXT_MAX_LENGTH) {
            // Truncate to 500 characters
            this._editingNode.textContent = text.substring(0, INLINE_TEXT_MAX_LENGTH);
            // Move cursor to end after truncation
            this._moveCursorToEnd(this._editingNode);
        }
    }

    // ─── Editing Lifecycle ───────────────────────────────────────────────

    /**
     * Enter inline editing mode for a text element.
     * Makes the text content div contenteditable and focuses it.
     * @param {string} elementId
     * @private
     */
    _enterEditing(elementId) {
        const element = this._registry.getElement(elementId);
        if (!element) return;

        // Find the DOM node for this element
        const elementNode = this._overlay.querySelector(`[data-element-id="${elementId}"]`);
        if (!elementNode) return;

        // Find the .canvas-text-content div inside
        const textContentDiv = elementNode.querySelector('.canvas-text-content');
        if (!textContentDiv) return;

        this._editingId = elementId;
        this._editingNode = textContentDiv;

        // Clear placeholder text if it's the default
        const currentContent = element.content || '';
        if (!currentContent || currentContent === PLACEHOLDER_TEXT) {
            textContentDiv.textContent = '';
        }

        // Enable contenteditable
        textContentDiv.contentEditable = 'true';
        textContentDiv.style.cursor = 'text';
        textContentDiv.style.outline = '1px solid #4a90d9';
        textContentDiv.style.outlineOffset = '2px';
        textContentDiv.style.minHeight = '1em';

        // Allow pointer events on this element during editing
        textContentDiv.style.pointerEvents = 'auto';
        textContentDiv.style.userSelect = 'text';

        // Focus and place cursor at end
        textContentDiv.focus();
        this._moveCursorToEnd(textContentDiv);

        // Attach editing event listeners
        document.addEventListener('keydown', this._onKeyDown, true);
        // Use setTimeout to avoid the current click event triggering click-outside
        setTimeout(() => {
            document.addEventListener('mousedown', this._onClickOutside, true);
        }, 0);
        textContentDiv.addEventListener('input', this._onInput);
    }

    /**
     * Exit inline editing mode, commit the text content to the registry.
     * Restores placeholder if content is empty.
     * @private
     */
    _exitEditing() {
        if (!this._editingId || !this._editingNode) {
            this._cleanupEditingState();
            return;
        }

        const elementId = this._editingId;
        const textContentDiv = this._editingNode;

        // Get the current text content
        let text = (textContentDiv.textContent || '').trim();

        // Truncate at 500 characters (safety check)
        if (text.length > INLINE_TEXT_MAX_LENGTH) {
            text = text.substring(0, INLINE_TEXT_MAX_LENGTH);
        }

        // Restore placeholder if content is empty
        if (!text) {
            text = '';
        }

        // Disable contenteditable
        textContentDiv.contentEditable = 'false';
        textContentDiv.style.cursor = '';
        textContentDiv.style.outline = '';
        textContentDiv.style.outlineOffset = '';
        textContentDiv.style.pointerEvents = '';
        textContentDiv.style.userSelect = '';

        // Commit the text to the registry
        const contentToStore = text || '';
        this._registry.updateElement(elementId, { content: contentToStore });

        // Update the display: show placeholder if empty
        textContentDiv.textContent = contentToStore || PLACEHOLDER_TEXT;

        // Remove editing event listeners
        document.removeEventListener('keydown', this._onKeyDown, true);
        document.removeEventListener('mousedown', this._onClickOutside, true);
        textContentDiv.removeEventListener('input', this._onInput);

        // Blur the element
        textContentDiv.blur();

        // Clear editing state
        this._editingId = null;
        this._editingNode = null;

        // Re-render the element to ensure consistency
        if (this._canvas && typeof this._canvas.renderElement === 'function') {
            this._canvas.renderElement(elementId);
        }
    }

    /**
     * Clean up editing state without committing (used for error recovery).
     * @private
     */
    _cleanupEditingState() {
        document.removeEventListener('keydown', this._onKeyDown, true);
        document.removeEventListener('mousedown', this._onClickOutside, true);
        if (this._editingNode) {
            this._editingNode.removeEventListener('input', this._onInput);
        }
        this._editingId = null;
        this._editingNode = null;
    }

    // ─── Helper Methods ──────────────────────────────────────────────────

    /**
     * Get the element ID from a double-click event, only if it's a text element.
     * Traverses up the DOM tree looking for data-element-id on a text-type element.
     * @param {MouseEvent} event
     * @returns {string|null}
     * @private
     */
    _getTextElementIdFromEvent(event) {
        let target = event.target;

        while (target && target !== this._overlay) {
            if (target.dataset && target.dataset.elementId) {
                return target.dataset.elementId;
            }
            target = target.parentElement;
        }

        return null;
    }

    /**
     * Move the cursor to the end of a contenteditable element.
     * @param {HTMLElement} element
     * @private
     */
    _moveCursorToEnd(element) {
        if (typeof window === 'undefined') return;

        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false); // collapse to end
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InlineTextEditor, PLACEHOLDER_TEXT, INLINE_TEXT_MAX_LENGTH };
}
