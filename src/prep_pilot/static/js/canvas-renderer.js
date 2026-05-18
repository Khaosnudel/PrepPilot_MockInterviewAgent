/**
 * CanvasRenderer - Renders elements as DOM nodes on a transparent overlay.
 *
 * Responsible for creating/updating/removing element DOM nodes on the canvas
 * overlay that sits on top of the preview iframe. Elements are rendered as
 * absolutely-positioned DOM nodes sorted by z-index (ascending), with ties
 * broken by insertion order (earlier first).
 *
 * Requirements: 6.6, 7.3
 */
class CanvasRenderer {
    /**
     * @param {HTMLElement} overlayElement - The transparent overlay div positioned over the preview iframe
     * @param {object} registry - An ElementRegistry instance providing element data
     */
    constructor(overlayElement, registry) {
        /** @type {HTMLElement} */
        this._overlay = overlayElement;
        /** @type {object} */
        this._registry = registry;
        /** @type {Map<string, HTMLElement>} element ID -> DOM node */
        this._nodes = new Map();

        // Ensure the overlay is set up as an absolute-positioned container
        this._initOverlay();
    }

    // ─── Rendering ───────────────────────────────────────────────────────

    /**
     * Render all elements from the registry as absolutely-positioned DOM nodes
     * sorted by z-index (ascending). Elements with the same z-index are ordered
     * by insertion time (earlier first).
     */
    renderAll() {
        const elements = this._registry.getAllElements();

        // Sort by z-index ascending; same z-index ordered by insertion time
        // getAllElements() returns elements in Map iteration order which matches
        // insertion order, so a stable sort on zIndex preserves insertion order for ties.
        const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

        // Remove nodes for elements that no longer exist
        const currentIds = new Set(elements.map(el => el.id));
        for (const [id, node] of this._nodes.entries()) {
            if (!currentIds.has(id)) {
                node.remove();
                this._nodes.delete(id);
            }
        }

        // Render each element in z-index order
        for (const element of sorted) {
            this.renderElement(element.id);
        }

        // Reorder DOM nodes to match z-index sort order
        for (const element of sorted) {
            const node = this._nodes.get(element.id);
            if (node && node.parentNode === this._overlay) {
                this._overlay.appendChild(node);
            }
        }
    }

    /**
     * Create or update a single element DOM node.
     * - Icon elements are rendered as inline SVG
     * - Image elements are rendered as <img>
     * - Text elements are rendered as <div>
     * @param {string} id - The element ID to render
     */
    renderElement(id) {
        const element = this._registry.getElement(id);
        if (!element) return;

        let node = this._nodes.get(id);

        if (!node) {
            // Create a new node
            node = this._createElement(element);
            this._nodes.set(id, node);
            this._overlay.appendChild(node);
        } else {
            // Update existing node content if type changed (unlikely but safe)
            this._updateElementContent(node, element);
        }

        // Apply common positioning and styles
        this._applyStyles(node, element);
    }

    /**
     * Remove a DOM node for the given element ID.
     * @param {string} id - The element ID whose node should be removed
     */
    removeElementNode(id) {
        const node = this._nodes.get(id);
        if (node) {
            node.remove();
            this._nodes.delete(id);
        }
    }

    // ─── Selection Visual Indicators ────────────────────────────────────

    /**
     * Display drag handle and 8 resize handles around the selected element(s).
     * For a single element, shows individual resize handles at corners and edge midpoints.
     * For multiple elements, delegates to showMultiSelectBoundingBox.
     *
     * @param {string[]} ids - Array of selected element IDs
     * Requirements: 3.1, 4.1, 4.8
     */
    showHandles(ids) {
        // Remove any existing handles first
        this.hideHandles();

        if (!ids || ids.length === 0) return;

        // Multi-select: show combined bounding box instead of individual handles
        if (ids.length > 1) {
            this.showMultiSelectBoundingBox(ids);
            return;
        }

        const elementId = ids[0];
        const element = this._registry.getElement(elementId);
        if (!element) return;

        // Create the handles container
        const handlesContainer = document.createElement('div');
        handlesContainer.classList.add('selection-handles');
        handlesContainer.dataset.handlesFor = elementId;
        handlesContainer.style.position = 'absolute';
        handlesContainer.style.left = element.x + 'px';
        handlesContainer.style.top = element.y + 'px';
        handlesContainer.style.width = element.width + 'px';
        handlesContainer.style.height = element.height + 'px';
        handlesContainer.style.pointerEvents = 'none';
        handlesContainer.style.zIndex = '9999';
        handlesContainer.style.boxSizing = 'border-box';

        // Selection border
        const border = document.createElement('div');
        border.classList.add('selection-border');
        border.style.position = 'absolute';
        border.style.top = '0';
        border.style.left = '0';
        border.style.width = '100%';
        border.style.height = '100%';
        border.style.border = '2px solid #4a90d9';
        border.style.pointerEvents = 'none';
        border.style.boxSizing = 'border-box';
        handlesContainer.appendChild(border);

        // Drag handle (centered at top, above the element)
        const dragHandle = this._createDragHandle();
        handlesContainer.appendChild(dragHandle);

        // 8 resize handles: 4 corners + 4 edge midpoints
        const resizeHandles = this._createResizeHandles();
        for (const handle of resizeHandles) {
            handlesContainer.appendChild(handle);
        }

        this._overlay.appendChild(handlesContainer);
    }

