/**
 * Tests for InlineTextEditor - Task 8.3
 * Tests inline text editing: double-click activation, keyboard input,
 * exit on Escape/click-outside, placeholder restoration, and 500-char truncation.
 *
 * Requirements: 10.2, 10.3, 10.5, 10.6
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock DOM Setup ──────────────────────────────────────────────────────────

// Mock window.getSelection for cursor positioning
const mockRange = {
    selectNodeContents: vi.fn(),
    collapse: vi.fn()
};

const mockSelection = {
    removeAllRanges: vi.fn(),
    addRange: vi.fn()
};

globalThis.window = {
    getSelection: vi.fn(() => mockSelection)
};

globalThis.document = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    createRange: vi.fn(() => mockRange)
};

function createMockOverlay() {
    const listeners = {};
    const children = [];

    const overlay = {
        style: {},
        dataset: {},
        parentElement: null,
        children,
        addEventListener: vi.fn((event, handler, options) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(handler);
        }),
        removeEventListener: vi.fn((event, handler, options) => {
            if (listeners[event]) {
                listeners[event] = listeners[event].filter(h => h !== handler);
            }
        }),
        querySelector: vi.fn((selector) => {
            // Find element by data-element-id selector
            const match = selector.match(/\[data-element-id="(.+?)"\]/);
            if (match) {
                return children.find(c => c.dataset && c.dataset.elementId === match[1]) || null;
            }
            return null;
        }),
        contains: vi.fn((target) => children.includes(target)),
        _listeners: listeners,
        _addChild(child) {
            children.push(child);
        }
    };

    return overlay;
}

function createMockTextElement(id, content) {
    const textContentListeners = {};
    const textContentDiv = {
        classList: { contains: vi.fn((cls) => cls === 'canvas-text-content'), add: vi.fn() },
        textContent: content || 'Double-click to edit',
        contentEditable: 'false',
        style: {},
        focus: vi.fn(),
        blur: vi.fn(),
        contains: vi.fn((target) => target === textContentDiv),
        addEventListener: vi.fn((event, handler) => {
            textContentListeners[event] = textContentListeners[event] || [];
            textContentListeners[event].push(handler);
        }),
        removeEventListener: vi.fn((event, handler) => {
            if (textContentListeners[event]) {
                textContentListeners[event] = textContentListeners[event].filter(h => h !== handler);
            }
        }),
        _listeners: textContentListeners
    };

    const elementNode = {
        dataset: { elementId: id, elementType: 'text' },
        parentElement: null,
        querySelector: vi.fn((selector) => {
            if (selector === '.canvas-text-content') return textContentDiv;
            return null;
        }),
        contains: vi.fn((target) => target === textContentDiv || target === elementNode)
    };

    return { elementNode, textContentDiv };
}

function createMockRegistry() {
    const elements = new Map();

    return {
        _elements: elements,
        addTextElement(id, content) {
            const el = {
                id,
                type: 'text',
                content: content || '',
                x: 50,
                y: 50,
                width: 200,
                height: 40,
                fontSize: 16,
                fontWeight: 'normal',
                color: '#e2e8f0',
                opacity: 1.0,
                zIndex: 1
            };
            elements.set(id, el);
            return el;
        },
        getElement(id) {
            return elements.get(id) || null;
        },
        updateElement: vi.fn((id, props) => {
            const el = elements.get(id);
            if (el) {
                Object.assign(el, props);
            }
        })
    };
}

function createMockCanvas() {
    return {
        renderElement: vi.fn()
    };
}

function createDblClickEvent(target) {
    return {
        target: target || {},
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
    };
}

// ─── Import Module ───────────────────────────────────────────────────────────

const { InlineTextEditor, PLACEHOLDER_TEXT, INLINE_TEXT_MAX_LENGTH } = await import('./inline-text-editor.js');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InlineTextEditor', () => {
    let overlay;
    let registry;
    let canvas;
    let editor;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        overlay = createMockOverlay();
        registry = createMockRegistry();
        canvas = createMockCanvas();
        editor = new InlineTextEditor(overlay, registry, canvas);
    });

    afterEach(() => {
        vi.useRealTimers();
        if (editor) {
            editor.destroy();
        }
    });

    describe('constructor', () => {
        it('should attach a dblclick listener to the overlay', () => {
            expect(overlay.addEventListener).toHaveBeenCalledWith('dblclick', expect.any(Function));
        });

        it('should start in non-editing state', () => {
            expect(editor.isEditing()).toBe(false);
            expect(editor.getEditingId()).toBeNull();
        });
    });

    describe('double-click to enter editing mode (Req 10.2)', () => {
        it('should enable contenteditable on double-click of a text element', () => {
            const id = 'text-elem-1';
            registry.addTextElement(id, 'Hello World');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Hello World');
            overlay._addChild(elementNode);

            // Simulate double-click on the text content div
            const event = createDblClickEvent(elementNode);
            editor._onDblClick(event);

            expect(editor.isEditing()).toBe(true);
            expect(editor.getEditingId()).toBe(id);
            expect(textContentDiv.contentEditable).toBe('true');
            expect(textContentDiv.focus).toHaveBeenCalled();
        });

        it('should not enter editing mode for non-text elements', () => {
            const id = 'icon-elem-1';
            registry._elements.set(id, { id, type: 'icon', x: 0, y: 0, width: 32, height: 32 });

            const elementNode = {
                dataset: { elementId: id, elementType: 'icon' },
                parentElement: overlay,
                querySelector: vi.fn(() => null)
            };
            overlay._addChild(elementNode);

            const event = createDblClickEvent(elementNode);
            editor._onDblClick(event);

            expect(editor.isEditing()).toBe(false);
        });

        it('should clear placeholder text when entering editing mode', () => {
            const id = 'text-elem-2';
            registry.addTextElement(id, '');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Double-click to edit');
            overlay._addChild(elementNode);

            const event = createDblClickEvent(elementNode);
            editor._onDblClick(event);

            expect(textContentDiv.textContent).toBe('');
        });

        it('should preserve existing content when entering editing mode', () => {
            const id = 'text-elem-3';
            registry.addTextElement(id, 'Existing text');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Existing text');
            overlay._addChild(elementNode);

            const event = createDblClickEvent(elementNode);
            editor._onDblClick(event);

            // Content should remain as-is (not cleared)
            expect(textContentDiv.textContent).toBe('Existing text');
        });

        it('should prevent default and stop propagation on double-click', () => {
            const id = 'text-elem-4';
            registry.addTextElement(id, 'Test');
            const { elementNode } = createMockTextElement(id, 'Test');
            overlay._addChild(elementNode);

            const event = createDblClickEvent(elementNode);
            editor._onDblClick(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(event.stopPropagation).toHaveBeenCalled();
        });

        it('should ignore double-click if already editing', () => {
            const id1 = 'text-elem-5';
            const id2 = 'text-elem-6';
            registry.addTextElement(id1, 'First');
            registry.addTextElement(id2, 'Second');

            const { elementNode: node1 } = createMockTextElement(id1, 'First');
            const { elementNode: node2 } = createMockTextElement(id2, 'Second');
            overlay._addChild(node1);
            overlay._addChild(node2);

            // Enter editing on first element
            editor._onDblClick(createDblClickEvent(node1));
            expect(editor.getEditingId()).toBe(id1);

            // Double-click on second element should be ignored
            editor._onDblClick(createDblClickEvent(node2));
            expect(editor.getEditingId()).toBe(id1);
        });
    });

    describe('exit editing on Escape (Req 10.3)', () => {
        it('should exit editing mode when Escape is pressed', () => {
            const id = 'text-elem-esc';
            registry.addTextElement(id, 'Some text');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Some text');
            overlay._addChild(elementNode);

            // Enter editing
            editor._onDblClick(createDblClickEvent(elementNode));
            expect(editor.isEditing()).toBe(true);

            // Simulate Escape keydown
            textContentDiv.textContent = 'Updated text';
            const keyEvent = {
                key: 'Escape',
                preventDefault: vi.fn(),
                stopPropagation: vi.fn()
            };
            editor._onKeyDown(keyEvent);

            expect(editor.isEditing()).toBe(false);
            expect(textContentDiv.contentEditable).toBe('false');
        });

        it('should commit text content when exiting via Escape', () => {
            const id = 'text-elem-esc2';
            registry.addTextElement(id, 'Original');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Original');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));
            textContentDiv.textContent = 'New content';

            editor._onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });

            expect(registry.updateElement).toHaveBeenCalledWith(id, { content: 'New content' });
        });

        it('should not exit on non-Escape keys', () => {
            const id = 'text-elem-key';
            registry.addTextElement(id, 'Test');
            const { elementNode } = createMockTextElement(id, 'Test');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));

            editor._onKeyDown({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });
            expect(editor.isEditing()).toBe(true);
        });
    });

    describe('exit editing on click-outside (Req 10.3)', () => {
        it('should exit editing when clicking outside the text element', () => {
            const id = 'text-elem-outside';
            registry.addTextElement(id, 'Click outside test');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Click outside test');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));
            expect(editor.isEditing()).toBe(true);

            // Advance timers so the click-outside listener is attached
            vi.advanceTimersByTime(10);

            // Simulate click outside
            textContentDiv.textContent = 'Modified';
            const outsideTarget = { dataset: {} };
            textContentDiv.contains.mockReturnValue(false);
            editor._onClickOutside({ target: outsideTarget });

            expect(editor.isEditing()).toBe(false);
            expect(registry.updateElement).toHaveBeenCalledWith(id, { content: 'Modified' });
        });

        it('should not exit when clicking inside the editing element', () => {
            const id = 'text-elem-inside';
            registry.addTextElement(id, 'Inside click');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Inside click');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));

            // Simulate click inside the editing node
            textContentDiv.contains.mockReturnValue(true);
            editor._onClickOutside({ target: textContentDiv });

            expect(editor.isEditing()).toBe(true);
        });
    });

    describe('placeholder restoration (Req 10.6)', () => {
        it('should restore placeholder when content is cleared and editing exits', () => {
            const id = 'text-elem-placeholder';
            registry.addTextElement(id, 'Will be cleared');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Will be cleared');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));

            // Clear the content
            textContentDiv.textContent = '';

            // Exit editing
            editor._onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });

            // Registry should store empty string
            expect(registry.updateElement).toHaveBeenCalledWith(id, { content: '' });
            // Display should show placeholder
            expect(textContentDiv.textContent).toBe('Double-click to edit');
        });

        it('should restore placeholder when content is only whitespace', () => {
            const id = 'text-elem-ws';
            registry.addTextElement(id, 'Whitespace test');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Whitespace test');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));
            textContentDiv.textContent = '   ';

            editor._onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });

            // Trimmed content is empty, so store empty and show placeholder
            expect(registry.updateElement).toHaveBeenCalledWith(id, { content: '' });
            expect(textContentDiv.textContent).toBe('Double-click to edit');
        });
    });

    describe('500-character truncation (Req 10.5, 10.7)', () => {
        it('should truncate text at 500 characters on input', () => {
            const id = 'text-elem-trunc';
            registry.addTextElement(id, '');
            const { elementNode, textContentDiv } = createMockTextElement(id, '');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));

            // Simulate input exceeding 500 chars
            textContentDiv.textContent = 'a'.repeat(600);
            editor._onInput({});

            expect(textContentDiv.textContent).toBe('a'.repeat(500));
        });

        it('should not truncate text at or below 500 characters', () => {
            const id = 'text-elem-notrunc';
            registry.addTextElement(id, '');
            const { elementNode, textContentDiv } = createMockTextElement(id, '');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));

            textContentDiv.textContent = 'a'.repeat(500);
            editor._onInput({});

            expect(textContentDiv.textContent).toBe('a'.repeat(500));
        });

        it('should truncate on commit if text exceeds 500 characters', () => {
            const id = 'text-elem-trunc-commit';
            registry.addTextElement(id, '');
            const { elementNode, textContentDiv } = createMockTextElement(id, '');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));

            // Set content over 500 chars (bypassing input handler)
            textContentDiv.textContent = 'b'.repeat(550);

            editor._onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });

            expect(registry.updateElement).toHaveBeenCalledWith(id, { content: 'b'.repeat(500) });
        });
    });

    describe('commitAndExit', () => {
        it('should commit and exit editing when called programmatically', () => {
            const id = 'text-elem-api';
            registry.addTextElement(id, 'API test');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'API test');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));
            textContentDiv.textContent = 'Committed via API';

            editor.commitAndExit();

            expect(editor.isEditing()).toBe(false);
            expect(registry.updateElement).toHaveBeenCalledWith(id, { content: 'Committed via API' });
        });

        it('should be a no-op when not editing', () => {
            editor.commitAndExit();
            expect(editor.isEditing()).toBe(false);
            expect(registry.updateElement).not.toHaveBeenCalled();
        });
    });

    describe('destroy', () => {
        it('should remove dblclick listener from overlay', () => {
            editor.destroy();
            expect(overlay.removeEventListener).toHaveBeenCalledWith('dblclick', expect.any(Function));
        });

        it('should exit editing if currently active', () => {
            const id = 'text-elem-destroy';
            registry.addTextElement(id, 'Destroy test');
            const { elementNode, textContentDiv } = createMockTextElement(id, 'Destroy test');
            overlay._addChild(elementNode);

            editor._onDblClick(createDblClickEvent(elementNode));
            expect(editor.isEditing()).toBe(true);

            editor.destroy();
            expect(editor.isEditing()).toBe(false);
        });
    });

    describe('constants', () => {
        it('should export PLACEHOLDER_TEXT as "Double-click to edit"', () => {
            expect(PLACEHOLDER_TEXT).toBe('Double-click to edit');
        });

        it('should export INLINE_TEXT_MAX_LENGTH as 500', () => {
            expect(INLINE_TEXT_MAX_LENGTH).toBe(500);
        });
    });
});
