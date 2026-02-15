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
    span.contentEditable = false; // Disable typing
    span.style.cursor = "pointer"; // Make it look clickable
    
    // Prevent drag propagation
    span.addEventListener("mousedown", (e) => e.stopPropagation());

    // CLICK TO CYCLE LOGIC
    span.addEventListener("click", (e) => {
        if (state.deleteMode) return;
        e.stopPropagation();
        
        const current = span.innerText;
        if (current === "") span.innerText = "1";
        else if (current === "1") span.innerText = "N";
        else if (current === "N") span.innerText = "M";
        else span.innerText = ""; // Reset to empty
    });

    return span;
}

export function positionLine(line, startEl, endEl) {
    // 1. Get Centers
    const x1 = parseFloat(startEl.style.left) + startEl.offsetWidth / 2;
    const y1 = parseFloat(startEl.style.top) + startEl.offsetHeight / 2;
    const x2 = parseFloat(endEl.style.left) + endEl.offsetWidth / 2;
    const y2 = parseFloat(endEl.style.top) + endEl.offsetHeight / 2;

    // 2. Calculate Line Geometry
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx); // Radians

    // 3. Position the Main Line
    line.style.width = `${length}px`;
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.transform = `rotate(${angle * 180 / Math.PI}deg)`;

    // 4. Calculate Label Positions (The "Gap" Logic)
    const startCard = line.querySelector(".start");
    const endCard = line.querySelector(".end");
    
    const startOffset = getDistanceToEdge(startEl.offsetWidth, startEl.offsetHeight, angle);
    const endOffset = getDistanceToEdge(endEl.offsetWidth, endEl.offsetHeight, angle + Math.PI); 

    const padding = 25; 

    startCard.style.left = `${startOffset + padding}px`;
    startCard.style.top = `-12px`; 
    startCard.style.transform = `rotate(${-angle * 180 / Math.PI}deg)`; 

    endCard.style.left = `${length - (endOffset + padding)}px`;
    endCard.style.top = `-12px`;
    endCard.style.transform = `rotate(${-angle * 180 / Math.PI}deg)`;
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