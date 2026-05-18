/**
 * ElementToolbar - Provides "Add Icon", "Add Image", and "Add Text" buttons
 * for the editor sidebar. Wires each button to its respective dialog/action
 * and adds elements to the canvas at center with appropriate defaults.
 *
 * Dependencies:
 *   - ElementRegistry (for adding elements)
 *   - CanvasRenderer (for getting canvas bounds and rendering)
 *   - IconPicker (for icon selection dialog)
 *   - ImageUploader (for image upload dialog)
 *   - geometry.js (for scaleToFit)
 *
 * Requirements: 1.1, 1.2, 2.1, 2.3, 2.4, 10.1
 */

class ElementToolbar {
    /**
     * @param {object} options
     * @param {HTMLElement} options.containerElement - The sidebar element to append toolbar buttons to
     * @param {object} options.registry - An ElementRegistry instance
     * @param {object} options.canvasRenderer - A CanvasRenderer instance
     * @param {object} [options.iconPicker] - An IconPicker instance (created internally if not provided)
     * @param {object} [options.imageUploader] - An ImageUploader instance (created internally if not provided)
     * @param {function} [options.scaleToFitFn] - The scaleToFit function from geometry.js
     */
    constructor(options) {
        this._container = options.containerElement;
        this._registry = options.registry;
        this._canvasRenderer = options.canvasRenderer;
        this._iconPicker = options.iconPicker || null;
        this._imageUploader = options.imageUploader || null;
        this._scaleToFit = options.scaleToFitFn || (typeof scaleToFit === 'function' ? scaleToFit : null);

        this._toolbarEl = null;
        this._init();
    }

    /**
     * Initialize the toolbar UI and wire button events.
     * @private
     */
    _init() {
        this._toolbarEl = document.createElement('div');
        this._toolbarEl.className = 'element-toolbar';
        this._toolbarEl.style.cssText = `
            margin-bottom: 1.25rem;
            border-bottom: 1px solid #334155;
            padding-bottom: 0.75rem;
        `;

        // Section title
        const title = document.createElement('div');
        title.className = 'section-title';
        title.textContent = 'Add Elements';
        title.style.cssText = `
            font-size: 0.8rem;
            font-weight: 700;
            color: #f59e0b;
            text-transform: uppercase;
            margin-bottom: 0.6rem;
            letter-spacing: 0.05em;
        `;
        this._toolbarEl.appendChild(title);

        // Button container
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `
            display: flex;
            gap: 0.5rem;
        `;

        // Add Icon button
        const addIconBtn = this._createButton('Add Icon', '🎨', () => this._handleAddIcon());
        addIconBtn.className = 'element-toolbar-add-icon';
        btnContainer.appendChild(addIconBtn);

        // Add Image button
        const addImageBtn = this._createButton('Add Image', '🖼️', () => this._handleAddImage());
        addImageBtn.className = 'element-toolbar-add-image';
        btnContainer.appendChild(addImageBtn);

        // Add Text button
        const addTextBtn = this._createButton('Add Text', '✏️', () => this._handleAddText());
        addTextBtn.className = 'element-toolbar-add-text';
        btnContainer.appendChild(addTextBtn);

        this._toolbarEl.appendChild(btnContainer);

        // Append to the container element
        if (this._container) {
            this._container.appendChild(this._toolbarEl);
        }
    }

