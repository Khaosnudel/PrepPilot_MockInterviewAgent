/**
 * image-uploader.js — Image Uploader dialog component for the Dynamic UI Editor
 *
 * Provides a modal dialog for uploading images via file input or URL.
 * Validates file format/size and URL accessibility before returning
 * the image source and natural dimensions.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 2.9
 */

/**
 * @typedef {Object} ImageSelection
 * @property {string} source - Data URL (base64) or external URL
 * @property {number} width - Natural width of the image in pixels
 * @property {number} height - Natural height of the image in pixels
 * @property {number} aspectRatio - width / height ratio
 */

/**
 * ImageUploader class — creates a modal dialog for image upload/URL input.
 * The dialog creates its own DOM elements when opened and removes them when closed.
 */
class ImageUploader {
    constructor() {
        this._resolve = null;
        this._overlay = null;
        this._abortController = null;
    }

    /**
     * Opens the Image Uploader dialog.
     * Returns a Promise that resolves with an ImageSelection on success,
     * or null if the user cancels.
     *
     * @returns {Promise<ImageSelection|null>}
     */
    open() {
        return new Promise((resolve) => {
            this._resolve = resolve;
            this._createDialog();
        });
    }

    /**
     * Closes the dialog and resolves with null (cancel).
     */
    close() {
        this._cleanup();
        if (this._resolve) {
            this._resolve(null);
            this._resolve = null;
        }
    }

    /**
     * Creates the modal dialog DOM elements and attaches event listeners.
     * @private
     */
    _createDialog() {
        // Create overlay backdrop
        this._overlay = document.createElement('div');
        this._overlay.className = 'image-uploader-overlay';
        Object.assign(this._overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '10000'
        });

        // Create dialog container
        const dialog = document.createElement('div');
        dialog.className = 'image-uploader-dialog';
        Object.assign(dialog.style, {
            backgroundColor: '#1e293b',
            borderRadius: '8px',
            padding: '24px',
            width: '440px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto',
            color: '#e2e8f0',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        });

        // Title
        const title = document.createElement('h3');
        title.textContent = 'Add Image';
        Object.assign(title.style, {
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#f1f5f9'
        });
        dialog.appendChild(title);

        // File upload section
        const fileSection = this._createFileSection();
        dialog.appendChild(fileSection);

        // Divider
        const divider = document.createElement('div');
        Object.assign(divider.style, {
            display: 'flex',
            alignItems: 'center',
            margin: '16px 0',
            gap: '12px'
        });
        const line1 = document.createElement('div');
        Object.assign(line1.style, { flex: '1', height: '1px', backgroundColor: '#334155' });
        const orText = document.createElement('span');
        orText.textContent = 'OR';
        Object.assign(orText.style, { fontSize: '12px', color: '#64748b', fontWeight: '500' });
        const line2 = document.createElement('div');
        Object.assign(line2.style, { flex: '1', height: '1px', backgroundColor: '#334155' });
        divider.appendChild(line1);
        divider.appendChild(orText);
        divider.appendChild(line2);
        dialog.appendChild(divider);

        // URL input section
        const urlSection = this._createUrlSection();
        dialog.appendChild(urlSection);

        // Error message area
        this._errorEl = document.createElement('div');
        this._errorEl.className = 'image-uploader-error';
        Object.assign(this._errorEl.style, {
            display: 'none',
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '4px',
            color: '#fca5a5',
            fontSize: '13px'
        });
        dialog.appendChild(this._errorEl);

