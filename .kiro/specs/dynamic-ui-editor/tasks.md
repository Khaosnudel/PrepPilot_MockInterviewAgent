# Implementation Plan: Dynamic UI Editor

## Overview

This plan transforms the existing Prep Pilot UI Editor from a static theme configurator into a dynamic visual editor. The implementation follows a layered approach: first establishing the data model and state management (Element Registry), then building the canvas rendering layer, interaction handlers (drag/resize/select), UI dialogs (Icon Picker, Image Uploader), properties inspector, and finally persistence/undo-redo. The frontend is vanilla JavaScript (no framework) extending the existing `ui-editor.html`. The backend extends the existing FastAPI `/theme` endpoint to include element data.

## Tasks

- [x] 1. Set up Element Registry and data models
  - [x] 1.1 Create the ElementRegistry class in a new `element-registry.js` module
    - Implement the `ElementRegistry` class with element CRUD methods: `addElement`, `removeElement`, `removeElements`, `getElement`, `getAllElements`, `updateElement`
    - Implement selection state management: `getSelectedIds`, `setSelection`, `clearSelection`
    - Implement z-index operations: `getMaxZIndex`, `getMinZIndex`, `bringToFront`, `sendToBack`, `moveForward`, `moveBackward`
    - Implement serialization: `serialize`, `deserialize`
    - Implement `onChange` event callback registration
    - Use `crypto.randomUUID()` for element ID generation
    - _Requirements: 1.2, 1.3, 2.5, 5.1, 5.2, 5.3, 5.4, 6.2, 6.3, 6.4, 6.5, 7.7_

  - [x]* 1.2 Write property tests for Element Registry serialization round-trip
    - **Property 1: Element serialization round-trip**
    - **Validates: Requirements 1.3, 2.5, 7.4, 7.7, 10.7**

  - [x]* 1.3 Write property tests for z-index assignment and layer operations
    - **Property 3: New element z-index assignment**
    - **Property 16: Z-index layer operations**
    - **Validates: Requirements 1.2, 6.2, 6.3, 6.4, 6.5, 10.1**

  - [x]* 1.4 Write property tests for selection state machine
    - **Property 12: Selection state machine**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 2. Implement validation and utility functions
  - [x] 2.1 Create a `validators.js` module with property value validation
    - Implement `validatePropertyValue(property, value, constraints)` for opacity, width, height, font size, z-index ranges
    - Implement `validateImageFile(file)` checking format (PNG, JPG, JPEG, SVG, WebP) and size (≤5MB)
    - Implement `validateGridSpacing(value)` checking integer in range [4, 128]
    - Implement `validateTextContent(content)` checking max 500 characters
    - _Requirements: 1.4, 1.7, 2.2, 2.7, 2.8, 8.6, 10.7_

  - [x] 2.2 Create a `geometry.js` module with position/size calculation utilities
    - Implement `clampPosition(x, y, elementWidth, elementHeight, canvasWidth, canvasHeight)` to keep elements within canvas bounds
    - Implement `scaleToFit(naturalWidth, naturalHeight, maxWidth, maxHeight)` for image scaling preserving aspect ratio
    - Implement `snapToGrid(value, spacing)` for grid snapping
    - Implement `computeDragPosition(initialPos, mouseDelta)` for drag offset preservation
    - Implement `computeCornerResize(initialDims, dragDelta, handle, minSize, maxSize)` for proportional resize
    - Implement `computeEdgeResize(initialDims, dragDelta, handle, minSize, maxSize)` for single-axis resize
    - Implement `computeBoundingBox(elements)` for multi-select bounding box
    - _Requirements: 2.4, 3.3, 3.6, 4.2, 4.3, 4.5, 4.6, 5.5, 8.2, 8.3_

  - [x]* 2.3 Write property tests for validation functions
    - **Property 4: Property value validation**
    - **Property 5: Image file validation**
    - **Property 20: Grid spacing validation**
    - **Validates: Requirements 1.7, 2.2, 8.6**

  - [x]* 2.4 Write property tests for geometry utilities
    - **Property 6: Image scaling preserves aspect ratio within bounds**
    - **Property 7: Position clamping keeps elements within canvas**
    - **Property 8: Drag position offset preservation**
    - **Property 9: Corner resize maintains aspect ratio**
    - **Property 10: Edge resize changes only one axis**
    - **Property 11: Resize dimension clamping**
    - **Property 15: Combined bounding box encompasses all elements**
    - **Property 18: Snap to grid**
    - **Validates: Requirements 2.4, 3.3, 3.6, 4.2, 4.3, 4.5, 4.6, 5.5, 8.2, 8.3**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Canvas Renderer and Grid Overlay
  - [x] 4.1 Create the CanvasRenderer class in a new `canvas-renderer.js` module
    - Create a transparent overlay `<div>` positioned absolutely over the preview iframe
    - Implement `renderAll()` to render all elements from the registry as absolutely-positioned DOM nodes sorted by z-index
    - Implement `renderElement(id)` to create/update a single element DOM node (icon as inline SVG, image as `<img>`, text as `<div>`)
    - Implement `removeElementNode(id)` to remove a DOM node
    - Implement `getCanvasBounds()` returning overlay dimensions
    - Render elements in ascending z-index order; same z-index ordered by insertion time
    - _Requirements: 6.6, 7.3_

  - [x] 4.2 Implement selection visual indicators (handles)
    - Implement `showHandles(ids)` displaying drag handle and 8 resize handles (4 corners + 4 edge midpoints) around selected element
    - Implement `hideHandles()` to remove all indicators
    - Implement `showMultiSelectBoundingBox(ids)` for combined bounding box display
    - Set appropriate cursor styles on resize handles (nw-resize, ew-resize, etc.)
    - _Requirements: 3.1, 4.1, 4.8, 5.5_

  - [x] 4.3 Implement grid overlay rendering
    - Implement `showGrid(spacing)` to render evenly-spaced grid lines on the overlay
    - Implement `hideGrid()` to remove grid overlay
    - Implement `updateGridSpacing(spacing)` to re-render grid with new spacing
    - Default spacing: 16px, range: 4–128px
    - _Requirements: 8.1, 8.4, 8.5_

  - [x]* 4.4 Write property tests for render order
    - **Property 17: Render order follows z-index**
    - **Validates: Requirements 6.6**

  - [x]* 4.5 Write property tests for grid spacing preservation
    - **Property 19: Grid spacing change preserves element positions**
    - **Validates: Requirements 8.4**

