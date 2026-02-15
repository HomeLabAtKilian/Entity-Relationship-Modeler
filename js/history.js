import { state } from './state.js';
import { getDiagramJSON, loadDiagram } from './io.js';

export function saveState() {
    if (state.isRestoring) return; // Don't save while undoing

    const currentJSON = getDiagramJSON();
    
    // Avoid duplicates (e.g. clicking without moving)
    if (state.history.length > 0 && state.history[state.history.length - 1] === currentJSON) {
        return;
    }

    state.history.push(currentJSON);
    
    // Limit history size to 50 steps to save memory
    if (state.history.length > 50) state.history.shift();
    
    // Clear redo stack because we branched off
    state.redoStack = [];
}

export function undo() {
    if (state.history.length === 0) return;

    state.isRestoring = true;

    // 1. Save current state to Redo Stack
    const currentJSON = getDiagramJSON();
    state.redoStack.push(currentJSON);

    // 2. Pop previous state
    const previousJSON = state.history.pop();
    
    // 3. Load it
    loadDiagram(previousJSON);

    state.isRestoring = false;
}

export function redo() {
    if (state.redoStack.length === 0) return;

    state.isRestoring = true;

    // 1. Save current state to History
    const currentJSON = getDiagramJSON();
    state.history.push(currentJSON);

    // 2. Pop next state
    const nextJSON = state.redoStack.pop();

    // 3. Load it
    loadDiagram(nextJSON);

    state.isRestoring = false;
}