    /**
     * Create a styled toolbar button.
     * @param {string} label - Button text
     * @param {string} icon - Emoji icon prefix
     * @param {function} onClick - Click handler
     * @returns {HTMLButtonElement}
     * @private
     */
    _createButton(label, icon, onClick) {
        const btn = document.createElement('button');
        btn.textContent = `${icon} ${label}`;
        btn.style.cssText = `
            flex: 1;
            padding: 0.5rem 0.4rem;
            border-radius: 6px;
            border: 1px solid #334155;
            background: #0f172a;
            color: #e2e8f0;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#1e293b';
            btn.style.borderColor = '#475569';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#0f172a';
            btn.style.borderColor = '#334155';
        });
        btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * Calculate the center position of the canvas for placing a new element.
     * @param {number} elementWidth - Width of the element to place
     * @param {number} elementHeight - Height of the element to place
     * @returns {{x: number, y: number}} Center position
     * @private
     */
    _getCanvasCenter(elementWidth, elementHeight) {
        const bounds = this._canvasRenderer.getCanvasBounds();
        const x = Math.max(0, Math.floor((bounds.width - elementWidth) / 2));
        const y = Math.max(0, Math.floor((bounds.height - elementHeight) / 2));
        return { x, y };
    }

    /**
     * Handle "Add Icon" button click.
     * Opens the IconPicker dialog; on selection, adds an icon element at canvas center
     * with defaults: 32×32, black color, opacity 1.0, z-index = max+1.
     * @private
     */
    async _handleAddIcon() {
        const picker = this._iconPicker || new IconPicker();
        const selection = await picker.open();

        if (!selection) return; // User cancelled

        const width = 32;
        const height = 32;
        const center = this._getCanvasCenter(width, height);

        const element = this._registry.addElement('icon', {
            x: center.x,
            y: center.y,
            width: width,
            height: height,
            color: '#000000',
            opacity: 1.0,
            iconId: selection.identifier,
            svgContent: selection.svgContent
        });

        this._canvasRenderer.renderElement(element.id);
    }

    /**
     * Handle "Add Image" button click.
     * Opens the ImageUploader dialog; on success, adds an image element at canvas center
     * scaled to fit within 200×200 maintaining aspect ratio.
     * @private
     */
    async _handleAddImage() {
        const uploader = this._imageUploader || new ImageUploader();
        const selection = await uploader.open();

        if (!selection) return; // User cancelled

        // Scale image to fit within 200×200 maintaining aspect ratio
        let scaledWidth, scaledHeight;
        if (this._scaleToFit) {
            const scaled = this._scaleToFit(selection.width, selection.height, 200, 200);
            scaledWidth = scaled.width;
            scaledHeight = scaled.height;
        } else {
            // Fallback scaling if scaleToFit is not available
            const ratio = Math.min(200 / selection.width, 200 / selection.height, 1);
            scaledWidth = selection.width * ratio;
            scaledHeight = selection.height * ratio;
        }

        const center = this._getCanvasCenter(scaledWidth, scaledHeight);

        const element = this._registry.addElement('image', {
            x: center.x,
            y: center.y,
            width: scaledWidth,
            height: scaledHeight,
            opacity: 1.0,
            source: selection.source,
            maintainAspectRatio: true
        });

        this._canvasRenderer.renderElement(element.id);
    }

    /**
     * Handle "Add Text" button click.
     * Adds a text element at canvas center with defaults:
     * width 200px, font size 16px, placeholder "Double-click to edit".
     * @private
     */
    _handleAddText() {
        const width = 200;
        const height = 40; // Reasonable default height for a single line of 16px text
        const center = this._getCanvasCenter(width, height);

        const element = this._registry.addElement('text', {
            x: center.x,
            y: center.y,
            width: width,
            height: height,
            opacity: 1.0,
            content: 'Double-click to edit',
            fontSize: 16,
            fontWeight: 'normal',
            color: '#e2e8f0'
        });

        this._canvasRenderer.renderElement(element.id);
    }

    /**
     * Get the toolbar DOM element (useful for testing or manual placement).
     * @returns {HTMLElement}
     */
    getElement() {
        return this._toolbarEl;
    }

    /**
     * Remove the toolbar from the DOM.
     */
    destroy() {
        if (this._toolbarEl && this._toolbarEl.parentNode) {
            this._toolbarEl.parentNode.removeChild(this._toolbarEl);
        }
        this._toolbarEl = null;
    }
}

// Export for both browser and Node.js (testing) environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ElementToolbar };
}