    /**
     * Remove all selection indicators (handles, bounding boxes) from the overlay.
     */
    hideHandles() {
        // Remove all handle containers
        const handleContainers = this._findAllByClass(this._overlay, 'selection-handles');
        for (const container of handleContainers) {
            container.remove();
        }

        // Remove multi-select bounding boxes
        const boundingBoxes = this._findAllByClass(this._overlay, 'multi-select-bbox');
        for (const bbox of boundingBoxes) {
            bbox.remove();
        }
    }

    /**
     * Display a combined bounding box around all selected elements for multi-select.
     * Hides individual resize handles and shows a single bounding box.
     *
     * @param {string[]} ids - Array of selected element IDs
     * Requirements: 5.5
     */
    showMultiSelectBoundingBox(ids) {
        if (!ids || ids.length === 0) return;

        // Gather element data for bounding box computation
        const elements = ids
            .map(id => this._registry.getElement(id))
            .filter(Boolean);

        if (elements.length === 0) return;

        // Compute combined bounding box
        const bbox = this._computeBoundingBox(elements);

        // Create bounding box container
        const bboxContainer = document.createElement('div');
        bboxContainer.classList.add('multi-select-bbox');
        bboxContainer.style.position = 'absolute';
        bboxContainer.style.left = bbox.x + 'px';
        bboxContainer.style.top = bbox.y + 'px';
        bboxContainer.style.width = bbox.width + 'px';
        bboxContainer.style.height = bbox.height + 'px';
        bboxContainer.style.pointerEvents = 'none';
        bboxContainer.style.zIndex = '9999';
        bboxContainer.style.boxSizing = 'border-box';
        bboxContainer.style.border = '2px dashed #4a90d9';

        this._overlay.appendChild(bboxContainer);
    }

    // ─── Canvas Info ─────────────────────────────────────────────────────

