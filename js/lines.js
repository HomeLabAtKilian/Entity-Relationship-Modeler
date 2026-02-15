import { state } from './state.js';

export function handleLineClick(element) {
    // Prevent connecting to Labels
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

    // Cardinalities
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
    span.contentEditable = true; // Allow typing
    span.setAttribute("spellcheck", "false");
    
    // Cycle on click (if not typing)
    span.addEventListener("mousedown", (e) => {
        if (e.detail > 1) return; // Allow double click to select text
        // Simple click cycle logic could go here, but contentEditable makes it tricky.
        // Let's stick to typing or simple click to focus.
    });
    
    // Optional: Add a small helper to cycle if empty
    span.onclick = (e) => {
        if (state.deleteMode) return;
        e.stopPropagation();
        if (span.innerText === "") span.innerText = "1";
        else if (span.innerText === "1") span.innerText = "n";
        else if (span.innerText === "n") span.innerText = "m";
        else if (span.innerText === "m") span.innerText = "";
    };

    return span;
}

export function positionLine(line, startEl, endEl) {
    const x1 = parseFloat(startEl.style.left) + startEl.offsetWidth / 2;
    const y1 = parseFloat(startEl.style.top) + startEl.offsetHeight / 2;
    const x2 = parseFloat(endEl.style.left) + endEl.offsetWidth / 2;
    const y2 = parseFloat(endEl.style.top) + endEl.offsetHeight / 2;

    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1); // Radians

    line.style.width = `${length}px`;
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.transform = `rotate(${angle * 180 / Math.PI}deg)`;

    // --- Gap Logic for Cardinalities ---
    const startCard = line.querySelector(".start");
    const endCard = line.querySelector(".end");
    
    // Distance from center to place text (approx half width + gap)
    const gap = 40; 

    // Start Card Position (Relative to line start)
    startCard.style.left = `${gap}px`;
    startCard.style.top = `-25px`;
    startCard.style.transform = `rotate(${-angle * 180 / Math.PI}deg)`; // Keep upright

    // End Card Position (Relative to line start, at the end)
    endCard.style.left = `${length - gap}px`;
    endCard.style.top = `-25px`;
    endCard.style.transform = `rotate(${-angle * 180 / Math.PI}deg)`; // Keep upright
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