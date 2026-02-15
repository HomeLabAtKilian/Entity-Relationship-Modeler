import { createElement } from './elements.js';

export function generateSchema() {
    const schemaMap = new Map();
    const intermediateTables = [];
    const entities = document.querySelectorAll('.element[data-type="entity"]');
    const relationships = document.querySelectorAll('.element[data-type="relationship"]');
    const isaTriangles = document.querySelectorAll('.element[data-type="isa"]');

    // --- PASS 1: Build Base Entities ---
    entities.forEach(entity => {
        const data = getEntityData(entity);
        schemaMap.set(entity.id, {
            name: data.name,
            pks: data.pks, // Own PKs
            attributes: data.attributes,
            fks: [],
            isWeak: entity.classList.contains('weak'),
            // Helper to get FULL PK (Own + Inherited)
            getFullPKs: function() {
                const inherited = this.fks.filter(fk => fk.is partOfPK).map(fk => fk.name);
                return [...inherited, ...this.pks];
            }
        });
        
        // Multivalued Attributes -> New Table
        data.multiAttributes.forEach(multi => {
            intermediateTables.push({
                name: `${data.name}_${multi}`,
                columns: [
                    ...data.pks.map(pk => ({ name: pk, isPK: true, isFK: true, source: data.name })),
                    { name: multi, isPK: true, isFK: false }
                ]
            });
        });
    });

    // --- PASS 1.5: Handle Weak Entities (Recursive Resolution) ---
    // We loop until no more changes occur to handle chains (A -> B -> C)
    let changes = true;
    while(changes) {
        changes = false;
        schemaMap.forEach((table, id) => {
            if (table.isWeak) {
                const entityEl = document.getElementById(id);
                if (entityEl && entityEl.lines) {
                    entityEl.lines.forEach(line => {
                        const otherEl = getOtherEnd(line, entityEl);
                        if (otherEl.dataset.type === 'relationship' && otherEl.classList.contains('weak')) {
                            const relConnections = getConnectedEntities(otherEl);
                            relConnections.forEach(conn => {
                                if (conn.entity.id !== id) {
                                    const ownerTable = schemaMap.get(conn.entity.id);
                                    if (ownerTable) {
                                        // Get Owner's FULL PKs (might include their own owner's PKs)
                                        const ownerPKs = ownerTable.pks.concat(
                                            ownerTable.fks.filter(f => f.isPartOfPK).map(f => f.name)
                                        );

                                        ownerPKs.forEach(pk => {
                                            // Avoid duplicates
                                            if (!table.fks.some(f => f.name === pk)) {
                                                table.fks.push({ 
                                                    name: pk, 
                                                    source: ownerTable.name, 
                                                    isPartOfPK: true // Crucial: Weak entities use owner key as part of their PK
                                                });
                                                changes = true;
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            }
        });
    }

    // --- PASS 1.8: Handle ISA ---
    isaTriangles.forEach(isa => {
        const connected = getConnectedEntities(isa);
        if (connected.length >= 2) {
            connected.sort((a, b) => parseFloat(a.entity.style.top) - parseFloat(b.entity.style.top));
            const superEntityEl = connected[0].entity;
            const subEntitiesData = connected.slice(1);
            const superTable = schemaMap.get(superEntityEl.id);

            if (superTable) {
                subEntitiesData.forEach(conn => {
                    const subTable = schemaMap.get(conn.entity.id);
                    if (subTable) {
                        superTable.pks.forEach(pk => {
                            if (!subTable.pks.includes(pk) && !subTable.fks.some(f => f.name === pk)) {
                                subTable.fks.push({ 
                                    name: pk, 
                                    source: superTable.name, 
                                    isPartOfPK: true // Subclass PK is also FK
                                });
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

        if (connections.length > 2) {
            // Ternary -> New Table
            const newTable = { name: relName, columns: [] };
            
            // Add Attributes
            relAttributes.forEach(attr => newTable.columns.push({ name: attr, isPK: false, isFK: false }));

            // Add Keys from all participants
            connections.forEach(conn => {
                const ent = schemaMap.get(conn.entity.id);
                if (ent) {
                    const fullPKs = ent.pks.concat(ent.fks.filter(f => f.isPartOfPK).map(f => f.name));
                    fullPKs.forEach(pk => {
                        const colName = resolveCollision(newTable.columns, pk, ent.name);
                        newTable.columns.push({ name: colName, isPK: true, isFK: true, source: ent.name });
                    });
                }
            });
            intermediateTables.push(newTable);
        }
        else if (connections.length === 2) {
            const [c1, c2] = connections;
            const ent1 = schemaMap.get(c1.entity.id);
            const ent2 = schemaMap.get(c2.entity.id);

            if (!ent1 || !ent2) return;

            const card1 = c1.cardinality.toUpperCase();
            const card2 = c2.cardinality.toUpperCase();
            const isRecursive = (c1.entity.id === c2.entity.id);

            // N:M -> New Table
            if ((card1 === 'N' || card1 === 'M') && (card2 === 'N' || card2 === 'M')) {
                const newTable = { name: relName, columns: [] };
                relAttributes.forEach(attr => newTable.columns.push({ name: attr, isPK: false, isFK: false }));

                // Ent1 Keys
                const pks1 = ent1.pks.concat(ent1.fks.filter(f => f.isPartOfPK).map(f => f.name));
                pks1.forEach(pk => {
                    const colName = resolveCollision(newTable.columns, pk, ent1.name);
                    newTable.columns.push({ name: colName, isPK: true, isFK: true, source: ent1.name });
                });

                // Ent2 Keys
                const pks2 = ent2.pks.concat(ent2.fks.filter(f => f.isPartOfPK).map(f => f.name));
                pks2.forEach(pk => {
                    let colName = pk;
                    if (isRecursive) colName = `other_${pk}`;
                    colName = resolveCollision(newTable.columns, colName, ent2.name);
                    newTable.columns.push({ name: colName, isPK: true, isFK: true, source: ent2.name });
                });

                intermediateTables.push(newTable);
            }
            // 1:N or 1:1
            else {
                let target, source, prefix = "";
                
                // Determine direction
                if ((card1 === 'N' || card1 === 'M') && (card2 === '1' || card2 === '')) {
                    target = ent1; source = ent2; // 1(Source) -> N(Target)
                    if (isRecursive) prefix = "supervisor_";
                } else if ((card1 === '1' || card1 === '') && (card2 === 'N' || card2 === 'M')) {
                    target = ent2; source = ent1;
                    if (isRecursive) prefix = "supervisor_";
                } else {
                    // 1:1 - Arbitrary or based on total participation (not tracked yet)
                    target = ent1; source = ent2;
                    if (isRecursive) prefix = "spouse_"; // Specific prefix for 1:1 recursive
                }

                // Migrate Keys
                const sourcePKs = source.pks.concat(source.fks.filter(f => f.isPartOfPK).map(f => f.name));
                sourcePKs.forEach(pk => {
                    const colName = prefix + pk;
                    // Check collision in Target
                    // Note: In 1:N, we don't rename for collision usually, but we should check
                    target.fks.push({ name: colName, source: source.name, isPartOfPK: false });
                });
                
                // Add Relationship Attributes to Target
                relAttributes.forEach(attr => target.attributes.push(attr));
            }
        }
    });

    // --- PASS 3: Render HTML ---
    let html = "<b>Relationsmodell:</b><br><br>";
    
    schemaMap.forEach(table => {
        // Convert Entity format to generic column format for rendering
        const columns = [
            ...table.pks.map(p => ({ name: p, isPK: true, isFK: false })),
            ...table.attributes.map(a => ({ name: a, isPK: false, isFK: false })),
            ...table.fks.map(f => ({ name: f.name, isPK: f.isPartOfPK, isFK: true }))
        ];
        html += renderTableHTML(table.name, columns);
    });

    if (intermediateTables.length > 0) {
        html += "<br><i>Zwischentabellen / Multivalued:</i><br>";
        intermediateTables.forEach(table => {
            html += renderTableHTML(table.name, table.columns);
        });
    }

    createElement('schema', { text: html, width: "500px", height: "auto" });
    return { schemaMap, intermediateTables };
}

// --- Helpers ---

// Resolves name collisions (e.g., Student.ID and Course.ID -> Student_ID, Course_ID)
function resolveCollision(existingColumns, candidateName, sourceName) {
    const exists = existingColumns.some(c => c.name === candidateName);
    if (exists) {
        return `${sourceName}_${candidateName}`;
    }
    return candidateName;
}

function renderTableHTML(tableName, columns) {
    let str = `<b>${tableName}</b> ( `;
    const parts = [];
    
    columns.forEach(col => {
        let val = col.name;
        if (col.isFK) val = `<i>${val}</i>`;
        if (col.isPK) val = `<ins>${val}</ins>`;
        parts.push(val);
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

    function traverseAttributes(el) {
        if (el.lines) {
            el.lines.forEach(line => {
                const otherEl = getOtherEnd(line, el);
                if (otherEl && otherEl.dataset.type.startsWith('attribute')) {
                    const subAttributes = getConnectedAttributes(otherEl);
                    if (subAttributes.length > 0) {
                        traverseAttributes(otherEl);
                    } else {
                        const attrName = otherEl.innerText.trim();
                        if (otherEl.dataset.type === 'attribute-multi') {
                            multiAttributes.push(attrName);
                        } else if (otherEl.dataset.type === 'attribute-derived') {
                            // Ignore
                        } else {
                            if (otherEl.classList.contains('primary-key')) pks.push(attrName);
                            else attributes.push(attrName);
                        }
                    }
                }
            });
        }
    }

    if (entity.lines) {
        entity.lines.forEach(line => {
            const otherEl = getOtherEnd(line, entity);
            if (otherEl && otherEl.dataset.type.startsWith('attribute')) {
                 const subs = getConnectedAttributes(otherEl);
                 if (subs.length > 0) traverseAttributes(otherEl);
                 else {
                     const attrName = otherEl.innerText.trim();
                     if (otherEl.dataset.type === 'attribute-multi') multiAttributes.push(attrName);
                     else if (otherEl.dataset.type === 'attribute-derived') {} 
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
            if (otherEl && otherEl.dataset.type.startsWith('attribute')) attributes.push(otherEl);
        });
    }
    return attributes;
}

function getConnectedEntities(element) {
    const connections = [];
    if (element.lines) {
        element.lines.forEach(line => {
            const otherEl = getOtherEnd(line, element);
            if (otherEl && otherEl.dataset.type === 'entity') {
                let card = "";
                if (line.dataset.startId === element.id) card = line.querySelector('.end').innerText;
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