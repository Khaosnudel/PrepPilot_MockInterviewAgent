/**
 * PropertiesInspector - Displays and edits properties of selected elements.
 *
 * Creates a sidebar panel section that shows editable fields based on the
 * selected element type. Validates input values using validators.js and
 * applies changes to the Element Registry within 100ms.
 *
 * Requirements: 1.4, 1.5, 1.7, 2.6, 4.7, 5.9, 6.1, 6.7, 10.4
 */

// Resolve validators module — works in both browser (global) and Node/vitest (require)
let _validators = {};
try {
    if (typeof require === 'function') {
        _validators = require('./validators');
    }
} catch (e) {
    // In browser, validators are loaded as a separate script and available globally
}

// Fallback: check for global functions (browser environment)
function _getValidator(name) {
    if (_validators && _validators[name]) return _validators[name];
    if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
    if (typeof window !== 'undefined' && window[name]) return window[name];
    return null;
}

class PropertiesInspector {
    /**
     * @param {HTMLElement} panelElement - The container element for the inspector panel
     * @param {object} registry - An ElementRegistry instance
     */
    constructor(panelElement, registry) {
        /** @type {HTMLElement} */
        this._panel = panelElement;
        /** @type {object} */
        this._registry = registry;
        /** @type {string|null} */
        this._currentElementId = null;
        /** @type {string[]|null} */
        this._currentMultiIds = null;
        /** @type {number|null} */
        this._updateTimer = null;

        this._buildPanel();
        this._bindRegistryEvents();
    }

    // ─── Panel Construction ──────────────────────────────────────────────

    /**
     * Build the inspector panel DOM structure.
     * @private
     */
    _buildPanel() {
        this._panel.innerHTML = '';
        this._panel.classList.add('properties-inspector');

        // Title
        const title = document.createElement('div');
        title.className = 'section-title';
        title.textContent = 'Element Properties';
        this._panel.appendChild(title);

        // No selection message
        this._noSelectionMsg = document.createElement('div');
        this._noSelectionMsg.className = 'pi-no-selection';
        this._noSelectionMsg.textContent = 'Select an element to edit its properties';
        this._noSelectionMsg.style.cssText = 'font-size: 0.75rem; color: #64748b; padding: 0.5rem 0;';
        this._panel.appendChild(this._noSelectionMsg);

        // Properties container (hidden when no selection)
        this._propsContainer = document.createElement('div');
        this._propsContainer.className = 'pi-props-container';
        this._propsContainer.style.display = 'none';
        this._panel.appendChild(this._propsContainer);

        // Layer controls section
        this._layerSection = document.createElement('div');
        this._layerSection.className = 'pi-layer-section';
        this._layerSection.style.cssText = 'margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #334155;';
        this._buildLayerControls();
        this._panel.appendChild(this._layerSection);

        // Initially disable layer controls
        this.disableLayerControls();
    }

    /**
     * Build the layer order controls (z-index display + 4 buttons).
     * @private
     */
    _buildLayerControls() {
        const title = document.createElement('div');
        title.className = 'section-title';
        title.textContent = 'Layer Order';
        title.style.cssText = 'font-size: 0.7rem; margin-bottom: 0.4rem;';
        this._layerSection.appendChild(title);

        // Z-index display
        const zRow = document.createElement('div');
        zRow.className = 'pi-field';
        zRow.style.cssText = 'margin-bottom: 0.5rem;';
        const zLabel = document.createElement('label');
        zLabel.textContent = 'Z-Index';
        zLabel.style.cssText = 'display: block; font-size: 0.7rem; color: #94a3b8; margin-bottom: 0.15rem;';
        this._zIndexDisplay = document.createElement('span');
        this._zIndexDisplay.className = 'pi-zindex-value';
        this._zIndexDisplay.textContent = '—';
        this._zIndexDisplay.style.cssText = 'font-size: 0.8rem; color: #e2e8f0; font-family: monospace;';
        zRow.appendChild(zLabel);
        zRow.appendChild(this._zIndexDisplay);
        this._layerSection.appendChild(zRow);

        // Button container
        const btnContainer = document.createElement('div');
        btnContainer.className = 'pi-layer-buttons';
        btnContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem;';

        this._btnBringToFront = this._createLayerButton('⬆⬆ Front', 'bringToFront');
        this._btnMoveForward = this._createLayerButton('⬆ Forward', 'moveForward');
        this._btnMoveBackward = this._createLayerButton('⬇ Backward', 'moveBackward');
        this._btnSendToBack = this._createLayerButton('⬇⬇ Back', 'sendToBack');

        btnContainer.appendChild(this._btnBringToFront);
        btnContainer.appendChild(this._btnSendToBack);
        btnContainer.appendChild(this._btnMoveForward);
        btnContainer.appendChild(this._btnMoveBackward);
        this._layerSection.appendChild(btnContainer);
    }

