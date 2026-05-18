/**
 * Persistence - Client-side save/load/export/reset for the UI Editor.
 *
 * Integrates with the existing ui-editor.html save/export/reset buttons to
 * persist element registry data alongside theme configuration via the
 * PUT/GET /theme endpoint.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
class Persistence {
    /**
     * @param {object} options
     * @param {object} options.registry - An ElementRegistry instance
     * @param {object} options.canvas - A CanvasRenderer instance (for renderAll after load)
     * @param {string} [options.apiBase] - Base URL for the API (default: 'http://127.0.0.1:8000')
     * @param {function} [options.showStatus] - Function to display status messages: showStatus(msg, type)
     * @param {function} [options.gatherTheme] - Function that gathers current theme data from the editor form
     * @param {function} [options.applyToEditor] - Function that applies theme data to the editor form inputs
     * @param {function} [options.getDefaults] - Function that returns default theme data
     */
    constructor(options) {
        if (!options || !options.registry) {
            throw new Error('Persistence requires an ElementRegistry instance');
        }

        /** @type {object} */
        this._registry = options.registry;
        /** @type {object|null} */
        this._canvas = options.canvas || null;
        /** @type {string} */
        this._apiBase = options.apiBase || 'http://127.0.0.1:8000';
        /** @type {function|null} */
        this._showStatus = options.showStatus || null;
        /** @type {function|null} */
        this._gatherTheme = options.gatherTheme || null;
        /** @type {function|null} */
        this._applyToEditor = options.applyToEditor || null;
        /** @type {function|null} */
        this._getDefaults = options.getDefaults || null;
    }

    // ─── Save ────────────────────────────────────────────────────────────

    /**
     * Save element registry data alongside theme to PUT /theme.
     * Shows a success message within 3 seconds on success.
     * Shows an error toast on failure and retains local state.
     *
     * Requirements: 7.1, 7.2
     * @returns {Promise<boolean>} True if save succeeded, false otherwise
     */
    async save() {
        const theme = this._gatherTheme ? this._gatherTheme() : {};
        const elements = this._registry.serialize();
        const payload = { ...theme, elements };

        try {
            const response = await fetch(`${this._apiBase}/theme`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                this._displayStatus('✓ Saved! Changes are live.', 'success');
                return true;
            } else {
                this._displayStatus('✗ Save failed — changes preserved locally', 'error');
                return false;
            }
        } catch (e) {
            this._displayStatus('✗ Could not connect — changes preserved locally', 'error');
            return false;
        }
    }

    // ─── Load ────────────────────────────────────────────────────────────

    /**
     * Load theme and element data from GET /theme on editor startup.
     * Deserializes elements into the registry and renders them on the canvas.
     * If no saved data exists, displays an empty canvas.
     * If load fails, starts with empty canvas and shows a warning.
     *
     * Requirements: 7.3
     * @returns {Promise<boolean>} True if load succeeded, false otherwise
     */
    async load() {
        try {
            const response = await fetch(`${this._apiBase}/theme`);

            if (!response.ok) {
                this._displayStatus('⚠ Could not load previous data', 'error');
                return false;
            }

            const data = await response.json();

            // Apply theme data to the editor form (if handler provided)
            if (this._applyToEditor) {
                this._applyToEditor(data);
            }

            // Deserialize elements into the registry
            const elements = Array.isArray(data.elements) ? data.elements : [];
            this._registry.deserialize(elements);

            // Render all elements on the canvas
            if (this._canvas && typeof this._canvas.renderAll === 'function') {
                this._canvas.renderAll();
            }

            return true;
        } catch (e) {
            // Start with empty canvas on load failure
            this._registry.deserialize([]);
            if (this._canvas && typeof this._canvas.renderAll === 'function') {
                this._canvas.renderAll();
            }
            return false;
        }
    }

    // ─── Export ──────────────────────────────────────────────────────────

    /**
     * Export theme JSON including elements data.
     * Copies the full JSON (theme + elements) to the clipboard.
     *
     * Requirements: 7.4
     * @returns {object} The exported JSON object (theme + elements)
     */
    exportJSON() {
        const theme = this._gatherTheme ? this._gatherTheme() : {};
        const elements = this._registry.serialize();
        const exportData = { ...theme, elements };

        // Attempt to copy to clipboard
        const jsonString = JSON.stringify(exportData, null, 2);
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(jsonString).then(() => {
                this._displayStatus('✓ Copied to clipboard', 'success');
            }).catch(() => {
                this._displayStatus('✓ Export ready (clipboard unavailable)', 'success');
            });
        } else {
            this._displayStatus('✓ Export ready', 'success');
        }

        return exportData;
    }

    // ─── Reset ───────────────────────────────────────────────────────────

    /**
     * Reset to defaults with a confirmation prompt.
     * On confirm: clears all elements from the canvas and registry.
     * On cancel: preserves current state (no action taken).
     *
     * Requirements: 7.5, 7.6
     * @param {function} [confirmFn] - Custom confirm function (defaults to window.confirm)
     * @returns {boolean} True if reset was performed, false if cancelled
     */
    reset(confirmFn) {
        const confirm = confirmFn || (typeof window !== 'undefined' ? window.confirm.bind(window) : () => false);

        const confirmed = confirm('Reset to defaults? This will remove all elements and restore the default theme.');

        if (!confirmed) {
            // User cancelled — preserve current state
            return false;
        }

        // Clear all elements from the registry
        this._registry.deserialize([]);

        // Apply default theme to editor form (if handlers provided)
        if (this._getDefaults && this._applyToEditor) {
            const defaults = this._getDefaults();
            this._applyToEditor(defaults);
        }

        // Re-render the canvas (now empty)
        if (this._canvas && typeof this._canvas.renderAll === 'function') {
            this._canvas.renderAll();
        }

        this._displayStatus('✓ Reset to defaults', 'success');
        return true;
    }

    // ─── Private Helpers ─────────────────────────────────────────────────

    /**
     * Display a status message using the provided showStatus callback.
     * Messages auto-dismiss within 3 seconds (handled by the showStatus implementation).
     * @param {string} msg - The message to display
     * @param {string} type - 'success' or 'error'
     * @private
     */
    _displayStatus(msg, type) {
        if (this._showStatus && typeof this._showStatus === 'function') {
            this._showStatus(msg, type);
        }
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Persistence };
}
