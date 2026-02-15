import { state } from './state.js';
import { createElement } from './elements.js';
import { createLine } from './lines.js';

export function getDiagramJSON() {
    const data = { elements: [], lines: [] };
    document.querySelectorAll(".element").forEach(el => {
        data.elements.push({
            id: el.id,
            type: el.dataset.type,
            left: el.style.left,
            top: el.style.top,
            width: el.style.width,
            height: el.style.height,
            text: el.dataset.type === 'schema' ? el.querySelector(".element-text").innerHTML : el.querySelector(".element-text").innerText,
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

export function loadDiagram(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        clearCanvas();
        
        let maxId = 0;
        data.elements.forEach(d => {
            createElement(d.type, d);
            const parts = d.id.split('-');
            const idNum = parseInt(parts[parts.length - 1]);
            if (!isNaN(idNum) && idNum > maxId) maxId = idNum;
        });
        state.elementCounter = maxId + 1;

        // Use requestAnimationFrame to ensure DOM is ready for lines
        requestAnimationFrame(() => {
            data.lines.forEach(l => {
                const s = document.getElementById(l.startId);
                const end = document.getElementById(l.endId);
                if (s && end) createLine(s, end, l);
            });
        });
    } catch (err) { 
        console.error(err); 
    }
}

export function clearCanvas() {
    document.getElementById("content-layer").innerHTML = "";
    state.elementCounter = 0;
    state.selectedElements.clear();
    state.lineStart = null;
}

export function saveProject() {
    const blob = new Blob([getDiagramJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "er_diagram.json";
    a.click();
}

export function exportImage() {
    const contentLayer = document.getElementById("content-layer");
    const elements = document.querySelectorAll(".element");
    if (elements.length === 0) { alert("Nothing to save!"); return; }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
        const x = parseFloat(el.style.left); const y = parseFloat(el.style.top);
        const w = el.offsetWidth; const h = el.offsetHeight;
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w; if (y + h > maxY) maxY = y + h;
    });
    
    const padding = 50;
    const width = (maxX + padding) - (minX - padding);
    const height = (maxY + padding) - (minY - padding);
    
    const originalTransform = contentLayer.style.transform;
    contentLayer.style.transform = "none";
    
    html2canvas(contentLayer, {
        x: minX - padding, y: minY - padding, width: width, height: height,
        backgroundColor: "#1e1e1e", scale: 2, logging: false
    }).then(canvas => {
        contentLayer.style.transform = originalTransform;
        const link = document.createElement('a');
        link.download = 'er_diagram.png';
        link.href = canvas.toDataURL();
        link.click();
    });
}