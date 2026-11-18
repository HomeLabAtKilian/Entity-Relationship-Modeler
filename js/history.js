import { state } from './state.js';
import { getDiagramJSON, loadDiagram } from './io.js';

// The history stores snapshots taken AFTER each change; the last entry is
// always the current diagram. Recording an unchanged diagram is a no-op, so
// plain clicks never create empty undo steps or wipe the redo stack.

const MAX_HISTORY = 50;
const AUTOSAVE_KEY = 'er-modeler:autosave';
const AUTOSAVE_DELAY = 400;

let autosaveTimer = null;
let pendingAutosave = null;
let autosaveWorks = true;

export function recordState() {
    const current = getDiagramJSON();
    const { history } = state;
    if (history.length && history[history.length - 1] === current) return;

    history.push(current);
    if (history.length > MAX_HISTORY + 1) history.shift();
    state.redoStack = [];
    scheduleAutosave(current);
}

export function resetHistory() {
    state.history = [getDiagramJSON()];
    state.redoStack = [];
}

export function undo() {
    recordState(); // capture any change that was not recorded yet
    if (state.history.length < 2) return;

    state.redoStack.push(state.history.pop());
    restore(state.history[state.history.length - 1]);
}

export function redo() {
    if (!state.redoStack.length) return;

    state.history.push(state.redoStack.pop());
    restore(state.history[state.history.length - 1]);
}

function restore(json) {
    loadDiagram(json, { quiet: true });
    // Store the exact serialization of what is now on screen, so the next
    // recordState() comparison is reliable.
    const actual = getDiagramJSON();
    state.history[state.history.length - 1] = actual;
    scheduleAutosave(actual);
}

// --- Autosave (browser localStorage) ---

function scheduleAutosave(json) {
    pendingAutosave = json;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(flushAutosave, AUTOSAVE_DELAY);
}

/** Writes a pending autosave immediately. Returns false if storage is unavailable. */
export function flushAutosave() {
    clearTimeout(autosaveTimer);
    if (pendingAutosave === null) return autosaveWorks;
    try {
        localStorage.setItem(AUTOSAVE_KEY, pendingAutosave);
        pendingAutosave = null;
        autosaveWorks = true;
    } catch {
        autosaveWorks = false;
    }
    return autosaveWorks;
}

export function readAutosave() {
    try {
        return localStorage.getItem(AUTOSAVE_KEY);
    } catch {
        return null;
    }
}
