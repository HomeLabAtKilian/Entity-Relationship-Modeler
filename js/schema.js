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
            fks: [],
            isWeak: entity.classList.contains('weak')
        });
        
        // Handle Multivalued Attributes (Create separate tables)
        data.multiAttributes.forEach(multi => {
            intermediateTables.push({
                name: `${data.name}_${multi}`,
                pks: [...data.pks, multi], // Composite PK
                attributes: [],
                fks: data.pks.map(pk => ({ name: pk, source: data.name }))
            });
        });
    });

    // --- PASS 1.5: Handle Weak Entities (Find Owner) ---
    schemaMap.forEach((table, id) => {
        if (table.isWeak) {
            // Find identifying relationship
            const entityEl = document.getElementById(id);
            if (entityEl && entityEl.lines) {
                entityEl.lines.forEach(line => {
                    const otherEl = getOtherEnd(line, entityEl);
                    // If connected to a relationship that is also weak (identifying)
                    if (otherEl.dataset.type === 'relationship' && otherEl.classList.contains('weak')) {
                        // Find the strong entity on the other side of this relationship
                        const relConnections = getConnectedEntities(otherEl);
                        relConnections.forEach(conn => {
                            if (conn.entity.id !== id) {
                                const ownerTable = schemaMap.get(conn.entity.id);
                                if (ownerTable) {
                                    // Pull Owner PKs into Weak Entity as PK + FK
                                    ownerTable.pks.forEach(pk => {
                                        table.pks.unshift(pk); // Add to start of PK list
                                        table.fks.push({ name: pk, source: ownerTable.name });
                                    });
                                }
                            }
                        });
                    }
                });
            }
        }
    });

    // --- PASS 2: Process Relationships ---
    relationships.forEach(rel => {
        const relName = rel.innerText.trim();
        const connections = getConnectedEntities(rel);
        const relAttributes = getConnectedAttributes(rel);

        // TERNARY (or N-ary) Relationship -> Always a new table
        if (connections.length > 2) {
            const newTable = {
                name: relName,
                pks: [],
                attributes: relAttributes,
                fks: []
            };
            connections.forEach(conn => {
                const ent = schemaMap.get(conn.entity.id);
                if (ent) {
                    ent.pks.forEach(pk => {
                        newTable.pks.push(pk);
                        newTable.fks.push({ name: pk, source: ent.name });
                    });
                }
            });
            intermediateTables.push(newTable);
        }
        // BINARY Relationship
        else if (connections.length === 2) {
            const [c1, c2] = connections;
            const ent1 = schemaMap.get(c1.entity.id);
            const ent2 = schemaMap.get(c2.entity.id);

            if (!ent1 || !ent2) return;

            const card1 = c1.cardinality.toUpperCase();
            const card2 = c2.cardinality.toUpperCase();
            
            // Recursive Relationship Check
            const isRecursive = (c1.entity.id === c2.entity.id);

            // N:M -> New Table
            if ((card1 === 'N' || card1 === 'M') && (card2 === 'N' || card2 === 'M')) {
                const newTable = {
                    name: relName,
                    pks: [],
                    attributes: relAttributes,
                    fks: []
                };
                
                // Ent1 Keys
                ent1.pks.forEach(pk => {
                    newTable.pks.push(pk);
                    newTable.fks.push({ name: pk, source: ent1.name });
                });
                
                // Ent2 Keys (Handle Recursive Renaming)
                ent2.pks.forEach(pk => {
                    let keyName = pk;
                    if (isRecursive) keyName = `other_${pk}`; // Simple renaming for recursive
                    newTable.pks.push(keyName);
                    newTable.fks.push({ name: keyName, source: ent2.name });
                });

                intermediateTables.push(newTable);
            }
            // 1:N (Ent1 is N)
            else if ((card1 === 'N' || card1 === 'M') && (card2 === '1' || card2 === '')) {
                ent2.pks.forEach(pk => {
                    let keyName = pk;
                    if (isRecursive) keyName = `supervisor_${pk}`;
                    ent1.fks.push({ name: keyName, source: ent2.name });
                });
            }
            // 1:N (Ent2 is N)
            else if ((card1 === '1' || card1 === '') && (card2 === 'N' || card2 === 'M')) {
                ent1.pks.forEach(pk => {
                    let keyName = pk;
                    if (isRecursive) keyName = `supervisor_${pk}`;
                    ent2.fks.push({ name: keyName, source: ent1.name });
                });
            }
            // 1:1
            else {
                ent2.pks.forEach(pk => ent1.fks.push({ name: pk, source: ent2.name }));
            }
        }
    });

    // --- PASS 3: Render HTML ---
    let html = "<b>Relationsmodell:</b><br><br>";
    schemaMap.forEach(table => html += renderTableString(table));
    if (intermediateTables.length > 0) {
        html += "<br><i>Zwischentabellen / Multivalued:</i><br>";
        intermediateTables.forEach(table => html += renderTableString(table));
    }

    createElement('schema', { text: html, width: "500px", height: "auto" });
    
    // Return data for SQL generator
    return { schemaMap, intermediateTables };
}

