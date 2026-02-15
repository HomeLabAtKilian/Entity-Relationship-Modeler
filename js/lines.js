import { state } from './state.js';

export function handleLineClick(element) {
    // Prevent connecting to Labels or Schema boxes
    if (element.dataset.type === 'label' || element.dataset.type === 'schema') return;

    if (state.lineStart === null) {
        state.lineStart = element;
        element.classList.add("line-start");
    } else {
        if (state.lineStart !== element) {
            if (!lineExists(state.lineStart, element)) {
                createLine(state.lineStart, element, null); 
            }
        }
        state.lineStart.classList.remove("line-start");
        state.lineStart = null;
    }
}

export function createLine(startEl, endEl, savedData) {
    const contentLayer = document.getElementById("content-layer");
    const line = document.createElement("div");
    line.classList.add("line");
    line.dataset.startId = startEl.id;
    line.dataset.endId = endEl.id;

    // Restore line type if saved
    if (savedData && savedData.lineType) {
        line.classList.add(savedData.lineType);
    }

    // --- REMOVED: Line Click Listener ---
    // We no longer toggle styles by clicking the thin line.
    // It is now handled by Right-Clicking the cardinality box.

    // Pass the 'line' element to the card creator so it can modify the line
    const startCard = createCardSpan(savedData ? savedData.cardStart : "", line);
    startCard.classList.add("start");
    
    const endCard = createCardSpan(savedData ? savedData.cardEnd : "", line);
    endCard.classList.add("end");

    // --- VISIBILITY LOGIC ---
    const type1 = startEl.dataset.type;
    const type2 = endEl.dataset.type;
    
    // 1. Attributes/Labels: No cardinalities
    if (type1.startsWith('attribute') || type2.startsWith('attribute') || type1 === 'label' || type2 === 'label') {
        startCard.style.display = 'none';
        endCard.style.display = 'none';
    } 
    // 2. Entity <-> Relationship: Only show cardinality near the Entity
    else if (type1 === 'entity' && type2 === 'relationship') {
        endCard.style.display = 'none'; 
    } 
    else if (type1 === 'relationship' && type2 === 'entity') {
        startCard.style.display = 'none'; 
    }
    // 3. Entity <-> Entity: Keep both visible

    line.appendChild(startCard);
    line.appendChild(endCard);
    contentLayer.appendChild(line);

    if (!startEl.lines) startEl.lines = [];
    if (!endEl.lines) endEl.lines = [];
    startEl.lines.push(line);
    endEl.lines.push(line);

    positionLine(line, startEl, endEl);
}

function createCardSpan(text, lineElement) {
    const span = document.createElement("span");
    span.className = "cardinality";
    span.innerText = text;
    span.contentEditable = false; 
    span.style.cursor = "pointer"; 
    
    // Prevent drag propagation
    span.addEventListener("mousedown", (e) => e.stopPropagation());

    // LEFT CLICK: Cycle Values
    span.addEventListener("click", (e) => {
        if (state.deleteMode) return;
        e.stopPropagation();
        
        const current = span.innerText;
        if (current === "") span.innerText = "1";
        else if (current === "1") span.innerText = "N";
        else if (current === "N") span.innerText = "M";
        else span.innerText = ""; 
    });

    // RIGHT CLICK: Toggle Line Style (Solid <-> Double)
    span.addEventListener("contextmenu", (e) => {
        e.preventDefault(); // Stop browser menu
        e.stopPropagation();

        if (lineElement.classList.contains("double")) {
            lineElement.classList.remove("double");
            // Optional: If you want dashed support, toggle to dashed here
            // lineElement.classList.add("dashed");
        } else {
            lineElement.classList.add("double");
            lineElement.classList.remove("dashed");
        }
    });

    return span;
}

export function positionLine(line, startEl, endEl) {
    const x1 = parseFloat(startEl.style.left) + startEl.offsetWidth / 2;
    const y1 = parseFloat(startEl.style.top) + startEl.offsetHeight / 2;
    const x2 = parseFloat(endEl.style.left) + endEl.offsetWidth / 2;
    const y2 = parseFloat(endEl.style.top) + endEl.offsetHeight / 2;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx); 

    line.style.width = `${length}px`;
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.transform = `rotate(${angle * 180 / Math.PI}deg)`;

    const startCard = line.querySelector(".start");
    const endCard = line.querySelector(".end");
    
    // Calculate offsets
    const startOffset = getDistanceToEdge(startEl.offsetWidth, startEl.offsetHeight, angle);
    const endOffset = getDistanceToEdge(endEl.offsetWidth, endEl.offsetHeight, angle + Math.PI); 
    const padding = 25; 

    // Position Start Label
    if (startCard.style.display !== 'none') {
        startCard.style.left = `${startOffset + padding}px`;
        startCard.style.top = `-12px`; 
        startCard.style.transform = `rotate(${-angle * 180 / Math.PI}deg)`; 
    }

    // Position End Label
    if (endCard.style.display !== 'none') {
        endCard.style.left = `${length - (endOffset + padding)}px`;
        endCard.style.top = `-12px`;
        endCard.style.transform = `rotate(${-angle * 180 / Math.PI}deg)`;
    }
}

function getDistanceToEdge(width, height, angle) {
    const w = width / 2;
    const h = height / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const distX = Math.abs(w / (Math.abs(cos) > 0.001 ? cos : 0.001));
    const distY = Math.abs(h / (Math.abs(sin) > 0.001 ? sin : 0.001));
    return Math.min(distX, distY);
}

export function updateLines(el) {
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