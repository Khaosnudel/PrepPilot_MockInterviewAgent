# Requirements Document

## Introduction

This feature enhances the Prep Pilot UI Editor (`/ui-editor`) with dynamic element editing capabilities. The current editor supports theme customization (colors, layout values, section toggles) but lacks the ability to add, position, resize, and manipulate individual visual elements like icons and images. This enhancement transforms the editor from a static theme configurator into a dynamic visual editor where users can place and arrange elements freely on the canvas.

## Glossary

- **Editor**: The UI Editor page served at `/ui-editor` that provides visual editing tools for the Prep Pilot interview interface
- **Canvas**: The preview area within the Editor where elements are rendered and can be visually manipulated
- **Element**: A discrete visual object (icon, image, or text block) placed on the Canvas that can be independently positioned, sized, and configured
- **Element_Panel**: The sidebar section within the Editor that displays available elements to add and properties of the selected element
- **Icon_Picker**: A dialog component within the Editor that allows users to browse and select icons from a predefined icon library
- **Image_Uploader**: A component within the Editor that allows users to upload or reference image files for placement on the Canvas
- **Element_Registry**: The internal data structure that stores all placed elements with their properties (type, position, size, z-index)
- **Drag_Handle**: A visual indicator on a selected Element that enables repositioning via mouse drag
- **Resize_Handle**: A visual indicator on the corners and edges of a selected Element that enables resizing via mouse drag
- **Properties_Inspector**: A panel within the Element_Panel that displays and allows editing of the selected Element's numeric properties
- **Z_Index**: The stacking order value that determines which Element appears in front of or behind other elements

## Requirements

### Requirement 1: Add Icon Elements

**User Story:** As a developer, I want to add icon elements to the UI editor canvas, so that I can visually place icons at specific positions and sizes within the interview interface.

#### Acceptance Criteria

1. WHEN the user clicks the "Add Icon" button, THE Editor SHALL display the Icon_Picker dialog with a searchable list of available icons, where search matches icon names by case-insensitive substring
2. WHEN the user selects an icon from the Icon_Picker, THE Editor SHALL place the selected icon as a new Element on the Canvas at the center of the visible area with a default size of 32x32 pixels, a default color of black, a default opacity of 1.0, and a Z_Index of one above the current highest Z_Index in the Element_Registry, and SHALL dismiss the Icon_Picker dialog
3. THE Element_Registry SHALL store each icon Element with its type, icon identifier, x-position, y-position, width, height, color, opacity, and z-index
4. WHEN an icon Element is selected, THE Properties_Inspector SHALL display editable fields for width (minimum 16, maximum equal to Canvas width in pixels), height (minimum 16, maximum equal to Canvas height in pixels), x-position, y-position, color, and opacity (0.0 to 1.0)
5. WHEN the user modifies a property value in the Properties_Inspector, THE Editor SHALL update the icon Element on the Canvas within 100 milliseconds
6. IF the Icon_Picker search query matches zero icons, THEN THE Icon_Picker SHALL display a "No icons found" message
7. IF the user enters a property value outside the allowed range in the Properties_Inspector, THEN THE Properties_Inspector SHALL reject the input and display an error indication identifying the valid range for that field

### Requirement 2: Add Image Elements

**User Story:** As a developer, I want to add image elements to the UI editor canvas, so that I can place custom images at specific positions and sizes within the interview interface.

#### Acceptance Criteria

