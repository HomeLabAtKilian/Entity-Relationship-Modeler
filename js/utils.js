export function sanitizePaste(e) {
    e.preventDefault();
    // 1. Check for files (Images)
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        // Image handling logic could go here if needed
        return; 
    }
    // 2. Handle Text (Strip HTML)
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
}

export function getCenter(el) {
    const x = parseFloat(el.style.left) + el.offsetWidth / 2;
    const y = parseFloat(el.style.top) + el.offsetHeight / 2;
    return { x, y };
}