/**
 * Unit tests for GridControls
 * Run with: npx vitest run src/prep_pilot/static/js/grid-controls.test.js
 *
 * @environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { GridControls } = await import('./grid-controls.js');
const { validateGridSpacing } = await import('./validators.js');

/**
 * Creates a mock GridOverlay instance.
 */
function createMockGridOverlay() {
    return {
        showGrid: vi.fn(),
        hideGrid: vi.fn(),
        updateGridSpacing: vi.fn()
    };
}

/**
 * Creates a mock InteractionHandler instance.
 */
function createMockInteractionHandler() {
    return {
        setSnapEnabled: vi.fn(),
        setGridSpacing: vi.fn()
    };
}

describe('GridControls', () => {
    let container;
    let gridOverlay;
    let interactionHandler;

    beforeEach(() => {
        container = document.createElement('div');
        gridOverlay = createMockGridOverlay();
        interactionHandler = createMockInteractionHandler();
    });

    function createControls(options = {}) {
        return new GridControls(container, {
            gridOverlay,
            interactionHandler,
            validateGridSpacing,
            ...options
        });
    }

    describe('constructor', () => {
        it('should throw if no container element is provided', () => {
            expect(() => new GridControls(null)).toThrow('GridControls requires a container element');
            expect(() => new GridControls(undefined)).toThrow('GridControls requires a container element');
        });

        it('should render controls into the container', () => {
            createControls();
            const section = container.querySelector('#grid-controls-section');
            expect(section).not.toBeNull();
        });

        it('should render a section title "Grid & Snap"', () => {
            createControls();
            const title = container.querySelector('.section-title');
            expect(title.textContent).toBe('Grid & Snap');
        });

        it('should render a "Show Grid" toggle checkbox', () => {
            createControls();
            const checkbox = container.querySelector('#grid-toggle');
            expect(checkbox).not.toBeNull();
            expect(checkbox.type).toBe('checkbox');
            expect(checkbox.checked).toBe(false);
        });

        it('should render a grid spacing input with default value 16', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            expect(input).not.toBeNull();
            expect(input.value).toBe('16');
        });

        it('should render a hidden error element', () => {
            createControls();
            const error = container.querySelector('#grid-spacing-error');
            expect(error).not.toBeNull();
            expect(error.style.display).toBe('none');
        });
    });

    describe('Show Grid toggle', () => {
        it('should call gridOverlay.showGrid when checked', () => {
            createControls();
            const checkbox = container.querySelector('#grid-toggle');
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            expect(gridOverlay.showGrid).toHaveBeenCalledWith(16);
        });

        it('should call interactionHandler.setSnapEnabled(true) when checked', () => {
            createControls();
            const checkbox = container.querySelector('#grid-toggle');
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            expect(interactionHandler.setSnapEnabled).toHaveBeenCalledWith(true);
        });

        it('should call gridOverlay.hideGrid when unchecked', () => {
            createControls();
            const checkbox = container.querySelector('#grid-toggle');

            // Enable first
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            // Then disable
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));

            expect(gridOverlay.hideGrid).toHaveBeenCalled();
        });

        it('should call interactionHandler.setSnapEnabled(false) when unchecked', () => {
            createControls();
            const checkbox = container.querySelector('#grid-toggle');

            // Enable first
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            // Then disable
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));

            expect(interactionHandler.setSnapEnabled).toHaveBeenCalledWith(false);
        });
    });

    describe('Grid spacing input', () => {
        it('should update grid spacing on valid input change', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            input.value = '32';
            input.dispatchEvent(new Event('change'));

            expect(gridOverlay.updateGridSpacing).toHaveBeenCalledWith(32);
            expect(interactionHandler.setGridSpacing).toHaveBeenCalledWith(32);
        });

        it('should accept minimum valid spacing (4)', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            input.value = '4';
            input.dispatchEvent(new Event('change'));

            expect(gridOverlay.updateGridSpacing).toHaveBeenCalledWith(4);
        });

        it('should accept maximum valid spacing (128)', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            input.value = '128';
            input.dispatchEvent(new Event('change'));

            expect(gridOverlay.updateGridSpacing).toHaveBeenCalledWith(128);
        });

        it('should reject non-numeric input and show error', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            const error = container.querySelector('#grid-spacing-error');

            input.value = 'abc';
            input.dispatchEvent(new Event('change'));

            expect(error.style.display).toBe('block');
            expect(error.textContent).toContain('integer between 4 and 128');
            // Input should revert to previous valid value
            expect(input.value).toBe('16');
        });

        it('should reject spacing below minimum (4) and show error', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            const error = container.querySelector('#grid-spacing-error');

            input.value = '2';
            input.dispatchEvent(new Event('change'));

            expect(error.style.display).toBe('block');
            expect(input.value).toBe('16');
        });

        it('should reject spacing above maximum (128) and show error', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            const error = container.querySelector('#grid-spacing-error');

            input.value = '200';
            input.dispatchEvent(new Event('change'));

            expect(error.style.display).toBe('block');
            expect(input.value).toBe('16');
        });

        it('should reject non-integer values and show error', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            const error = container.querySelector('#grid-spacing-error');

            input.value = '16.5';
            input.dispatchEvent(new Event('change'));

            expect(error.style.display).toBe('block');
            expect(input.value).toBe('16');
        });

        it('should clear error on valid input after previous error', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');
            const error = container.querySelector('#grid-spacing-error');

            // Trigger error
            input.value = 'abc';
            input.dispatchEvent(new Event('change'));
            expect(error.style.display).toBe('block');

            // Fix with valid input
            input.value = '24';
            input.dispatchEvent(new Event('change'));
            expect(error.style.display).toBe('none');
        });

        it('should highlight input border on error', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');

            input.value = 'abc';
            input.dispatchEvent(new Event('change'));

            expect(input.style.borderColor).toBe('#fca5a5');
        });

        it('should reset input border on valid input', () => {
            createControls();
            const input = container.querySelector('#grid-spacing');

            // Trigger error
            input.value = 'abc';
            input.dispatchEvent(new Event('change'));

            // Fix
            input.value = '24';
            input.dispatchEvent(new Event('change'));

            expect(input.style.borderColor).toBe('#334155');
        });
    });

    describe('public API', () => {
        it('isGridEnabled() should return current state', () => {
            const controls = createControls();
            expect(controls.isGridEnabled()).toBe(false);

            const checkbox = container.querySelector('#grid-toggle');
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            expect(controls.isGridEnabled()).toBe(true);
        });

        it('getSpacing() should return current spacing', () => {
            const controls = createControls();
            expect(controls.getSpacing()).toBe(16);

            const input = container.querySelector('#grid-spacing');
            input.value = '64';
            input.dispatchEvent(new Event('change'));

            expect(controls.getSpacing()).toBe(64);
        });

        it('setEnabled() should programmatically toggle grid', () => {
            const controls = createControls();
            controls.setEnabled(true);

            expect(controls.isGridEnabled()).toBe(true);
            expect(gridOverlay.showGrid).toHaveBeenCalled();
            expect(interactionHandler.setSnapEnabled).toHaveBeenCalledWith(true);
        });

        it('setSpacing() should programmatically update spacing', () => {
            const controls = createControls();
            controls.setSpacing(48);

            expect(controls.getSpacing()).toBe(48);
            expect(gridOverlay.updateGridSpacing).toHaveBeenCalledWith(48);
        });

        it('destroy() should clear the container', () => {
            const controls = createControls();
            expect(container.children.length).toBeGreaterThan(0);

            controls.destroy();
            expect(container.innerHTML).toBe('');
        });
    });

    describe('graceful handling without dependencies', () => {
        it('should work without gridOverlay', () => {
            const controls = new GridControls(container, {
                gridOverlay: null,
                interactionHandler,
                validateGridSpacing
            });

            const checkbox = container.querySelector('#grid-toggle');
            checkbox.checked = true;
            expect(() => checkbox.dispatchEvent(new Event('change'))).not.toThrow();
        });

        it('should work without interactionHandler', () => {
            const controls = new GridControls(container, {
                gridOverlay,
                interactionHandler: null,
                validateGridSpacing
            });

            const checkbox = container.querySelector('#grid-toggle');
            checkbox.checked = true;
            expect(() => checkbox.dispatchEvent(new Event('change'))).not.toThrow();
        });

        it('should use inline validation when validateGridSpacing is not provided', () => {
            const controls = new GridControls(container, {
                gridOverlay,
                interactionHandler,
                validateGridSpacing: null
            });

            const input = container.querySelector('#grid-spacing');
            input.value = '32';
            input.dispatchEvent(new Event('change'));

            expect(gridOverlay.updateGridSpacing).toHaveBeenCalledWith(32);
        });
    });

    describe('existing DOM elements mode', () => {
        let existingToggle;
        let existingInput;
        let existingError;

        beforeEach(() => {
            existingToggle = document.createElement('input');
            existingToggle.type = 'checkbox';
            existingToggle.id = 'grid-toggle';
            container.appendChild(existingToggle);

            existingInput = document.createElement('input');
            existingInput.type = 'number';
            existingInput.id = 'grid-spacing';
            existingInput.value = '16';
            container.appendChild(existingInput);

            existingError = document.createElement('div');
            existingError.id = 'grid-error';
            existingError.style.display = 'none';
            container.appendChild(existingError);
        });

        it('should wire existing DOM elements without creating new ones', () => {
            const childCountBefore = container.children.length;
            const controls = new GridControls(container, {
                gridOverlay,
                interactionHandler,
                validateGridSpacing,
                elements: {
                    toggle: existingToggle,
                    spacingInput: existingInput,
                    errorElement: existingError
                }
            });

            // Should not add new children
            expect(container.children.length).toBe(childCountBefore);
        });

        it('should wire toggle on existing checkbox', () => {
            const controls = new GridControls(container, {
                gridOverlay,
                interactionHandler,
                validateGridSpacing,
                elements: {
                    toggle: existingToggle,
                    spacingInput: existingInput,
                    errorElement: existingError
                }
            });

            existingToggle.checked = true;
            existingToggle.dispatchEvent(new Event('change'));

            expect(gridOverlay.showGrid).toHaveBeenCalledWith(16);
            expect(interactionHandler.setSnapEnabled).toHaveBeenCalledWith(true);
        });

        it('should validate spacing on existing input', () => {
            const controls = new GridControls(container, {
                gridOverlay,
                interactionHandler,
                validateGridSpacing,
                elements: {
                    toggle: existingToggle,
                    spacingInput: existingInput,
                    errorElement: existingError
                }
            });

            existingInput.value = 'abc';
            existingInput.dispatchEvent(new Event('change'));

            expect(existingError.style.display).toBe('block');
            expect(existingError.textContent).toContain('integer between 4 and 128');
            expect(existingInput.value).toBe('16');
        });

        it('should update spacing on valid input with existing elements', () => {
            const controls = new GridControls(container, {
                gridOverlay,
                interactionHandler,
                validateGridSpacing,
                elements: {
                    toggle: existingToggle,
                    spacingInput: existingInput,
                    errorElement: existingError
                }
            });

            existingInput.value = '64';
            existingInput.dispatchEvent(new Event('change'));

            expect(gridOverlay.updateGridSpacing).toHaveBeenCalledWith(64);
            expect(interactionHandler.setGridSpacing).toHaveBeenCalledWith(64);
        });
    });
});