    /**
     * Create a layer control button.
     * @param {string} label - Button text
     * @param {string} action - Registry method name
     * @returns {HTMLButtonElement}
     * @private
     */
    _createLayerButton(label, action) {
        const btn = document.createElement('button');
        btn.className = 'pi-layer-btn';
        btn.textContent = label;
        btn.dataset.action = action;
        btn.style.cssText = 'padding: 0.3rem 0.4rem; border-radius: 4px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 0.7rem; cursor: pointer; font-weight: 600;';
        btn.addEventListener('click', () => this._handleLayerAction(action));
        return btn;
    }

    // ─── Registry Event Binding ──────────────────────────────────────────

    /**
     * Listen for registry changes to update the inspector when selection changes.
     * @private
     */
    _bindRegistryEvents() {
        this._registry.onChange(() => {
            const selectedIds = this._registry.getSelectedIds();
            if (selectedIds.length === 0) {
                this.clear();
            } else if (selectedIds.length === 1) {
                this.showForElement(selectedIds[0]);
            } else {
                this.showForMultiSelect(selectedIds);
            }
        });
    }

    // ─── Public Display Methods ──────────────────────────────────────────

    /**
     * Display properties for a single selected element.
     * @param {string} id - Element ID
     */
    showForElement(id) {
        const element = this._registry.getElement(id);
        if (!element) {
            this.clear();
            return;
        }

        this._currentElementId = id;
        this._currentMultiIds = null;
        this._noSelectionMsg.style.display = 'none';
        this._propsContainer.style.display = 'block';

        this._renderFieldsForElement(element);
        this.showLayerControls(id);
    }

    /**
     * Display shared properties for multi-selected elements.
     * @param {string[]} ids - Array of selected element IDs
     */
    showForMultiSelect(ids) {
        const elements = ids.map(id => this._registry.getElement(id)).filter(Boolean);
        if (elements.length === 0) {
            this.clear();
            return;
        }

        this._currentElementId = null;
        this._currentMultiIds = ids;
        this._noSelectionMsg.style.display = 'none';
        this._propsContainer.style.display = 'block';

        this._renderFieldsForMultiSelect(elements);
        // Disable layer controls for multi-select (show but disable)
        this.disableLayerControls();
    }

    /**
     * Clear the inspector (no selection).
     */
    clear() {
        this._currentElementId = null;
        this._currentMultiIds = null;
        this._noSelectionMsg.style.display = 'block';
        this._propsContainer.style.display = 'none';
        this._propsContainer.innerHTML = '';
        this.disableLayerControls();
    }

    /**
     * Update position fields live during drag (called by InteractionHandler).
     * @param {number} x - Current x position
     * @param {number} y - Current y position
     */
    updateLivePosition(x, y) {
        const xInput = this._propsContainer.querySelector('[data-prop="x"]');
        const yInput = this._propsContainer.querySelector('[data-prop="y"]');
        if (xInput) xInput.value = Math.round(x);
        if (yInput) yInput.value = Math.round(y);
    }