1. WHEN the user clicks the "Add Image" button, THE Editor SHALL display the Image_Uploader dialog
2. WHEN the user provides an image via file upload, THE Image_Uploader SHALL accept files in PNG, JPG, JPEG, SVG, and WebP formats with a maximum file size of 5MB
3. WHEN the user provides an image URL in the Image_Uploader, THE Editor SHALL attempt to load the image from the URL within 10 seconds, and if the URL returns a response with a content-type matching one of the accepted image formats (PNG, JPG, JPEG, SVG, WebP), place it as a new Element on the Canvas
4. WHEN an image is successfully loaded, THE Editor SHALL place the image Element on the Canvas at the center of the visible area, scaled to fit within 200x200 pixels while maintaining aspect ratio
5. THE Element_Registry SHALL store each image Element with its type, source (data URL or external URL), x-position, y-position, width (minimum 1 pixel, maximum 5000 pixels), height (minimum 1 pixel, maximum 5000 pixels), opacity (decimal value from 0.0 to 1.0 inclusive), and z-index (integer from 0 to 1000)
6. WHEN an image Element is selected, THE Properties_Inspector SHALL display editable fields for width, height, x-position, y-position, opacity (constrained to 0.0 to 1.0), and a toggle to maintain aspect ratio
7. IF the uploaded file exceeds 5MB, THEN THE Image_Uploader SHALL display an error message indicating the file size limit
8. IF the uploaded file format is not supported, THEN THE Image_Uploader SHALL display an error message listing the accepted formats
9. IF the image URL fails to load due to an unreachable host, a non-image content-type response, or a timeout exceeding 10 seconds, THEN THE Image_Uploader SHALL display an error message indicating the URL could not be loaded and the Element SHALL not be added to the Canvas

### Requirement 3: Drag to Reposition Elements

**User Story:** As a developer, I want to drag elements on the canvas to reposition them, so that I can arrange icons and images precisely where I want them in the interface layout.

#### Acceptance Criteria

1. WHEN the user clicks on an Element on the Canvas, THE Editor SHALL select that Element and display the Drag_Handle and Resize_Handle indicators
2. WHEN the user presses and holds the mouse button on the body of a selected Element or its Drag_Handle (but not on a Resize_Handle), THE Editor SHALL initiate a drag operation
3. WHILE the user drags an Element, THE Editor SHALL update the Element position on the Canvas within each animation frame (approximately 16ms) maintaining the offset between the initial mouse click point and the Element origin so that the Element does not jump to the cursor
4. WHEN the user releases the mouse button during a drag operation, THE Editor SHALL finalize the Element position and update the Element_Registry with the new x-position and y-position
5. WHILE the user drags an Element, THE Properties_Inspector SHALL display the current x-position and y-position values updating within each animation frame
6. THE Editor SHALL constrain Element positions so that the entire Element bounding box remains within the visible Canvas boundaries, clamping the position if the user attempts to drag beyond the edge
7. IF the user clicks on an empty area of the Canvas while no drag operation is active, THEN THE Editor SHALL deselect the currently selected Element and hide the Drag_Handle and Resize_Handle indicators

### Requirement 4: Resize Elements

**User Story:** As a developer, I want to resize elements on the canvas by dragging their edges or corners, so that I can adjust icons and images to the exact dimensions I need.

#### Acceptance Criteria

1. WHEN an Element is selected, THE Editor SHALL display eight Resize_Handle indicators (four corners and four edge midpoints) around the Element's bounding box
2. WHEN the user drags a corner Resize_Handle, THE Editor SHALL resize the Element proportionally (maintaining aspect ratio) anchored from the opposite corner, updating the visual representation on every animation frame
3. WHEN the user drags an edge midpoint Resize_Handle, THE Editor SHALL resize the Element along that single axis anchored from the opposite edge, updating the visual representation on every animation frame
4. WHEN the user releases the mouse button after a resize operation, THE Editor SHALL update the Element_Registry with the new width, height, and position values
5. WHILE the user is performing a resize operation, THE Editor SHALL clamp the Element dimensions to a minimum of 16x16 pixels, preventing further reduction below that bound
6. WHILE the user is performing a resize operation, THE Editor SHALL clamp the Element dimensions to a maximum equal to the Canvas dimensions, preventing further expansion beyond that bound
7. WHILE the user resizes an Element, THE Properties_Inspector SHALL display the current width and height values updating on every animation frame
8. WHEN the user hovers over a Resize_Handle, THE Editor SHALL change the cursor to the corresponding directional resize cursor (e.g., nw-resize for top-left corner, ew-resize for left/right edges)

### Requirement 5: Element Selection and Multi-Select

**User Story:** As a developer, I want to select one or multiple elements to manage them together, so that I can efficiently arrange groups of elements.

#### Acceptance Criteria

