/**
 * validators.js — Property value validation for the Dynamic UI Editor
 *
 * Provides validation functions for element properties, image files,
 * grid spacing, and text content.
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const ACCEPTED_IMAGE_FORMATS = ['png', 'jpg', 'jpeg', 'svg', 'webp'];
const MAX_TEXT_LENGTH = 500;
const GRID_SPACING_MIN = 4;
const GRID_SPACING_MAX = 128;

/**
 * Validates a numeric dimension value against min/max constraints.
 * Returns an object with `valid`, `value` (clamped if valid), and `error` (if invalid).
 *
 * @param {*} value - The value to validate
 * @param {number} min - Minimum allowed value (inclusive)
 * @param {number} max - Maximum allowed value (inclusive)
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validateDimension(value, min, max) {
    const num = Number(value);

    if (value === null || value === undefined || value === '' || isNaN(num)) {
        return {
            valid: false,
            value: null,
            error: `Value must be a number between ${min} and ${max}`
        };
    }

    if (!isFinite(num)) {
        return {
            valid: false,
            value: null,
            error: `Value must be a finite number between ${min} and ${max}`
        };
    }

    if (num < min) {
        return {
            valid: true,
            value: min,
            error: null
        };
    }

    if (num > max) {
        return {
            valid: true,
            value: max,
            error: null
        };
    }

    return {
        valid: true,
        value: num,
        error: null
    };
}

/**
 * Validates an opacity value. Must be a number between 0.0 and 1.0 inclusive.
 * Clamps to range if within numeric bounds.
 *
 * @param {*} value - The opacity value to validate
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validateOpacity(value) {
    const num = Number(value);

    if (value === null || value === undefined || value === '' || isNaN(num)) {
        return {
            valid: false,
            value: null,
            error: 'Opacity must be a number between 0.0 and 1.0'
        };
    }

    if (!isFinite(num)) {
        return {
            valid: false,
            value: null,
            error: 'Opacity must be a finite number between 0.0 and 1.0'
        };
    }

    if (num < 0.0) {
        return {
            valid: true,
            value: 0.0,
            error: null
        };
    }

    if (num > 1.0) {
        return {
            valid: true,
            value: 1.0,
            error: null
        };
    }

    return {
        valid: true,
        value: num,
        error: null
    };
}

/**
 * Validates a CSS color string. Accepts:
 * - Hex colors: #RGB, #RRGGBB, #RRGGBBAA
 * - Named CSS colors (basic set)
 * - rgb()/rgba() functional notation
 * - hsl()/hsla() functional notation
 *
 * @param {*} value - The color string to validate
 * @returns {{ valid: boolean, value: string|null, error: string|null }}
 */
function validateColor(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return {
            valid: false,
            value: null,
            error: 'Color must be a non-empty string'
        };
    }

    const trimmed = value.trim();

    // Hex color: #RGB, #RRGGBB, #RRGGBBAA
    const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    if (hexPattern.test(trimmed)) {
        return { valid: true, value: trimmed, error: null };
    }

    // rgb() / rgba() functional notation
    const rgbPattern = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
    if (rgbPattern.test(trimmed)) {
        return { valid: true, value: trimmed, error: null };
    }

    // hsl() / hsla() functional notation
    const hslPattern = /^hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
    if (hslPattern.test(trimmed)) {
        return { valid: true, value: trimmed, error: null };
    }

    // Named CSS colors (common set)
    const namedColors = [
        'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
        'orange', 'purple', 'pink', 'brown', 'gray', 'grey', 'silver', 'gold',
        'navy', 'teal', 'maroon', 'olive', 'lime', 'aqua', 'fuchsia',
        'transparent', 'inherit', 'currentColor',
        'aliceblue', 'antiquewhite', 'aquamarine', 'azure', 'beige', 'bisque',
        'blanchedalmond', 'blueviolet', 'burlywood', 'cadetblue', 'chartreuse',
        'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'darkblue',
        'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
        'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid',
        'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray',
        'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
        'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite',
        'forestgreen', 'gainsboro', 'ghostwhite', 'goldenrod', 'greenyellow',
        'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki',
        'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
        'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen',
        'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue',
        'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow',
        'limegreen', 'linen', 'mediumaquamarine', 'mediumblue', 'mediumorchid',
        'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
        'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
        'mistyrose', 'moccasin', 'navajowhite', 'oldlace', 'olivedrab',
        'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
        'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'plum', 'powderblue',
        'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown',
        'seagreen', 'seashell', 'sienna', 'skyblue', 'slateblue', 'slategray',
        'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'thistle',
        'tomato', 'turquoise', 'violet', 'wheat', 'whitesmoke', 'yellowgreen'
    ];

    if (namedColors.includes(trimmed.toLowerCase())) {
        return { valid: true, value: trimmed, error: null };
    }

    return {
        valid: false,
        value: null,
        error: 'Invalid color. Use hex (#RRGGBB), rgb(), hsl(), or a named CSS color'
    };
}

