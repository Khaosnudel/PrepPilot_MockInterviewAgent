/**
 * GridOverlay — Renders a configurable grid overlay on the canvas.
 *
 * Provides show/hide/update functionality for evenly-spaced grid lines
 * rendered on the editor's overlay element. Used for visual alignment
 * and snap-to-grid positioning.
 *
 * Requirements: 8.1, 8.4, 8.5
 */

const DEFAULT_GRID_SPACING = 16;
const MIN_GRID_SPACING = 4;
const MAX_GRID_SPACING = 128;

/**
 * GridOverlay class manages the rendering of grid lines on a container element.
 */
class GridOverlay {
    /**
     * @param {HTMLElement} containerElement - The overlay container to render grid lines into
     */
    constructor(containerElement) {
        if (!containerElement) {
            throw new Error('GridOverlay requires a container element');
        }

        /** @type {HTMLElement} */
        this._container = containerElement;

        /** @type {number} */
        this._spacing = DEFAULT_GRID_SPACING;

        /** @type {boolean} */
        this._visible = false;

        /** @type {HTMLElement|null} */
        this._gridElement = null;
    }

    /**
     * Shows the grid overlay with the specified spacing.
     * If the grid is already visible, it re-renders with the new spacing.
     *
     * @param {number} [spacing] - Grid line spacing in pixels (4–128, default 16)
     */
    showGrid(spacing) {
        const resolvedSpacing = typeof spacing === 'number' ? spacing : this._spacing;
        const clampedSpacing = this._clampSpacing(resolvedSpacing);

        this._spacing = clampedSpacing;
        this._visible = true;
        this._render();
    }

    /**
     * Hides the grid overlay and removes the grid element from the DOM.
     */
    hideGrid() {
        this._visible = false;
        this._removeGridElement();
    }

    /**
     * Updates the grid spacing and re-renders if the grid is currently visible.
     * Does not change element positions (Requirement 8.4).
     *
     * @param {number} spacing - New grid spacing in pixels (4–128)
     */
    updateGridSpacing(spacing) {
        const clampedSpacing = this._clampSpacing(spacing);
        this._spacing = clampedSpacing;

        if (this._visible) {
            this._render();
        }
    }

    /**
     * Returns the current grid spacing value.
     * @returns {number}
     */
    getSpacing() {
        return this._spacing;
    }

    /**
     * Returns whether the grid is currently visible.
     * @returns {boolean}
     */
    isVisible() {
        return this._visible;
    }

    // ─── Private Methods ─────────────────────────────────────────────────

    /**
     * Clamps spacing to the valid range [4, 128] and ensures it's an integer.
     * @param {number} spacing
     * @returns {number}
     */
    _clampSpacing(spacing) {
        const intSpacing = Math.round(spacing);
        return Math.max(MIN_GRID_SPACING, Math.min(intSpacing, MAX_GRID_SPACING));
    }

    /**
     * Removes the grid element from the DOM if it exists.
     */
    _removeGridElement() {
        if (this._gridElement && this._gridElement.parentNode) {
            this._gridElement.parentNode.removeChild(this._gridElement);
        }
        this._gridElement = null;
    }

    /**
     * Renders the grid lines into the container using a dedicated grid element.
     * Uses CSS background with repeating linear gradients for efficient rendering.
     */
    _render() {
        this._removeGridElement();

        const gridEl = document.createElement('div');
        gridEl.className = 'ui-editor-grid-overlay';
        gridEl.setAttribute('data-grid-spacing', this._spacing);

        // Position the grid element to fill the container
        gridEl.style.position = 'absolute';
        gridEl.style.top = '0';
        gridEl.style.left = '0';
        gridEl.style.width = '100%';
        gridEl.style.height = '100%';
        gridEl.style.pointerEvents = 'none';
        gridEl.style.zIndex = '0'; // Behind elements but visible on overlay

        // Use CSS repeating linear gradients for grid lines
        // This is performant and scales well with any container size
        const lineColor = 'rgba(128, 128, 128, 0.3)';
        const lineWidth = 1;
        const spacing = this._spacing;

        gridEl.style.backgroundImage = [
            `repeating-linear-gradient(to right, ${lineColor} 0px, ${lineColor} ${lineWidth}px, transparent ${lineWidth}px, transparent ${spacing}px)`,
            `repeating-linear-gradient(to bottom, ${lineColor} 0px, ${lineColor} ${lineWidth}px, transparent ${lineWidth}px, transparent ${spacing}px)`
        ].join(', ');
        gridEl.style.backgroundSize = `${spacing}px ${spacing}px`;

        this._container.appendChild(gridEl);
        this._gridElement = gridEl;
    }
}

// Export for Node.js testing (fast-check) while remaining usable in browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GridOverlay,
        DEFAULT_GRID_SPACING,
        MIN_GRID_SPACING,
        MAX_GRID_SPACING
    };
}