    /**
     * Update size fields live during resize (called by InteractionHandler).
     * @param {number} width - Current width
     * @param {number} height - Current height
     */
    updateLiveSize(width, height) {
        const wInput = this._propsContainer.querySelector('[data-prop="width"]');
        const hInput = this._propsContainer.querySelector('[data-prop="height"]');
        if (wInput) wInput.value = Math.round(width);
        if (hInput) hInput.value = Math.round(height);
    }

    // ─── Layer Controls ──────────────────────────────────────────────────

    /**
     * Enable layer controls and show z-index for a specific element.
     * @param {string} id - Element ID
     */
    showLayerControls(id) {
        const element = this._registry.getElement(id);
        if (!element) {
            this.disableLayerControls();
            return;
        }

        this._zIndexDisplay.textContent = String(element.zIndex);
        this._setLayerButtonsEnabled(true);
    }

    /**
     * Disable all layer controls (no element selected).
     */
    disableLayerControls() {
        this._zIndexDisplay.textContent = '—';
        this._setLayerButtonsEnabled(false);
    }

    /**
     * Enable or disable layer buttons.
     * @param {boolean} enabled
     * @private
     */
    _setLayerButtonsEnabled(enabled) {
        const buttons = [this._btnBringToFront, this._btnSendToBack, this._btnMoveForward, this._btnMoveBackward];
        for (const btn of buttons) {
            btn.disabled = !enabled;
            btn.style.opacity = enabled ? '1' : '0.4';
            btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
        }
    }

    /**
     * Handle a layer action button click.
     * @param {string} action - The registry method to call
     * @private
     */
    _handleLayerAction(action) {
        const id = this._currentElementId;
        if (!id) return;

        if (typeof this._registry[action] === 'function') {
            this._registry[action](id);
            // Update z-index display
            const element = this._registry.getElement(id);
            if (element) {
                this._zIndexDisplay.textContent = String(element.zIndex);
            }
        }
    }

    // ─── Field Rendering ─────────────────────────────────────────────────

    /**
     * Render editable fields for a single element based on its type.
     * @param {object} element - The element data
     * @private
     */
    _renderFieldsForElement(element) {
        this._propsContainer.innerHTML = '';

        // Type label
        const typeLabel = document.createElement('div');
        typeLabel.style.cssText = 'font-size: 0.7rem; color: #f59e0b; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem;';
        typeLabel.textContent = element.type + ' Element';
        this._propsContainer.appendChild(typeLabel);

        // Get field definitions based on element type
        const fields = this._getFieldsForType(element.type);

        for (const field of fields) {
            const fieldEl = this._createField(field, element);
            this._propsContainer.appendChild(fieldEl);
        }
    }

    /**
     * Render shared fields for multi-selected elements.
     * @param {object[]} elements - Array of selected elements
     * @private
     */
    _renderFieldsForMultiSelect(elements) {
        this._propsContainer.innerHTML = '';

        // Multi-select label
        const label = document.createElement('div');
        label.style.cssText = 'font-size: 0.7rem; color: #f59e0b; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem;';
        label.textContent = `${elements.length} Elements Selected`;
        this._propsContainer.appendChild(label);

        // Find shared properties across all selected element types
        const sharedFields = this._getSharedFields(elements);

        // Use first element values as display (mixed values show placeholder)
        for (const field of sharedFields) {
            const values = elements.map(el => el[field.prop]);
            const allSame = values.every(v => v === values[0]);
            const displayElement = { ...elements[0] };
            if (!allSame) {
                displayElement[field.prop] = '';
            }
            const fieldEl = this._createField(field, displayElement, !allSame);
            this._propsContainer.appendChild(fieldEl);
        }
    }

