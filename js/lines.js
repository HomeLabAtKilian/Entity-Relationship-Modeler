import { state, NOTATIONS } from './state.js';
import { recordState } from './history.js';
import { toast } from './utils.js';

const LINE_HIT_HEIGHT = 14; // clickable band around the visible stroke (keep in sync with CSS)
const PARALLEL_GAP = 18;    // distance between two lines connecting the same pair
const CARD_PADDING = 24;    // distance of a cardinality label from the element edge

export function handleLineClick(element) {
    const type = element.dataset.type;
    if (type === 'label' || type === 'schema') return;

    if (!state.lineStart) {
        state.lineStart = element;
        element.classList.add('line-start');
        return;
    }

    const start = state.lineStart;
    start.classList.remove('line-start');
    state.lineStart = null;
    if (start === element) return;

    const existing = linesBetween(start, element).length;
    if (existing) {
        // A second line between an entity and a relationship models a
        // recursive relationship (e.g. Mitarbeiter "leitet" Mitarbeiter).
        const types = [start.dataset.type, type];
        if (existing === 1 && types.includes('entity') && types.includes('relationship')) {
            createLine(start, element, null);
            recordState();
            toast('Second line added (recursive relationship). Double-click a line to give it a role name.', 4500);
        } else {
            toast('These elements are already connected.');
        }
        return;
    }

    createLine(start, element, null);
    recordState();
}

export function createLine(startEl, endEl, savedData = null) {
    const line = document.createElement('div');
    line.className = 'line';
    line.dataset.startId = startEl.id;
    line.dataset.endId = endEl.id;
    line._start = startEl;
    line._end = endEl;
    if (savedData?.lineType === 'double') line.classList.add('double');

    const startCard = createCardSpan(savedData?.cardStart || '', line, 'start');
    const endCard = createCardSpan(savedData?.cardEnd || '', line, 'end');
    const role = document.createElement('span');
    role.className = 'role-label';
    line.append(startCard, endCard, role);
    setRole(line, savedData?.role || '');

    // Cardinalities only make sense next to the entity of an entity-relationship line
    const t1 = startEl.dataset.type;
    const t2 = endEl.dataset.type;
    const noCards = [t1, t2].some(t => t.startsWith('attribute') || t === 'label' || t === 'isa');
    if (noCards) {
        startCard.hidden = true;
        endCard.hidden = true;
    } else if (t1 === 'entity' && t2 === 'relationship') {
        endCard.hidden = true;
    } else if (t1 === 'relationship' && t2 === 'entity') {
        startCard.hidden = true;
    }

    line.addEventListener('click', e => {
        e.stopPropagation();
        if (state.deleteMode) {
            removeLine(line);
            recordState();
        }
    });
    line.addEventListener('dblclick', e => {
        e.stopPropagation();
        if (!state.deleteMode) editRole(line);
    });
    line.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        line.classList.toggle('double'); // total participation
        recordState();
    });

    document.getElementById('content-layer').appendChild(line);
    startEl.lines = startEl.lines || [];
    endEl.lines = endEl.lines || [];
    startEl.lines.push(line);
    endEl.lines.push(line);

    linesBetween(startEl, endEl).forEach(l => positionLine(l));
    return line;
}

export function removeLine(line) {
    const start = line._start;
    const end = line._end;
    for (const el of [start, end]) {
        if (el?.lines) el.lines = el.lines.filter(l => l !== line);
    }
    line.remove();
    if (start && end) linesBetween(start, end).forEach(l => positionLine(l));
}

function createCardSpan(text, line, which) {
    const span = document.createElement('span');
    span.className = `cardinality ${which}`;
    span.textContent = text;

    span.addEventListener('mousedown', e => e.stopPropagation());
    span.addEventListener('click', e => {
        if (state.deleteMode) return; // let the click reach the line, which deletes it
        e.stopPropagation();
        if (e.shiftKey) {
            const value = prompt('Cardinality (e.g. 1, N, M, C, MC, (0,n)):', span.textContent);
            if (value === null) return;
            span.textContent = value.trim();
        } else {
            const values = NOTATIONS[state.notation].values;
            const index = values.indexOf(span.textContent);
            span.textContent = index === -1 ? values[1] : values[(index + 1) % values.length];
        }
        positionLine(line);
        recordState();
    });
    // Right-click bubbles to the line and toggles the double line there.
    return span;
}