/**
 * Validates grid spacing value. Must be an integer between 4 and 128 inclusive.
 *
 * @param {*} value - The grid spacing value to validate
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validateGridSpacing(value) {
    const num = Number(value);

    if (value === null || value === undefined || value === '' || isNaN(num)) {
        return {
            valid: false,
            value: null,
            error: `Grid spacing must be an integer between ${GRID_SPACING_MIN} and ${GRID_SPACING_MAX}`
        };
    }

    if (!isFinite(num) || !Number.isInteger(num)) {
        return {
            valid: false,
            value: null,
            error: `Grid spacing must be an integer between ${GRID_SPACING_MIN} and ${GRID_SPACING_MAX}`
        };
    }

    if (num < GRID_SPACING_MIN || num > GRID_SPACING_MAX) {
        return {
            valid: false,
            value: null,
            error: `Grid spacing must be an integer between ${GRID_SPACING_MIN} and ${GRID_SPACING_MAX}`
        };
    }

    return {
        valid: true,
        value: num,
        error: null
    };
}

/**
 * Validates an image file for format and size constraints.
 * Accepted formats: PNG, JPG, JPEG, SVG, WebP
 * Maximum size: 5MB (5,242,880 bytes)
 *
 * @param {File|{name: string, size: number, type?: string}} file - The file to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateImageFile(file) {
    if (!file || typeof file !== 'object') {
        return {
            valid: false,
            error: 'No file provided'
        };
    }

    // Check file format by extension
    const fileName = file.name || '';
    const extension = fileName.split('.').pop().toLowerCase();

    if (!ACCEPTED_IMAGE_FORMATS.includes(extension)) {
        return {
            valid: false,
            error: `Unsupported format. Accepted formats: ${ACCEPTED_IMAGE_FORMATS.map(f => f.toUpperCase()).join(', ')}`
        };
    }

    // Check file size
    const fileSize = file.size || 0;
    if (fileSize > MAX_FILE_SIZE) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        return {
            valid: false,
            error: `File size (${sizeMB}MB) exceeds the 5MB limit`
        };
    }

    return {
        valid: true,
        error: null
    };
}

/**
 * Validates text content for a text element. Maximum 500 characters.
 * Returns the text truncated to 500 characters if it exceeds the limit.
 *
 * @param {*} text - The text content to validate
 * @returns {{ valid: boolean, value: string, error: string|null, truncated: boolean }}
 */
function validateTextContent(text) {
    if (text === null || text === undefined) {
        return {
            valid: true,
            value: '',
            error: null,
            truncated: false
        };
    }

    const str = String(text);

    if (str.length > MAX_TEXT_LENGTH) {
        return {
            valid: true,
            value: str.substring(0, MAX_TEXT_LENGTH),
            error: null,
            truncated: true
        };
    }

    return {
        valid: true,
        value: str,
        error: null,
        truncated: false
    };
}

// Export for use in other modules and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        validateDimension,
        validateOpacity,
        validateColor,
        validateGridSpacing,
        validateImageFile,
        validateTextContent,
        MAX_FILE_SIZE,
        ACCEPTED_IMAGE_FORMATS,
        MAX_TEXT_LENGTH,
        GRID_SPACING_MIN,
        GRID_SPACING_MAX
    };
}
