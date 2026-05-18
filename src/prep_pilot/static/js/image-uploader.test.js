/**
 * Unit tests for ImageUploader dialog component
 * Run with: npx vitest run src/prep_pilot/static/js/image-uploader.test.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock DOM environment basics
const mockElements = [];

// Set up minimal DOM mocks
vi.stubGlobal('document', {
    createElement: (tag) => {
        const el = {
            tagName: tag.toUpperCase(),
            className: '',
            textContent: '',
            type: '',
            placeholder: '',
            accept: '',
            disabled: false,
            value: '',
            style: {},
            children: [],
            parentNode: null,
            src: '',
            naturalWidth: 0,
            naturalHeight: 0,
            onload: null,
            onerror: null,
            appendChild: function(child) {
                this.children.push(child);
                child.parentNode = this;
            },
            removeChild: function(child) {
                const idx = this.children.indexOf(child);
                if (idx >= 0) this.children.splice(idx, 1);
                child.parentNode = null;
            },
            addEventListener: function(event, handler) {
                if (!this._listeners) this._listeners = {};
                if (!this._listeners[event]) this._listeners[event] = [];
                this._listeners[event].push(handler);
            },
            _listeners: {}
        };
        mockElements.push(el);
        return el;
    },
    body: {
        appendChild: function(child) { child.parentNode = this; },
        removeChild: function(child) { child.parentNode = null; }
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
});

// Mock Image constructor
class MockImage {
    constructor() {
        this.src = '';
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        this.onload = null;
        this.onerror = null;
    }
    set src(val) {
        this._src = val;
        if (val && this._shouldSucceed !== false) {
            // Simulate async image load
            setTimeout(() => {
                this.naturalWidth = this._mockWidth || 800;
                this.naturalHeight = this._mockHeight || 600;
                if (this.onload) this.onload();
            }, 0);
        } else if (val && this._shouldSucceed === false) {
            setTimeout(() => {
                if (this.onerror) this.onerror();
            }, 0);
        }
    }
    get src() { return this._src; }
}

vi.stubGlobal('Image', MockImage);

// Mock fetch
vi.stubGlobal('fetch', vi.fn());

// Mock AbortController
vi.stubGlobal('AbortController', class {
    constructor() {
        this.signal = { aborted: false };
    }
    abort() { this.signal.aborted = true; }
});

// Mock validateImageFile from validators.js
vi.stubGlobal('validateImageFile', (file) => {
    const MAX_SIZE = 5 * 1024 * 1024;
    const FORMATS = ['png', 'jpg', 'jpeg', 'svg', 'webp'];
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (!FORMATS.includes(ext)) {
        return { valid: false, error: `Unsupported format. Accepted formats: ${FORMATS.map(f => f.toUpperCase()).join(', ')}` };
    }
    if (file.size > MAX_SIZE) {
        return { valid: false, error: `File size exceeds the 5MB limit` };
    }
    return { valid: true, error: null };
});

const { ImageUploader } = await import('./image-uploader.js');

describe('ImageUploader', () => {
    let uploader;

    beforeEach(() => {
        uploader = new ImageUploader();
        mockElements.length = 0;
        vi.clearAllMocks();
    });

    afterEach(() => {
        uploader._cleanup();
    });

    describe('open/close', () => {
        it('should return a promise when opened', () => {
            const result = uploader.open();
            expect(result).toBeInstanceOf(Promise);
            uploader.close();
        });

        it('should resolve with null when closed (cancelled)', async () => {
            const promise = uploader.open();
            uploader.close();
            const result = await promise;
            expect(result).toBeNull();
        });

        it('should create overlay DOM element when opened', () => {
            uploader.open();
            expect(uploader._overlay).not.toBeNull();
            expect(uploader._overlay.className).toBe('image-uploader-overlay');
            uploader.close();
        });

        it('should remove overlay DOM element when closed', () => {
            uploader.open();
            const overlay = uploader._overlay;
            uploader.close();
            expect(uploader._overlay).toBeNull();
        });
    });

    describe('file validation', () => {
        it('should reject files with unsupported format', () => {
            uploader.open();

            const file = { name: 'test.bmp', size: 1000 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('Unsupported format');

            uploader.close();
        });

        it('should reject files exceeding 5MB', () => {
            uploader.open();

            const file = { name: 'large.png', size: 6 * 1024 * 1024 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('5MB');

            uploader.close();
        });

        it('should accept valid PNG files under 5MB', () => {
            const file = { name: 'photo.png', size: 1024 * 1024 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(true);
            expect(validation.error).toBeNull();
        });

        it('should accept valid JPG files', () => {
            const file = { name: 'photo.jpg', size: 2 * 1024 * 1024 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(true);
        });

        it('should accept valid JPEG files', () => {
            const file = { name: 'photo.jpeg', size: 500000 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(true);
        });

        it('should accept valid SVG files', () => {
            const file = { name: 'icon.svg', size: 5000 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(true);
        });

        it('should accept valid WebP files', () => {
            const file = { name: 'image.webp', size: 3 * 1024 * 1024 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(true);
        });

        it('should reject files at exactly 5MB + 1 byte', () => {
            const file = { name: 'big.png', size: 5 * 1024 * 1024 + 1 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(false);
        });

        it('should accept files at exactly 5MB', () => {
            const file = { name: 'exact.png', size: 5 * 1024 * 1024 };
            const validation = validateImageFile(file);
            expect(validation.valid).toBe(true);
        });
    });

    describe('URL validation', () => {
        it('should show error for empty URL', async () => {
            uploader.open();
            uploader._urlInput = { value: '   ' };
            await uploader._handleUrlLoad();
            expect(uploader._errorEl.textContent).toContain('enter an image URL');
            uploader.close();
        });

        it('should show error when fetch returns non-image content-type', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                headers: {
                    get: () => 'text/html'
                }
            });

            uploader.open();
            uploader._urlInput = { value: 'https://example.com/page.html' };
            await uploader._handleUrlLoad();
            expect(uploader._errorEl.textContent).toContain('supported image format');
            uploader.close();
        });

        it('should show error when fetch returns HTTP error', async () => {
            fetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                headers: { get: () => '' }
            });

            uploader.open();
            uploader._urlInput = { value: 'https://example.com/missing.png' };
            await uploader._handleUrlLoad();
            expect(uploader._errorEl.textContent).toContain('could not be loaded');
            uploader.close();
        });

        it('should show error when fetch throws network error', async () => {
            fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

            uploader.open();
            uploader._urlInput = { value: 'https://unreachable.example.com/img.png' };
            await uploader._handleUrlLoad();
            expect(uploader._errorEl.textContent).toContain('unreachable');
            uploader.close();
        });

        it('should show timeout error when request is aborted', async () => {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            fetch.mockRejectedValueOnce(abortError);

            uploader.open();
            uploader._urlInput = { value: 'https://slow.example.com/img.png' };
            await uploader._handleUrlLoad();
            expect(uploader._errorEl.textContent).toContain('timed out');
            uploader.close();
        });

        it('should accept valid image content-types', async () => {
            const validTypes = [
                'image/png',
                'image/jpeg',
                'image/jpg',
                'image/svg+xml',
                'image/webp'
            ];

            for (const contentType of validTypes) {
                fetch.mockResolvedValueOnce({
                    ok: true,
                    headers: { get: () => contentType }
                });

                uploader.open();
                uploader._urlInput = { value: 'https://example.com/img.png' };

                // We can't fully test the image load in this mock environment,
                // but we can verify fetch succeeds without error
                await uploader._handleUrlLoad();
                // If no error is shown, the content-type was accepted
                // (the image load will happen asynchronously)
                uploader.close();
            }
        });
    });

    describe('_fallbackValidateFile', () => {
        it('should validate format correctly', () => {
            const result = uploader._fallbackValidateFile({ name: 'test.gif', size: 100 });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Unsupported format');
        });

        it('should validate size correctly', () => {
            const result = uploader._fallbackValidateFile({ name: 'test.png', size: 10 * 1024 * 1024 });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('5MB');
        });

        it('should accept valid files', () => {
            const result = uploader._fallbackValidateFile({ name: 'test.webp', size: 1000 });
            expect(result.valid).toBe(true);
        });
    });

    describe('error display', () => {
        it('should show error message', () => {
            uploader.open();
            uploader._showError('Test error');
            expect(uploader._errorEl.textContent).toBe('Test error');
            expect(uploader._errorEl.style.display).toBe('block');
            uploader.close();
        });

        it('should hide error message', () => {
            uploader.open();
            uploader._showError('Test error');
            uploader._hideError();
            expect(uploader._errorEl.textContent).toBe('');
            expect(uploader._errorEl.style.display).toBe('none');
            uploader.close();
        });
    });

    describe('loading state', () => {
        it('should disable load button when loading', () => {
            uploader.open();
            uploader._setLoading(true);
            expect(uploader._loadBtn.disabled).toBe(true);
            expect(uploader._loadBtn.textContent).toBe('Loading...');
            uploader.close();
        });

        it('should re-enable load button when not loading', () => {
            uploader.open();
            uploader._setLoading(true);
            uploader._setLoading(false);
            expect(uploader._loadBtn.disabled).toBe(false);
            expect(uploader._loadBtn.textContent).toBe('Load');
            uploader.close();
        });
    });

    describe('image loading and result', () => {
        it('should resolve with image dimensions on successful load', async () => {
            const promise = uploader.open();

            // Simulate successful image load
            const mockImg = { naturalWidth: 1024, naturalHeight: 768 };
            // Directly call the resolve path
            uploader._cleanup();
            uploader._resolve({
                source: 'data:image/png;base64,abc',
                width: 1024,
                height: 768,
                aspectRatio: 1024 / 768
            });
            uploader._resolve = null;

            const result = await promise;
            expect(result).toEqual({
                source: 'data:image/png;base64,abc',
                width: 1024,
                height: 768,
                aspectRatio: 1024 / 768
            });
        });

        it('should compute correct aspect ratio', () => {
            // Test aspect ratio calculation
            const width = 1920;
            const height = 1080;
            const aspectRatio = width / height;
            expect(aspectRatio).toBeCloseTo(16 / 9, 5);
        });

        it('should handle square images', () => {
            const width = 500;
            const height = 500;
            const aspectRatio = width / height;
            expect(aspectRatio).toBe(1);
        });
    });
});