function editRole(line) {
    const value = prompt('Role name for this line (leave empty to remove it):', line.dataset.role || '');
    if (value === null) return;
    setRole(line, value.trim());
    positionLine(line);
    recordState();
}

function setRole(line, role) {
    if (role) line.dataset.role = role;
    else delete line.dataset.role;
    const label = line.querySelector('.role-label');
    label.textContent = role;
    label.hidden = !role;
    label._size = null; // re-measure on next positioning
}

function sizeOf(el, cache) {
    if (cache?.has(el)) return cache.get(el);
    const size = { w: el.offsetWidth, h: el.offsetHeight };
    cache?.set(el, size);
    return size;
}

/** `sizes` is an optional Map element -> {w, h} used while dragging. */
export function positionLine(line, sizes = null) {
    const s = line._start;
    const e = line._end;
    if (!s || !e) return;

    const ss = sizeOf(s, sizes);
    const es = sizeOf(e, sizes);
    let x1 = (parseFloat(s.style.left) || 0) + ss.w / 2;
    let y1 = (parseFloat(s.style.top) || 0) + ss.h / 2;
    let x2 = (parseFloat(e.style.left) || 0) + es.w / 2;
    let y2 = (parseFloat(e.style.top) || 0) + es.h / 2;

    // Spread parallel lines (recursive relationships) so they don't overlap.
    // Use a canonical direction so both lines agree on which side is which.
    const [a, b] = s.id < e.id ? [s, e] : [e, s];
    const siblings = linesBetween(a, b);
    let side = -1; // which side of the line the role label goes on (line's own y axis)
    if (siblings.length > 1) {
        const sign = a === s ? 1 : -1;
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const nx = (-(y2 - y1) / len) * sign;
        const ny = ((x2 - x1) / len) * sign;
        const offset = (siblings.indexOf(line) - (siblings.length - 1) / 2) * PARALLEL_GAP;
        x1 += nx * offset; y1 += ny * offset;
        x2 += nx * offset; y2 += ny * offset;
        if (offset !== 0) side = Math.sign(offset * sign); // outer side, away from the sibling
    }

    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const deg = (angle * 180) / Math.PI;

    line.style.width = `${length}px`;
    line.style.left = `${x1}px`;
    line.style.top = `${y1 - LINE_HIT_HEIGHT / 2}px`;
    line.style.transform = `rotate(${deg}deg)`;

    // Labels are centred on their anchor point and rotated back to horizontal
    const upright = `translate(-50%, -50%) rotate(${-deg}deg)`;
    const startCard = line.querySelector('.start');
    const endCard = line.querySelector('.end');
    const role = line.querySelector('.role-label');

    if (!startCard.hidden) {
        startCard.style.left = `${getDistanceToEdge(ss.w, ss.h, angle) + CARD_PADDING}px`;
        startCard.style.transform = upright;
    }
    if (!endCard.hidden) {
        endCard.style.left = `${length - getDistanceToEdge(es.w, es.h, angle + Math.PI) - CARD_PADDING}px`;
        endCard.style.transform = upright;
    }
    if (!role.hidden) {
        // The label stays horizontal, so its extent across the line depends on the angle
        if (!role._size?.w) role._size = { w: role.offsetWidth, h: role.offsetHeight }; // 0 while hidden by zoom LOD
        const size = role._size.w ? role._size : { w: 8 * role.textContent.length, h: 16 };
        const across = 6 + (size.w / 2) * Math.abs(Math.sin(angle)) + (size.h / 2) * Math.abs(Math.cos(angle));
        role.style.left = `${length / 2}px`;
        role.style.top = `${LINE_HIT_HEIGHT / 2 + side * across}px`;
        role.style.transform = upright;
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

export function updateLines(el, sizes = null) {
    (el.lines || []).forEach(line => positionLine(line, sizes));
}

export function linesBetween(a, b) {
    return (a.lines || []).filter(l => (l._start === a && l._end === b) || (l._start === b && l._end === a));
}

export function getOtherEnd(line, el) {
    return line._start === el ? line._end : line._start;
}