    /**
     * Get field definitions for a given element type.
     * @param {string} type - Element type ('icon', 'image', 'text')
     * @returns {Array<{prop: string, label: string, type: string, min?: number, max?: number, options?: string[]}>}
     * @private
     */
    _getFieldsForType(type) {
        const commonPosition = [
            { prop: 'x', label: 'X Position', type: 'number', min: 0, max: 5000 },
            { prop: 'y', label: 'Y Position', type: 'number', min: 0, max: 5000 }
        ];

        switch (type) {
            case 'icon':
                return [
                    { prop: 'width', label: 'Width', type: 'number', min: 16, max: 5000 },
                    { prop: 'height', label: 'Height', type: 'number', min: 16, max: 5000 },
                    ...commonPosition,
                    { prop: 'color', label: 'Color', type: 'color' },
                    { prop: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.1 }
                ];
            case 'image':
                return [
                    { prop: 'width', label: 'Width', type: 'number', min: 1, max: 5000 },
                    { prop: 'height', label: 'Height', type: 'number', min: 1, max: 5000 },
                    ...commonPosition,
                    { prop: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.1 },
                    { prop: 'maintainAspectRatio', label: 'Maintain Aspect Ratio', type: 'toggle' }
                ];
            case 'text':
                return [
                    { prop: 'fontSize', label: 'Font Size', type: 'number', min: 8, max: 128 },
                    { prop: 'fontWeight', label: 'Font Weight', type: 'select', options: ['normal', 'bold'] },
                    { prop: 'color', label: 'Color', type: 'color' },
                    ...commonPosition,
                    { prop: 'width', label: 'Width', type: 'number', min: 16, max: 5000 },
                    { prop: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.1 }
                ];
            default:
                return [...commonPosition];
        }
    }

    /**
     * Get fields shared across all element types in a multi-selection.
     * @param {object[]} elements - Array of selected elements
     * @returns {Array} Shared field definitions
     * @private
     */
    _getSharedFields(elements) {
        const types = [...new Set(elements.map(el => el.type))];

        if (types.length === 1) {
            // All same type — show all fields for that type
            return this._getFieldsForType(types[0]);
        }

        // Multiple types — show only shared properties
        // All element types share: x, y, width, height, opacity
        return [
            { prop: 'width', label: 'Width', type: 'number', min: 1, max: 5000 },
            { prop: 'height', label: 'Height', type: 'number', min: 1, max: 5000 },
            { prop: 'x', label: 'X Position', type: 'number', min: 0, max: 5000 },
            { prop: 'y', label: 'Y Position', type: 'number', min: 0, max: 5000 },
            { prop: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.1 }
        ];
    }

    // ─── Field Creation ──────────────────────────────────────────────────

    /**
     * Create a single editable field DOM element.
     * @param {object} fieldDef - Field definition
     * @param {object} element - Element data for current values
     * @param {boolean} [isMixed=false] - Whether the value is mixed across multi-select
     * @returns {HTMLElement}
     * @private
     */
    _createField(fieldDef, element, isMixed = false) {
        const container = document.createElement('div');
        container.className = 'pi-field';
        container.style.cssText = 'margin-bottom: 0.5rem;';

        const label = document.createElement('label');
        label.textContent = fieldDef.label;
        label.style.cssText = 'display: block; font-size: 0.7rem; color: #94a3b8; margin-bottom: 0.15rem;';
        container.appendChild(label);

        let input;

        switch (fieldDef.type) {
            case 'number':
                input = this._createNumberInput(fieldDef, element, isMixed);
                break;
            case 'color':
                input = this._createColorInput(fieldDef, element, isMixed);
                break;
            case 'toggle':
                input = this._createToggleInput(fieldDef, element);
                break;
            case 'select':
                input = this._createSelectInput(fieldDef, element);
                break;
            default:
                input = this._createNumberInput(fieldDef, element, isMixed);
        }

        container.appendChild(input);

        // Error message container
        const errorEl = document.createElement('div');
        errorEl.className = 'pi-field-error';
        errorEl.style.cssText = 'font-size: 0.65rem; color: #fca5a5; margin-top: 0.15rem; display: none;';
        errorEl.dataset.errorFor = fieldDef.prop;
        container.appendChild(errorEl);

        return container;
    }