- [x] 5. Implement Interaction Handler (Drag, Resize, Selection)
  - [x] 5.1 Create the InteractionHandler class in a new `interaction-handler.js` module
    - Implement mouse event listeners on the canvas overlay for click, mousedown, mousemove, mouseup
    - Implement `handleClick(event)` for element selection (plain click selects one, deselects others)
    - Implement `handleShiftClick(event)` for multi-select toggle (add/remove from selection)
    - Implement click-on-empty-area to deselect all elements
    - _Requirements: 3.1, 3.7, 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 Implement drag-to-reposition logic
    - Implement `startDrag(elementId, mouseEvent)` capturing initial mouse offset from element origin
    - Implement `onDragMove(mouseEvent)` updating element position on each animation frame (requestAnimationFrame) preserving cursor-to-element offset
    - Implement `endDrag()` finalizing position in Element Registry
    - Implement multi-select group drag maintaining relative positions
    - Clamp positions to keep elements within canvas bounds
    - Update Properties Inspector live during drag
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 5.6, 5.7_

  - [x] 5.3 Implement resize logic
    - Implement `startResize(elementId, handle, mouseEvent)` identifying which handle is being dragged
    - Implement `onResizeMove(mouseEvent)` computing new dimensions per frame: corner handles resize proportionally (maintain aspect ratio), edge handles resize single axis
    - Implement `endResize()` finalizing dimensions in Element Registry
    - Clamp dimensions to min 16×16 and max canvas dimensions
    - Anchor resize from opposite corner/edge
    - Update Properties Inspector live during resize
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 5.4 Implement grid snap integration in interaction handler
    - Implement `setSnapEnabled(enabled)` and `setGridSpacing(spacing)`
    - Implement `snapToGrid(value)` rounding to nearest grid increment
    - Apply snap on drag release (snap element top-left to nearest grid intersection)
    - Apply snap on resize release (snap width/height to nearest grid multiple, minimum one increment)
    - _Requirements: 8.2, 8.3_

  - [x]* 5.5 Write property tests for multi-select group move
    - **Property 13: Multi-select group move preserves relative positions**
    - **Validates: Requirements 5.6**

  - [x]* 5.6 Write property tests for delete operation
    - **Property 14: Delete removes exactly selected elements**
    - **Validates: Requirements 5.8**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Icon Picker and Image Uploader dialogs
  - [x] 7.1 Create the IconPicker dialog component
    - Create a modal dialog with a searchable list of icons (use a predefined icon library, e.g., Lucide icon set as inline SVGs)
    - Implement case-insensitive substring search filtering
    - Display "No icons found" message when search matches zero icons
    - Return selected icon's identifier, name, and SVG content on selection
    - Close dialog on cancel or selection
    - _Requirements: 1.1, 1.6_

  - [x] 7.2 Create the ImageUploader dialog component
    - Create a modal dialog with file upload input and URL input field
    - Validate file format (PNG, JPG, JPEG, SVG, WebP) and size (≤5MB)
    - Display error messages for unsupported format or oversized files
    - Implement URL loading with 10-second timeout and content-type validation
    - Display error for URL load failures (unreachable, non-image, timeout)
    - Return image source (data URL or external URL) and natural dimensions on success
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 2.9_

  - [x]* 7.3 Write property tests for icon search filter
    - **Property 2: Icon search filter correctness**
    - **Validates: Requirements 1.1**

