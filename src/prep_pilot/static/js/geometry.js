/**
 * Geometry utility module for the Dynamic UI Editor.
 * Provides position/size calculation utilities for element manipulation.
 *
 * Requirements: 2.4, 3.3, 3.6, 4.2, 4.3, 4.5, 4.6, 5.5, 8.2, 8.3
 */

/**
 * Clamps an element's position to keep it fully within the canvas bounds.
 *
 * @param {number} x - Desired x position (pixels from canvas left)
 * @param {number} y - Desired y position (pixels from canvas top)
 * @param {number} elementWidth - Width of the element in pixels
 * @param {number} elementHeight - Height of the element in pixels
 * @param {number} canvasWidth - Width of the canvas in pixels
 * @param {number} canvasHeight - Height of the canvas in pixels
 * @returns {{x: number, y: number}} Clamped position ensuring element stays within canvas
 */
function clampPosition(x, y, elementWidth, elementHeight, canvasWidth, canvasHeight) {
    const maxX = canvasWidth - elementWidth;
    const maxY = canvasHeight - elementHeight;
    return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY))
    };
}

/**
 * Scales dimensions to fit within a maximum bounding box while preserving aspect ratio.
 * Maximizes size so at least one dimension equals the max (unless both natural
 * dimensions are already within bounds).
 *
 * @param {number} naturalWidth - Original width in pixels (must be > 0)
 * @param {number} naturalHeight - Original height in pixels (must be > 0)
 * @param {number} maxWidth - Maximum allowed width in pixels
 * @param {number} maxHeight - Maximum allowed height in pixels
 * @returns {{width: number, height: number}} Scaled dimensions maintaining aspect ratio
 */
function scaleToFit(naturalWidth, naturalHeight, maxWidth, maxHeight) {
    if (naturalWidth <= 0 || naturalHeight <= 0) {
        return { width: 0, height: 0 };
    }

    if (naturalWidth <= maxWidth && naturalHeight <= maxHeight) {
        return { width: naturalWidth, height: naturalHeight };
    }

    const widthRatio = maxWidth / naturalWidth;
    const heightRatio = maxHeight / naturalHeight;
    const scale = Math.min(widthRatio, heightRatio);

    return {
        width: naturalWidth * scale,
        height: naturalHeight * scale
    };
}

/**
 * Snaps a value to the nearest grid-aligned position.
 * Uses standard rounding: round(value / spacing) * spacing.
 *
 * @param {number} value - The value to snap
 * @param {number} spacing - Grid spacing in pixels (valid range: 4–128)
 * @returns {number} The nearest grid-aligned value
 */
function snapToGrid(value, spacing) {
    if (spacing <= 0) {
        return value;
    }
    return Math.round(value / spacing) * spacing;
}

/**
 * Computes the new position during a drag operation, preserving the offset
 * between the cursor and the element origin.
 *
 * @param {{x: number, y: number}} initialPos - Element position at drag start
 * @param {{dx: number, dy: number}} mouseDelta - Mouse movement delta since drag start
 * @returns {{x: number, y: number}} New element position (before clamping)
 */
function computeDragPosition(initialPos, mouseDelta) {
    return {
        x: initialPos.x + mouseDelta.dx,
        y: initialPos.y + mouseDelta.dy
    };
}

/**
 * Computes new dimensions for a corner resize operation (proportional).
 * Corner handles maintain aspect ratio. The resize is anchored from the opposite corner.
 *
 * @param {{width: number, height: number, x: number, y: number}} initialDims - Initial element dimensions and position
 * @param {{dx: number, dy: number}} dragDelta - Mouse movement delta during resize
 * @param {string} handle - Which corner handle: 'nw', 'ne', 'sw', 'se'
 * @param {{width: number, height: number}} minSize - Minimum allowed dimensions
 * @param {{width: number, height: number}} maxSize - Maximum allowed dimensions
 * @returns {{width: number, height: number, x: number, y: number}} New dimensions and position
 */
