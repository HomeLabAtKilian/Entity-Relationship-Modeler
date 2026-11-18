export function sanitizePaste(e) {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
}

export function getCenter(el) {
    return {
        x: (parseFloat(el.style.left) || 0) + el.offsetWidth / 2,
        y: (parseFloat(el.style.top) || 0) + el.offsetHeight / 2,
    };
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

// Only simple formatting survives; everything else (scripts, event handlers,
// images, links, ...) is removed. Used for the schema box, whose HTML is stored
// in project files that classmates share with each other.
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'INS', 'S', 'SMALL', 'BR', 'SPAN', 'DIV', 'P']);
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'LINK', 'META', 'NOSCRIPT']);
const ALLOWED_CLASSES = new Set(['pk', 'fk']);

export function sanitizeHTML(html) {
    const template = document.createElement('template'); // parsed content is inert
    template.innerHTML = String(html ?? '');
    cleanNode(template.content);
    return template.innerHTML;
}

function cleanNode(node) {
    for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) continue;
        if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }

        const tag = child.tagName.toUpperCase();
        if (DROPPED_TAGS.has(tag)) { child.remove(); continue; }
        cleanNode(child);
        if (!ALLOWED_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }

        const classes = [...child.classList].filter(c => ALLOWED_CLASSES.has(c));
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
        if (classes.length) child.className = classes.join(' ');
    }
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer = null;

export function toast(message, duration = 2500) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), duration);
}