        // Button row
        const buttonRow = document.createElement('div');
        Object.assign(buttonRow.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '20px'
        });
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        Object.assign(cancelBtn.style, {
            padding: '8px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #475569',
            borderRadius: '4px',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '14px'
        });
        cancelBtn.addEventListener('click', () => this.close());
        buttonRow.appendChild(cancelBtn);
        dialog.appendChild(buttonRow);

        this._overlay.appendChild(dialog);
        document.body.appendChild(this._overlay);

        // Close on overlay click (outside dialog)
        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay) {
                this.close();
            }
        });

        // Close on Escape key
        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    /**
     * Creates the file upload section of the dialog.
     * @private
     * @returns {HTMLElement}
     */
    _createFileSection() {
        const section = document.createElement('div');

        const label = document.createElement('label');
        label.textContent = 'Upload from file';
        Object.assign(label.style, {
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#cbd5e1'
        });
        section.appendChild(label);

        const hint = document.createElement('div');
        hint.textContent = 'Accepted: PNG, JPG, JPEG, SVG, WebP (max 5MB)';
        Object.assign(hint.style, {
            fontSize: '12px',
            color: '#64748b',
            marginBottom: '8px'
        });
        section.appendChild(hint);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp';
        Object.assign(fileInput.style, {
            width: '100%',
            padding: '8px',
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '4px',
            color: '#e2e8f0',
            fontSize: '14px',
            cursor: 'pointer'
        });
        fileInput.addEventListener('change', (e) => this._handleFileSelect(e));
        section.appendChild(fileInput);

        return section;
    }

    /**
     * Creates the URL input section of the dialog.
     * @private
     * @returns {HTMLElement}
     */
    _createUrlSection() {
        const section = document.createElement('div');

        const label = document.createElement('label');
        label.textContent = 'Load from URL';
        Object.assign(label.style, {
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#cbd5e1'
        });
        section.appendChild(label);

        const inputRow = document.createElement('div');
        Object.assign(inputRow.style, {
            display: 'flex',
            gap: '8px'
        });

        this._urlInput = document.createElement('input');
        this._urlInput.type = 'url';
        this._urlInput.placeholder = 'https://example.com/image.png';
        Object.assign(this._urlInput.style, {
            flex: '1',
            padding: '8px 12px',
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '4px',
            color: '#e2e8f0',
            fontSize: '14px'
        });
        inputRow.appendChild(this._urlInput);

        this._loadBtn = document.createElement('button');
        this._loadBtn.textContent = 'Load';
        Object.assign(this._loadBtn.style, {
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
        });
        this._loadBtn.addEventListener('click', () => this._handleUrlLoad());
        inputRow.appendChild(this._loadBtn);

        section.appendChild(inputRow);

        return section;
    }

    /**
     * Handles file selection from the file input.
     * Validates format and size, then reads the file as a data URL.
     * @private
     * @param {Event} event
     */
    _handleFileSelect(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        this._hideError();

        // Use validators.js for file validation
        const validation = (typeof validateImageFile === 'function')
            ? validateImageFile(file)
            : this._fallbackValidateFile(file);

        if (!validation.valid) {
            this._showError(validation.error);
            return;
        }

        // Read file as data URL
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            this._loadImageAndResolve(dataUrl);
        };
        reader.onerror = () => {
            this._showError('Failed to read the file. Please try again.');
        };
        reader.readAsDataURL(file);
    }

    /**
     * Fallback file validation if validateImageFile is not available globally.
     * @private
     * @param {File} file
     * @returns {{valid: boolean, error: string|null}}
     */
    _fallbackValidateFile(file) {
        const MAX_SIZE = 5 * 1024 * 1024;
        const FORMATS = ['png', 'jpg', 'jpeg', 'svg', 'webp'];

        const ext = (file.name || '').split('.').pop().toLowerCase();
        if (!FORMATS.includes(ext)) {
            return {
                valid: false,
                error: `Unsupported format. Accepted formats: ${FORMATS.map(f => f.toUpperCase()).join(', ')}`
            };
        }

        if (file.size > MAX_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            return {
                valid: false,
                error: `File size (${sizeMB}MB) exceeds the 5MB limit`
            };
        }

        return { valid: true, error: null };
    }

    /**
     * Handles URL loading. Fetches the image with a 10-second timeout
     * and validates the content-type.
     * @private
     */
    async _handleUrlLoad() {
        const url = this._urlInput.value.trim();
        if (!url) {
            this._showError('Please enter an image URL.');
            return;
        }

        this._hideError();
        this._setLoading(true);

        // Abort any previous request
        if (this._abortController) {
            this._abortController.abort();
        }
        this._abortController = new AbortController();

        // Set up 10-second timeout
        const timeoutId = setTimeout(() => {
            if (this._abortController) {
                this._abortController.abort();
            }
        }, 10000);

        try {
            const response = await fetch(url, {
                signal: this._abortController.signal,
                mode: 'cors'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                this._showError(`URL could not be loaded (HTTP ${response.status}). Please check the URL and try again.`);
                this._setLoading(false);
                return;
            }

            // Validate content-type
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            const validContentTypes = [
                'image/png',
                'image/jpg',
                'image/jpeg',
                'image/svg+xml',
                'image/webp'
            ];

            const isValidImage = validContentTypes.some(type => contentType.includes(type));
            if (!isValidImage) {
                this._showError('The URL does not point to a supported image format (PNG, JPG, JPEG, SVG, WebP).');
                this._setLoading(false);
                return;
            }

            // Load the image to get natural dimensions
            this._loadImageAndResolve(url);
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                this._showError('Request timed out after 10 seconds. Please check the URL and try again.');
            } else {
                this._showError('URL could not be loaded. The host may be unreachable or the request was blocked.');
            }
            this._setLoading(false);
        }
    }

    /**
     * Loads an image from a source (data URL or external URL) to determine
     * its natural dimensions, then resolves the dialog promise.
     * @private
     * @param {string} source - Data URL or external URL
     */
    _loadImageAndResolve(source) {
        const img = new Image();

        img.onload = () => {
            const width = img.naturalWidth;
            const height = img.naturalHeight;
            const aspectRatio = height > 0 ? width / height : 1;

            const result = {
                source: source,
                width: width,
                height: height,
                aspectRatio: aspectRatio
            };

            this._cleanup();
            if (this._resolve) {
                this._resolve(result);
                this._resolve = null;
            }
        };

        img.onerror = () => {
            this._showError('Failed to load the image. The file may be corrupted or the URL is invalid.');
            this._setLoading(false);
        };

        img.src = source;
    }

    /**
     * Displays an error message in the dialog.
     * @private
     * @param {string} message
     */
    _showError(message) {
        if (this._errorEl) {
            this._errorEl.textContent = message;
            this._errorEl.style.display = 'block';
        }
    }

    /**
     * Hides the error message.
     * @private
     */
    _hideError() {
        if (this._errorEl) {
            this._errorEl.textContent = '';
            this._errorEl.style.display = 'none';
        }
    }

    /**
     * Sets the loading state on the Load button.
     * @private
     * @param {boolean} loading
     */
    _setLoading(loading) {
        if (this._loadBtn) {
            this._loadBtn.disabled = loading;
            this._loadBtn.textContent = loading ? 'Loading...' : 'Load';
            this._loadBtn.style.opacity = loading ? '0.6' : '1';
            this._loadBtn.style.cursor = loading ? 'not-allowed' : 'pointer';
        }
    }

    /**
     * Removes all dialog DOM elements and cleans up event listeners.
     * @private
     */
    _cleanup() {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }

        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }

        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._errorEl = null;
        this._urlInput = null;
        this._loadBtn = null;
    }
}

// Export for use in other modules and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ImageUploader };
}