// --- Helpers ---

function renderTableString(table) {
    let str = `<b>${table.name}</b> ( `;
    const parts = [];
    table.pks.forEach(pk => {
        const isAlsoFK = table.fks.some(fk => fk.name === pk);
        parts.push(isAlsoFK ? `<ins><i>${pk}</i></ins>` : `<ins>${pk}</ins>`);
    });
    table.attributes.forEach(attr => parts.push(attr));
    table.fks.forEach(fk => {
        if (!table.pks.includes(fk.name)) parts.push(`<i>${fk.name}</i>`);
    });
    str += parts.join(", ");
    str += " )<br>";
    return str;
}

function getEntityData(entity) {
    const name = entity.innerText.trim();
    const pks = [];
    const attributes = [];
    const multiAttributes = [];

    // Recursive function to handle Composite Attributes
    function traverseAttributes(el) {
        if (el.lines) {
            el.lines.forEach(line => {
                const otherEl = getOtherEnd(line, el);
                // Check if it's an attribute and NOT the one we came from (to avoid loops)
                if (otherEl && otherEl.dataset.type.startsWith('attribute')) {
                    // Check if this attribute has its OWN attributes (Composite Parent)
                    // If it does, we ignore the parent name and recurse
                    const subAttributes = getConnectedAttributes(otherEl);
                    
                    if (subAttributes.length > 0) {
                        // It's a composite parent, recurse!
                        traverseAttributes(otherEl);
                    } else {
                        // It's a leaf attribute
                        const attrName = otherEl.innerText.trim();
                        
                        if (otherEl.dataset.type === 'attribute-multi') {
                            multiAttributes.push(attrName);
                        } else if (otherEl.dataset.type === 'attribute-derived') {
                            // Ignore derived
                        } else {
                            if (otherEl.classList.contains('primary-key')) pks.push(attrName);
                            else attributes.push(attrName);
                        }
                    }
                }
            });
        }
    }

    // Initial call from Entity
    if (entity.lines) {
        entity.lines.forEach(line => {
            const otherEl = getOtherEnd(line, entity);
            if (otherEl && otherEl.dataset.type.startsWith('attribute')) {
                 // Check if composite parent
                 const subs = getConnectedAttributes(otherEl);
                 if (subs.length > 0) {
                     // Recurse down composite
                     traverseAttributes(otherEl);
                 } else {
                     // Direct attribute
                     const attrName = otherEl.innerText.trim();
                     if (otherEl.dataset.type === 'attribute-multi') multiAttributes.push(attrName);
                     else if (otherEl.dataset.type === 'attribute-derived') {} // Ignore
                     else {
                         if (otherEl.classList.contains('primary-key')) pks.push(attrName);
                         else attributes.push(attrName);
                     }
                 }
            }
        });
    }

    return { name, pks, attributes, multiAttributes };
}

function getConnectedAttributes(element) {
    const attributes = [];
    if (element.lines) {
        element.lines.forEach(line => {
            const otherEl = getOtherEnd(line, element);
            // Only count if it's an attribute and "downstream" (not the entity we came from)
            if (otherEl && otherEl.dataset.type.startsWith('attribute')) {
                // Simple check: is it further away from the entity? 
                // For now, just return all connected attributes. 
                // In a perfect graph, attributes only connect to 1 thing.
                attributes.push(otherEl);
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
                if (line.dataset.startId === relationship.id) card = line.querySelector('.end').innerText;
                else card = line.querySelector('.start').innerText;
                connections.push({ entity: otherEl, cardinality: card });
            }
        });
    }
    return connections;
}

function getOtherEnd(line, currentEl) {
    const otherId = (line.dataset.startId === currentEl.id) ? line.dataset.endId : line.dataset.startId;
    return document.getElementById(otherId);
}