    /**
     * Create a number input field.
     * @param {object} fieldDef - Field definition with min, max, step
     * @param {object} element - Element data
     * @param {boolean} isMixed - Whether value is mixed
     * @returns {HTMLElement}
     * @private
     */
    _createNumberInput(fieldDef, element, isMixed) {
        const input = document.createElement('input');
        input.type = 'number';
        input.dataset.prop = fieldDef.prop;
        input.style.cssText = 'width: 100%; padding: 0.3rem 0.4rem; border-radius: 4px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 0.8rem;';

        if (fieldDef.min !== undefined) input.min = fieldDef.min;
        if (fieldDef.max !== undefined) input.max = fieldDef.max;
        if (fieldDef.step !== undefined) input.step = fieldDef.step;

        if (isMixed) {
            input.placeholder = 'Mixed';
            input.value = '';
        } else {
            const val = element[fieldDef.prop];
            input.value = val !== undefined && val !== null ? val : '';
        }

        input.addEventListener('input', () => this._handleInputChange(fieldDef, input));
        input.addEventListener('change', () => this._handleInputChange(fieldDef, input));

        return input;
    }

    /**
     * Create a color input field (color picker + text input).
     * @param {object} fieldDef - Field definition
     * @param {object} element - Element data
     * @param {boolean} isMixed - Whether value is mixed
     * @returns {HTMLElement}
     * @private
     */
    _createColorInput(fieldDef, element, isMixed) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 0.4rem;';

        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.dataset.prop = fieldDef.prop;
        colorPicker.style.cssText = 'width: 32px; height: 26px; border: none; border-radius: 4px; cursor: pointer;';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.dataset.prop = fieldDef.prop;
        textInput.style.cssText = 'flex: 1; padding: 0.3rem 0.4rem; border-radius: 4px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 0.75rem; font-family: monospace;';

        const currentColor = element[fieldDef.prop] || '#000000';
        if (isMixed) {
            textInput.placeholder = 'Mixed';
            textInput.value = '';
            colorPicker.value = '#000000';
        } else {
            colorPicker.value = currentColor;
            textInput.value = currentColor;
        }

        colorPicker.addEventListener('input', () => {
            textInput.value = colorPicker.value;
            this._handleColorChange(fieldDef, colorPicker.value);
        });

        textInput.addEventListener('change', () => {
            const result = this._validateColor(textInput.value);
            if (result.valid) {
                colorPicker.value = result.value;
                this._handleColorChange(fieldDef, result.value);
                this._clearFieldError(fieldDef.prop);
            } else {
                this._showFieldError(fieldDef.prop, result.error);
            }
        });