- [x] 8. Implement Properties Inspector and Element Toolbar
  - [x] 8.1 Create the PropertiesInspector component
    - Add a new section in the editor sidebar panel for element properties
    - Display editable fields based on selected element type:
      - Icon: width, height, x, y, color, opacity
      - Image: width, height, x, y, opacity, maintain-aspect-ratio toggle
      - Text: font size, font weight, color, x, y, width, opacity
    - Validate input values against defined ranges and show inline error for out-of-range values
    - Apply property changes to Element Registry within 100ms
    - Display z-index value and four layer-order control buttons
    - Disable layer controls when no element is selected
    - For multi-select: show only shared properties, apply changes to all selected elements
    - _Requirements: 1.4, 1.5, 1.7, 2.6, 4.7, 5.9, 6.1, 6.7, 10.4_

  - [x] 8.2 Create the Element Toolbar (Add Icon / Add Image / Add Text buttons)
    - Add "Add Icon", "Add Image", and "Add Text" buttons to the editor sidebar
    - Wire "Add Icon" to open IconPicker, on selection add icon element at canvas center with defaults (32×32, black, opacity 1.0, z-index = max+1)
    - Wire "Add Image" to open ImageUploader, on success add image element at canvas center scaled to fit 200×200 maintaining aspect ratio
    - Wire "Add Text" to add text element at canvas center with defaults (width 200px, font size 16px, placeholder "Double-click to edit")
    - _Requirements: 1.1, 1.2, 2.1, 2.3, 2.4, 10.1_

  - [x] 8.3 Implement inline text editing
    - On double-click of a text element, enable inline editing mode with visible cursor
    - Allow keyboard input within element boundaries
    - Exit editing on Escape or click-outside, commit text content
    - Restore placeholder "Double-click to edit" if content is cleared
    - Truncate at 500 characters
    - _Requirements: 10.2, 10.3, 10.5, 10.6_