1. WHEN the user clicks on an Element, THE Editor SHALL select that Element, deselect all other Elements, and display the Drag_Handle and Resize_Handle indicators on the selected Element
2. WHEN the user holds the Shift key and clicks on an unselected Element, THE Editor SHALL add that Element to the current selection without deselecting other Elements
3. WHEN the user holds the Shift key and clicks on an already-selected Element, THE Editor SHALL remove that Element from the current selection
4. WHEN the user clicks on an empty area of the Canvas, THE Editor SHALL deselect all Elements and hide all selection indicators
5. WHEN multiple Elements are selected, THE Editor SHALL display a combined bounding box around all selected Elements and hide individual Resize_Handle indicators
6. WHEN the user drags a multi-selected group, THE Editor SHALL move all selected Elements together maintaining their relative positions, constrained so that no Element moves outside the visible Canvas boundaries
7. WHEN the user releases the mouse button after dragging a multi-selected group, THE Editor SHALL update the Element_Registry with the new x-position and y-position for each moved Element
8. WHEN the user presses the Delete key with one or more Elements selected, THE Editor SHALL remove the selected Elements from the Canvas and the Element_Registry
9. WHILE multiple Elements are selected, THE Properties_Inspector SHALL display only the properties shared across all selected Element types and apply any property change to all selected Elements simultaneously

### Requirement 6: Element Z-Index (Layer Order) Management

**User Story:** As a developer, I want to control the stacking order of elements, so that I can layer icons and images in front of or behind each other.

#### Acceptance Criteria

1. WHEN an Element is selected, THE Properties_Inspector SHALL display the current Z_Index integer value and four layer-order controls: "Bring to Front", "Send to Back", "Move Forward", and "Move Backward"
2. WHEN the user clicks "Bring to Front", THE Editor SHALL set the selected Element Z_Index to one above the current highest Z_Index in the Element_Registry
3. WHEN the user clicks "Send to Back", THE Editor SHALL set the selected Element Z_Index to one below the current lowest Z_Index in the Element_Registry
4. WHEN the user clicks "Move Forward", THE Editor SHALL swap the Z_Index of the selected Element with the Element that has the next higher Z_Index in the Element_Registry
5. WHEN the user clicks "Move Backward", THE Editor SHALL swap the Z_Index of the selected Element with the Element that has the next lower Z_Index in the Element_Registry
6. THE Canvas SHALL render Elements in ascending Z_Index order so that higher Z_Index Elements appear in front of lower Z_Index Elements, and IF two Elements share the same Z_Index, THEN THE Canvas SHALL render them in the order they were added to the Element_Registry
7. IF no Element is selected, THEN THE Properties_Inspector SHALL disable the four layer-order controls
8. IF the selected Element already has the highest Z_Index in the Element_Registry when "Move Forward" is clicked, THEN THE Editor SHALL leave the Z_Index unchanged
9. IF the selected Element already has the lowest Z_Index in the Element_Registry when "Move Backward" is clicked, THEN THE Editor SHALL leave the Z_Index unchanged

### Requirement 7: Element Persistence and Export

**User Story:** As a developer, I want placed elements to be saved and exported alongside the theme, so that my layout work persists across sessions.

#### Acceptance Criteria

1. WHEN the user clicks "Save to Live UI", THE Editor SHALL persist all Element_Registry data to the server alongside the existing theme data and display a success confirmation message within 3 seconds
2. IF the save operation fails due to a server or network error, THEN THE Editor SHALL display an error message indicating the save was unsuccessful and retain all Element_Registry data in its current state on the Canvas
3. WHEN the Editor loads, THE Editor SHALL retrieve previously saved Element_Registry data from the server and render all stored Elements on the Canvas at their saved positions and sizes; IF no previously saved Element_Registry data exists, THEN THE Editor SHALL display an empty Canvas with no Elements
4. WHEN the user clicks "Export Theme JSON", THE Editor SHALL include the Element_Registry data in the exported JSON alongside the theme configuration
5. WHEN the user clicks "Reset to Defaults", THE Editor SHALL display a confirmation prompt; WHEN the user confirms the reset, THE Editor SHALL remove all Elements from the Canvas and clear the Element_Registry
6. IF the user cancels the reset confirmation prompt, THEN THE Editor SHALL take no action and preserve the current Element_Registry state
7. THE Element_Registry serialization format SHALL include for each Element: type, x-position, y-position, width, height, opacity, z-index, and the following type-specific properties — icon identifier and color for icon Elements, source URL or data URL for image Elements, and text content, font size, font weight, and color for text Elements

