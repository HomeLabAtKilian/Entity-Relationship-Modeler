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
            pks: data.pks,
            attributes: data.attributes,
            fks: [],
            isWeak: entity.classList.contains('weak')
        });
        
        data.multiAttributes.forEach(multi => {
            intermediateTables.push({
                name: `${data.name}_${multi}`,
                pks: [...data.pks, multi],
                attributes: [],
                fks: data.pks.map(pk => ({ name: pk, source: data.name }))
            });
        });
    });

    // --- PASS 1.5: Handle Weak Entities ---
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
                                    ownerTable.pks.forEach(pk => {
                                        table.pks.unshift(pk);
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
                            if (!subTable.pks.includes(pk)) subTable.pks.unshift(pk);
                            subTable.fks.push({ name: pk, source: superTable.name });
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
            const newTable = { name: relName, pks: [], attributes: relAttributes, fks: [] };
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
        else if (connections.length === 2) {
            const [c1, c2] = connections;
            const ent1 = schemaMap.get(c1.entity.id);
            const ent2 = schemaMap.get(c2.entity.id);

            if (!ent1 || !ent2) return;

            const card1 = c1.cardinality.toUpperCase();
            const card2 = c2.cardinality.toUpperCase();
            const isRecursive = (c1.entity.id === c2.entity.id);

            if ((card1 === 'N' || card1 === 'M') && (card2 === 'N' || card2 === 'M')) {
                const newTable = { name: relName, pks: [], attributes: relAttributes, fks: [] };
                ent1.pks.forEach(pk => { newTable.pks.push(pk); newTable.fks.push({ name: pk, source: ent1.name }); });
                ent2.pks.forEach(pk => {
                    let keyName = pk;
                    if (isRecursive) keyName = `other_${pk}`;
                    newTable.pks.push(keyName);
                    newTable.fks.push({ name: keyName, source: ent2.name });
                });
                intermediateTables.push(newTable);
            }
            else if ((card1 === 'N' || card1 === 'M') && (card2 === '1' || card2 === '')) {
                ent2.pks.forEach(pk => {
                    let keyName = pk;
                    if (isRecursive) keyName = `supervisor_${pk}`;
                    ent1.fks.push({ name: keyName, source: ent2.name });
                });
            }
            else if ((card1 === '1' || card1 === '') && (card2 === 'N' || card2 === 'M')) {
                ent1.pks.forEach(pk => {
                    let keyName = pk;
                    if (isRecursive) keyName = `supervisor_${pk}`;
                    ent2.fks.push({ name: keyName, source: ent1.name });
                });
            }
            else {
                ent2.pks.forEach(pk => ent1.fks.push({ name: pk, source: ent2.name }));
            }
        }
    });

    let html = "<b>Relationsmodell:</b><br><br>";
    schemaMap.forEach(table => html += renderTableString(table));
    if (intermediateTables.length > 0) {
        html += "<br><i>Zwischentabellen / Multivalued:</i><br>";
        intermediateTables.forEach(table => html += renderTableString(table));
    }

    createElement('schema', { text: html, width: "500px", height: "auto" });
    return { schemaMap, intermediateTables };
}

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