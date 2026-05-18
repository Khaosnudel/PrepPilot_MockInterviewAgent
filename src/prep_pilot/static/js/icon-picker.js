/**
 * IconPicker - Modal dialog for browsing and selecting icons.
 * 
 * Provides a searchable grid of predefined icons (Lucide icon set as inline SVGs).
 * Creates its own DOM elements when opened and removes them when closed.
 * Returns the selected icon's identifier, name, and SVG content.
 * 
 * Requirements: 1.1, 1.6
 */

/**
 * Predefined icon library based on the Lucide icon set.
 * Each icon has an identifier, display name, and SVG path content.
 * All SVGs use a 24x24 viewBox with stroke-based rendering.
 */
const ICON_LIBRARY = [
    {
        identifier: 'lucide-home',
        name: 'Home',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
    },
    {
        identifier: 'lucide-star',
        name: 'Star',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
    },
    {
        identifier: 'lucide-heart',
        name: 'Heart',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
    },
    {
        identifier: 'lucide-search',
        name: 'Search',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    },
    {
        identifier: 'lucide-settings',
        name: 'Settings',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
    },
    {
        identifier: 'lucide-user',
        name: 'User',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    },
    {
        identifier: 'lucide-mail',
        name: 'Mail',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'
    },
    {
        identifier: 'lucide-bell',
        name: 'Bell',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
    },
    {
        identifier: 'lucide-calendar',
        name: 'Calendar',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    },
    {
        identifier: 'lucide-check',
        name: 'Check',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    },
    {
        identifier: 'lucide-x',
        name: 'Close',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    },
    {
        identifier: 'lucide-plus',
        name: 'Plus',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    },
    {
        identifier: 'lucide-minus',
        name: 'Minus',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    },
    {
        identifier: 'lucide-arrow-up',
        name: 'Arrow Up',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>'
    },
    {
        identifier: 'lucide-arrow-down',
        name: 'Arrow Down',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>'
    },
    {
        identifier: 'lucide-arrow-left',
        name: 'Arrow Left',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>'
    },
    {
        identifier: 'lucide-arrow-right',
        name: 'Arrow Right',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
    },
    {
        identifier: 'lucide-trash',
        name: 'Trash',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
    },
    {
        identifier: 'lucide-edit',
        name: 'Edit',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
    },
    {
        identifier: 'lucide-eye',
        name: 'Eye',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    },
    {
        identifier: 'lucide-lock',
        name: 'Lock',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
    },
    {
        identifier: 'lucide-unlock',
        name: 'Unlock',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'
    },
    {
        identifier: 'lucide-download',
        name: 'Download',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    },
    {
        identifier: 'lucide-upload',
        name: 'Upload',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
    },
    {
        identifier: 'lucide-image',
        name: 'Image',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    },
    {
        identifier: 'lucide-file',
        name: 'File',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>'
    },
    {
        identifier: 'lucide-folder',
        name: 'Folder',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
    },
    {
        identifier: 'lucide-clock',
        name: 'Clock',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    },
    {
        identifier: 'lucide-zap',
        name: 'Zap',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    },
    {
        identifier: 'lucide-shield',
        name: 'Shield',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
    },
    {
        identifier: 'lucide-globe',
        name: 'Globe',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
    },
    {
        identifier: 'lucide-link',
        name: 'Link',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
    },
    {
        identifier: 'lucide-message-circle',
        name: 'Message Circle',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
    },
    {
        identifier: 'lucide-mic',
        name: 'Microphone',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
    },
    {
        identifier: 'lucide-play',
        name: 'Play',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
    },
    {
        identifier: 'lucide-pause',
        name: 'Pause',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
    },
    {
        identifier: 'lucide-volume-2',
        name: 'Volume',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
    },
    {
        identifier: 'lucide-bookmark',
        name: 'Bookmark',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
    },
    {
        identifier: 'lucide-award',
        name: 'Award',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>'
    },
    {
        identifier: 'lucide-target',
        name: 'Target',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
    }
];


/**
 * Filter icons by a search query using case-insensitive substring matching.
 * @param {Array} icons - Array of icon objects with `name` property
 * @param {string} query - Search query string
 * @returns {Array} Filtered array of icons whose names contain the query
 */
function filterIcons(icons, query) {
    if (!query || query.trim() === '') {
        return icons;
    }
    const lowerQuery = query.toLowerCase();
    return icons.filter(icon => icon.name.toLowerCase().includes(lowerQuery));
}

/**
 * IconPicker - Modal dialog component for browsing and selecting icons.
 * 
 * Creates its own DOM elements when opened and removes them when closed.
 * Returns a Promise that resolves with the selected icon or null if cancelled.
 */
class IconPicker {
    constructor() {
        this._overlay = null;
        this._dialog = null;
        this._resolve = null;
    }

    /**
     * Open the icon picker dialog.
     * @returns {Promise<{identifier: string, name: string, svgContent: string} | null>}
     *   Resolves with selected icon data, or null if cancelled.
     */
    open() {
        return new Promise((resolve) => {
            this._resolve = resolve;
            this._createDOM();
            this._bindEvents();
        });
    }