        row.appendChild(colorPicker);
        row.appendChild(textInput);
        return row;
    }

    /**
     * Create a toggle (checkbox) input field.
     * @param {object} fieldDef - Field definition
     * @param {object} element - Element data
     * @returns {HTMLElement}
     * @private
     */
    _createToggleInput(fieldDef, element) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 0.5rem;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.prop = fieldDef.prop;
        checkbox.checked = !!element[fieldDef.prop];
        checkbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';

        const label = document.createElement('span');
        label.textContent = checkbox.checked ? 'On' : 'Off';
        label.style.cssText = 'font-size: 0.75rem; color: #cbd5e1;';

        checkbox.addEventListener('change', () => {
            label.textContent = checkbox.checked ? 'On' : 'Off';
            this._applyPropertyChange(fieldDef.prop, checkbox.checked);
        });

        row.appendChild(checkbox);
        row.appendChild(label);
        return row;
    }

    /**
     * Create a select dropdown input field.
     * @param {object} fieldDef - Field definition with options array
     * @param {object} element - Element data
     * @returns {HTMLElement}
     * @private
     */
    _createSelectInput(fieldDef, element) {
        const select = document.createElement('select');
        select.dataset.prop = fieldDef.prop;
        select.style.cssText = 'width: 100%; padding: 0.3rem 0.4rem; border-radius: 4px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 0.8rem;';

        for (const option of (fieldDef.options || [])) {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option.charAt(0).toUpperCase() + option.slice(1);
            if (element[fieldDef.prop] === option) opt.selected = true;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => {
            this._applyPropertyChange(fieldDef.prop, select.value);
        });

        return select;
    }

    // ─── Input Handling & Validation ─────────────────────────────────────

    /**
     * Handle a numeric input change with validation.
     * @param {object} fieldDef - Field definition
     * @param {HTMLInputElement} input - The input element
     * @private
     */
    _handleInputChange(fieldDef, input) {
        const rawValue = input.value;

        // Empty value — don't apply
        if (rawValue === '' || rawValue === null) return;

        const result = this._validateNumericValue(rawValue, fieldDef.min, fieldDef.max);

        if (!result.valid) {
            this._showFieldError(fieldDef.prop, result.error);
            input.style.borderColor = '#ef4444';
            return;
        }

        // Clear error state
        this._clearFieldError(fieldDef.prop);
        input.style.borderColor = '#334155';

        // Apply the validated (possibly clamped) value
        this._applyPropertyChange(fieldDef.prop, result.value);
    }

    /**
     * Handle a color input change.
     * @param {object} fieldDef - Field definition
     * @param {string} value - The color value
     * @private
     */
    _handleColorChange(fieldDef, value) {
        this._clearFieldError(fieldDef.prop);
        this._applyPropertyChange(fieldDef.prop, value);
    }

    /**
     * Validate a numeric value against min/max constraints.
     * @param {*} value - The value to validate
     * @param {number} min - Minimum allowed
     * @param {number} max - Maximum allowed
     * @returns {{ valid: boolean, value: number|null, error: string|null }}
     * @private
     */
    _validateNumericValue(value, min, max) {
        // Use validators.js if available
        const validateDimension = _getValidator('validateDimension');
        if (validateDimension && min !== undefined && max !== undefined) {
            return validateDimension(value, min, max);
        }

        // Fallback validation
        const num = Number(value);
        if (isNaN(num) || !isFinite(num)) {
            return { valid: false, value: null, error: `Value must be a number between ${min} and ${max}` };
        }
        if (min !== undefined && num < min) {
            return { valid: false, value: null, error: `Value must be at least ${min}` };
        }
        if (max !== undefined && num > max) {
            return { valid: false, value: null, error: `Value must be at most ${max}` };
        }
        return { valid: true, value: num, error: null };
    }

    /**
     * Validate a color value.
     * @param {string} value - The color string
     * @returns {{ valid: boolean, value: string|null, error: string|null }}
     * @private
     */
    _validateColor(value) {
        const validateColor = _getValidator('validateColor');
        if (validateColor) {
            return validateColor(value);
        }
        // Fallback: accept any non-empty string
        if (!value || value.trim() === '') {
            return { valid: false, value: null, error: 'Color must be a non-empty string' };
        }
        return { valid: true, value: value.trim(), error: null };
    }

    // ─── Property Application ────────────────────────────────────────────

    /**
     * Apply a property change to the Element Registry within 100ms.
     * Uses debouncing to batch rapid changes.
     * @param {string} prop - Property name
     * @param {*} value - New value
     * @private
     */
    _applyPropertyChange(prop, value) {
        // Clear any pending update timer
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
        }

        // Apply immediately (within 100ms requirement)
        this._updateTimer = setTimeout(() => {
            if (this._currentElementId) {
                // Single element update
                this._registry.updateElement(this._currentElementId, { [prop]: value });
            } else if (this._currentMultiIds) {
                // Multi-select: apply to all selected elements
                for (const id of this._currentMultiIds) {
                    this._registry.updateElement(id, { [prop]: value });
                }
            }
            this._updateTimer = null;
        }, 0); // Apply on next tick (well within 100ms)
    }

    // ─── Error Display ───────────────────────────────────────────────────

    /**
     * Show an inline error message for a field.
     * @param {string} prop - Property name
     * @param {string} message - Error message
     * @private
     */
    _showFieldError(prop, message) {
        const errorEl = this._propsContainer.querySelector(`[data-error-for="${prop}"]`);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    /**
     * Clear the inline error message for a field.
     * @param {string} prop - Property name
     * @private
     */
    _clearFieldError(prop) {
        const errorEl = this._propsContainer.querySelector(`[data-error-for="${prop}"]`);
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PropertiesInspector };
}
