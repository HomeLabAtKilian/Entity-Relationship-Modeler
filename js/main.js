import { state } from './state.js';
import { createElement, deleteElement, clearSelection, addToSelection, selectAll } from './elements.js';
import { buildRelationalModel, renderSchemaHTML } from './schema.js';
import { generateSQL } from './sql.js';
import { saveProject, loadDiagram, exportImage, clearCanvas, setNotation } from './io.js';
import { undo, redo, recordState, resetHistory, readAutosave, flushAutosave } from './history.js';
import { toast } from './utils.js';

const VIEW_MODE_KEY = 'er-modeler:view-mode';
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.2;

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
    const viewport = $('viewport');
    const contentLayer = $('content-layer');
    const selectionBox = $('selection-box');

    // --- Actions ---

    function addElement(type) {
        const el = createElement(type);
        clearSelection();
        addToSelection(el);
        recordState();
    }

    function toggleOnSelection(className, accepts, hint) {
        const targets = [...state.selectedElements].filter(accepts);
        if (!targets.length) { toast(hint); return; }
        // Mixed selection: switch all on; otherwise switch all off
        const enable = !targets.every(el => el.classList.contains(className));
        targets.forEach(el => el.classList.toggle(className, enable));
        recordState();
    }

    const canBeKey = el => el.dataset.type === 'attribute' || el.dataset.type === 'attribute-multi';
    const togglePrimaryKey = () => toggleOnSelection('primary-key', canBeKey, 'Select an attribute first.');
    const toggleForeignKey = () => toggleOnSelection('foreign-key', canBeKey, 'Select an attribute first.');
    const toggleWeak = () => toggleOnSelection(
        'weak',
        el => el.dataset.type === 'entity' || el.dataset.type === 'relationship',
        'Select an entity or relationship first.'
    );

    function deleteSelection() {
        if (!state.selectedElements.size) return;
        [...state.selectedElements].forEach(deleteElement);
        recordState();
    }

    function showSchema() {
        const model = buildRelationalModel();
        let box = contentLayer.querySelector(':scope > .element[data-type="schema"]');
        if (!box) box = createElement('schema');
        box.querySelector('.element-text').innerHTML = renderSchemaHTML(model);
        recordState();
        showWarnings(model.warnings);
        if (!model.warnings.length) toast('Relational model updated.');
    }

    function exportSQL() {
        const model = generateSQL($('sql_dialect').value);
        showWarnings([...model.warnings, ...model.sqlNotes]);
    }

    function setModes(lineMode, deleteMode) {
        state.lineMode = lineMode;
        state.deleteMode = deleteMode;
        if (!lineMode && state.lineStart) {
            state.lineStart.classList.remove('line-start');
            state.lineStart = null;
        }
        $('add_line').classList.toggle('active', lineMode);
        $('delete_mode').classList.toggle('delete-active', deleteMode);
        document.body.classList.toggle('line-mode', lineMode);
        document.body.classList.toggle('delete-mode', deleteMode);
    }
    const toggleLineMode = () => setModes(!state.lineMode, false);
    const toggleDeleteMode = () => setModes(false, !state.deleteMode);

    function setViewMode(mode) {
        state.viewMode = mode;
        $('view_toggle').checked = mode === 'advanced';
        document.querySelectorAll('.advanced-feature').forEach(el => { el.hidden = mode !== 'advanced'; });
        try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* not important */ }
    }

    function readViewMode() {
        try { return localStorage.getItem(VIEW_MODE_KEY) === 'advanced' ? 'advanced' : 'basic'; } catch { return 'basic'; }
    }

    // --- Setup ---

    function setupMenu() {
        const addButtons = {
            add_entity: 'entity',
            add_attribute: 'attribute',
            add_relationship: 'relationship',
            add_label: 'label',
            add_attr_multi: 'attribute-multi',
            add_attr_derived: 'attribute-derived',
            add_isa: 'isa',
        };
        Object.entries(addButtons).forEach(([id, type]) => $(id).addEventListener('click', () => addElement(type)));

        $('toggle_pk').addEventListener('click', togglePrimaryKey);
        $('toggle_fk').addEventListener('click', toggleForeignKey);
        $('toggle_weak').addEventListener('click', toggleWeak);

        $('view_toggle').addEventListener('change', e => setViewMode(e.target.checked ? 'advanced' : 'basic'));
        $('notation_select').addEventListener('change', e => { setNotation(e.target.value); recordState(); });

        $('generate_schema').addEventListener('click', showSchema);
        $('generate_sql').addEventListener('click', exportSQL);

        $('add_line').addEventListener('click', toggleLineMode);
        $('delete_mode').addEventListener('click', toggleDeleteMode);

        $('zoom_in').addEventListener('click', () => zoomAt(window.innerWidth / 2, window.innerHeight / 2, state.scale * ZOOM_STEP));
        $('zoom_out').addEventListener('click', () => zoomAt(window.innerWidth / 2, window.innerHeight / 2, state.scale / ZOOM_STEP));
        $('zoom_reset').addEventListener('click', () => { state.scale = 1; state.panX = 0; state.panY = 0; updateTransform(); });

        $('save_data').addEventListener('click', exportImage);
        $('save_json').addEventListener('click', saveProject);
        $('clear_canvas').addEventListener('click', () => {
            if (!contentLayer.childElementCount) return;
            if (!confirm('Clear the whole diagram? (You can undo this with Ctrl+Z.)')) return;
            clearCanvas();
            showWarnings([]);
            recordState();
        });

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.hidden = true;
        document.body.appendChild(fileInput);
        $('load_data').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                if (loadDiagram(ev.target.result)) {
                    showWarnings([]);
                    recordState();
                    toast(`Loaded ${file.name}`);
                }
            };
            reader.readAsText(file);
        });
    }

    function setupPanels() {
        $('warnings_close').addEventListener('click', () => showWarnings([]));
        $('toggle_help').addEventListener('click', toggleHelp);
        $('help_close').addEventListener('click', toggleHelp);
    }

    function toggleHelp() {
        $('help-panel').hidden = !$('help-panel').hidden;
    }

    function showWarnings(list) {
        const panel = $('warnings-panel');
        const ul = $('warnings-list');
        ul.replaceChildren(...list.map(text => {
            const li = document.createElement('li');
            li.textContent = text;
            return li;
        }));
        panel.hidden = !list.length;
    }

    function setupViewport() {
        let isBoxSelecting = false;
        let boxStartX = 0;
        let boxStartY = 0;

        document.addEventListener('contextmenu', e => {
            if (e.ctrlKey || isBoxSelecting) e.preventDefault();
        });

        viewport.addEventListener('mousedown', e => {
            if ((e.ctrlKey && e.button === 2) || (e.shiftKey && e.button === 0)) {
                e.preventDefault();
                e.stopPropagation();
                isBoxSelecting = true;
                boxStartX = e.clientX;
                boxStartY = e.clientY;
                Object.assign(selectionBox.style, { left: `${boxStartX}px`, top: `${boxStartY}px`, width: '0px', height: '0px' });
                selectionBox.hidden = false;
                return;
            }

            if (e.button === 0 && (e.target === viewport || e.target === contentLayer)) {
                if (!e.ctrlKey && !e.shiftKey) clearSelection();
                if (state.lineStart) {
                    state.lineStart.classList.remove('line-start');
                    state.lineStart = null;
                }
                state.isPanning = true;
                state.startPanX = e.clientX - state.panX;
                state.startPanY = e.clientY - state.panY;
                viewport.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', e => {
            if (isBoxSelecting) {
                e.preventDefault();
                Object.assign(selectionBox.style, {
                    width: `${Math.abs(e.clientX - boxStartX)}px`,
                    height: `${Math.abs(e.clientY - boxStartY)}px`,
                    left: `${Math.min(e.clientX, boxStartX)}px`,
                    top: `${Math.min(e.clientY, boxStartY)}px`,
                });
                return;
            }
            if (state.isPanning) {
                e.preventDefault();
                state.panX = e.clientX - state.startPanX;
                state.panY = e.clientY - state.startPanY;
                updateTransform();
            }
        });

        window.addEventListener('mouseup', e => {
            if (isBoxSelecting) {
                isBoxSelecting = false;
                const boxRect = selectionBox.getBoundingClientRect();
                selectionBox.hidden = true;
                if (boxRect.width > 2 && boxRect.height > 2) {
                    if (!e.ctrlKey && !e.shiftKey) clearSelection();
                    contentLayer.querySelectorAll(':scope > .element').forEach(el => {
                        const r = el.getBoundingClientRect();
                        const intersects = !(boxRect.right < r.left || boxRect.left > r.right || boxRect.bottom < r.top || boxRect.top > r.bottom);
                        if (intersects) addToSelection(el);
                    });
                }
                return;
            }
            state.isPanning = false;
            viewport.style.cursor = '';
        });

        viewport.addEventListener('wheel', e => {
            e.preventDefault();
            const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // lines -> pixels (Firefox)
            const clamped = Math.max(-100, Math.min(100, delta));
            zoomAt(e.clientX, e.clientY, state.scale * Math.exp(-clamped * 0.0015));
        }, { passive: false });
    }

    // Zoom is multiplicative, so every step feels the same at any zoom level
    function zoomAt(screenX, screenY, newScale) {
        const scale = Math.min(Math.max(ZOOM_MIN, newScale), ZOOM_MAX);
        const worldX = (screenX - state.panX) / state.scale;
        const worldY = (screenY - state.panY) / state.scale;
        state.scale = scale;
        state.panX = screenX - worldX * scale;
        state.panY = screenY - worldY * scale;
        updateTransform();
    }

    function updateTransform() {
        contentLayer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
        const gridSize = 20 * state.scale;
        viewport.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        viewport.style.backgroundPosition = `${state.panX}px ${state.panY}px`;
        viewport.classList.toggle('zoom-low', state.scale < 0.6);
        viewport.classList.toggle('zoom-very-low', state.scale < 0.3);
    }

    function setupKeyboard() {
        document.addEventListener('keydown', e => {
            const active = document.activeElement;
            const editing = active?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(active?.tagName);
            const key = e.key.toLowerCase();

            if (e.ctrlKey || e.metaKey) {
                if (e.altKey) return;
                if (key === 's') { e.preventDefault(); saveProject(); return; }
                if (editing) return; // native text undo / select all while typing
                if (key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
                if (key === 'y') { e.preventDefault(); redo(); return; }
                if (key === 'a') { e.preventDefault(); selectAll(); return; }
                return; // leave Ctrl+P, Ctrl+C, ... to the browser
            }

            if (e.key === 'Escape') {
                if (active?.isContentEditable) { active.blur(); return; }
                setModes(false, false);
                clearSelection();
                $('help-panel').hidden = true;
                return;
            }
            if (editing || e.altKey) return;

            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
            if (e.key === '?') { toggleHelp(); return; }
            if (key === 'p') togglePrimaryKey();
            else if (key === 'f') toggleForeignKey();
            else if (key === 'w') toggleWeak();
            else if (key === 'l') toggleLineMode();
        });
    }

    // --- Start-up (after all declarations above) ---

    setupMenu();
    setupViewport();
    setupKeyboard();
    setupPanels();
    setViewMode(readViewMode());

    const saved = readAutosave();
    if (saved && loadDiagram(saved, { quiet: true }) && contentLayer.childElementCount) {
        toast('Your last session was restored.');
    }
    resetHistory();
    updateTransform();

    window.addEventListener('beforeunload', e => {
        if (document.activeElement?.isContentEditable) document.activeElement.blur();
        recordState();
        // Only warn when the work could not be autosaved
        if (!flushAutosave() && contentLayer.childElementCount) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});
