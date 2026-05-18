/**
 * Unit tests for PropertiesInspector component.
 * Run with: npx vitest run src/prep_pilot/static/js/properties-inspector.test.js
 *
 * Validates: Requirements 1.4, 1.5, 1.7, 2.6, 4.7, 5.9, 6.1, 6.7, 10.4
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock crypto.randomUUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
    randomUUID: () => `test-uuid-${++uuidCounter}`
});

const { ElementRegistry } = await import('./element-registry.js');
const { PropertiesInspector } = await import('./properties-inspector.js');

describe('PropertiesInspector', () => {
    let registry;
    let panel;
    let inspector;

    beforeEach(() => {
        registry = new ElementRegistry();
        panel = document.createElement('div');
        panel.id = 'test-panel';
        document.body.appendChild(panel);
        inspector = new PropertiesInspector(panel, registry);
    });

    afterEach(() => {
        if (panel.parentNode) {
            document.body.removeChild(panel);
        }
    });

    describe('Initial state', () => {
        it('shows no-selection message initially', () => {
            const msg = panel.querySelector('.pi-no-selection');
            expect(msg).not.toBeNull();
            expect(msg.style.display).not.toBe('none');
        });

        it('hides properties container initially', () => {
            const container = panel.querySelector('.pi-props-container');
            expect(container.style.display).toBe('none');
        });

        it('layer controls are disabled initially', () => {
            const buttons = panel.querySelectorAll('.pi-layer-btn');
            buttons.forEach(btn => {
                expect(btn.disabled).toBe(true);
            });
        });

        it('displays four layer control buttons', () => {
            const buttons = panel.querySelectorAll('.pi-layer-btn');
            expect(buttons.length).toBe(4);
        });
    });

    describe('Single element selection - Icon (Req 1.4)', () => {
        let element;

        beforeEach(() => {
            element = registry.addElement('icon', {
                x: 100, y: 50, width: 32, height: 32,
                color: '#ff0000', opacity: 0.8, iconId: 'lucide-star'
            });
            registry.selectElement(element.id);
        });

        it('shows properties container when element is selected', () => {
            const container = panel.querySelector('.pi-props-container');
            expect(container.style.display).toBe('block');
        });

        it('hides no-selection message when element is selected', () => {
            const msg = panel.querySelector('.pi-no-selection');
            expect(msg.style.display).toBe('none');
        });

        it('displays width, height, x, y, color, opacity fields for icon', () => {
            const container = panel.querySelector('.pi-props-container');
            const inputs = container.querySelectorAll('[data-prop]');
            const props = Array.from(inputs).map(i => i.dataset.prop);
            expect(props).toContain('width');
            expect(props).toContain('height');
            expect(props).toContain('x');
            expect(props).toContain('y');
            expect(props).toContain('color');
            expect(props).toContain('opacity');
        });

        it('displays element type label', () => {
            const container = panel.querySelector('.pi-props-container');
            expect(container.textContent.toLowerCase()).toContain('icon');
        });

        it('enables layer controls when element is selected', () => {
            const buttons = panel.querySelectorAll('.pi-layer-btn');
            buttons.forEach(btn => {
                expect(btn.disabled).toBe(false);
            });
        });

        it('displays z-index value (Req 6.1)', () => {
            const zDisplay = panel.querySelector('.pi-zindex-value');
            expect(zDisplay.textContent).toBe(String(element.zIndex));
        });
    });

    describe('Single element selection - Image (Req 2.6)', () => {
        beforeEach(() => {
            const element = registry.addElement('image', {
                x: 200, y: 100, width: 150, height: 100,
                opacity: 1.0, source: 'data:image/png;base64,abc',
                maintainAspectRatio: true
            });
            registry.selectElement(element.id);
        });

        it('displays width, height, x, y, opacity, maintainAspectRatio for image', () => {
            const container = panel.querySelector('.pi-props-container');
            const inputs = container.querySelectorAll('[data-prop]');
            const props = Array.from(inputs).map(i => i.dataset.prop);
            expect(props).toContain('width');
            expect(props).toContain('height');
            expect(props).toContain('x');
            expect(props).toContain('y');
            expect(props).toContain('opacity');
            expect(props).toContain('maintainAspectRatio');
        });

        it('does not display color field for image type', () => {
            const container = panel.querySelector('.pi-props-container');
            const colorInputs = container.querySelectorAll('input[data-prop="color"]');
            expect(colorInputs.length).toBe(0);
        });
    });

    describe('Single element selection - Text (Req 10.4)', () => {
        beforeEach(() => {
            const element = registry.addElement('text', {
                x: 50, y: 300, width: 200, height: 40,
                fontSize: 16, fontWeight: 'normal', color: '#e2e8f0',
                opacity: 1.0, content: 'Hello'
            });
            registry.selectElement(element.id);
        });

        it('displays fontSize, fontWeight, color, x, y, width, opacity for text', () => {
            const container = panel.querySelector('.pi-props-container');
            const inputs = container.querySelectorAll('[data-prop]');
            const props = Array.from(inputs).map(i => i.dataset.prop);
            expect(props).toContain('fontSize');
            expect(props).toContain('fontWeight');
            expect(props).toContain('color');
            expect(props).toContain('x');
            expect(props).toContain('y');
            expect(props).toContain('width');
            expect(props).toContain('opacity');
        });
    });

    describe('Deselection', () => {
        it('clears inspector when selection is cleared', () => {
            const element = registry.addElement('icon', { x: 0, y: 0 });
            registry.selectElement(element.id);
            expect(panel.querySelector('.pi-props-container').style.display).toBe('block');

            registry.clearSelection();
            expect(panel.querySelector('.pi-no-selection').style.display).toBe('block');
            expect(panel.querySelector('.pi-props-container').style.display).toBe('none');
        });

        it('disables layer controls when selection is cleared (Req 6.7)', () => {
            const element = registry.addElement('icon', { x: 0, y: 0 });
            registry.selectElement(element.id);
            registry.clearSelection();

            const buttons = panel.querySelectorAll('.pi-layer-btn');
            buttons.forEach(btn => {
                expect(btn.disabled).toBe(true);
            });
        });
    });

    describe('Multi-select (Req 5.9)', () => {
        let el1, el2;

        beforeEach(() => {
            el1 = registry.addElement('icon', { x: 10, y: 20, width: 32, height: 32, color: '#ff0000', opacity: 0.5 });
            el2 = registry.addElement('image', { x: 50, y: 60, width: 100, height: 80, opacity: 1.0, source: 'test.png' });
            registry.setSelection([el1.id, el2.id]);
        });

        it('shows multi-select label with count', () => {
            const container = panel.querySelector('.pi-props-container');
            expect(container.textContent).toContain('2');
            expect(container.textContent.toLowerCase()).toContain('selected');
        });

        it('shows only shared properties for mixed types', () => {
            const container = panel.querySelector('.pi-props-container');
            const inputs = container.querySelectorAll('[data-prop]');
            const props = Array.from(inputs).map(i => i.dataset.prop);
            // Shared across icon and image: width, height, x, y, opacity
            expect(props).toContain('width');
            expect(props).toContain('height');
            expect(props).toContain('x');
            expect(props).toContain('y');
            expect(props).toContain('opacity');
        });

        it('does not show type-specific properties for mixed types', () => {
            const container = panel.querySelector('.pi-props-container');
            const inputs = container.querySelectorAll('[data-prop]');
            const props = Array.from(inputs).map(i => i.dataset.prop);
            // Color is icon-specific, maintainAspectRatio is image-specific
            expect(props).not.toContain('color');
            expect(props).not.toContain('maintainAspectRatio');
        });

        it('disables layer controls for multi-select', () => {
            const buttons = panel.querySelectorAll('.pi-layer-btn');
            buttons.forEach(btn => {
                expect(btn.disabled).toBe(true);
            });
        });
    });

    describe('Input validation (Req 1.7)', () => {
        let element;

        beforeEach(() => {
            element = registry.addElement('icon', {
                x: 100, y: 50, width: 32, height: 32,
                color: '#000000', opacity: 1.0
            });
            registry.selectElement(element.id);
        });

        it('shows inline error for non-numeric input', () => {
            const container = panel.querySelector('.pi-props-container');
            const widthInput = container.querySelector('[data-prop="width"]');
            widthInput.value = 'abc';
            widthInput.dispatchEvent(new Event('change'));

            const errorEl = container.querySelector('[data-error-for="width"]');
            expect(errorEl.style.display).toBe('block');
            expect(errorEl.textContent).not.toBe('');
        });

        it('clears error for valid input', () => {
            const container = panel.querySelector('.pi-props-container');
            const widthInput = container.querySelector('[data-prop="width"]');

            // Trigger error
            widthInput.value = 'abc';
            widthInput.dispatchEvent(new Event('change'));

            // Provide valid input
            widthInput.value = '64';
            widthInput.dispatchEvent(new Event('change'));

            const errorEl = container.querySelector('[data-error-for="width"]');
            expect(errorEl.style.display).toBe('none');
        });

        it('highlights input border red on error', () => {
            const container = panel.querySelector('.pi-props-container');
            const widthInput = container.querySelector('[data-prop="width"]');
            widthInput.value = 'invalid';
            widthInput.dispatchEvent(new Event('change'));

            expect(widthInput.style.borderColor).toBe('#ef4444');
        });
    });

    describe('Property application (Req 1.5)', () => {
        let element;

        beforeEach(() => {
            element = registry.addElement('icon', {
                x: 100, y: 50, width: 32, height: 32,
                color: '#000000', opacity: 1.0
            });
            registry.selectElement(element.id);
        });

        it('applies valid numeric property change to registry', async () => {
            const container = panel.querySelector('.pi-props-container');
            const widthInput = container.querySelector('[data-prop="width"]');
            widthInput.value = '64';
            widthInput.dispatchEvent(new Event('change'));

            // Wait for async application
            await new Promise(resolve => setTimeout(resolve, 10));

            const updated = registry.getElement(element.id);
            expect(updated.width).toBe(64);
        });

        it('applies toggle change to registry', async () => {
            const imgEl = registry.addElement('image', {
                x: 0, y: 0, width: 100, height: 100,
                source: 'test.png', maintainAspectRatio: false
            });
            registry.selectElement(imgEl.id);

            const container = panel.querySelector('.pi-props-container');
            const toggle = container.querySelector('[data-prop="maintainAspectRatio"]');
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            const updated = registry.getElement(imgEl.id);
            expect(updated.maintainAspectRatio).toBe(true);
        });

        it('applies select change to registry', async () => {
            const textEl = registry.addElement('text', {
                x: 0, y: 0, width: 200, height: 40,
                fontSize: 16, fontWeight: 'normal', color: '#e2e8f0',
                content: 'Test'
            });
            registry.selectElement(textEl.id);

            const container = panel.querySelector('.pi-props-container');
            const select = container.querySelector('[data-prop="fontWeight"]');
            select.value = 'bold';
            select.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            const updated = registry.getElement(textEl.id);
            expect(updated.fontWeight).toBe('bold');
        });
    });

    describe('Layer controls (Req 6.1)', () => {
        let el1, el2, el3;

        beforeEach(() => {
            el1 = registry.addElement('icon', { x: 0, y: 0 });
            el2 = registry.addElement('icon', { x: 10, y: 10 });
            el3 = registry.addElement('icon', { x: 20, y: 20 });
        });

        it('Bring to Front sets z-index above all others', () => {
            registry.selectElement(el1.id);
            const btn = panel.querySelector('[data-action="bringToFront"]');
            btn.click();

            const updated = registry.getElement(el1.id);
            expect(updated.zIndex).toBeGreaterThan(registry.getElement(el3.id).zIndex);
        });

        it('Send to Back sets z-index below all others', () => {
            registry.selectElement(el3.id);
            const btn = panel.querySelector('[data-action="sendToBack"]');
            btn.click();

            const updated = registry.getElement(el3.id);
            expect(updated.zIndex).toBeLessThan(registry.getElement(el1.id).zIndex);
        });

        it('Move Forward swaps z-index with next higher element', () => {
            registry.selectElement(el1.id);
            const originalZ1 = registry.getElement(el1.id).zIndex;
            const originalZ2 = registry.getElement(el2.id).zIndex;

            const btn = panel.querySelector('[data-action="moveForward"]');
            btn.click();

            expect(registry.getElement(el1.id).zIndex).toBe(originalZ2);
            expect(registry.getElement(el2.id).zIndex).toBe(originalZ1);
        });

        it('Move Backward swaps z-index with next lower element', () => {
            registry.selectElement(el3.id);
            const originalZ3 = registry.getElement(el3.id).zIndex;
            const originalZ2 = registry.getElement(el2.id).zIndex;

            const btn = panel.querySelector('[data-action="moveBackward"]');
            btn.click();

            expect(registry.getElement(el3.id).zIndex).toBe(originalZ2);
            expect(registry.getElement(el2.id).zIndex).toBe(originalZ3);
        });

        it('z-index display updates after layer action', () => {
            registry.selectElement(el1.id);
            const btn = panel.querySelector('[data-action="bringToFront"]');
            btn.click();

            const zDisplay = panel.querySelector('.pi-zindex-value');
            const updated = registry.getElement(el1.id);
            expect(zDisplay.textContent).toBe(String(updated.zIndex));
        });
    });

    describe('Live position/size updates (Req 4.7)', () => {
        let element;

        beforeEach(() => {
            element = registry.addElement('icon', {
                x: 100, y: 50, width: 32, height: 32,
                color: '#000000', opacity: 1.0
            });
            registry.selectElement(element.id);
        });

        it('updateLivePosition updates x and y input fields', () => {
            inspector.updateLivePosition(200, 150);
            const container = panel.querySelector('.pi-props-container');
            const xInput = container.querySelector('[data-prop="x"]');
            const yInput = container.querySelector('[data-prop="y"]');
            expect(xInput.value).toBe('200');
            expect(yInput.value).toBe('150');
        });

        it('updateLiveSize updates width and height input fields', () => {
            inspector.updateLiveSize(64, 64);
            const container = panel.querySelector('.pi-props-container');
            const wInput = container.querySelector('[data-prop="width"]');
            const hInput = container.querySelector('[data-prop="height"]');
            expect(wInput.value).toBe('64');
            expect(hInput.value).toBe('64');
        });

        it('updateLivePosition rounds values', () => {
            inspector.updateLivePosition(123.7, 456.2);
            const container = panel.querySelector('.pi-props-container');
            const xInput = container.querySelector('[data-prop="x"]');
            const yInput = container.querySelector('[data-prop="y"]');
            expect(xInput.value).toBe('124');
            expect(yInput.value).toBe('456');
        });
    });

    describe('Multi-select property application (Req 5.9)', () => {
        it('applies property change to all selected elements', async () => {
            const el1 = registry.addElement('icon', { x: 10, y: 20, opacity: 0.5 });
            const el2 = registry.addElement('icon', { x: 50, y: 60, opacity: 0.8 });
            registry.setSelection([el1.id, el2.id]);

            const container = panel.querySelector('.pi-props-container');
            const opacityInput = container.querySelector('[data-prop="opacity"]');
            opacityInput.value = '0.7';
            opacityInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(registry.getElement(el1.id).opacity).toBe(0.7);
            expect(registry.getElement(el2.id).opacity).toBe(0.7);
        });
    });
});
