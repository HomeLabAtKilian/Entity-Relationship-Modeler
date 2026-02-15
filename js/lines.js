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

    // Click to cycle line types
    line.addEventListener("click", (e) => {
        if (state.deleteMode) {
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
    span.contentEditable = true; 
    span.setAttribute("spellcheck", "false");
    
    // Prevent drag propagation when clicking text
    span.addEventListener("mousedown", (e) => e.stopPropagation());

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

    // 3. Position the Main Line (Visual)
    line.style.width = `${length}px`;
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.transform = `rotate(${angle * 180 / Math.PI}deg)`;

    // 4. Calculate Label Positions (The "Gap" Logic)
    const startCard = line.querySelector(".start");
    const endCard = line.querySelector(".end");
    
    // Calculate distance from center to edge of box at this specific angle
    const startOffset = getDistanceToEdge(startEl.offsetWidth, startEl.offsetHeight, angle);
    const endOffset = getDistanceToEdge(endEl.offsetWidth, endEl.offsetHeight, angle + Math.PI); // +PI because entering from opposite side

    const padding = 25; // Extra space outside the box

    // Position Start Label
    // We position relative to the line's start (0,0)
    startCard.style.left = `${startOffset + padding}px`;
    startCard.style.top = `-12px`; // Vertically center on line
    startCard.style.transform = `rotate(${-angle * 180 / Math.PI}deg)`; // Counter-rotate to keep text upright

    // Position End Label
    // We position relative to the line's start, so we go full length minus offset
    endCard.style.left = `${length - (endOffset + padding)}px`;
    endCard.style.top = `-12px`;
    endCard.style.transform = `rotate(${-angle * 180 / Math.PI}deg)`;
}

/**
 * Calculates the distance from the center of a rectangle to its edge
 * along a specific angle.
 */
function getDistanceToEdge(width, height, angle) {
    // Normalize angle
    const w = width / 2;
    const h = height / 2;
    
    // Avoid division by zero
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    // Calculate distance to vertical edges (left/right)
    // dist = w / |cos(theta)|
    const distX = Math.abs(w / (Math.abs(cos) > 0.001 ? cos : 0.001));
    
    // Calculate distance to horizontal edges (top/bottom)
    // dist = h / |sin(theta)|
    const distY = Math.abs(h / (Math.abs(sin) > 0.001 ? sin : 0.001));

    // The actual intersection is the closer of the two
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