### Requirement 8: Canvas Grid and Snap-to-Grid

**User Story:** As a developer, I want an optional alignment grid on the canvas, so that I can position elements precisely and consistently.

#### Acceptance Criteria

1. WHEN the user enables the "Show Grid" toggle, THE Canvas SHALL display a grid overlay of evenly spaced lines with configurable spacing (default 16 pixels, minimum 4 pixels, maximum 128 pixels)
2. WHILE the grid is enabled, WHEN the user drags an Element, THE Editor SHALL snap the Element's top-left corner position to the nearest grid intersection upon release
3. WHILE the grid is enabled, WHEN the user resizes an Element, THE Editor SHALL snap the Element's width and height to the nearest multiple of the grid spacing (with a minimum snapped dimension of one grid increment)
4. WHEN the user modifies the grid spacing value to a valid integer within 4 to 128 pixels, THE Canvas SHALL update the grid overlay to reflect the new spacing while preserving existing Element positions unchanged
5. WHEN the user disables the "Show Grid" toggle, THE Canvas SHALL hide the grid overlay and disable snap behavior while preserving all current Element positions unchanged
6. IF the user enters a grid spacing value that is non-numeric or outside the range of 4 to 128 pixels, THEN THE Editor SHALL reject the input, retain the previous valid spacing value, and display an error message indicating the acceptable range

### Requirement 9: Undo and Redo Operations

**User Story:** As a developer, I want to undo and redo my editing actions, so that I can experiment freely and revert mistakes without starting over.

#### Acceptance Criteria

1. WHEN the user performs an action that modifies the Element_Registry (add, delete, move, resize, property change), THE Editor SHALL push a snapshot of the Element_Registry state immediately before the action onto the undo stack and clear the redo stack
2. WHEN the user completes a continuous drag or resize operation (mouse button release), THE Editor SHALL record the entire operation as a single undo entry representing the state before the drag or resize began
3. WHEN the user presses Ctrl+Z and the undo stack is not empty, THE Editor SHALL push the current Element_Registry state onto the redo stack and restore the Canvas and Element_Registry to the most recent state from the undo stack
4. WHEN the user presses Ctrl+Y or Ctrl+Shift+Z and the redo stack is not empty, THE Editor SHALL push the current Element_Registry state onto the undo stack and restore the Canvas and Element_Registry to the most recent state from the redo stack
5. THE Editor SHALL maintain a maximum undo history of 50 states, discarding the oldest state when a new state is pushed and the stack is at capacity
6. IF the undo stack is empty and the user presses Ctrl+Z, THEN THE Editor SHALL take no action and the Canvas shall remain unchanged
7. IF the redo stack is empty and the user presses Ctrl+Y or Ctrl+Shift+Z, THEN THE Editor SHALL take no action and the Canvas shall remain unchanged

### Requirement 10: Add Text Block Elements

**User Story:** As a developer, I want to add custom text blocks to the canvas, so that I can place labels, headings, or decorative text at specific positions.

#### Acceptance Criteria

1. WHEN the user clicks the "Add Text" button, THE Editor SHALL place a new text Element on the Canvas at the center of the visible area with a default width of 200 pixels, a default font size of 16 pixels, and default placeholder text "Double-click to edit"
2. WHEN the user double-clicks a text Element, THE Editor SHALL enable inline text editing mode for that Element, displaying a visible text cursor and allowing keyboard input within the Element boundaries
3. WHEN the user presses Escape or clicks outside the text Element while in inline text editing mode, THE Editor SHALL exit inline text editing mode and commit the current text content
4. WHEN a text Element is selected, THE Properties_Inspector SHALL display editable fields for font size (range: 8 to 128 pixels), font weight (normal or bold), text color, x-position, y-position, width, and opacity (range: 0.0 to 1.0)
5. WHEN the user modifies text content or properties, THE Editor SHALL update the text Element on the Canvas within 100 milliseconds
6. IF the user clears all text content from a text Element during inline editing and exits editing mode, THEN THE Editor SHALL restore the placeholder text "Double-click to edit" and retain the Element on the Canvas
7. THE Element_Registry SHALL store each text Element with its type, content (maximum 500 characters), font size, font weight, color, x-position, y-position, width, opacity, and z-index
