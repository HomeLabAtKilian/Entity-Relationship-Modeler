document.addEventListener("DOMContentLoaded", () => {
    const viewport = document.getElementById("viewport");
    const contentLayer = document.getElementById("content-layer");
    const selectionBox = document.getElementById("selection-box");
    
    // --- State Variables ---
    let lineMode = false;
    let deleteMode = false;
    let lineStart = null;
    let elementCounter = 0;
    let selectedElements = new Set();
    
    // --- Viewport State ---
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;

    // --- Box Selection State ---
    let isBoxSelecting = false;
    let boxStartX = 0;
    let boxStartY = 0;

    // --- Theme Colors ---
    const colors = {
        entity: "#ffa000",       
        relationship: "#0090ff", 
        attribute: "#13a200",    
        label: "transparent"
    };

    // --- Initialization ---
    setupMenuListeners();
    setupViewportControls();
    setupKeyboardShortcuts();
    updateTransform();

    // --- Menu Listeners ---
    function setupMenuListeners() {
        document.getElementById("add_entity").addEventListener("click", () => createElement("entity"));
        document.getElementById("add_relationship").addEventListener("click", () => createElement("relationship"));
        document.getElementById("add_attribute").addEventListener("click", () => createElement("attribute"));
        document.getElementById("add_label").addEventListener("click", () => createElement("label"));

        // Primary Key Toggle
        document.getElementById("toggle_pk").addEventListener("click", () => {
            selectedElements.forEach(el => el.classList.toggle("primary-key"));
        });

        // Line Tool
        const lineBtn = document.getElementById("add_line");
        lineBtn.addEventListener("click", () => {
            lineMode = !lineMode;
            deleteMode = false;
            updateButtonStates();
            if (!lineMode && lineStart) {
                lineStart.classList.remove("line-start");
                lineStart = null;
            }
        });

        // Delete Tool
        const deleteBtn = document.getElementById("delete_mode");
        deleteBtn.addEventListener("click", () => {
            deleteMode = !deleteMode;
            lineMode = false;
            updateButtonStates();
        });

        // Zoom Controls
        document.getElementById("zoom_in").addEventListener("click", () => zoomCenter(0.1));
        document.getElementById("zoom_out").addEventListener("click", () => zoomCenter(-0.1));
        document.getElementById("zoom_reset").addEventListener("click", () => {
            scale = 1; panX = 0; panY = 0;
            updateTransform();
        });

        // File Controls
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
        
        if (lineMode) lineBtn.classList.add("active");
        else lineBtn.classList.remove("active");

        if (deleteMode) deleteBtn.classList.add("delete-active");
        else deleteBtn.classList.remove("delete-active");
    }

    // --- Viewport Logic (Pan, Zoom, Box Select) ---
    function setupViewportControls() {
        
        // Prevent Context Menu on Right Click (for Box Select)
        document.addEventListener("contextmenu", (e) => {
            if (e.ctrlKey) e.preventDefault();
        });

        viewport.addEventListener("mousedown", (e) => {
            // 1. Box Selection (Ctrl + Right Click)
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

            // 2. Panning (Left Click on background)
            if (e.button === 0 && (e.target === viewport || e.target === contentLayer)) {
                isPanning = true;
                startPanX = e.clientX - panX;
                startPanY = e.clientY - panY;
                viewport.style.cursor = "grabbing";
            }
        });

        window.addEventListener("mousemove", (e) => {
            // Handle Box Selection Drag
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

            // Handle Panning
            if (isPanning) {
                e.preventDefault();
                panX = e.clientX - startPanX;
                panY = e.clientY - startPanY;
                updateTransform();
            }
        });

        window.addEventListener("mouseup", (e) => {
            // Finish Box Selection
            if (isBoxSelecting) {
                isBoxSelecting = false;
                selectionBox.hidden = true;
                
                // Calculate selection
                const boxRect = selectionBox.getBoundingClientRect();
                
                // If simple click without drag, don't clear selection
                if (boxRect.width < 5 && boxRect.height < 5) return;

                if (!e.shiftKey) clearSelection();

                document.querySelectorAll(".element").forEach(el => {
                    const elRect = el.getBoundingClientRect();
                    // Check Intersection
                    if (
                        boxRect.left < elRect.right &&
                        boxRect.right > elRect.left &&
                        boxRect.top < elRect.bottom &&
                        boxRect.bottom > elRect.top
                    ) {
                        addToSelection(el);
                    }
                });
                return;
            }

            isPanning = false;
            viewport.style.cursor = "grab";
        });

        // Zooming
        viewport.addEventListener("wheel", (e) => {
            e.preventDefault();
            const zoomIntensity = 0.02; 
            const direction = e.deltaY > 0 ? -1 : 1;
            const factor = direction * zoomIntensity;

            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const worldX = (mouseX - panX) / scale;
            const worldY = (mouseY - panY) / scale;

            scale += factor;
            scale = Math.min(Math.max(0.1, scale), 5);

            panX = mouseX - worldX * scale;
            panY = mouseY - worldY * scale;

            updateTransform();
        }, { passive: false });
    }

    function zoomCenter(delta) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const worldX = (centerX - panX) / scale;
        const worldY = (centerY - panY) / scale;

        scale += delta;
        scale = Math.min(Math.max(0.1, scale), 5);

        panX = centerX - worldX * scale;
        panY = centerY - worldY * scale;
        updateTransform();
    }

    function updateTransform() {
        contentLayer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        const gridSize = 20 * scale; 
        viewport.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        viewport.style.backgroundPosition = `${panX}px ${panY}px`;

        viewport.classList.remove("zoom-low", "zoom-very-low");
        if (scale < 0.6) viewport.classList.add("zoom-low");
        if (scale < 0.3) viewport.classList.add("zoom-very-low");
    }

    // --- Element Creation ---
    function createElement(type, savedData = null) {
        const element = document.createElement("div");
        element.id = savedData ? savedData.id : `element-${elementCounter++}`;
        element.dataset.type = type;
        element.classList.add("element");
        
        if (savedData) {
            if (savedData.isWeak) element.classList.add("weak");
            if (savedData.isPK) element.classList.add("primary-key");
        }

        const text = document.createElement("p");
        text.classList.add("element-text");
        text.contentEditable = true;
        text.innerText = savedData ? savedData.text : (type.charAt(0).toUpperCase() + type.slice(1));
        text.setAttribute("spellcheck", "false");
        
        switch (type) {
            case "entity":
                element.style.backgroundColor = colors.entity;
                element.style.width = "200px";
                element.style.height = "60px";
                element.style.borderRadius = "0px";
                break;
            case "relationship":
                element.style.backgroundColor = colors.relationship;
                element.style.width = "100px";
                element.style.height = "100px";
                element.style.transform = "rotate(45deg)";
                text.style.transform = "rotate(-45deg)";
                break;
            case "attribute":
                element.style.backgroundColor = colors.attribute;
                element.style.width = "200px";
                element.style.height = "60px";
                element.style.borderRadius = "50%";
                break;
            case "label":
                element.style.backgroundColor = colors.label;
                element.style.boxShadow = "none";
                text.style.fontSize = "1.5em";
                break;
        }

        element.appendChild(text);
        contentLayer.appendChild(element);

        if (savedData) {
            element.style.left = savedData.left;
            element.style.top = savedData.top;
        } else {
            const viewportCenterX = window.innerWidth / 2;
            const viewportCenterY = window.innerHeight / 2;
            const dropX = (viewportCenterX - panX) / scale;
            const dropY = (viewportCenterY - panY) / scale;
            const snapX = Math.round(dropX / 20) * 20 - (parseInt(element.style.width || 0)/2);
            const snapY = Math.round(dropY / 20) * 20 - (parseInt(element.style.height || 0)/2);
            element.style.left = `${snapX}px`;
            element.style.top = `${snapY}px`;
        }

        // --- Element Listeners ---
        element.addEventListener("click", (e) => {
            e.stopPropagation();
            if (deleteMode) {
                deleteElement(element);
                return;
            }
            if (lineMode) {
                handleLineClick(element);
            } else {
                toggleSelection(element, e.shiftKey);
            }
        });

        element.addEventListener("mousedown", (e) => {
            if (deleteMode || lineMode) return;
            if (e.button !== 0) return;
            e.stopPropagation();

            if (!selectedElements.has(element) && !e.shiftKey) {
                clearSelection();
                addToSelection(element);
            } else if (!selectedElements.has(element) && e.shiftKey) {
                addToSelection(element);
            }

            const startMouseX = e.clientX;
            const startMouseY = e.clientY;
            
            const initialPositions = new Map();
            selectedElements.forEach(el => {
                initialPositions.set(el.id, { 
                    left: parseFloat(el.style.left) || 0, 
                    top: parseFloat(el.style.top) || 0 
                });
            });

            function onMouseMove(ev) {
                const dx = (ev.clientX - startMouseX) / scale;
                const dy = (ev.clientY - startMouseY) / scale;

                selectedElements.forEach(el => {
                    const init = initialPositions.get(el.id);
                    const rawLeft = init.left + dx;
                    const rawTop = init.top + dy;
                    const snappedLeft = Math.round(rawLeft / 20) * 20;
                    const snappedTop = Math.round(rawTop / 20) * 20;
                    el.style.left = `${snappedLeft}px`;
                    el.style.top = `${snappedTop}px`;
                    updateLines(el);
                });
            }

            function onMouseUp() {
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
            }

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        });

        element.addEventListener("dblclick", (e) => {
            if (deleteMode || lineMode) return;
            e.stopPropagation();
            text.focus();
            document.execCommand('selectAll', false, null);
        });
    }

    // --- Helper Functions ---
    function deleteElement(el) {
        if (el.lines) el.lines.forEach(line => line.remove());
        el.remove();
        selectedElements.delete(el);
    }

    function handleLineClick(element) {
        if (lineStart === null) {
            lineStart = element;
            element.classList.add("line-start");
        } else {
            if (lineStart !== element) {
                if (!lineExists(lineStart, element)) {
                    createLine(lineStart, element, null); 
                }
            }
            lineStart.classList.remove("line-start");
            lineStart = null;
        }
    }

    function createLine(startEl, endEl, savedData) {
        const line = document.createElement("div");
        line.classList.add("line");
        line.dataset.startId = startEl.id;
        line.dataset.endId = endEl.id;

        // Restore line type if saved
        if (savedData && savedData.lineType) {
            line.classList.add(savedData.lineType);
        }

        // Click to cycle line types
        line.addEventListener("click", (e) => {
            if (deleteMode) {
                line.remove();
                return;
            }
            e.stopPropagation();
            
            if (line.classList.contains("double")) {
                line.classList.remove("double");
                line.classList.add("dashed");
            } else if (line.classList.contains("dashed")) {
                line.classList.remove("dashed");
            } else {
                line.classList.add("double");
            }
        });

        const startCard = createCardSpan(savedData ? savedData.cardStart : "");
        startCard.classList.add("start");
        const endCard = createCardSpan(savedData ? savedData.cardEnd : "");
        endCard.classList.add("end");

        line.appendChild(startCard);
        line.appendChild(endCard);
        contentLayer.appendChild(line);

        if (!startEl.lines) startEl.lines = [];
        if (!endEl.lines) endEl.lines = [];
        startEl.lines.push(line);
        endEl.lines.push(line);

        positionLine(line, startEl, endEl);
    }

    function createCardSpan(text) {
        const span = document.createElement("span");
        span.className = "cardinality";
        span.innerText = text;
        span.onclick = (e) => {
            if(deleteMode) return;
            e.stopPropagation();
            const opts = ["", "1", "N", "M", "(0,n)", "(1,1)"];
            const curr = opts.indexOf(span.innerText);
            span.innerText = opts[(curr + 1) % opts.length];
        };
        return span;
    }

    function positionLine(line, startEl, endEl) {
        const x1 = parseFloat(startEl.style.left) + startEl.offsetWidth / 2;
        const y1 = parseFloat(startEl.style.top) + startEl.offsetHeight / 2;
        const x2 = parseFloat(endEl.style.left) + endEl.offsetWidth / 2;
        const y2 = parseFloat(endEl.style.top) + endEl.offsetHeight / 2;

        const length = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

        line.style.width = `${length}px`;
        line.style.left = `${x1}px`;
        line.style.top = `${y1}px`;
        line.style.transform = `rotate(${angle}deg)`;

        const startCard = line.querySelector(".start");
        const endCard = line.querySelector(".end");
        
        startCard.style.left = "30px";
        endCard.style.right = "30px";
        startCard.style.transform = `rotate(${-angle}deg)`;
        endCard.style.transform = `rotate(${-angle}deg)`;
    }

    function updateLines(el) {
        if (!el.lines) return;
        el.lines.forEach(line => {
            const s = document.getElementById(line.dataset.startId);
            const e = document.getElementById(line.dataset.endId);
            if (s && e) positionLine(line, s, e);
        });
    }

    function lineExists(s, e) {
        if (!s.lines) return false;
        return s.lines.some(l => 
            (l.dataset.startId === s.id && l.dataset.endId === e.id) ||
            (l.dataset.startId === e.id && l.dataset.endId === s.id)
        );
    }

    function toggleSelection(el, multi) {
        if (!multi) clearSelection();
        if (selectedElements.has(el)) {
            el.classList.remove("selected");
            selectedElements.delete(el);
        } else {
            el.classList.add("selected");
            selectedElements.add(el);
        }
    }

    function addToSelection(el) {
        el.classList.add("selected");
        selectedElements.add(el);
    }

    function clearSelection() {
        selectedElements.forEach(el => el.classList.remove("selected"));
        selectedElements.clear();
    }

    function setupKeyboardShortcuts() {
        document.addEventListener("keydown", (e) => {
            if (e.key === "Delete" || e.key === "Backspace") {
                if (document.activeElement.isContentEditable) return;
                selectedElements.forEach(el => deleteElement(el));
                selectedElements.clear();
            }
            if (e.key.toLowerCase() === "w") {
                if (document.activeElement.isContentEditable) return;
                selectedElements.forEach(el => el.classList.toggle("weak"));
            }
            // Toggle Primary Key with 'P'
            if (e.key.toLowerCase() === "p") {
                if (document.activeElement.isContentEditable) return;
                selectedElements.forEach(el => el.classList.toggle("primary-key"));
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
                text: el.querySelector(".element-text").innerText,
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
        if (elements.length === 0) {
            alert("Nothing to save!");
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        elements.forEach(el => {
            const x = parseFloat(el.style.left);
            const y = parseFloat(el.style.top);
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        });

        const padding = 50;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const width = maxX - minX;
        const height = maxY - minY;

        const originalTransform = contentLayer.style.transform;
        contentLayer.style.transform = "none"; 

        html2canvas(contentLayer, {
            x: minX,
            y: minY,
            width: width,
            height: height,
            backgroundColor: "#1e1e1e", 
            scale: 2, 
            logging: false
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
                data.elements.forEach(d => createElement(d.type, d));
                setTimeout(() => {
                    data.lines.forEach(l => {
                        const s = document.getElementById(l.startId);
                        const end = document.getElementById(l.endId);
                        if (s && end) createLine(s, end, l);
                    });
                }, 0);
            } catch (err) { console.error(err); }
        };
        reader.readAsText(file);
    }

    function clearCanvas() {
        contentLayer.innerHTML = "";
        elementCounter = 0;
        selectedElements.clear();
        lineStart = null;
    }
});