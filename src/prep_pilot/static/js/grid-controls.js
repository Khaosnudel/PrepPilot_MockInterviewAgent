/**
 * GridControls — Sidebar controls for grid toggle and spacing configuration.
 *
 * Can be used in two modes:
 * 1. Self-rendering: Pass a container element and it creates its own DOM structure.
 * 2. Existing DOM: Pass pre-existing DOM element references via options.elements.
 *
 * Wires the toggle to show/hide the grid overlay and enable/disable snap-to-grid
 * in the interaction handler. Validates spacing input using validators.js and
 * displays inline error messages for invalid values.
 *
 * Requirements: 8.1, 8.4, 8.5, 8.6
 */

class GridControls {
    /**
     * @param {HTMLElement} containerElement - The sidebar container to render controls into
     * @param {object} options - Dependencies
     * @param {object} options.gridOverlay - A GridOverlay instance (showGrid, hideGrid, updateGridSpacing)
     * @param {object} options.interactionHandler - An InteractionHandler instance (setSnapEnabled, setGridSpacing)
     * @param {function} [options.validateGridSpacing] - Validation function for grid spacing (from validators.js)
     * @param {object} [options.elements] - Pre-existing DOM elements to wire (skip self-rendering)
     * @param {HTMLInputElement} [options.elements.toggle] - Existing toggle checkbox
     * @param {HTMLInputElement} [options.elements.spacingInput] - Existing spacing input
     * @param {HTMLElement} [options.elements.errorElement] - Existing error display element
     */
    constructor(containerElement, options = {}) {
        if (!containerElement) {
            throw new Error('GridControls requires a container element');
        }

        /** @type {HTMLElement} */
        this._container = containerElement;

        /** @type {object|null} */
        this._gridOverlay = options.gridOverlay || null;

        /** @type {object|null} */
        this._interactionHandler = options.interactionHandler || null;

        /** @type {function|null} */
        this._validateGridSpacing = options.validateGridSpacing || null;

        /** @type {number} */
        this._currentSpacing = 16;

        /** @type {boolean} */
        this._gridEnabled = false;

        // DOM references (set during render or from existing elements)
        /** @type {HTMLInputElement|null} */
        this._toggleCheckbox = null;

        /** @type {HTMLInputElement|null} */
        this._spacingInput = null;

        /** @type {HTMLElement|null} */
        this._errorElement = null;

        // Use existing DOM elements if provided, otherwise self-render
        if (options.elements) {
            this._toggleCheckbox = options.elements.toggle || null;
            this._spacingInput = options.elements.spacingInput || null;
            this._errorElement = options.elements.errorElement || null;
            this._attachEventListeners();
        } else {
            this._render();
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /**
     * Returns whether the grid is currently enabled.
     * @returns {boolean}
     */
    isGridEnabled() {
        return this._gridEnabled;
    }

    /**
     * Returns the current grid spacing value.
     * @returns {number}
     */
    getSpacing() {
        return this._currentSpacing;
    }

    /**
     * Programmatically set the grid enabled state.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this._gridEnabled = !!enabled;
        if (this._toggleCheckbox) {
            this._toggleCheckbox.checked = this._gridEnabled;
        }
        this._applyGridState();
    }

    /**
     * Programmatically set the grid spacing.
     * @param {number} spacing
     */
    setSpacing(spacing) {
        const result = this._validate(spacing);
        if (result.valid) {
            this._currentSpacing = result.value;
            if (this._spacingInput) {
                this._spacingInput.value = this._currentSpacing;
            }
            this._clearError();
            this._applySpacing();
        }
    }

    /**
     * Destroy the controls and remove DOM elements.
     */
    destroy() {
        if (this._container) {
            this._container.innerHTML = '';
        }
        this._toggleCheckbox = null;
        this._spacingInput = null;
        this._errorElement = null;
    }

    // ─── Private Methods ─────────────────────────────────────────────────

    /**
     * Attach event listeners to existing DOM elements (used when elements are pre-rendered).
     * @private
     */
    _attachEventListeners() {
        if (this._toggleCheckbox) {
            this._toggleCheckbox.addEventListener('change', () => this._onToggleChange());
        }
        if (this._spacingInput) {
            this._spacingInput.addEventListener('change', () => this._onSpacingChange());
            this._spacingInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this._onSpacingChange();
                    e.preventDefault();
                }
            });
        }
    }

    /**
     * Render the grid controls into the container element.
     * @private
     */
    _render() {
        // Create the section structure
        const section = document.createElement('div');
        section.className = 'section';
        section.id = 'grid-controls-section';

        // Section title
        const title = document.createElement('div');
        title.className = 'section-title';
        title.textContent = 'Grid & Snap';
        section.appendChild(title);

        // Show Grid toggle
        const toggleRow = document.createElement('div');
        toggleRow.className = 'toggle';

        const toggleLabel = document.createElement('label');
        toggleLabel.textContent = 'Show Grid';
        toggleLabel.setAttribute('for', 'grid-toggle');

        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.id = 'grid-toggle';
        toggleCheckbox.checked = this._gridEnabled;
        toggleCheckbox.style.width = '16px';
        toggleCheckbox.style.height = '16px';
        toggleCheckbox.style.cursor = 'pointer';

        toggleRow.appendChild(toggleLabel);
        toggleRow.appendChild(toggleCheckbox);
        section.appendChild(toggleRow);

        // Grid spacing field
        const spacingField = document.createElement('div');
        spacingField.className = 'field';

        const spacingLabel = document.createElement('label');
        spacingLabel.textContent = 'Grid Spacing (4–128 px)';
        spacingLabel.setAttribute('for', 'grid-spacing');

        const spacingInput = document.createElement('input');
        spacingInput.type = 'text';
        spacingInput.id = 'grid-spacing';
        spacingInput.value = String(this._currentSpacing);
        spacingInput.placeholder = '16';
        spacingInput.style.width = '100%';
        spacingInput.style.padding = '0.35rem 0.5rem';
        spacingInput.style.borderRadius = '4px';
        spacingInput.style.border = '1px solid #334155';
        spacingInput.style.background = '#0f172a';
        spacingInput.style.color = '#e2e8f0';
        spacingInput.style.fontSize = '0.8rem';

        spacingField.appendChild(spacingLabel);
        spacingField.appendChild(spacingInput);
        section.appendChild(spacingField);

        // Error message element (hidden by default)
        const errorEl = document.createElement('div');
        errorEl.id = 'grid-spacing-error';
        errorEl.style.fontSize = '0.7rem';
        errorEl.style.color = '#fca5a5';
        errorEl.style.marginTop = '0.2rem';
        errorEl.style.display = 'none';
        section.appendChild(errorEl);

        // Append to container
        this._container.appendChild(section);

        // Store references
        this._toggleCheckbox = toggleCheckbox;
        this._spacingInput = spacingInput;
        this._errorElement = errorEl;

        // Attach event listeners
        this._attachEventListeners();
    }

    /**
     * Handle the grid toggle checkbox change event.
     * @private
     */
    _onToggleChange() {
        this._gridEnabled = this._toggleCheckbox.checked;
        this._applyGridState();
    }

    /**
     * Handle the spacing input change event.
     * Validates the input and updates grid spacing or shows an error.
     * @private
     */
    _onSpacingChange() {
        const rawValue = this._spacingInput.value.trim();
        const result = this._validate(rawValue);

        if (result.valid) {
            this._currentSpacing = result.value;
            this._spacingInput.value = String(this._currentSpacing);
            this._clearError();
            this._applySpacing();
        } else {
            // Reject input: retain previous valid value and show error
            this._spacingInput.value = String(this._currentSpacing);
            this._showError(result.error);
        }
    }

    /**
     * Validate a grid spacing value using the provided validator or inline logic.
     * @param {*} value - The value to validate
     * @returns {{ valid: boolean, value: number|null, error: string|null }}
     * @private
     */
    _validate(value) {
        if (this._validateGridSpacing) {
            return this._validateGridSpacing(value);
        }

        // Inline fallback validation
        const num = Number(value);
        if (value === null || value === undefined || value === '' || isNaN(num)) {
            return { valid: false, value: null, error: 'Grid spacing must be an integer between 4 and 128' };
        }
        if (!isFinite(num) || !Number.isInteger(num)) {
            return { valid: false, value: null, error: 'Grid spacing must be an integer between 4 and 128' };
        }
        if (num < 4 || num > 128) {
            return { valid: false, value: null, error: 'Grid spacing must be an integer between 4 and 128' };
        }
        return { valid: true, value: num, error: null };
    }

    /**
     * Apply the current grid enabled/disabled state to the overlay and interaction handler.
     * @private
     */
    _applyGridState() {
        if (this._gridEnabled) {
            // Show grid and enable snap
            if (this._gridOverlay && typeof this._gridOverlay.showGrid === 'function') {
                this._gridOverlay.showGrid(this._currentSpacing);
            }
            if (this._interactionHandler && typeof this._interactionHandler.setSnapEnabled === 'function') {
                this._interactionHandler.setSnapEnabled(true);
            }
        } else {
            // Hide grid and disable snap
            if (this._gridOverlay && typeof this._gridOverlay.hideGrid === 'function') {
                this._gridOverlay.hideGrid();
            }
            if (this._interactionHandler && typeof this._interactionHandler.setSnapEnabled === 'function') {
                this._interactionHandler.setSnapEnabled(false);
            }
        }
    }

    /**
     * Apply the current spacing value to the grid overlay and interaction handler.
     * @private
     */
    _applySpacing() {
        if (this._gridOverlay && typeof this._gridOverlay.updateGridSpacing === 'function') {
            this._gridOverlay.updateGridSpacing(this._currentSpacing);
        }
        if (this._interactionHandler && typeof this._interactionHandler.setGridSpacing === 'function') {
            this._interactionHandler.setGridSpacing(this._currentSpacing);
        }
    }

    /**
     * Show an error message below the spacing input.
     * @param {string} message - The error message to display
     * @private
     */
    _showError(message) {
        if (this._errorElement) {
            this._errorElement.textContent = message;
            this._errorElement.style.display = 'block';
        }
        if (this._spacingInput) {
            this._spacingInput.style.borderColor = '#fca5a5';
        }
    }

    /**
     * Clear the error message.
     * @private
     */
    _clearError() {
        if (this._errorElement) {
            this._errorElement.textContent = '';
            this._errorElement.style.display = 'none';
        }
        if (this._spacingInput) {
            this._spacingInput.style.borderColor = '#334155';
        }
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GridControls };
}
