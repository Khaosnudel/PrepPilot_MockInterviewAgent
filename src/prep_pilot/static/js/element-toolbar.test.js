/**
 * Unit tests for ElementToolbar
 * Run with: npx vitest run src/prep_pilot/static/js/element-toolbar.test.js
 *
 * Tests the "Add Icon", "Add Image", and "Add Text" toolbar buttons
 * and their integration with ElementRegistry, CanvasRenderer, IconPicker,
 * and ImageUploader.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { ElementRegistry } = await import('./element-registry.js');
const { ElementToolbar } = await import('./element-toolbar.js');

// Mock CanvasRenderer
function createMockCanvasRenderer() {
    return {
        getCanvasBounds: vi.fn(() => ({ width: 800, height: 600 })),
        renderElement: vi.fn(),
        renderAll: vi.fn()
    };
}

// Mock IconPicker that resolves with a selection
function createMockIconPicker(selection) {
    return {
        open: vi.fn(() => Promise.resolve(selection))
    };
}

// Mock ImageUploader that resolves with a selection
function createMockImageUploader(selection) {
    return {
        open: vi.fn(() => Promise.resolve(selection))
    };
}

describe('ElementToolbar', () => {
    let container;
    let registry;
    let canvasRenderer;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        registry = new ElementRegistry();
        canvasRenderer = createMockCanvasRenderer();
    });

    describe('Initialization', () => {
        it('should create toolbar with three buttons in the container', () => {
            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer
            });

            const buttons = container.querySelectorAll('button');
            expect(buttons.length).toBe(3);
        });

        it('should have Add Icon, Add Image, and Add Text buttons', () => {
            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer
            });

            const buttons = container.querySelectorAll('button');
            const texts = Array.from(buttons).map(b => b.textContent);
            expect(texts[0]).toContain('Add Icon');
            expect(texts[1]).toContain('Add Image');
            expect(texts[2]).toContain('Add Text');
        });

        it('should have a section title "Add Elements"', () => {
            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer
            });

            const title = container.querySelector('.section-title');
            expect(title.textContent).toBe('Add Elements');
        });
    });

    describe('Add Icon', () => {
        it('should open IconPicker and add icon element on selection', async () => {
            const iconSelection = {
                identifier: 'lucide-star',
                name: 'Star',
                svgContent: '<svg>star</svg>'
            };
            const iconPicker = createMockIconPicker(iconSelection);

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                iconPicker
            });

            const addIconBtn = container.querySelector('.element-toolbar-add-icon');
            addIconBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(iconPicker.open).toHaveBeenCalled();
            const elements = registry.getAllElements();
            expect(elements.length).toBe(1);
            expect(elements[0].type).toBe('icon');
            expect(elements[0].iconId).toBe('lucide-star');
            expect(elements[0].svgContent).toBe('<svg>star</svg>');
            expect(elements[0].width).toBe(32);
            expect(elements[0].height).toBe(32);
            expect(elements[0].color).toBe('#000000');
            expect(elements[0].opacity).toBe(1.0);
        });

        it('should place icon at canvas center', async () => {
            const iconSelection = {
                identifier: 'lucide-home',
                name: 'Home',
                svgContent: '<svg>home</svg>'
            };
            const iconPicker = createMockIconPicker(iconSelection);
            canvasRenderer.getCanvasBounds.mockReturnValue({ width: 800, height: 600 });

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                iconPicker
            });

            const addIconBtn = container.querySelector('.element-toolbar-add-icon');
            addIconBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            const elements = registry.getAllElements();
            // Center: (800 - 32) / 2 = 384, (600 - 32) / 2 = 284
            expect(elements[0].x).toBe(384);
            expect(elements[0].y).toBe(284);
        });

        it('should assign z-index = max+1', async () => {
            // Add an existing element (gets z-index 1)
            registry.addElement('text', { x: 0, y: 0, width: 100, height: 30 });

            const iconSelection = {
                identifier: 'lucide-star',
                name: 'Star',
                svgContent: '<svg>star</svg>'
            };
            const iconPicker = createMockIconPicker(iconSelection);

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                iconPicker
            });

            const addIconBtn = container.querySelector('.element-toolbar-add-icon');
            addIconBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            const elements = registry.getAllElements();
            const iconEl = elements.find(e => e.type === 'icon');
            expect(iconEl.zIndex).toBe(2); // max was 1, so new is 2
        });

        it('should not add element if IconPicker is cancelled', async () => {
            const iconPicker = createMockIconPicker(null);

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                iconPicker
            });

            const addIconBtn = container.querySelector('.element-toolbar-add-icon');
            addIconBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(registry.getAllElements().length).toBe(0);
        });

        it('should call canvasRenderer.renderElement after adding icon', async () => {
            const iconSelection = {
                identifier: 'lucide-star',
                name: 'Star',
                svgContent: '<svg>star</svg>'
            };
            const iconPicker = createMockIconPicker(iconSelection);

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                iconPicker
            });

            const addIconBtn = container.querySelector('.element-toolbar-add-icon');
            addIconBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(canvasRenderer.renderElement).toHaveBeenCalled();
        });
    });

    describe('Add Image', () => {
        it('should open ImageUploader and add image element on success', async () => {
            const imageSelection = {
                source: 'data:image/png;base64,abc123',
                width: 400,
                height: 300,
                aspectRatio: 4 / 3
            };
            const imageUploader = createMockImageUploader(imageSelection);
            const scaleToFitFn = (w, h, maxW, maxH) => {
                const ratio = Math.min(maxW / w, maxH / h, 1);
                return { width: w * ratio, height: h * ratio };
            };

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                imageUploader,
                scaleToFitFn
            });

            const addImageBtn = container.querySelector('.element-toolbar-add-image');
            addImageBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(imageUploader.open).toHaveBeenCalled();
            const elements = registry.getAllElements();
            expect(elements.length).toBe(1);
            expect(elements[0].type).toBe('image');
            expect(elements[0].source).toBe('data:image/png;base64,abc123');
            expect(elements[0].maintainAspectRatio).toBe(true);
        });

        it('should scale image to fit within 200x200 maintaining aspect ratio', async () => {
            const imageSelection = {
                source: 'https://example.com/img.png',
                width: 800,
                height: 400,
                aspectRatio: 2
            };
            const imageUploader = createMockImageUploader(imageSelection);
            const scaleToFitFn = (w, h, maxW, maxH) => {
                const ratio = Math.min(maxW / w, maxH / h, 1);
                return { width: w * ratio, height: h * ratio };
            };

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                imageUploader,
                scaleToFitFn
            });

            const addImageBtn = container.querySelector('.element-toolbar-add-image');
            addImageBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            const elements = registry.getAllElements();
            // 800x400 scaled to fit 200x200: ratio = min(200/800, 200/400) = min(0.25, 0.5) = 0.25
            // Result: 200x100
            expect(elements[0].width).toBe(200);
            expect(elements[0].height).toBe(100);
        });

        it('should not scale images already within 200x200', async () => {
            const imageSelection = {
                source: 'data:image/png;base64,small',
                width: 100,
                height: 80,
                aspectRatio: 100 / 80
            };
            const imageUploader = createMockImageUploader(imageSelection);
            const scaleToFitFn = (w, h, maxW, maxH) => {
                if (w <= maxW && h <= maxH) return { width: w, height: h };
                const ratio = Math.min(maxW / w, maxH / h);
                return { width: w * ratio, height: h * ratio };
            };

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                imageUploader,
                scaleToFitFn
            });

            const addImageBtn = container.querySelector('.element-toolbar-add-image');
            addImageBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            const elements = registry.getAllElements();
            expect(elements[0].width).toBe(100);
            expect(elements[0].height).toBe(80);
        });

        it('should not add element if ImageUploader is cancelled', async () => {
            const imageUploader = createMockImageUploader(null);

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                imageUploader
            });

            const addImageBtn = container.querySelector('.element-toolbar-add-image');
            addImageBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(registry.getAllElements().length).toBe(0);
        });

        it('should place image at canvas center', async () => {
            const imageSelection = {
                source: 'data:image/png;base64,test',
                width: 200,
                height: 200,
                aspectRatio: 1
            };
            const imageUploader = createMockImageUploader(imageSelection);
            const scaleToFitFn = (w, h, maxW, maxH) => {
                if (w <= maxW && h <= maxH) return { width: w, height: h };
                const ratio = Math.min(maxW / w, maxH / h);
                return { width: w * ratio, height: h * ratio };
            };
            canvasRenderer.getCanvasBounds.mockReturnValue({ width: 1000, height: 800 });

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer,
                imageUploader,
                scaleToFitFn
            });

            const addImageBtn = container.querySelector('.element-toolbar-add-image');
            addImageBtn.click();
            await new Promise(resolve => setTimeout(resolve, 10));

            const elements = registry.getAllElements();
            // Center: (1000 - 200) / 2 = 400, (800 - 200) / 2 = 300
            expect(elements[0].x).toBe(400);
            expect(elements[0].y).toBe(300);
        });
    });

    describe('Add Text', () => {
        it('should add text element with correct defaults', () => {
            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer
            });

            const addTextBtn = container.querySelector('.element-toolbar-add-text');
            addTextBtn.click();

            const elements = registry.getAllElements();
            expect(elements.length).toBe(1);
            expect(elements[0].type).toBe('text');
            expect(elements[0].width).toBe(200);
            expect(elements[0].fontSize).toBe(16);
            expect(elements[0].content).toBe('Double-click to edit');
            expect(elements[0].fontWeight).toBe('normal');
            expect(elements[0].color).toBe('#e2e8f0');
            expect(elements[0].opacity).toBe(1.0);
        });

        it('should place text element at canvas center', () => {
            canvasRenderer.getCanvasBounds.mockReturnValue({ width: 600, height: 400 });

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer
            });

            const addTextBtn = container.querySelector('.element-toolbar-add-text');
            addTextBtn.click();

            const elements = registry.getAllElements();
            // Center: (600 - 200) / 2 = 200, (400 - 40) / 2 = 180
            expect(elements[0].x).toBe(200);
            expect(elements[0].y).toBe(180);
        });

        it('should assign z-index = max+1 for text element', () => {
            // Add two existing elements
            registry.addElement('icon', { x: 0, y: 0, width: 32, height: 32 });
            registry.addElement('image', { x: 50, y: 50, width: 100, height: 100 });

            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer
            });

            const addTextBtn = container.querySelector('.element-toolbar-add-text');
            addTextBtn.click();

            const elements = registry.getAllElements();
            const textEl = elements.find(e => e.type === 'text');
            expect(textEl.zIndex).toBe(3); // max was 2, so new is 3
        });

        it('should call canvasRenderer.renderElement after adding text', () => {
            new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer
            });

            const addTextBtn = container.querySelector('.element-toolbar-add-text');
            addTextBtn.click();

            expect(canvasRenderer.renderElement).toHaveBeenCalled();
        });
    });

    describe('destroy', () => {
        it('should remove toolbar from DOM', () => {
            const toolbar = new ElementToolbar({
                containerElement: container,
                registry,
                canvasRenderer
            });

            expect(container.querySelector('.element-toolbar')).not.toBeNull();
            toolbar.destroy();
            expect(container.querySelector('.element-toolbar')).toBeNull();
        });
    });
});
