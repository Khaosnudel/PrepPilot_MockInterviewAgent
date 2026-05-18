/**
 * InteractionHandler - Manages mouse events for element selection, drag, and resize.
 *
 * Attaches mouse event listeners to the canvas overlay element and delegates
 * to the appropriate handler based on event type and target. Uses event delegation
 * to detect which element was clicked by checking `data-element-id` attributes
 * on DOM nodes.
 *
 * Requirements: 3.1, 3.7, 5.1, 5.2, 5.3, 5.4
 */
class InteractionHandler {
    /**
     * @param {object} canvas - A CanvasRenderer instance
     * @param {object} registry - An ElementRegistry instance
     */
    constructor(canvas, registry) {
        /** @type {object} */
        this._canvas = canvas;
        /** @type {object} */
        this._registry = registry;

        /** @type {HTMLElement|null} */
        this._overlay = canvas._overlay || null;

        // Drag state
        /** @type {boolean} */
        this._isDragging = false;
        /** @type {string|null} */
        this._dragElementId = null;
        /** @type {{x: number, y: number}|null} */
        this._dragStartMouse = null;
        /** @type {{x: number, y: number}|null} */
        this._dragStartPos = null;
        /** @type {Map<string, {x: number, y: number}>|null} */
        this._dragGroupStartPositions = null;

        // Resize state
        /** @type {boolean} */
        this._isResizing = false;
        /** @type {string|null} */
        this._resizeElementId = null;
        /** @type {string|null} */
        this._resizeHandle = null;
        /** @type {{x: number, y: number}|null} */
        this._resizeStartMouse = null;
        /** @type {{width: number, height: number, x: number, y: number}|null} */
        this._resizeStartDims = null;

        // Grid snap state
        /** @type {boolean} */
        this._snapEnabled = false;
        /** @type {number} */
        this._gridSpacing = 16;

        // Animation frame tracking
        /** @type {number|null} */
        this._animFrameId = null;

        // Bind event handlers to preserve `this` context
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onClick = this._onClick.bind(this);

        // Attach listeners if overlay is available
        if (this._overlay) {
            this._attachListeners();
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /**
     * Handle a click event for element selection.
     * Plain click selects one element and deselects all others.
     * Click on empty area deselects all.
     *
     * @param {MouseEvent} event - The click event
     */
    handleClick(event) {
        const elementId = this._getElementIdFromEvent(event);

        if (elementId) {
            // Plain click on an element: select it, deselect others
            this._registry.selectElement(elementId);
            this._showHandlesForSelection();
        } else {
            // Click on empty area: deselect all
            this._registry.clearSelection();
            this._hideHandles();
        }
    }

    /**
     * Handle a shift-click event for multi-select toggle.
     * Shift+click on unselected element adds it to selection.
     * Shift+click on selected element removes it from selection.
     *
     * @param {MouseEvent} event - The click event with shift key held
     */
    handleShiftClick(event) {
        const elementId = this._getElementIdFromEvent(event);

        if (!elementId) {
            // Shift+click on empty area: no action (preserve current selection)
            return;
        }

        const selectedIds = this._registry.getSelectedIds();
        const isSelected = selectedIds.includes(elementId);

        if (isSelected) {
            // Remove from selection
            this._registry.removeFromSelection(elementId);
        } else {
            // Add to selection
            this._registry.addToSelection(elementId);
        }

        this._showHandlesForSelection();
    }

    /**
     * Enable or disable grid snapping.
     * @param {boolean} enabled - Whether snap is enabled
     */
    setSnapEnabled(enabled) {
        this._snapEnabled = !!enabled;
    }

    /**
     * Set the grid spacing for snap operations.
     * @param {number} spacing - Grid spacing in pixels
     */
    setGridSpacing(spacing) {
        if (typeof spacing === 'number' && spacing >= 4 && spacing <= 128) {
            this._gridSpacing = spacing;
        }
    }

    /**
     * Snap a value to the nearest grid increment.
     * @param {number} value - The value to snap
     * @returns {number} The snapped value
     */
    snapToGrid(value) {
        if (!this._snapEnabled || this._gridSpacing <= 0) {
            return value;
        }
        return Math.round(value / this._gridSpacing) * this._gridSpacing;
    }

    /**
     * Destroy the handler and remove all event listeners.
     */
    destroy() {
        if (this._overlay) {
            this._detachListeners();
        }
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }
    }

    // ─── Event Listener Management ───────────────────────────────────────

    /**
     * Attach mouse event listeners to the canvas overlay.
     * @private
     */
    _attachListeners() {
        this._overlay.addEventListener('click', this._onClick);
        this._overlay.addEventListener('mousedown', this._onMouseDown);
        // mousemove and mouseup are attached to document to handle
        // cases where the mouse leaves the overlay during drag/resize
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    /**
     * Detach all mouse event listeners.
     * @private
     */
    _detachListeners() {
        this._overlay.removeEventListener('click', this._onClick);
        this._overlay.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
    }

    // ─── Event Handlers ──────────────────────────────────────────────────

    /**
     * Handle click events on the overlay.
     * Delegates to handleClick or handleShiftClick based on shift key state.
     * Suppressed if a drag/resize operation just completed.
     * @param {MouseEvent} event
     * @private
     */
    _onClick(event) {
        // If a drag or resize just ended, suppress the click
        if (this._suppressClick) {
            this._suppressClick = false;
            return;
        }

        if (event.shiftKey) {
            this.handleShiftClick(event);
        } else {
            this.handleClick(event);
        }
    }

    /**
     * Handle mousedown events on the overlay.
     * Initiates drag or resize depending on the target.
     * @param {MouseEvent} event
     * @private
     */
    _onMouseDown(event) {
        // Check if the target is a resize handle
        const resizeHandle = this._getResizeHandleFromEvent(event);
        if (resizeHandle) {
            const elementId = this._getResizeElementId(event);
            if (elementId) {
                this._startResize(elementId, resizeHandle, event);
                event.preventDefault();
                return;
            }
        }

        // Check if the target is an element (for drag)
        const elementId = this._getElementIdFromEvent(event);
        if (elementId) {
            // Only start drag if element is selected or will be selected
            const selectedIds = this._registry.getSelectedIds();
            if (!selectedIds.includes(elementId) && !event.shiftKey) {
                // Select the element first (will happen on click)
                this._registry.selectElement(elementId);
                this._showHandlesForSelection();
            }
            this._startDrag(elementId, event);
            event.preventDefault();
        }
    }

    /**
     * Handle mousemove events (attached to document for drag/resize tracking).
     * @param {MouseEvent} event
     * @private
     */
    _onMouseMove(event) {
        if (this._isDragging) {
            this._onDragMove(event);
        } else if (this._isResizing) {
            this._onResizeMove(event);
        }
    }

    /**
     * Handle mouseup events (attached to document for drag/resize completion).
     * @param {MouseEvent} event
     * @private
     */
    _onMouseUp(event) {
        if (this._isDragging) {
            this._endDrag(event);
        } else if (this._isResizing) {
            this._endResize(event);
        }
    }

    // ─── Drag Operations ─────────────────────────────────────────────────

    /**
     * Start a drag operation for an element.
     * @param {string} elementId - The element being dragged
     * @param {MouseEvent} event - The initiating mousedown event
     * @private
     */
    _startDrag(elementId, event) {
        const element = this._registry.getElement(elementId);
        if (!element) return;

        this._isDragging = true;
        this._dragElementId = elementId;
        this._dragStartMouse = { x: event.clientX, y: event.clientY };
        this._dragStartPos = { x: element.x, y: element.y };

        // For multi-select group drag, capture all selected element positions
        const selectedIds = this._registry.getSelectedIds();
        if (selectedIds.length > 1 && selectedIds.includes(elementId)) {
            this._dragGroupStartPositions = new Map();
            for (const id of selectedIds) {
                const el = this._registry.getElement(id);
                if (el) {
                    this._dragGroupStartPositions.set(id, { x: el.x, y: el.y });
                }
            }
        } else {
            this._dragGroupStartPositions = null;
        }
    }

    /**
     * Handle mouse movement during a drag operation.
     * Updates element position on each animation frame.
     * @param {MouseEvent} event
     * @private
     */
    _onDragMove(event) {
        if (!this._isDragging) return;

        // Use requestAnimationFrame for smooth updates
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
        }

        this._animFrameId = requestAnimationFrame(() => {
            const dx = event.clientX - this._dragStartMouse.x;
            const dy = event.clientY - this._dragStartMouse.y;

            if (this._dragGroupStartPositions) {
                // Multi-select group drag
                this._updateGroupDragPositions(dx, dy);
            } else {
                // Single element drag
                this._updateSingleDragPosition(dx, dy);
            }

            this._animFrameId = null;
        });
    }

    /**
     * Update position for a single element during drag.
     * @param {number} dx - Mouse delta X
     * @param {number} dy - Mouse delta Y
     * @private
     */
    _updateSingleDragPosition(dx, dy) {
        const newPos = {
            x: this._dragStartPos.x + dx,
            y: this._dragStartPos.y + dy
        };

        // Clamp to canvas bounds
        const element = this._registry.getElement(this._dragElementId);
        if (element) {
            const bounds = this._canvas.getCanvasBounds();
            const clamped = this._clampPosition(
                newPos.x, newPos.y,
                element.width, element.height,
                bounds.width, bounds.height
            );
            this._registry.updateElement(this._dragElementId, { x: clamped.x, y: clamped.y });
            this._canvas.renderElement(this._dragElementId);
        }
    }

    /**
     * Update positions for all elements in a group drag.
     * @param {number} dx - Mouse delta X
     * @param {number} dy - Mouse delta Y
     * @private
     */
    _updateGroupDragPositions(dx, dy) {
        const bounds = this._canvas.getCanvasBounds();

        for (const [id, startPos] of this._dragGroupStartPositions) {
            const element = this._registry.getElement(id);
            if (element) {
                const newPos = {
                    x: startPos.x + dx,
                    y: startPos.y + dy
                };
                const clamped = this._clampPosition(
                    newPos.x, newPos.y,
                    element.width, element.height,
                    bounds.width, bounds.height
                );
                this._registry.updateElement(id, { x: clamped.x, y: clamped.y });
                this._canvas.renderElement(id);
            }
        }
    }

    /**
     * End a drag operation and finalize position.
     * @param {MouseEvent} event
     * @private
     */
    _endDrag(event) {
        if (!this._isDragging) return;

        const dx = event.clientX - this._dragStartMouse.x;
        const dy = event.clientY - this._dragStartMouse.y;

        // Only suppress click if there was actual movement
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            this._suppressClick = true;

            // Apply grid snap on release if enabled
            if (this._snapEnabled) {
                if (this._dragGroupStartPositions) {
                    for (const [id] of this._dragGroupStartPositions) {
                        const el = this._registry.getElement(id);
                        if (el) {
                            const snappedX = this.snapToGrid(el.x);
                            const snappedY = this.snapToGrid(el.y);
                            this._registry.updateElement(id, { x: snappedX, y: snappedY });
                            this._canvas.renderElement(id);
                        }
                    }
                } else {
                    const el = this._registry.getElement(this._dragElementId);
                    if (el) {
                        const snappedX = this.snapToGrid(el.x);
                        const snappedY = this.snapToGrid(el.y);
                        this._registry.updateElement(this._dragElementId, { x: snappedX, y: snappedY });
                        this._canvas.renderElement(this._dragElementId);
                    }
                }
            }
        }

        // Reset drag state
        this._isDragging = false;
        this._dragElementId = null;
        this._dragStartMouse = null;
        this._dragStartPos = null;
        this._dragGroupStartPositions = null;

        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }
    }

    // ─── Resize Operations ───────────────────────────────────────────────

    /**
     * Start a resize operation.
     * @param {string} elementId - The element being resized
     * @param {string} handle - The resize handle identifier (nw, ne, sw, se, n, s, e, w)
     * @param {MouseEvent} event - The initiating mousedown event
     * @private
     */
    _startResize(elementId, handle, event) {
        const element = this._registry.getElement(elementId);
        if (!element) return;

        this._isResizing = true;
        this._resizeElementId = elementId;
        this._resizeHandle = handle;
        this._resizeStartMouse = { x: event.clientX, y: event.clientY };
        this._resizeStartDims = {
            width: element.width,
            height: element.height,
            x: element.x,
            y: element.y
        };
    }

    /**
     * Handle mouse movement during a resize operation.
     * @param {MouseEvent} event
     * @private
     */
    _onResizeMove(event) {
        if (!this._isResizing) return;

        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
        }

        this._animFrameId = requestAnimationFrame(() => {
            const dx = event.clientX - this._resizeStartMouse.x;
            const dy = event.clientY - this._resizeStartMouse.y;
            const bounds = this._canvas.getCanvasBounds();

            const minSize = { width: 16, height: 16 };
            const maxSize = { width: bounds.width, height: bounds.height };
            const dragDelta = { dx, dy };

            let result;
            const cornerHandles = ['nw', 'ne', 'sw', 'se'];
            const edgeHandles = ['n', 's', 'e', 'w'];

            if (cornerHandles.includes(this._resizeHandle)) {
                // Use geometry module if available, otherwise inline
                if (typeof computeCornerResize === 'function') {
                    result = computeCornerResize(this._resizeStartDims, dragDelta, this._resizeHandle, minSize, maxSize);
                } else {
                    result = this._computeCornerResize(this._resizeStartDims, dragDelta, this._resizeHandle, minSize, maxSize);
                }
            } else if (edgeHandles.includes(this._resizeHandle)) {
                if (typeof computeEdgeResize === 'function') {
                    result = computeEdgeResize(this._resizeStartDims, dragDelta, this._resizeHandle, minSize, maxSize);
                } else {
                    result = this._computeEdgeResize(this._resizeStartDims, dragDelta, this._resizeHandle, minSize, maxSize);
                }
            }

            if (result) {
                this._registry.updateElement(this._resizeElementId, {
                    width: result.width,
                    height: result.height,
                    x: result.x,
                    y: result.y
                });
                this._canvas.renderElement(this._resizeElementId);
            }

            this._animFrameId = null;
        });
    }

    /**
     * End a resize operation and finalize dimensions.
     * @param {MouseEvent} event
     * @private
     */
    _endResize(event) {
        if (!this._isResizing) return;

        this._suppressClick = true;

        // Apply grid snap on release if enabled
        if (this._snapEnabled) {
            const el = this._registry.getElement(this._resizeElementId);
            if (el) {
                const snappedWidth = Math.max(this._gridSpacing, this.snapToGrid(el.width));
                const snappedHeight = Math.max(this._gridSpacing, this.snapToGrid(el.height));
                this._registry.updateElement(this._resizeElementId, {
                    width: snappedWidth,
                    height: snappedHeight
                });
                this._canvas.renderElement(this._resizeElementId);
            }
        }

        // Reset resize state
        this._isResizing = false;
        this._resizeElementId = null;
        this._resizeHandle = null;
        this._resizeStartMouse = null;
        this._resizeStartDims = null;

        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }
    }

    // ─── Helper Methods ──────────────────────────────────────────────────

    /**
     * Get the element ID from a mouse event by traversing up the DOM tree
     * looking for a `data-element-id` attribute.
     * @param {MouseEvent} event - The mouse event
     * @returns {string|null} The element ID or null if click was on empty area
     * @private
     */
    _getElementIdFromEvent(event) {
        let target = event.target;

        // Walk up the DOM tree looking for data-element-id
        while (target && target !== this._overlay) {
            if (target.dataset && target.dataset.elementId) {
                return target.dataset.elementId;
            }
            target = target.parentElement;
        }

        return null;
    }

    /**
     * Get the resize handle identifier from a mouse event.
     * Looks for a `data-resize-handle` attribute on the target.
     * @param {MouseEvent} event - The mouse event
     * @returns {string|null} The handle identifier or null
     * @private
     */
    _getResizeHandleFromEvent(event) {
        let target = event.target;

        while (target && target !== this._overlay) {
            if (target.dataset && target.dataset.resizeHandle) {
                return target.dataset.resizeHandle;
            }
            target = target.parentElement;
        }

        return null;
    }

    /**
     * Get the element ID associated with a resize handle event.
     * @param {MouseEvent} event - The mouse event
     * @returns {string|null} The element ID or null
     * @private
     */
    _getResizeElementId(event) {
        let target = event.target;

        while (target && target !== this._overlay) {
            if (target.dataset && target.dataset.resizeHandle) {
                // The resize handle should be inside or associated with an element
                // Look for data-element-id on the same node or parent
                if (target.dataset.elementId) {
                    return target.dataset.elementId;
                }
                // Check parent for element ID
                let parent = target.parentElement;
                while (parent && parent !== this._overlay) {
                    if (parent.dataset && parent.dataset.elementId) {
                        return parent.dataset.elementId;
                    }
                    parent = parent.parentElement;
                }
            }
            target = target.parentElement;
        }

        return null;
    }

    /**
     * Show selection handles for the current selection.
     * Delegates to CanvasRenderer if showHandles/showMultiSelectBoundingBox are available.
     * @private
     */
    _showHandlesForSelection() {
        const selectedIds = this._registry.getSelectedIds();

        if (selectedIds.length === 0) {
            this._hideHandles();
            return;
        }

        if (selectedIds.length > 1) {
            // Multi-select: show combined bounding box
            if (typeof this._canvas.showMultiSelectBoundingBox === 'function') {
                this._canvas.showMultiSelectBoundingBox(selectedIds);
            }
        } else {
            // Single select: show individual handles
            if (typeof this._canvas.showHandles === 'function') {
                this._canvas.showHandles(selectedIds);
            }
        }
    }

    /**
     * Hide all selection handles.
     * @private
     */
    _hideHandles() {
        if (typeof this._canvas.hideHandles === 'function') {
            this._canvas.hideHandles();
        }
    }

    /**
     * Clamp a position to keep an element within canvas bounds.
     * @param {number} x - Desired x position
     * @param {number} y - Desired y position
     * @param {number} width - Element width
     * @param {number} height - Element height
     * @param {number} canvasWidth - Canvas width
     * @param {number} canvasHeight - Canvas height
     * @returns {{x: number, y: number}} Clamped position
     * @private
     */
    _clampPosition(x, y, width, height, canvasWidth, canvasHeight) {
        // Use geometry module if available
        if (typeof clampPosition === 'function') {
            return clampPosition(x, y, width, height, canvasWidth, canvasHeight);
        }
        // Inline fallback
        const maxX = canvasWidth - width;
        const maxY = canvasHeight - height;
        return {
            x: Math.max(0, Math.min(x, maxX)),
            y: Math.max(0, Math.min(y, maxY))
        };
    }

    /**
     * Inline fallback for corner resize computation.
     * @private
     */
    _computeCornerResize(initialDims, dragDelta, handle, minSize, maxSize) {
        const aspectRatio = initialDims.width / initialDims.height;
        let newWidth, newHeight, newX, newY;

        switch (handle) {
            case 'se':
                newWidth = initialDims.width + dragDelta.dx;
                newHeight = newWidth / aspectRatio;
                newX = initialDims.x;
                newY = initialDims.y;
                break;
            case 'sw':
                newWidth = initialDims.width - dragDelta.dx;
                newHeight = newWidth / aspectRatio;
                newX = initialDims.x + (initialDims.width - newWidth);
                newY = initialDims.y;
                break;
            case 'ne':
                newWidth = initialDims.width + dragDelta.dx;
                newHeight = newWidth / aspectRatio;
                newX = initialDims.x;
                newY = initialDims.y + (initialDims.height - newHeight);
                break;
            case 'nw':
                newWidth = initialDims.width - dragDelta.dx;
                newHeight = newWidth / aspectRatio;
                newX = initialDims.x + (initialDims.width - newWidth);
                newY = initialDims.y + (initialDims.height - newHeight);
                break;
            default:
                return { ...initialDims };
        }

        const clampedWidth = Math.max(minSize.width, Math.min(newWidth, maxSize.width));
        const clampedHeight = Math.max(minSize.height, Math.min(newHeight, maxSize.height));

        let finalWidth, finalHeight;
        if (clampedWidth / clampedHeight > aspectRatio) {
            finalHeight = clampedHeight;
            finalWidth = finalHeight * aspectRatio;
        } else {
            finalWidth = clampedWidth;
            finalHeight = finalWidth / aspectRatio;
        }

        finalWidth = Math.max(minSize.width, finalWidth);
        finalHeight = Math.max(minSize.height, finalHeight);

        let finalX, finalY;
        switch (handle) {
            case 'se': finalX = initialDims.x; finalY = initialDims.y; break;
            case 'sw': finalX = initialDims.x + initialDims.width - finalWidth; finalY = initialDims.y; break;
            case 'ne': finalX = initialDims.x; finalY = initialDims.y + initialDims.height - finalHeight; break;
            case 'nw': finalX = initialDims.x + initialDims.width - finalWidth; finalY = initialDims.y + initialDims.height - finalHeight; break;
            default: finalX = initialDims.x; finalY = initialDims.y;
        }

        return { width: finalWidth, height: finalHeight, x: finalX, y: finalY };
    }

    /**
     * Inline fallback for edge resize computation.
     * @private
     */
    _computeEdgeResize(initialDims, dragDelta, handle, minSize, maxSize) {
        let newWidth = initialDims.width;
        let newHeight = initialDims.height;
        let newX = initialDims.x;
        let newY = initialDims.y;

        switch (handle) {
            case 'e': newWidth = initialDims.width + dragDelta.dx; break;
            case 'w': newWidth = initialDims.width - dragDelta.dx; newX = initialDims.x + dragDelta.dx; break;
            case 's': newHeight = initialDims.height + dragDelta.dy; break;
            case 'n': newHeight = initialDims.height - dragDelta.dy; newY = initialDims.y + dragDelta.dy; break;
            default: return { ...initialDims };
        }

        const clampedWidth = Math.max(minSize.width, Math.min(newWidth, maxSize.width));
        const clampedHeight = Math.max(minSize.height, Math.min(newHeight, maxSize.height));

        if (handle === 'w') newX = initialDims.x + (initialDims.width - clampedWidth);
        if (handle === 'n') newY = initialDims.y + (initialDims.height - clampedHeight);

        return { width: clampedWidth, height: clampedHeight, x: newX, y: newY };
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InteractionHandler };
}
