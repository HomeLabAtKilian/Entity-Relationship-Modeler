import { createElement } from './elements.js';

export function generateSchema() {
    // 1. Data Structures to hold our Schema
    // Map: EntityID -> { name, pks: [], attributes: [], fks: [] }
    const schemaMap = new Map();
    const intermediateTables = []; // For N:M relationships

    const entities = document.querySelectorAll('.element[data-type="entity"]');
    const relationships = document.querySelectorAll('.element[data-type="relationship"]');

    // --- PASS 1: Build Base Entities ---
    entities.forEach(entity => {
        const data = getEntityData(entity);
        schemaMap.set(entity.id, {
            name: data.name,
            pks: data.pks,
            attributes: data.attributes,
            fks: [] // Foreign Keys will be added in Pass 2
        });
    });

    // --- PASS 2: Process Relationships (The Logic) ---
    relationships.forEach(rel => {
        const relName = rel.innerText.trim();
        const connections = getConnectedEntities(rel);
        const relAttributes = getConnectedAttributes(rel); // Attributes on the diamond itself

        // We need exactly 2 entities for a standard binary relationship
        if (connections.length === 2) {
            const [c1, c2] = connections;
            const ent1 = schemaMap.get(c1.entity.id);
            const ent2 = schemaMap.get(c2.entity.id);

            if (!ent1 || !ent2) return;

            const card1 = c1.cardinality.toUpperCase(); // Cardinality at Entity 1
            const card2 = c2.cardinality.toUpperCase(); // Cardinality at Entity 2

            // Logic: Determine 1:1, 1:N, or N:M
            // Note: In Chen notation, if A has '1' and B has 'N', it means 1 A relates to N B's.
            
            // CASE N:M (Many-to-Many) -> New Table
            if ((card1 === 'N' || card1 === 'M') && (card2 === 'N' || card2 === 'M')) {
                const newTable = {
                    name: relName, // Table name = Relationship name
                    pks: [], // Composite PK
                    attributes: relAttributes, // Attributes on the relationship
                    fks: []
                };

                // Add PKs from both sides as FKs and Composite PKs
                ent1.pks.forEach(pk => {
                    newTable.pks.push(pk); // Part of composite PK
                    newTable.fks.push({ name: pk, source: ent1.name });
                });
                ent2.pks.forEach(pk => {
                    newTable.pks.push(pk); // Part of composite PK
                    newTable.fks.push({ name: pk, source: ent2.name });
                });

                intermediateTables.push(newTable);
            }
            
            // CASE 1:N (One-to-Many)
            // If Ent1 is 'N' and Ent2 is '1' -> Ent1 gets FK from Ent2
            else if ((card1 === 'N' || card1 === 'M') && (card2 === '1' || card2 === '')) {
                // Ent1 is the "Many" side. It gets Ent2's PKs.
                ent2.pks.forEach(pk => {
                    ent1.fks.push({ name: pk, source: ent2.name });
                });
            }
            // Reverse 1:N
            else if ((card1 === '1' || card1 === '') && (card2 === 'N' || card2 === 'M')) {
                // Ent2 is the "Many" side. It gets Ent1's PKs.
                ent1.pks.forEach(pk => {
                    ent2.fks.push({ name: pk, source: ent1.name });
                });
            }

            // CASE 1:1 (One-to-One)
            // Pick one side to hold the FK (usually the one with total participation, but we pick Ent1 arbitrarily here)
            else {
                ent2.pks.forEach(pk => {
                    ent1.fks.push({ name: pk, source: ent2.name });
                });
            }
        }
    });

    // --- PASS 3: Render HTML ---
    let html = "<b>Relationsmodell:</b><br><br>";

    // 1. Render Entities
    schemaMap.forEach(table => {
        html += renderTableString(table);
    });

    // 2. Render Intermediate Tables
    if (intermediateTables.length > 0) {
        html += "<br><i>Zwischentabellen (N:M):</i><br>";
        intermediateTables.forEach(table => {
            html += renderTableString(table);
        });
    }

    // Spawn Box
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

    // Primary Keys
    table.pks.forEach(pk => parts.push(`<ins>${pk}</ins>`));

    // Normal Attributes
    table.attributes.forEach(attr => parts.push(attr));

    // Foreign Keys
    table.fks.forEach(fk => parts.push(`<i>${fk.name}</i>`)); // Italic for FK

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
                // Determine Cardinality
                // If line.startId is the relationship, we look at cardEnd for the Entity's cardinality
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