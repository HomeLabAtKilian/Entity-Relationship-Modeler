import { state } from './state.js';
import { createElement, deleteElement, clearSelection, addToSelection } from './elements.js';
import { createLine } from './lines.js';
import { generateSchema } from './schema.js';
import { generateSQL } from './sql.js';

document.addEventListener("DOMContentLoaded", () => {
    const viewport = document.getElementById("viewport");
    const contentLayer = document.getElementById("content-layer");
    const selectionBox = document.getElementById("selection-box");

    setupMenuListeners();
    setupViewportControls();
    setupKeyboardShortcuts();
    updateTransform();

    function setupMenuListeners() {
        // Basic
        document.getElementById("add_entity").addEventListener("click", () => createElement("entity"));
        document.getElementById("add_attribute").addEventListener("click", () => createElement("attribute"));
        document.getElementById("add_relationship").addEventListener("click", () => createElement("relationship"));
        document.getElementById("add_label").addEventListener("click", () => createElement("label"));
        
        // College Features
        document.getElementById("add_attr_multi").addEventListener("click", () => createElement("attribute-multi"));
        document.getElementById("add_attr_derived").addEventListener("click", () => createElement("attribute-derived"));
        document.getElementById("add_isa").addEventListener("click", () => createElement("isa"));
        document.getElementById("generate_sql").addEventListener("click", generateSQL);

        // Toggles
        document.getElementById("toggle_pk").addEventListener("click", () => {
            state.selectedElements.forEach(el => el.classList.toggle("primary-key"));
        });
        document.getElementById("toggle_weak").addEventListener("click", () => {
            state.selectedElements.forEach(el => el.classList.toggle("weak"));
        });

        // View Switcher
        document.getElementById("view_toggle").addEventListener("change", (e) => {
            state.viewMode = e.target.checked ? 'college' : 'school';
            const collegeBtns = document.querySelectorAll('.college-feature');
            collegeBtns.forEach(btn => {
                btn.style.display = state.viewMode === 'college' ? 'block' : 'none';
            });
        });

        document.getElementById("generate_schema").addEventListener("click", generateSchema);

        // Tools
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

        // Zoom & File
        document.getElementById("zoom_in").addEventListener("click", () => zoomCenter(0.1));
        document.getElementById("zoom_out").addEventListener("click", () => zoomCenter(-0.1));
        document.getElementById("zoom_reset").addEventListener("click", () => { state.scale = 1; state.panX = 0; state.panY = 0; updateTransform(); });
        document.getElementById("save_data").addEventListener("click", exportImage);
        document.getElementById("save_json").addEventListener("click", saveDiagram);
        document.getElementById("clear_canvas").addEventListener("click", clearCanvas);
        
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);
        document.getElementById("load_data").addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
            if (e.target.files[0]) loadDiagram(e.target.files[0]);
            fileInput.value = '';
        });
    }

    function updateButtonStates() {
        const lineBtn = document.getElementById("add_line");
        const deleteBtn = document.getElementById("delete_mode");
        if (state.lineMode) lineBtn.classList.add("active"); else lineBtn.classList.remove("active");
        if (state.deleteMode) deleteBtn.classList.add("delete-active"); else deleteBtn.classList.remove("delete-active");
    }

    // --- Viewport Controls (Same as before) ---
    function setupViewportControls() {
        let isBoxSelecting = false;
        let boxStartX = 0;
        let boxStartY = 0;

        document.addEventListener("contextmenu", (e) => { if (e.ctrlKey) e.preventDefault(); });

        viewport.addEventListener("mousedown", (e) => {
            if (e.ctrlKey && e.button === 2) {
                e.preventDefault();
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
                state.isPanning = true;
                state.startPanX = e.clientX - state.panX;
                state.startPanY = e.clientY - state.panY;
                viewport.style.cursor = "grabbing";
            }
        });

        window.addEventListener("mousemove", (e) => {
            if (isBoxSelecting) {
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
                if (boxRect.width > 5 && boxRect.height > 5) {
                    if (!e.shiftKey) clearSelection();
                    document.querySelectorAll(".element").forEach(el => {
                        const elRect = el.getBoundingClientRect();
                        if (boxRect.left < elRect.right && boxRect.right > elRect.left &&
                            boxRect.top < elRect.bottom && boxRect.bottom > elRect.top) {
                            addToSelection(el);
                        }
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
            if (e.key === "Delete" || e.key === "Backspace") {
                if (document.activeElement.isContentEditable) return;
                state.selectedElements.forEach(el => deleteElement(el));
                state.selectedElements.clear();
            }
            if (e.key.toLowerCase() === "w") {
                if (document.activeElement.isContentEditable) return;
                state.selectedElements.forEach(el => el.classList.toggle("weak"));
            }
            if (e.key.toLowerCase() === "p") {
                if (document.activeElement.isContentEditable) return;
                state.selectedElements.forEach(el => el.classList.toggle("primary-key"));
            }
        });
    }

    // --- Save/Load/Export ---
    function getDiagramJSON() {
        const data = { elements: [], lines: [] };
        document.querySelectorAll(".element").forEach(el => {
            data.elements.push({
                id: el.id,
                type: el.dataset.type,
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height,
                text: el.dataset.type === 'schema' ? el.querySelector(".element-text").innerHTML : el.querySelector(".element-text").innerText,
                isWeak: el.classList.contains("weak"),
                isPK: el.classList.contains("primary-key")
            });
        });
        document.querySelectorAll(".line").forEach(l => {
            let type = "";
            if (l.classList.contains("double")) type = "double";
            if (l.classList.contains("dashed")) type = "dashed";
            data.lines.push({
                startId: l.dataset.startId,
                endId: l.dataset.endId,
                cardStart: l.querySelector(".start").innerText,
                cardEnd: l.querySelector(".end").innerText,
                lineType: type
            });
        });
        return JSON.stringify(data);
    }

    function saveDiagram() {
        const blob = new Blob([getDiagramJSON()], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "er_diagram.json";
        a.click();
    }

    function exportImage() {
        const elements = document.querySelectorAll(".element");
        if (elements.length === 0) { alert("Nothing to save!"); return; }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        elements.forEach(el => {
            const x = parseFloat(el.style.left); const y = parseFloat(el.style.top);
            const w = el.offsetWidth; const h = el.offsetHeight;
            if (x < minX) minX = x; if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w; if (y + h > maxY) maxY = y + h;
        });
        const padding = 50;
        const width = (maxX + padding) - (minX - padding);
        const height = (maxY + padding) - (minY - padding);
        const originalTransform = contentLayer.style.transform;
        contentLayer.style.transform = "none";
        html2canvas(contentLayer, {
            x: minX - padding, y: minY - padding, width: width, height: height,
            backgroundColor: "#1e1e1e", scale: 2, logging: false
        }).then(canvas => {
            contentLayer.style.transform = originalTransform;
            const link = document.createElement('a');
            link.download = 'er_diagram.png';
            link.href = canvas.toDataURL();
            link.click();
        });
    }

    function loadDiagram(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                clearCanvas();
                let maxId = 0;
                data.elements.forEach(d => {
                    createElement(d.type, d);
                    const parts = d.id.split('-');
                    const idNum = parseInt(parts[parts.length - 1]);
                    if (!isNaN(idNum) && idNum > maxId) maxId = idNum;
                });
                state.elementCounter = maxId + 1;
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        data.lines.forEach(l => {
                            const s = document.getElementById(l.startId);
                            const end = document.getElementById(l.endId);
                            if (s && end) createLine(s, end, l);
                        });
                    }, 200);
                });
            } catch (err) { console.error(err); alert("Error loading file."); }
        };
        reader.readAsText(file);
    }

    function clearCanvas() {
        contentLayer.innerHTML = "";
        state.elementCounter = 0;
        state.selectedElements.clear();
        state.lineStart = null;
    }
});