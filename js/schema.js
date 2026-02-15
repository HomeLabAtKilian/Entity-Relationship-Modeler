import { createElement } from './elements.js';

export function generateSchema() {
    const entities = document.querySelectorAll('.element[data-type="entity"]');
    let schemaHTML = "<b>Relationsmodell:</b><br><br>";

    entities.forEach(entity => {
        const name = entity.innerText.trim();
        const attributes = [];
        const pks = [];

        // Find connected attributes via lines
        if (entity.lines) {
            entity.lines.forEach(line => {
                const otherId = (line.dataset.startId === entity.id) ? line.dataset.endId : line.dataset.startId;
                const otherEl = document.getElementById(otherId);
                
                if (otherEl && otherEl.dataset.type === 'attribute') {
                    const attrName = otherEl.innerText.trim();
                    if (otherEl.classList.contains('primary-key')) {
                        pks.push(attrName);
                    } else {
                        attributes.push(attrName);
                    }
                }
            });
        }

        // Format: Name ( <ins>PK</ins>, Attr1, Attr2 )
        let entry = `<b>${name}</b> ( `;
        
        // Add PKs
        pks.forEach((pk, index) => {
            entry += `<ins>${pk}</ins>`;
            if (index < pks.length - 1) entry += ", ";
        });

        if (pks.length > 0 && attributes.length > 0) entry += ", ";

        // Add Attributes
        attributes.forEach((attr, index) => {
            entry += attr;
            if (index < attributes.length - 1) entry += ", ";
        });

        entry += " )<br>";
        schemaHTML += entry;
    });

    // Spawn the Schema Box
    createElement('schema', { text: schemaHTML });
}