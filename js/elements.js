import { state } from './state.js';
import { handleLineClick, updateLines, removeLine, positionLine } from './lines.js';
import { sanitizePaste, sanitizeHTML } from './utils.js';
import { recordState } from './history.js';

const GRID = 20;
const DRAG_THRESHOLD = 3; // px of mouse movement before a click becomes a drag

const DEFAULT_TEXT = {
    entity: 'Entity',
    relationship: 'Relationship',
    attribute: 'Attribute',
    'attribute-multi': 'Attribute',
    'attribute-derived': 'Attribute',
    label: 'Label',
    isa: 'ISA',
    schema: '<b>Relationsmodell:</b><br>',
};

export const ELEMENT_TYPES = new Set(Object.keys(DEFAULT_TEXT));

const snap = value => Math.round(value / GRID) * GRID;

/**
 * Creates an element on the canvas. With `savedData` (loading a file or undo)
 * the saved id, position and flags are used. Does not record history; the
 * caller decides when a user action is complete.
 */
export function createElement(type, savedData = null) {
    const contentLayer = document.getElementById('content-layer');
    const element = document.createElement('div');
    element.id = uniqueId(savedData?.id);
    element.dataset.type = type;
    element.classList.add('element');
    element.lines = [];

    if (savedData?.isWeak) element.classList.add('weak');
    if (savedData?.isPK) element.classList.add('primary-key');
    if (savedData?.isFK) element.classList.add('foreign-key');

    const text = document.createElement('p');
    text.className = 'element-text';
    text.contentEditable = 'true';
    text.spellcheck = false;
    if (type === 'schema') text.innerHTML = sanitizeHTML(savedData?.text ?? DEFAULT_TEXT.schema);
    else text.innerText = savedData?.text ?? DEFAULT_TEXT[type] ?? type;
    text.addEventListener('paste', sanitizePaste);

    // Text edits become one undo step when editing ends
    let textBefore = '';
    text.addEventListener('focus', () => { textBefore = text.innerHTML; });
    text.addEventListener('blur', () => {
        if (text.innerHTML === textBefore) return;
        updateLines(element);
        recordState();
    });

    switch (type) {
        case 'entity':
            element.style.backgroundColor = state.colors.entity;
            element.style.width = '200px'; element.style.height = '60px';
            break;
        case 'relationship':
            element.style.backgroundColor = state.colors.relationship;
            element.style.width = '100px'; element.style.height = '100px';
            element.style.transform = 'rotate(45deg)';
            text.style.transform = 'rotate(-45deg)';
            break;
        case 'attribute':
        case 'attribute-multi':
        case 'attribute-derived':
            element.style.backgroundColor = state.colors.attribute;
            element.style.width = '200px'; element.style.height = '60px';
            element.style.borderRadius = '50%';
            break;
        case 'label':
            element.style.backgroundColor = state.colors.label;
            element.style.boxShadow = 'none';
            text.style.fontSize = '1.5em';
            break;
        case 'schema':
            element.classList.add('schema-box');
            element.style.width = '500px';
            break;
    }

    element.appendChild(text);
    contentLayer.appendChild(element);

    if (savedData) {
        if (savedData.left) element.style.left = savedData.left;
        if (savedData.top) element.style.top = savedData.top;
        if (savedData.width) element.style.width = savedData.width;
        if (savedData.height) element.style.height = savedData.height;
    } else {
        placeNewElement(element);
    }

    element.addEventListener('click', e => {
        e.stopPropagation();
        if (state.deleteMode) {
            deleteElement(element);
            recordState();
            return;
        }
        if (state.lineMode) handleLineClick(element);
    });

    element.addEventListener('mousedown', e => {
        if (state.deleteMode || state.lineMode || e.button !== 0) return;
        if (document.activeElement === text) return; // editing: let the caret move
        e.stopPropagation();

        // Selection changes that only make sense if the mouse does not move
        // are applied on mouseup (via onClick) instead of on mousedown.
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        const wasSelected = state.selectedElements.has(element);
        let onClick = null;
        if (additive) {
            if (wasSelected) onClick = () => removeFromSelection(element);
            else addToSelection(element);
        } else if (!wasSelected) {
            clearSelection();
            addToSelection(element);
        } else {
            onClick = () => { clearSelection(); addToSelection(element); };
        }
        initDrag(e, onClick);
    });

    element.addEventListener('dblclick', e => {
        if (state.deleteMode || state.lineMode) return;
        e.stopPropagation();
        text.focus();
        document.execCommand('selectAll', false, null);
    });

    return element;
}

function uniqueId(requested) {
    if (requested && requested !== 'undefined' && !document.getElementById(requested)) return requested;
    let id;
    do { id = `element-${state.elementCounter++}`; } while (document.getElementById(id));
    return id;
}

function placeNewElement(element) {
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    const centerX = (window.innerWidth / 2 - state.panX) / state.scale;
    const centerY = (window.innerHeight / 2 - state.panY) / state.scale;
    let left = snap(centerX - w / 2);
    let top = snap(centerY - h / 2);

    // Don't stack new elements exactly on top of each other
    const taken = new Set(
        [...document.querySelectorAll('#content-layer > .element')]
            .filter(el => el !== element)
            .map(el => `${parseFloat(el.style.left)},${parseFloat(el.style.top)}`)
    );
    while (taken.has(`${left},${top}`)) { left += GRID; top += GRID; }

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
}

function initDrag(e, onClick) {
    const startX = e.clientX;
    const startY = e.clientY;
    const initial = new Map(
        [...state.selectedElements].map(el => [el, { left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 }])
    );

    // Collect each affected line once and measure element sizes up front, so
    // dragging never forces a layout per line per mouse move.
    const lines = new Set([...initial.keys()].flatMap(el => el.lines || []));
    const sizes = new Map();
    lines.forEach(line => [line._start, line._end].forEach(el => {
        if (el && !sizes.has(el)) sizes.set(el, { w: el.offsetWidth, h: el.offsetHeight });
    }));

    let dragging = false;
    let frame = 0;
    let lastEvent = e;

    const apply = () => {
        frame = 0;
        const dx = (lastEvent.clientX - startX) / state.scale;
        const dy = (lastEvent.clientY - startY) / state.scale;
        for (const [el, pos] of initial) {
            el.style.left = `${snap(pos.left + dx)}px`;
            el.style.top = `${snap(pos.top + dy)}px`;
        }
        lines.forEach(line => positionLine(line, sizes));
    };

    const onMove = ev => {
        lastEvent = ev;
        if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        if (!frame) frame = requestAnimationFrame(apply);
    };

    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (frame) { cancelAnimationFrame(frame); apply(); }
        if (dragging) recordState();
        else onClick?.();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

export function deleteElement(el) {
    [...(el.lines || [])].forEach(removeLine);
    if (state.lineStart === el) state.lineStart = null;
    state.selectedElements.delete(el);
    el.remove();
}

export function addToSelection(el) {
    el.classList.add('selected');
    state.selectedElements.add(el);
}

export function removeFromSelection(el) {
    el.classList.remove('selected');
    state.selectedElements.delete(el);
}

export function clearSelection() {
    state.selectedElements.forEach(el => el.classList.remove('selected'));
    state.selectedElements.clear();
}

export function selectAll() {
    document.querySelectorAll('#content-layer > .element').forEach(addToSelection);
}