function computeCornerResize(initialDims, dragDelta, handle, minSize, maxSize) {
    const aspectRatio = initialDims.width / initialDims.height;
    let newWidth, newHeight, newX, newY;

    switch (handle) {
        case 'se': // bottom-right corner: anchor is top-left
            newWidth = initialDims.width + dragDelta.dx;
            newHeight = newWidth / aspectRatio;
            newX = initialDims.x;
            newY = initialDims.y;
            break;
        case 'sw': // bottom-left corner: anchor is top-right
            newWidth = initialDims.width - dragDelta.dx;
            newHeight = newWidth / aspectRatio;
            newX = initialDims.x + (initialDims.width - newWidth);
            newY = initialDims.y;
            break;
        case 'ne': // top-right corner: anchor is bottom-left
            newWidth = initialDims.width + dragDelta.dx;
            newHeight = newWidth / aspectRatio;
            newX = initialDims.x;
            newY = initialDims.y + (initialDims.height - newHeight);
            break;
        case 'nw': // top-left corner: anchor is bottom-right
            newWidth = initialDims.width - dragDelta.dx;
            newHeight = newWidth / aspectRatio;
            newX = initialDims.x + (initialDims.width - newWidth);
            newY = initialDims.y + (initialDims.height - newHeight);
            break;
        default:
            return { ...initialDims };
    }

    // Clamp dimensions to min/max
    const clampedWidth = Math.max(minSize.width, Math.min(newWidth, maxSize.width));
    const clampedHeight = Math.max(minSize.height, Math.min(newHeight, maxSize.height));

    // Maintain aspect ratio after clamping by using the more restrictive constraint
    let finalWidth, finalHeight;
    if (clampedWidth / clampedHeight > aspectRatio) {
        // Height is the limiting factor
        finalHeight = clampedHeight;
        finalWidth = finalHeight * aspectRatio;
    } else {
        // Width is the limiting factor
        finalWidth = clampedWidth;
        finalHeight = finalWidth / aspectRatio;
    }

    // Ensure final dimensions still respect minimums
    finalWidth = Math.max(minSize.width, finalWidth);
    finalHeight = Math.max(minSize.height, finalHeight);

    // Recalculate position based on anchor
    let finalX, finalY;
    switch (handle) {
        case 'se':
            finalX = initialDims.x;
            finalY = initialDims.y;
            break;
        case 'sw':
            finalX = initialDims.x + initialDims.width - finalWidth;
            finalY = initialDims.y;
            break;
        case 'ne':
            finalX = initialDims.x;
            finalY = initialDims.y + initialDims.height - finalHeight;
            break;
        case 'nw':
            finalX = initialDims.x + initialDims.width - finalWidth;
            finalY = initialDims.y + initialDims.height - finalHeight;
            break;
        default:
            finalX = initialDims.x;
            finalY = initialDims.y;
    }

    return {
        width: finalWidth,
        height: finalHeight,
        x: finalX,
        y: finalY
    };
}

/**
 * Computes new dimensions for an edge resize operation (single-axis).
 * Edge handles change only one axis. The resize is anchored from the opposite edge.
 *
 * @param {{width: number, height: number, x: number, y: number}} initialDims - Initial element dimensions and position
 * @param {{dx: number, dy: number}} dragDelta - Mouse movement delta during resize
 * @param {string} handle - Which edge handle: 'n', 's', 'e', 'w'
 * @param {{width: number, height: number}} minSize - Minimum allowed dimensions
 * @param {{width: number, height: number}} maxSize - Maximum allowed dimensions
 * @returns {{width: number, height: number, x: number, y: number}} New dimensions and position
 */
function computeEdgeResize(initialDims, dragDelta, handle, minSize, maxSize) {
    let newWidth = initialDims.width;
    let newHeight = initialDims.height;
    let newX = initialDims.x;
    let newY = initialDims.y;

    switch (handle) {
        case 'e': // right edge: anchor is left
            newWidth = initialDims.width + dragDelta.dx;
            break;
        case 'w': // left edge: anchor is right
            newWidth = initialDims.width - dragDelta.dx;
            newX = initialDims.x + dragDelta.dx;
            break;
        case 's': // bottom edge: anchor is top
            newHeight = initialDims.height + dragDelta.dy;
            break;
        case 'n': // top edge: anchor is bottom
            newHeight = initialDims.height - dragDelta.dy;
            newY = initialDims.y + dragDelta.dy;
            break;
        default:
            return { ...initialDims };
    }

    // Clamp dimensions
    const clampedWidth = Math.max(minSize.width, Math.min(newWidth, maxSize.width));
    const clampedHeight = Math.max(minSize.height, Math.min(newHeight, maxSize.height));

    // Adjust position if clamping changed the dimension for left/top edges
    if (handle === 'w') {
        newX = initialDims.x + (initialDims.width - clampedWidth);
    }
    if (handle === 'n') {
        newY = initialDims.y + (initialDims.height - clampedHeight);
    }

    return {
        width: clampedWidth,
        height: clampedHeight,
        x: newX,
        y: newY
    };
}

/**
 * Computes the combined bounding box that encompasses all given elements.
 * The bounding box is the smallest rectangle containing all elements.
 *
 * @param {Array<{x: number, y: number, width: number, height: number}>} elements - Array of elements with position and size
 * @returns {{x: number, y: number, width: number, height: number}} Combined bounding box
 */
function computeBoundingBox(elements) {
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

// Export for Node.js testing (fast-check) while remaining usable in browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        clampPosition,
        scaleToFit,
        snapToGrid,
        computeDragPosition,
        computeCornerResize,
        computeEdgeResize,
        computeBoundingBox
    };
}
