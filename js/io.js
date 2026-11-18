import { state, NOTATIONS } from './state.js';
import { createElement, ELEMENT_TYPES } from './elements.js';
import { createLine } from './lines.js';
import { downloadBlob, toast } from './utils.js';

const FILE_VERSION = 2;

export function getDiagramJSON() {
    const contentLayer = document.getElementById('content-layer');
    const data = { version: FILE_VERSION, notation: state.notation, elements: [], lines: [] };

    contentLayer.querySelectorAll(':scope > .element').forEach(el => {
        const text = el.querySelector('.element-text');
        data.elements.push({
            id: el.id,
            type: el.dataset.type,
            left: el.style.left,
            top: el.style.top,
            width: el.style.width,
            height: el.style.height,
            text: el.dataset.type === 'schema' ? text.innerHTML : text.innerText,
            isWeak: el.classList.contains('weak'),
            isPK: el.classList.contains('primary-key'),
            isFK: el.classList.contains('foreign-key'),
        });
    });

    contentLayer.querySelectorAll(':scope > .line').forEach(line => {
        data.lines.push({
            startId: line.dataset.startId,
            endId: line.dataset.endId,
            cardStart: line.querySelector('.start').textContent,
            cardEnd: line.querySelector('.end').textContent,
            lineType: line.classList.contains('double') ? 'double' : '',
            role: line.dataset.role || '',
        });
    });

    return JSON.stringify(data);
}

/**
 * Replaces the canvas with the diagram in `jsonString`.
 * Returns true on success; on failure the previous diagram is kept.
 */
export function loadDiagram(jsonString, { quiet = false } = {}) {
    let data;
    try {
        data = JSON.parse(jsonString);
    } catch {
        if (!quiet) toast('This file is not a valid diagram.');
        return false;
    }
    if (!data || !Array.isArray(data.elements)) {
        if (!quiet) toast('This file is not a valid diagram.');
        return false;
    }

    const backup = getDiagramJSON();
    try {
        applyDiagram(data);
        return true;
    } catch (err) {
        console.error(err);
        applyDiagram(JSON.parse(backup));
        if (!quiet) toast('The diagram could not be loaded.');
        return false;
    }
}

function applyDiagram(data) {
    clearCanvas();
    if (data.notation && NOTATIONS[data.notation]) setNotation(data.notation);

    // Set the counter first so generated ids never collide with loaded ones
    let maxId = -1;
    data.elements.forEach(d => {
        const match = /(\d+)$/.exec(String(d?.id ?? ''));
        if (match) maxId = Math.max(maxId, Number(match[1]));
    });
    state.elementCounter = maxId + 1;

    data.elements.forEach(d => {
        if (d && ELEMENT_TYPES.has(d.type)) createElement(d.type, d);
    });

    (Array.isArray(data.lines) ? data.lines : []).forEach(l => {
        const start = findElement(l?.startId);
        const end = findElement(l?.endId);
        if (start && end && start !== end) createLine(start, end, l);
    });
}

function findElement(id) {
    if (!id) return null;
    const el = document.getElementById(id);
    return el && el.classList.contains('element') && el.parentElement?.id === 'content-layer' ? el : null;
}

export function clearCanvas() {
    document.getElementById('content-layer').innerHTML = '';
    state.elementCounter = 0;
    state.selectedElements.clear();
    state.lineStart = null;
}

export function setNotation(notation) {
    if (!NOTATIONS[notation]) return;
    state.notation = notation;
    const select = document.getElementById('notation_select');
    if (select) select.value = notation;
}

export function saveProject() {
    downloadBlob(new Blob([getDiagramJSON()], { type: 'application/json' }), 'er_diagram.json');
}

export async function exportImage() {
    const contentLayer = document.getElementById('content-layer');
    const viewport = document.getElementById('viewport');
    const elements = [...contentLayer.querySelectorAll(':scope > .element')];

    if (!elements.length) { toast('Nothing to export yet.'); return; }
    if (typeof window.html2canvas !== 'function') {
        toast('Image export needs an internet connection (html2canvas could not be loaded).', 4000);
        return;
    }

    // offsetLeft/Top are layout positions and work even for elements that
    // were never dragged (no inline left/top).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
        minX = Math.min(minX, el.offsetLeft);
        minY = Math.min(minY, el.offsetTop);
        maxX = Math.max(maxX, el.offsetLeft + el.offsetWidth);
        maxY = Math.max(maxY, el.offsetTop + el.offsetHeight);
    });
    const padding = 50;

    // Temporarily remove zoom level-of-detail styles and selection highlights,
    // otherwise they end up in the picture (e.g. invisible text when zoomed out).
    const lodClasses = ['zoom-low', 'zoom-very-low'].filter(c => viewport.classList.contains(c));
    const highlights = [...contentLayer.querySelectorAll('.selected, .line-start')]
        .map(el => [el, ['selected', 'line-start'].filter(c => el.classList.contains(c))]);
    const originalTransform = contentLayer.style.transform;

    viewport.classList.remove(...lodClasses);
    highlights.forEach(([el, classes]) => el.classList.remove(...classes));
    contentLayer.style.transform = 'none';

    try {
        const canvas = await window.html2canvas(contentLayer, {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + 2 * padding,
            height: maxY - minY + 2 * padding,
            backgroundColor: '#1e1e1e',
            scale: 2,
            logging: false,
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Rendering produced no image');
        downloadBlob(blob, 'er_diagram.png');
    } catch (err) {
        console.error(err);
        toast('Image export failed.');
    } finally {
        contentLayer.style.transform = originalTransform;
        viewport.classList.add(...lodClasses);
        highlights.forEach(([el, classes]) => el.classList.add(...classes));
    }
}
