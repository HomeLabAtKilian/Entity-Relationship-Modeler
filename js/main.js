import { state } from './state.js';
import { createElement, deleteElement, clearSelection, addToSelection } from './elements.js';
import { createLine } from './lines.js';
import { generateSchema } from './schema.js';
import { generateSQL } from './sql.js';
import { saveProject, loadDiagram, exportImage, clearCanvas } from './io.js'; // Import IO
import { undo, redo, saveState } from './history.js'; // Import History

document.addEventListener("DOMContentLoaded", () => {
    const viewport = document.getElementById("viewport");
    const contentLayer = document.getElementById("content-layer");
    const selectionBox = document.getElementById("selection-box");

    setupMenuListeners();
    setupViewportControls();
    setupKeyboardShortcuts();
    updateTransform();

    function setupMenuListeners() {
        document.getElementById("add_entity").addEventListener("click", () => createElement("entity"));
        document.getElementById("add_attribute").addEventListener("click", () => createElement("attribute"));
        document.getElementById("add_relationship").addEventListener("click", () => createElement("relationship"));
        document.getElementById("add_label").addEventListener("click", () => createElement("label"));
        
        document.getElementById("add_attr_multi").addEventListener("click", () => createElement("attribute-multi"));
        document.getElementById("add_attr_derived").addEventListener("click", () => createElement("attribute-derived"));
        document.getElementById("add_isa").addEventListener("click", () => createElement("isa"));
        document.getElementById("generate_sql").addEventListener("click", generateSQL);

        document.getElementById("toggle_pk").addEventListener("click", () => {
            saveState(); // Save before toggle
            state.selectedElements.forEach(el => el.classList.toggle("primary-key"));
        });
        document.getElementById("toggle_weak").addEventListener("click", () => {
            saveState(); // Save before toggle
            state.selectedElements.forEach(el => el.classList.toggle("weak"));
        });

        document.getElementById("view_toggle").addEventListener("change", (e) => {
            state.viewMode = e.target.checked ? 'advanced' : 'basic';
            const advancedBtns = document.querySelectorAll('.advanced-feature');
            advancedBtns.forEach(btn => {
                btn.style.display = state.viewMode === 'advanced' ? 'block' : 'none';
            });
        });

        document.getElementById("generate_schema").addEventListener("click", generateSchema);

        const lineBtn = document.getElementById("add_line");
        lineBtn.addEventListener("click", () => {
            state.lineMode = !state.lineMode;
            state.deleteMode = false;
            updateButtonStates();
            if (!state.lineMode && state.lineStart) {
                state.lineStart.classList.remove("line-start");
                state.lineStart = null;
            }
        });

        const deleteBtn = document.getElementById("delete_mode");
        deleteBtn.addEventListener("click", () => {
            state.deleteMode = !state.deleteMode;
            state.lineMode = false;
            updateButtonStates();
        });

        document.getElementById("zoom_in").addEventListener("click", () => zoomCenter(0.1));
        document.getElementById("zoom_out").addEventListener("click", () => zoomCenter(-0.1));
        document.getElementById("zoom_reset").addEventListener("click", () => { state.scale = 1; state.panX = 0; state.panY = 0; updateTransform(); });
        
        // Updated IO Listeners
        document.getElementById("save_data").addEventListener("click", exportImage);
        document.getElementById("save_json").addEventListener("click", saveProject);
        document.getElementById("clear_canvas").addEventListener("click", () => {
            saveState();
            clearCanvas();
        });
        
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);
        document.getElementById("load_data").addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
            if (e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    saveState(); // Save current before loading new
                    loadDiagram(ev.target.result);
                };
                reader.readAsText(e.target.files[0]);
            }
            fileInput.value = '';
        });
    }

    function updateButtonStates() {
        const lineBtn = document.getElementById("add_line");
        const deleteBtn = document.getElementById("delete_mode");
        if (state.lineMode) lineBtn.classList.add("active"); else lineBtn.classList.remove("active");
        if (state.deleteMode) deleteBtn.classList.add("delete-active"); else deleteBtn.classList.remove("delete-active");
    }

    function setupViewportControls() {
        let isBoxSelecting = false;
        let boxStartX = 0;
        let boxStartY = 0;

        document.addEventListener("contextmenu", (e) => { 
            if (e.ctrlKey || isBoxSelecting) {
                e.preventDefault(); 
                return false;
            }
        });

        viewport.addEventListener("mousedown", (e) => {
            if ((e.ctrlKey && e.button === 2) || (e.shiftKey && e.button === 0)) {
                e.preventDefault();
                e.stopPropagation();
                isBoxSelecting = true;
                boxStartX = e.clientX;
                boxStartY = e.clientY;
                selectionBox.style.left = `${boxStartX}px`;
                selectionBox.style.top = `${boxStartY}px`;
                selectionBox.style.width = "0px";
                selectionBox.style.height = "0px";
                selectionBox.hidden = false;
                return;
            }

            if (e.button === 0 && (e.target === viewport || e.target === contentLayer)) {
                if (!e.ctrlKey && !e.shiftKey) clearSelection();
                state.isPanning = true;
                state.startPanX = e.clientX - state.panX;
                state.startPanY = e.clientY - state.panY;
                viewport.style.cursor = "grabbing";
            }
        });

        window.addEventListener("mousemove", (e) => {
            if (isBoxSelecting) {
                e.preventDefault();
                const currentX = e.clientX;
                const currentY = e.clientY;
                const width = Math.abs(currentX - boxStartX);
                const height = Math.abs(currentY - boxStartY);
                const left = Math.min(currentX, boxStartX);
                const top = Math.min(currentY, boxStartY);
                selectionBox.style.width = `${width}px`;
                selectionBox.style.height = `${height}px`;
                selectionBox.style.left = `${left}px`;
                selectionBox.style.top = `${top}px`;
                return;
            }
            if (state.isPanning) {
                e.preventDefault();
                state.panX = e.clientX - state.startPanX;
                state.panY = e.clientY - state.startPanY;
                updateTransform();
            }
        });

        window.addEventListener("mouseup", (e) => {
            if (isBoxSelecting) {
                isBoxSelecting = false;
                selectionBox.hidden = true;
                const boxRect = selectionBox.getBoundingClientRect();
                if (boxRect.width > 2 && boxRect.height > 2) {
                    if (!e.ctrlKey && !e.shiftKey) clearSelection();
                    document.querySelectorAll(".element").forEach(el => {
                        const elRect = el.getBoundingClientRect();
                        const intersects = !(boxRect.right < elRect.left || boxRect.left > elRect.right || boxRect.bottom < elRect.top || boxRect.top > elRect.bottom);
                        if (intersects) addToSelection(el);
                    });
                }
                return;
            }
            state.isPanning = false;
            viewport.style.cursor = "grab";
        });

        viewport.addEventListener("wheel", (e) => {
            e.preventDefault();
            const zoomIntensity = 0.02;
            const direction = e.deltaY > 0 ? -1 : 1;
            const factor = direction * zoomIntensity;
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const worldX = (mouseX - state.panX) / state.scale;
            const worldY = (mouseY - state.panY) / state.scale;
            state.scale += factor;
            state.scale = Math.min(Math.max(0.1, state.scale), 5);
            state.panX = mouseX - worldX * state.scale;
            state.panY = mouseY - worldY * state.scale;
            updateTransform();
        }, { passive: false });
    }

    function zoomCenter(delta) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const worldX = (centerX - state.panX) / state.scale;
        const worldY = (centerY - state.panY) / state.scale;
        state.scale += delta;
        state.scale = Math.min(Math.max(0.1, state.scale), 5);
        state.panX = centerX - worldX * state.scale;
        state.panY = centerY - worldY * state.scale;
        updateTransform();
    }

    function updateTransform() {
        contentLayer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
        const gridSize = 20 * state.scale;
        viewport.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        viewport.style.backgroundPosition = `${state.panX}px ${state.panY}px`;
        viewport.classList.remove("zoom-low", "zoom-very-low");
        if (state.scale < 0.6) viewport.classList.add("zoom-low");
        if (state.scale < 0.3) viewport.classList.add("zoom-very-low");
    }

    function setupKeyboardShortcuts() {
        document.addEventListener("keydown", (e) => {
            // Undo / Redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
                return;
            }

            if (e.key === "Delete" || e.key === "Backspace") {
                if (document.activeElement.isContentEditable) return;
                saveState(); // Save before delete
                state.selectedElements.forEach(el => deleteElement(el));
                state.selectedElements.clear();
            }
            if (e.key.toLowerCase() === "w") {
                if (document.activeElement.isContentEditable) return;
                saveState(); // Save before toggle
                state.selectedElements.forEach(el => el.classList.toggle("weak"));
            }
            if (e.key.toLowerCase() === "p") {
                if (document.activeElement.isContentEditable) return;
                saveState(); // Save before toggle
                state.selectedElements.forEach(el => el.classList.toggle("primary-key"));
            }
        });
    }
});