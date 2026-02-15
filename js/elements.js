import { state } from './state.js';
import { handleLineClick, updateLines } from './lines.js';
import { sanitizePaste } from './utils.js';

export function createElement(type, savedData = null) {
    const contentLayer = document.getElementById("content-layer");
    const element = document.createElement("div");
    element.id = savedData ? savedData.id : `element-${state.elementCounter++}`;
    element.dataset.type = type;
    element.classList.add("element");
    
    if (savedData) {
        if (savedData.isWeak) element.classList.add("weak");
        if (savedData.isPK) element.classList.add("primary-key");
    }

    const text = document.createElement("p");
    text.classList.add("element-text");
    text.contentEditable = true;
    text.innerText = savedData ? savedData.text : (type === 'schema' ? '' : (type === 'isa' ? 'ISA' : type.charAt(0).toUpperCase() + type.slice(1)));
    text.setAttribute("spellcheck", "false");
    text.addEventListener("paste", sanitizePaste);

    // Styling
    switch (type) {
        case "entity":
            element.style.backgroundColor = state.colors.entity;
            element.style.width = "200px"; element.style.height = "60px";
            break;
        case "relationship":
            element.style.backgroundColor = state.colors.relationship;
            element.style.width = "100px"; element.style.height = "100px";
            element.style.transform = "rotate(45deg)";
            text.style.transform = "rotate(-45deg)";
            break;
        case "attribute":
        case "attribute-multi":
        case "attribute-derived":
            element.style.backgroundColor = state.colors.attribute;
            element.style.width = "200px"; element.style.height = "60px";
            element.style.borderRadius = "50%";
            break;
        case "isa":
            break;
        case "label":
            element.style.backgroundColor = state.colors.label;
            element.style.boxShadow = "none";
            text.style.fontSize = "1.5em";
            break;
        case "schema":
            element.classList.add("schema-box");
            text.innerHTML = savedData ? savedData.text : "<b>Relationsmodell:</b><br>";
            break;
    }

    element.appendChild(text);
    contentLayer.appendChild(element);

    // Positioning
    if (savedData) {
        element.style.left = savedData.left;
        element.style.top = savedData.top;
        if (savedData.width) element.style.width = savedData.width;
        if (savedData.height) element.style.height = savedData.height;
    } else {
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        const dropX = (viewportCenterX - state.panX) / state.scale;
        const dropY = (viewportCenterY - state.panY) / state.scale;
        const snapX = Math.round(dropX / 20) * 20 - (parseInt(element.style.width || 200)/2);
        const snapY = Math.round(dropY / 20) * 20 - (parseInt(element.style.height || 60)/2);
        element.style.left = `${snapX}px`;
        element.style.top = `${snapY}px`;
    }

    // --- CLICK LISTENER ---
    element.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.deleteMode) {
            deleteElement(element);
            return;
        }
        if (state.lineMode) {
            handleLineClick(element);
            return;
        }

        if (e.ctrlKey) {
            if (element.dataset.justSelected === "true") {
                delete element.dataset.justSelected;
            } else {
                toggleSelection(element, true);
            }
        } else {
            if (element.dataset.justDragged === "true") {
                delete element.dataset.justDragged;
            } else {
                toggleSelection(element, false);
            }
        }
    });

    // --- MOUSEDOWN LISTENER ---
    element.addEventListener("mousedown", (e) => {
        if (state.deleteMode || state.lineMode) return;
        if (e.button !== 0) return;
        e.stopPropagation();

        if (e.ctrlKey) {
            if (!state.selectedElements.has(element)) {
                addToSelection(element);
                element.dataset.justSelected = "true";
            }
        } else {
            if (!state.selectedElements.has(element)) {
                clearSelection();
                addToSelection(element);
            }
        }
        initDrag(e);
    });

    // --- FIX 2: SELECT ALL TEXT ON DOUBLE CLICK ---
    element.addEventListener("dblclick", (e) => {
        if (state.deleteMode || state.lineMode) return;
        e.stopPropagation();
        text.focus();
        // Select all text inside the element
        document.execCommand('selectAll', false, null);
    });
}

function initDrag(e) {
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    
    const initialPositions = new Map();
    state.selectedElements.forEach(el => {
        initialPositions.set(el.id, { left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 });
    });

    function onMouseMove(ev) {
        const dx = (ev.clientX - startMouseX) / state.scale;
        const dy = (ev.clientY - startMouseY) / state.scale;

        state.selectedElements.forEach(el => {
            const init = initialPositions.get(el.id);
            const rawLeft = init.left + dx;
            const rawTop = init.top + dy;
            const snappedLeft = Math.round(rawLeft / 20) * 20;
            const snappedTop = Math.round(rawTop / 20) * 20;
            el.style.left = `${snappedLeft}px`;
            el.style.top = `${snappedTop}px`;
            updateLines(el);
            el.dataset.justDragged = "true";
        });
    }

    function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
}

export function deleteElement(el) {
    if (el.lines) el.lines.forEach(line => line.remove());
    el.remove();
    state.selectedElements.delete(el);
}

export function toggleSelection(el, multi) {
    if (!multi) clearSelection();
    if (state.selectedElements.has(el)) {
        if (multi) { 
            el.classList.remove("selected"); 
            state.selectedElements.delete(el); 
        }
    } else {
        el.classList.add("selected"); 
        state.selectedElements.add(el);
    }
}

export function addToSelection(el) { 
    el.classList.add("selected"); 
    state.selectedElements.add(el); 
}

export function clearSelection() { 
    state.selectedElements.forEach(el => el.classList.remove("selected")); 
    state.selectedElements.clear(); 
}