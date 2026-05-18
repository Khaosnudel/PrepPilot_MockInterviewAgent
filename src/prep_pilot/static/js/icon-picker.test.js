/**
 * Unit tests for IconPicker
 * Run with: npx vitest run src/prep_pilot/static/js/icon-picker.test.js
 * 
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock DOM environment for testing
const { ICON_LIBRARY, filterIcons, IconPicker } = await import('./icon-picker.js');

describe('ICON_LIBRARY', () => {
    it('should contain at least 30 icons', () => {
        expect(ICON_LIBRARY.length).toBeGreaterThanOrEqual(30);
    });

    it('each icon should have identifier, name, and svg properties', () => {
        ICON_LIBRARY.forEach(icon => {
            expect(icon).toHaveProperty('identifier');
            expect(icon).toHaveProperty('name');
            expect(icon).toHaveProperty('svg');
            expect(typeof icon.identifier).toBe('string');
            expect(typeof icon.name).toBe('string');
            expect(typeof icon.svg).toBe('string');
        });
    });

    it('each icon identifier should be unique', () => {
        const identifiers = ICON_LIBRARY.map(i => i.identifier);
        const uniqueIdentifiers = new Set(identifiers);
        expect(uniqueIdentifiers.size).toBe(identifiers.length);
    });

    it('each icon SVG should contain valid SVG markup', () => {
        ICON_LIBRARY.forEach(icon => {
            expect(icon.svg).toContain('<svg');
            expect(icon.svg).toContain('</svg>');
            expect(icon.svg).toContain('viewBox="0 0 24 24"');
        });
    });

    it('each icon identifier should follow lucide-* naming convention', () => {
        ICON_LIBRARY.forEach(icon => {
            expect(icon.identifier).toMatch(/^lucide-/);
        });
    });
});

describe('filterIcons', () => {
    it('should return all icons when query is empty', () => {
        const result = filterIcons(ICON_LIBRARY, '');
        expect(result).toEqual(ICON_LIBRARY);
    });

    it('should return all icons when query is null', () => {
        const result = filterIcons(ICON_LIBRARY, null);
        expect(result).toEqual(ICON_LIBRARY);
    });

    it('should return all icons when query is undefined', () => {
        const result = filterIcons(ICON_LIBRARY, undefined);
        expect(result).toEqual(ICON_LIBRARY);
    });

    it('should return all icons when query is whitespace only', () => {
        const result = filterIcons(ICON_LIBRARY, '   ');
        expect(result).toEqual(ICON_LIBRARY);
    });

    it('should filter by case-insensitive substring match on name', () => {
        const result = filterIcons(ICON_LIBRARY, 'star');
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.every(icon => icon.name.toLowerCase().includes('star'))).toBe(true);
    });

    it('should be case-insensitive (uppercase query)', () => {
        const result = filterIcons(ICON_LIBRARY, 'STAR');
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.every(icon => icon.name.toLowerCase().includes('star'))).toBe(true);
    });

    it('should be case-insensitive (mixed case query)', () => {
        const result = filterIcons(ICON_LIBRARY, 'StAr');
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.every(icon => icon.name.toLowerCase().includes('star'))).toBe(true);
    });

    it('should return empty array when no icons match', () => {
        const result = filterIcons(ICON_LIBRARY, 'xyznonexistent');
        expect(result).toEqual([]);
    });

    it('should match partial substrings', () => {
        const result = filterIcons(ICON_LIBRARY, 'ar');
        // Should match "Star", "Arrow Up", "Arrow Down", etc.
        expect(result.length).toBeGreaterThanOrEqual(1);
        result.forEach(icon => {
            expect(icon.name.toLowerCase()).toContain('ar');
        });
    });

    it('should not produce false positives', () => {
        const result = filterIcons(ICON_LIBRARY, 'home');
        result.forEach(icon => {
            expect(icon.name.toLowerCase()).toContain('home');
        });
    });

    it('should not produce false negatives', () => {
        // Every icon with "arrow" in the name should be in the results
        const result = filterIcons(ICON_LIBRARY, 'arrow');
        const allArrowIcons = ICON_LIBRARY.filter(i => i.name.toLowerCase().includes('arrow'));
        expect(result.length).toBe(allArrowIcons.length);
    });

    it('should work with custom icon arrays', () => {
        const customIcons = [
            { identifier: 'a', name: 'Apple', svg: '<svg></svg>' },
            { identifier: 'b', name: 'Banana', svg: '<svg></svg>' },
            { identifier: 'c', name: 'Cherry', svg: '<svg></svg>' }
        ];
        const result = filterIcons(customIcons, 'an');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Banana');
    });
});

describe('IconPicker', () => {
    let picker;

    beforeEach(() => {
        picker = new IconPicker();
    });

    afterEach(() => {
        // Clean up any leftover DOM elements
        const overlays = document.querySelectorAll('.icon-picker-overlay');
        overlays.forEach(el => el.remove());
    });

    describe('open()', () => {
        it('should create overlay and dialog DOM elements', async () => {
            const promise = picker.open();
            
            const overlay = document.querySelector('.icon-picker-overlay');
            expect(overlay).not.toBeNull();
            
            const dialog = document.querySelector('.icon-picker-dialog');
            expect(dialog).not.toBeNull();

            // Cancel to resolve the promise
            const cancelBtn = document.querySelector('.icon-picker-cancel');
            cancelBtn.click();
            
            const result = await promise;
            expect(result).toBeNull();
        });

        it('should display search input', async () => {
            const promise = picker.open();
            
            const searchInput = document.querySelector('.icon-picker-search');
            expect(searchInput).not.toBeNull();
            expect(searchInput.placeholder).toBe('Search icons...');

            // Cancel to resolve
            document.querySelector('.icon-picker-cancel').click();
            await promise;
        });

        it('should display all icons initially', async () => {
            const promise = picker.open();
            
            const iconItems = document.querySelectorAll('.icon-picker-item');
            expect(iconItems.length).toBe(ICON_LIBRARY.length);

            // Cancel to resolve
            document.querySelector('.icon-picker-cancel').click();
            await promise;
        });
    });

    describe('icon selection', () => {
        it('should return icon data when an icon is clicked', async () => {
            const promise = picker.open();
            
            const firstIcon = document.querySelector('.icon-picker-item');
            firstIcon.click();
            
            const result = await promise;
            expect(result).not.toBeNull();
            expect(result).toHaveProperty('identifier');
            expect(result).toHaveProperty('name');
            expect(result).toHaveProperty('svgContent');
            expect(typeof result.identifier).toBe('string');
            expect(typeof result.name).toBe('string');
            expect(typeof result.svgContent).toBe('string');
        });

        it('should return correct icon data for selected icon', async () => {
            const promise = picker.open();
            
            // Find and click the "Star" icon
            const iconItems = document.querySelectorAll('.icon-picker-item');
            let starBtn = null;
            iconItems.forEach(btn => {
                if (btn.dataset.identifier === 'lucide-star') {
                    starBtn = btn;
                }
            });
            expect(starBtn).not.toBeNull();
            starBtn.click();
            
            const result = await promise;
            expect(result.identifier).toBe('lucide-star');
            expect(result.name).toBe('Star');
            expect(result.svgContent).toContain('<svg');
        });

        it('should close dialog after selection', async () => {
            const promise = picker.open();
            
            const firstIcon = document.querySelector('.icon-picker-item');
            firstIcon.click();
            
            await promise;
            
            const overlay = document.querySelector('.icon-picker-overlay');
            expect(overlay).toBeNull();
        });
    });

    describe('cancel behavior', () => {
        it('should return null when cancel button is clicked', async () => {
            const promise = picker.open();
            
            const cancelBtn = document.querySelector('.icon-picker-cancel');
            cancelBtn.click();
            
            const result = await promise;
            expect(result).toBeNull();
        });

        it('should close dialog on cancel', async () => {
            const promise = picker.open();
            
            document.querySelector('.icon-picker-cancel').click();
            await promise;
            
            const overlay = document.querySelector('.icon-picker-overlay');
            expect(overlay).toBeNull();
        });

        it('should return null when overlay backdrop is clicked', async () => {
            const promise = picker.open();
            
            const overlay = document.querySelector('.icon-picker-overlay');
            // Simulate click on the overlay itself (not the dialog)
            overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            
            const result = await promise;
            expect(result).toBeNull();
        });

        it('should return null when Escape key is pressed', async () => {
            const promise = picker.open();
            
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            
            const result = await promise;
            expect(result).toBeNull();
        });
    });

    describe('search filtering', () => {
        it('should filter icons when typing in search input', async () => {
            const promise = picker.open();
            
            const searchInput = document.querySelector('.icon-picker-search');
            searchInput.value = 'star';
            searchInput.dispatchEvent(new Event('input'));
            
            const iconItems = document.querySelectorAll('.icon-picker-item');
            expect(iconItems.length).toBeGreaterThanOrEqual(1);
            iconItems.forEach(item => {
                expect(item.dataset.name.toLowerCase()).toContain('star');
            });

            // Cancel to resolve
            document.querySelector('.icon-picker-cancel').click();
            await promise;
        });

        it('should show "No icons found" when search matches nothing', async () => {
            const promise = picker.open();
            
            const searchInput = document.querySelector('.icon-picker-search');
            searchInput.value = 'xyznonexistent';
            searchInput.dispatchEvent(new Event('input'));
            
            const noResults = document.querySelector('.icon-picker-no-results');
            expect(noResults).not.toBeNull();
            expect(noResults.textContent).toBe('No icons found');
            
            const iconItems = document.querySelectorAll('.icon-picker-item');
            expect(iconItems.length).toBe(0);

            // Cancel to resolve
            document.querySelector('.icon-picker-cancel').click();
            await promise;
        });

        it('should restore full list when search is cleared', async () => {
            const promise = picker.open();
            
            const searchInput = document.querySelector('.icon-picker-search');
            
            // Type something
            searchInput.value = 'star';
            searchInput.dispatchEvent(new Event('input'));
            
            // Clear search
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            
            const iconItems = document.querySelectorAll('.icon-picker-item');
            expect(iconItems.length).toBe(ICON_LIBRARY.length);

            // Cancel to resolve
            document.querySelector('.icon-picker-cancel').click();
            await promise;
        });
    });

    describe('close()', () => {
        it('should remove DOM elements when called directly', () => {
            picker.open();
            
            expect(document.querySelector('.icon-picker-overlay')).not.toBeNull();
            
            picker.close();
            
            expect(document.querySelector('.icon-picker-overlay')).toBeNull();
        });

        it('should be safe to call multiple times', () => {
            picker.open();
            picker.close();
            expect(() => picker.close()).not.toThrow();
        });
    });
});
