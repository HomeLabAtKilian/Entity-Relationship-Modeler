export function sanitizePaste(e) {
    e.preventDefault();
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        return; 
    }
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
}

export function getCenter(el) {
    const x = parseFloat(el.style.left) + el.offsetWidth / 2;
    const y = parseFloat(el.style.top) + el.offsetHeight / 2;
    return { x, y };
}