    /**
     * Get the canvas overlay dimensions.
     * @returns {{ width: number, height: number }} The overlay width and height in pixels
     */
    getCanvasBounds() {
        return {
            width: this._overlay.offsetWidth || this._overlay.clientWidth || 0,
            height: this._overlay.offsetHeight || this._overlay.clientHeight || 0
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────────────

    /**
     * Initialize the overlay element with required styles.
     * @private
     */
    _initOverlay() {
        const style = this._overlay.style;
        style.position = 'absolute';
        style.top = '0';
        style.left = '0';
        style.width = '100%';
        style.height = '100%';
        style.pointerEvents = 'auto';
        style.overflow = 'hidden';
        // Transparent background so the iframe preview shows through
        if (!style.backgroundColor) {
            style.backgroundColor = 'transparent';
        }
    }

    /**
     * Create a new DOM element based on the element type.
     * @param {object} element - The element data
     * @returns {HTMLElement} The created DOM node
     * @private
     */
    _createElement(element) {
        const wrapper = document.createElement('div');
        wrapper.dataset.elementId = element.id;
        wrapper.classList.add('canvas-element');

        this._updateElementContent(wrapper, element);
        return wrapper;
    }

    /**
     * Update the inner content of a DOM node based on element type.
     * @param {HTMLElement} node - The wrapper DOM node
     * @param {object} element - The element data
     * @private
     */
    _updateElementContent(node, element) {
        // Store the current type to detect changes
        const currentType = node.dataset.elementType;

        if (currentType !== element.type) {
            // Clear existing content and rebuild
            node.innerHTML = '';
            node.dataset.elementType = element.type;

            switch (element.type) {
                case 'icon':
                    this._renderIconContent(node, element);
                    break;
                case 'image':
                    this._renderImageContent(node, element);
                    break;
                case 'text':
                    this._renderTextContent(node, element);
                    break;
            }
        } else {
            // Update in-place based on type
            switch (element.type) {
                case 'icon':
                    this._updateIconContent(node, element);
                    break;
                case 'image':
                    this._updateImageContent(node, element);
                    break;
                case 'text':
                    this._updateTextContent(node, element);
                    break;
            }
        }
    }

    /**
     * Render icon element content as inline SVG.
     * @param {HTMLElement} node - The wrapper node
     * @param {object} element - The icon element data
     * @private
     */
    _renderIconContent(node, element) {
        const svgContent = element.svgContent || this._getDefaultIconSvg(element.iconId);
        node.innerHTML = svgContent;

        // Style the SVG to fill the container
        const svg = node.querySelector('svg');
        if (svg) {
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.display = 'block';
            if (element.color) {
                svg.style.color = element.color;
                svg.setAttribute('fill', 'currentColor');
            }
        }
    }

    /**
     * Update icon content without full rebuild.
     * @param {HTMLElement} node - The wrapper node
     * @param {object} element - The icon element data
     * @private
     */
    _updateIconContent(node, element) {
        const svg = node.querySelector('svg');
        if (svg) {
            if (element.color) {
                svg.style.color = element.color;
                svg.setAttribute('fill', 'currentColor');
            }
        } else {
            // SVG missing, re-render
            this._renderIconContent(node, element);
        }
    }

    /**
     * Render image element content as an <img> tag.
     * @param {HTMLElement} node - The wrapper node
     * @param {object} element - The image element data
     * @private
     */
    _renderImageContent(node, element) {
        const img = document.createElement('img');
        img.src = element.source || '';
        img.alt = '';
        img.draggable = false;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.display = 'block';
        img.style.objectFit = element.maintainAspectRatio ? 'contain' : 'fill';
        node.appendChild(img);
    }

    /**
     * Update image content without full rebuild.
     * @param {HTMLElement} node - The wrapper node
     * @param {object} element - The image element data
     * @private
     */
    _updateImageContent(node, element) {
        const img = node.querySelector('img');
        if (img) {
            if (img.src !== element.source) {
                img.src = element.source || '';
            }
            img.style.objectFit = element.maintainAspectRatio ? 'contain' : 'fill';
        } else {
            // img missing, re-render
            this._renderImageContent(node, element);
        }
    }

    /**
     * Render text element content as a styled <div>.
     * @param {HTMLElement} node - The wrapper node
     * @param {object} element - The text element data
     * @private
     */
    _renderTextContent(node, element) {
        const textDiv = document.createElement('div');
        textDiv.classList.add('canvas-text-content');
        textDiv.textContent = element.content || 'Double-click to edit';
        textDiv.style.width = '100%';
        textDiv.style.height = '100%';
        textDiv.style.fontSize = (element.fontSize || 16) + 'px';
        textDiv.style.fontWeight = element.fontWeight || 'normal';
        textDiv.style.color = element.color || '#e2e8f0';
        textDiv.style.overflow = 'hidden';
        textDiv.style.wordWrap = 'break-word';
        textDiv.style.whiteSpace = 'pre-wrap';
        node.appendChild(textDiv);
    }

    /**
     * Update text content without full rebuild.
     * @param {HTMLElement} node - The wrapper node
     * @param {object} element - The text element data
     * @private
     */
    _updateTextContent(node, element) {
        const textDiv = node.querySelector('.canvas-text-content');
        if (textDiv) {
            textDiv.textContent = element.content || 'Double-click to edit';
            textDiv.style.fontSize = (element.fontSize || 16) + 'px';
            textDiv.style.fontWeight = element.fontWeight || 'normal';
            textDiv.style.color = element.color || '#e2e8f0';
        } else {
            // textDiv missing, re-render
            this._renderTextContent(node, element);
        }
    }

    /**
     * Apply common positioning and style properties to a node.
     * @param {HTMLElement} node - The DOM node
     * @param {object} element - The element data
     * @private
     */
    _applyStyles(node, element) {
        const style = node.style;
        style.position = 'absolute';
        style.left = element.x + 'px';
        style.top = element.y + 'px';
        style.width = element.width + 'px';
        style.height = element.height + 'px';
        style.opacity = String(element.opacity != null ? element.opacity : 1.0);
        style.zIndex = String(element.zIndex || 0);
        style.userSelect = 'none';
        style.boxSizing = 'border-box';
    }

    /**
     * Generate a default placeholder SVG for an icon when no svgContent is provided.
     * @param {string} iconId - The icon identifier
     * @returns {string} SVG markup string
     * @private
     */
    _getDefaultIconSvg(iconId) {
        // Provide a simple placeholder SVG with the icon ID as a visual hint
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <rect width="24" height="24" rx="4" fill="currentColor" opacity="0.2"/>
            <text x="12" y="16" text-anchor="middle" font-size="8" fill="currentColor">${(iconId || '?').substring(0, 3)}</text>
        </svg>`;
    }

    /**
     * Create the drag handle element (centered at top of selection).
     * @returns {HTMLElement} The drag handle DOM element
     * @private
     */
    _createDragHandle() {
        const handle = document.createElement('div');
        handle.classList.add('drag-handle');
        handle.dataset.handleType = 'drag';
        handle.style.position = 'absolute';
        handle.style.top = '-20px';
        handle.style.left = '50%';
        handle.style.transform = 'translateX(-50%)';
        handle.style.width = '24px';
        handle.style.height = '12px';
        handle.style.backgroundColor = '#4a90d9';
        handle.style.borderRadius = '3px';
        handle.style.cursor = 'move';
        handle.style.pointerEvents = 'auto';
        return handle;
    }

    /**
     * Create the 8 resize handles (4 corners + 4 edge midpoints).
     * Each handle has the appropriate cursor style.
     * @returns {HTMLElement[]} Array of 8 resize handle DOM elements
     * @private
     */
    _createResizeHandles() {
        const handleSize = 8;
        const halfSize = handleSize / 2;

        // Define handle positions and cursors
        // Corners: nw, ne, sw, se
        // Edges: n, s, e, w
        const handleDefs = [
            { id: 'nw', cursor: 'nw-resize', top: -halfSize + 'px', left: -halfSize + 'px' },
            { id: 'ne', cursor: 'ne-resize', top: -halfSize + 'px', right: -halfSize + 'px' },
            { id: 'sw', cursor: 'sw-resize', bottom: -halfSize + 'px', left: -halfSize + 'px' },
            { id: 'se', cursor: 'se-resize', bottom: -halfSize + 'px', right: -halfSize + 'px' },
            { id: 'n', cursor: 'ns-resize', top: -halfSize + 'px', left: '50%', transform: 'translateX(-50%)' },
            { id: 's', cursor: 'ns-resize', bottom: -halfSize + 'px', left: '50%', transform: 'translateX(-50%)' },
            { id: 'e', cursor: 'ew-resize', top: '50%', right: -halfSize + 'px', transform: 'translateY(-50%)' },
            { id: 'w', cursor: 'ew-resize', top: '50%', left: -halfSize + 'px', transform: 'translateY(-50%)' }
        ];

        return handleDefs.map(def => {
            const handle = document.createElement('div');
            handle.classList.add('resize-handle');
            handle.dataset.handleType = 'resize';
            handle.dataset.handleDirection = def.id;
            handle.style.position = 'absolute';
            handle.style.width = handleSize + 'px';
            handle.style.height = handleSize + 'px';
            handle.style.backgroundColor = '#ffffff';
            handle.style.border = '1px solid #4a90d9';
            handle.style.boxSizing = 'border-box';
            handle.style.cursor = def.cursor;
            handle.style.pointerEvents = 'auto';

            // Apply positioning
            if (def.top !== undefined) handle.style.top = def.top;
            if (def.bottom !== undefined) handle.style.bottom = def.bottom;
            if (def.left !== undefined) handle.style.left = def.left;
            if (def.right !== undefined) handle.style.right = def.right;
            if (def.transform) handle.style.transform = def.transform;

            return handle;
        });
    }

    /**
     * Compute the combined bounding box for a set of elements.
     * @param {Array<{x: number, y: number, width: number, height: number}>} elements
     * @returns {{x: number, y: number, width: number, height: number}}
     * @private
     */
    _computeBoundingBox(elements) {
        if (!elements || elements.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const el of elements) {
            minX = Math.min(minX, el.x);
            minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + el.width);
            maxY = Math.max(maxY, el.y + el.height);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Find all child elements with a given class name (recursive).
     * @param {HTMLElement} parent - Parent element to search within
     * @param {string} className - Class name to search for
     * @returns {HTMLElement[]} Array of matching elements
     * @private
     */
    _findAllByClass(parent, className) {
        const results = [];
        if (!parent || !parent.children) return results;
        for (const child of parent.children) {
            if (child.classList && child.classList.contains(className)) {
                results.push(child);
            }
            if (child.children && child.children.length > 0) {
                results.push(...this._findAllByClass(child, className));
            }
        }
        return results;
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CanvasRenderer };
}
