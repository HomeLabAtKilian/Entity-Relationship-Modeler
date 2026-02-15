import { createElement } from './elements.js';

export function generateSchema() {
    const schemaMap = new Map();
    const intermediateTables = [];

    const entities = document.querySelectorAll('.element[data-type="entity"]');
    const relationships = document.querySelectorAll('.element[data-type="relationship"]');

    // --- PASS 1: Build Base Entities ---
    entities.forEach(entity => {
        const data = getEntityData(entity);
        schemaMap.set(entity.id, {
            name: data.name,
            pks: data.pks,
            attributes: data.attributes,
            fks: [] 
        });
    });

    // --- PASS 2: Process Relationships ---
    relationships.forEach(rel => {
        const relName = rel.innerText.trim();
        const connections = getConnectedEntities(rel);
        const relAttributes = getConnectedAttributes(rel);

        if (connections.length === 2) {
            const [c1, c2] = connections;
            const ent1 = schemaMap.get(c1.entity.id);
            const ent2 = schemaMap.get(c2.entity.id);

            if (!ent1 || !ent2) return;

            const card1 = c1.cardinality.toUpperCase();
            const card2 = c2.cardinality.toUpperCase();

            // N:M -> New Table
            if ((card1 === 'N' || card1 === 'M') && (card2 === 'N' || card2 === 'M')) {
                const newTable = {
                    name: relName,
                    pks: [],
                    attributes: relAttributes,
                    fks: []
                };

                // Add PKs from both sides
                ent1.pks.forEach(pk => {
                    newTable.pks.push(pk); 
                    newTable.fks.push({ name: pk, source: ent1.name });
                });
                ent2.pks.forEach(pk => {
                    newTable.pks.push(pk); 
                    newTable.fks.push({ name: pk, source: ent2.name });
                });

                intermediateTables.push(newTable);
            }
            // 1:N (Ent1 is N)
            else if ((card1 === 'N' || card1 === 'M') && (card2 === '1' || card2 === '')) {
                ent2.pks.forEach(pk => ent1.fks.push({ name: pk, source: ent2.name }));
            }
            // 1:N (Ent2 is N)
            else if ((card1 === '1' || card1 === '') && (card2 === 'N' || card2 === 'M')) {
                ent1.pks.forEach(pk => ent2.fks.push({ name: pk, source: ent1.name }));
            }
            // 1:1
            else {
                ent2.pks.forEach(pk => ent1.fks.push({ name: pk, source: ent2.name }));
            }
        }
    });

    // --- PASS 3: Render HTML ---
    let html = "<b>Relationsmodell:</b><br><br>";

    schemaMap.forEach(table => {
        html += renderTableString(table);
    });

    if (intermediateTables.length > 0) {
        html += "<br><i>Zwischentabellen (N:M):</i><br>";
        intermediateTables.forEach(table => {
            html += renderTableString(table);
        });
    }

    createElement('schema', { 
        text: html,
        width: "450px",
        height: "auto"
    });
}

// --- Helpers ---

function renderTableString(table) {
    let str = `<b>${table.name}</b> ( `;
    const parts = [];

    // 1. Render Primary Keys (and check if they are also FKs)
    table.pks.forEach(pk => {
        // Check if this PK is also an FK (common in N:M tables)
        const isAlsoFK = table.fks.some(fk => fk.name === pk);
        
        if (isAlsoFK) {
            // Render as Underlined AND Italic
            parts.push(`<ins><i>${pk}</i></ins>`);
        } else {
            // Render as just Underlined
            parts.push(`<ins>${pk}</ins>`);
        }
    });

    // 2. Render Attributes
    table.attributes.forEach(attr => parts.push(attr));

    // 3. Render Foreign Keys (ONLY if they weren't already rendered as PKs)
    table.fks.forEach(fk => {
        const isAlsoPK = table.pks.includes(fk.name);
        if (!isAlsoPK) {
            parts.push(`<i>${fk.name}</i>`);
        }
    });

    str += parts.join(", ");
    str += " )<br>";
    return str;
}

function getEntityData(entity) {
    const name = entity.innerText.trim();
    const pks = [];
    const attributes = [];

    if (entity.lines) {
        entity.lines.forEach(line => {
            const otherEl = getOtherEnd(line, entity);
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
    return { name, pks, attributes };
}

function getConnectedAttributes(element) {
    const attributes = [];
    if (element.lines) {
        element.lines.forEach(line => {
            const otherEl = getOtherEnd(line, element);
            if (otherEl && otherEl.dataset.type === 'attribute') {
                attributes.push(otherEl.innerText.trim());
            }
        });
    }
    return attributes;
}

function getConnectedEntities(relationship) {
    const connections = [];
    if (relationship.lines) {
        relationship.lines.forEach(line => {
            const otherEl = getOtherEnd(line, relationship);
            if (otherEl && otherEl.dataset.type === 'entity') {
                let card = "";
                if (line.dataset.startId === relationship.id) {
                    card = line.querySelector('.end').innerText;
                } else {
                    card = line.querySelector('.start').innerText;
                }
                
                connections.push({
                    entity: otherEl,
                    cardinality: card
                });
            }
        });
    }
    return connections;
}

function getOtherEnd(line, currentEl) {
    const otherId = (line.dataset.startId === currentEl.id) ? line.dataset.endId : line.dataset.startId;
    return document.getElementById(otherId);
}