    /**
     * Close the dialog and clean up DOM elements.
     */
    close() {
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._dialog = null;
    }

    /**
     * Create the modal DOM structure.
     */
    _createDOM() {
        // Overlay (backdrop)
        this._overlay = document.createElement('div');
        this._overlay.className = 'icon-picker-overlay';
        this._overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Dialog container
        this._dialog = document.createElement('div');
        this._dialog.className = 'icon-picker-dialog';
        this._dialog.style.cssText = `
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 8px;
            width: 480px;
            max-height: 520px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid #334155;
        `;

        const title = document.createElement('h3');
        title.textContent = 'Select an Icon';
        title.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #e2e8f0;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'icon-picker-cancel';
        cancelBtn.textContent = '✕';
        cancelBtn.style.cssText = `
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
        `;

        header.appendChild(title);
        header.appendChild(cancelBtn);

        // Search input
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = `
            padding: 12px 20px;
            border-bottom: 1px solid #334155;
        `;

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search icons...';
        searchInput.className = 'icon-picker-search';
        searchInput.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            background: #0f172a;
            border: 1px solid #475569;
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 14px;
            outline: none;
            box-sizing: border-box;
        `;

        searchContainer.appendChild(searchInput);

        // Icon grid container
        const gridContainer = document.createElement('div');
        gridContainer.className = 'icon-picker-grid';
        gridContainer.style.cssText = `
            padding: 16px 20px;
            overflow-y: auto;
            flex: 1;
        `;

        // Assemble dialog
        this._dialog.appendChild(header);
        this._dialog.appendChild(searchContainer);
        this._dialog.appendChild(gridContainer);
        this._overlay.appendChild(this._dialog);
        document.body.appendChild(this._overlay);

        // Render initial icon grid
        this._renderIcons(ICON_LIBRARY, gridContainer);

        // Focus search input
        searchInput.focus();
    }

    /**
     * Render the icon grid with the given icons.
     * @param {Array} icons - Icons to display
     * @param {HTMLElement} container - Grid container element
     */
    _renderIcons(icons, container) {
        container.innerHTML = '';

        if (icons.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'icon-picker-no-results';
            noResults.textContent = 'No icons found';
            noResults.style.cssText = `
                text-align: center;
                color: #94a3b8;
                padding: 32px 0;
                font-size: 14px;
            `;
            container.appendChild(noResults);
            return;
        }

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
            gap: 8px;
        `;

        icons.forEach(icon => {
            const iconBtn = document.createElement('button');
            iconBtn.className = 'icon-picker-item';
            iconBtn.dataset.identifier = icon.identifier;
            iconBtn.dataset.name = icon.name;
            iconBtn.title = icon.name;
            iconBtn.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                padding: 10px 4px;
                background: #0f172a;
                border: 1px solid #334155;
                border-radius: 6px;
                cursor: pointer;
                color: #e2e8f0;
                transition: background 0.15s, border-color 0.15s;
            `;

            const svgContainer = document.createElement('div');
            svgContainer.innerHTML = icon.svg;
            svgContainer.style.cssText = `
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const label = document.createElement('span');
            label.textContent = icon.name;
            label.style.cssText = `
                font-size: 10px;
                color: #94a3b8;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 64px;
                text-align: center;
            `;

            iconBtn.appendChild(svgContainer);
            iconBtn.appendChild(label);
            grid.appendChild(iconBtn);
        });

        container.appendChild(grid);
    }

    /**
     * Bind event listeners for search, selection, and cancel.
     */
    _bindEvents() {
        const searchInput = this._dialog.querySelector('.icon-picker-search');
        const gridContainer = this._dialog.querySelector('.icon-picker-grid');
        const cancelBtn = this._dialog.querySelector('.icon-picker-cancel');

        // Search filtering
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            const filtered = filterIcons(ICON_LIBRARY, query);
            this._renderIcons(filtered, gridContainer);
        });

        // Icon selection (event delegation on grid container)
        gridContainer.addEventListener('click', (e) => {
            const iconBtn = e.target.closest('.icon-picker-item');
            if (!iconBtn) return;

            const identifier = iconBtn.dataset.identifier;
            const name = iconBtn.dataset.name;
            const iconData = ICON_LIBRARY.find(i => i.identifier === identifier);

            if (iconData && this._resolve) {
                const result = {
                    identifier: iconData.identifier,
                    name: iconData.name,
                    svgContent: iconData.svg
                };
                this._resolve(result);
                this._resolve = null;
                this.close();
            }
        });

        // Cancel button
        cancelBtn.addEventListener('click', () => {
            if (this._resolve) {
                this._resolve(null);
                this._resolve = null;
            }
            this.close();
        });

        // Click on overlay backdrop to cancel
        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay) {
                if (this._resolve) {
                    this._resolve(null);
                    this._resolve = null;
                }
                this.close();
            }
        });

        // Escape key to cancel
        this._keyHandler = (e) => {
            if (e.key === 'Escape') {
                if (this._resolve) {
                    this._resolve(null);
                    this._resolve = null;
                }
                this.close();
                document.removeEventListener('keydown', this._keyHandler);
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    }
}

// Export for use in other modules and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IconPicker, ICON_LIBRARY, filterIcons };
}