- [x] 9. Implement Undo/Redo system
  - [x] 9.1 Create the UndoRedoManager class
    - Implement undo stack (max 50 entries) and redo stack
    - Implement `pushState(state)` that deep-clones the Element Registry state, pushes to undo stack, and clears redo stack
    - Implement `undo()` returning previous state (push current to redo)
    - Implement `redo()` returning next state (push current to undo)
    - Implement FIFO eviction when undo stack exceeds 50 entries
    - _Requirements: 9.1, 9.5_

  - [x] 9.2 Integrate undo/redo with Element Registry and interactions
    - Push undo state before each modifying action (add, delete, property change)
    - For continuous drag/resize operations: record state at mousedown, push single undo entry at mouseup
    - Wire Ctrl+Z to undo, Ctrl+Y / Ctrl+Shift+Z to redo
    - Wire Delete key to remove selected elements
    - No-op when respective stack is empty
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 5.8_

  - [x]* 9.3 Write property tests for undo/redo
    - **Property 21: Undo/redo round-trip**
    - **Property 22: Continuous operation produces single undo entry**
    - **Property 23: Undo stack capacity limit**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement persistence and server integration
  - [x] 11.1 Extend the FastAPI `/theme` endpoint to include elements data
    - Modify `PUT /theme` to accept and persist an `elements` array in the theme JSON alongside existing theme data
    - Modify `GET /theme` to return the `elements` array (empty array if none exist)
    - Validate element data structure on save (schema check)
    - Handle corrupted/invalid elements gracefully (fall back to empty array)
    - _Requirements: 7.1, 7.3, 7.4, 7.7_

  - [x] 11.2 Implement client-side save/load/export/reset
    - Wire "Save to Live UI" button to PUT element registry data alongside theme to `/theme`, show success message within 3 seconds
    - Show error toast on save failure (network/server error), retain local state
    - On editor load, GET `/theme` and deserialize elements to render on canvas
    - Wire "Export Theme JSON" to include elements in exported JSON
    - Wire "Reset to Defaults" with confirmation prompt; on confirm clear all elements; on cancel preserve state
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 11.3 Write unit tests for save/load/export integration
    - Test save success and failure UI feedback
    - Test load on startup renders saved elements
    - Test export includes elements in JSON
    - Test reset with confirmation clears registry
    - Test reset cancel preserves state
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 12. Wire all components together in ui-editor.html
  - [x] 12.1 Integrate all JavaScript modules into ui-editor.html
    - Add script tags or inline the modules (ElementRegistry, CanvasRenderer, InteractionHandler, PropertiesInspector, IconPicker, ImageUploader, UndoRedoManager, validators, geometry)
    - Initialize all components on page load with proper dependency wiring
    - Add the canvas overlay div positioned over the preview iframe
    - Add Element Toolbar buttons, Properties Inspector section, and Grid controls to the sidebar
    - Ensure existing theme editing functionality remains intact
    - _Requirements: All_

  - [x] 12.2 Add grid toggle and spacing controls to the sidebar
    - Add "Show Grid" toggle checkbox
    - Add grid spacing input field (default 16, range 4–128)
    - Wire toggle to show/hide grid and enable/disable snap
    - Wire spacing input to update grid with validation
    - _Requirements: 8.1, 8.4, 8.5, 8.6_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The frontend is vanilla JavaScript (no build tools, no framework) — consistent with the existing editor
- The backend uses Python/FastAPI with Hypothesis for property-based testing
- For client-side JS property tests, use a Node.js test runner with `fast-check` as specified in the design
- All JavaScript modules can be inlined in `ui-editor.html` or loaded as separate `.js` files from the static directory

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.3", "2.4"] },
    { "id": 2, "tasks": ["4.1", "4.3", "7.1", "7.2", "9.1"] },
    { "id": 3, "tasks": ["4.2", "4.4", "4.5", "7.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "8.1", "8.2"] },
    { "id": 5, "tasks": ["5.5", "5.6", "8.3", "9.2"] },
    { "id": 6, "tasks": ["9.3", "11.1"] },
    { "id": 7, "tasks": ["11.2", "12.1", "12.2"] },
    { "id": 8, "tasks": ["11.3"] }
  ]
}
```
