import { state } from './state.js';
import { getOtherEnd } from './lines.js';
import { getCenter, escapeHTML } from './utils.js';

/*
 * Translates the ER diagram on the canvas into a relational model.
 *
 * Result: { tables, warnings, sqlNotes }
 *   table = { name, kind: 'entity' | 'multi' | 'relationship',
 *             columns: [{ name, isPK, isFK, notNull }],
 *             foreignKeys: [{ columns, refTable, refColumns }],
 *             uniques: [[column names]], key: [column names] }
 */
export function buildRelationalModel() {
    const warnings = [];
    const sqlNotes = [];
    const warn = msg => { if (!warnings.includes(msg)) warnings.push(msg); };

    const all = [...document.querySelectorAll('#content-layer > .element')];
    const ofType = type => all.filter(el => el.dataset.type === type);
    const entities = ofType('entity');
    const relationships = ofType('relationship');
    const isas = ofType('isa');

    const tables = [];
    const entityTables = new Map(); // entity element -> table

    const createTable = (rawName, kind, fallback) => {
        const base = rawName || fallback;
        let name = base;
        for (let i = 2; tables.some(t => t.name.toLowerCase() === name.toLowerCase()); i++) name = `${base}_${i}`;
        if (name !== base) warn(`The name "${base}" is used more than once – the table was renamed to "${name}".`);
        const table = { name, kind, columns: [], foreignKeys: [], uniques: [], key: [], multi: [], isWeak: false };
        tables.push(table);
        return table;
    };

    // --- 1. One table per entity with its own attributes ---
    for (const ent of entities) {
        const name = textOf(ent);
        if (!name) warn('An entity has no name.');
        const table = createTable(name, 'entity', 'Entity');
        table.isWeak = ent.classList.contains('weak');

        for (const attr of collectAttributes(ent)) {
            if (attr.derived) continue;
            if (attr.multi) { table.multi.push(attr); continue; }
            addColumn(table, [attr.name], { isPK: attr.isPK, isFK: attr.isFK, manualFK: attr.isFK });
        }
        entityTables.set(ent, table);
    }

    for (const ent of entities) {
        for (const other of neighbours(ent)) {
            if (other.dataset.type !== 'entity') continue;
            const pair = [textOf(ent), textOf(other)].sort();
            warn(`"${pair[0]}" and "${pair[1]}" are connected directly – connect entities through a relationship.`);
        }
    }

    // --- 2. Who inherits whose key (weak entity owners, ISA supertypes) ---
    const parents = new Map(); // table -> [{ table, kind }]
    const addParent = (child, parent, kind) => {
        if (!child || !parent || child === parent) return;
        if (!parents.has(child)) parents.set(child, []);
        if (!parents.get(child).some(p => p.table === parent)) parents.get(child).push({ table: parent, kind });
    };

    const identifying = new Set();
    for (const rel of relationships) {
        if (!rel.classList.contains('weak')) continue;
        const conns = connectionsOf(rel);
        const weakConns = conns.filter(c => c.entity.classList.contains('weak'));
        if (!weakConns.length) {
            warn(`Identifying relationship "${textOf(rel) || 'Relationship'}" is not connected to a weak entity.`);
            continue;
        }
        identifying.add(rel);
        for (const weak of weakConns) {
            for (const owner of conns) {
                // The weak entity belongs to exactly one owner
                if (owner.entity !== weak.entity && isSingle(weak, owner)) {
                    addParent(entityTables.get(weak.entity), entityTables.get(owner.entity), 'weak');
                }
            }
        }
    }
    for (const table of entityTables.values()) {
        if (table.isWeak && !parents.has(table)) {
            warn(`Weak entity "${table.name}" has no owner – connect it to an identifying (double) relationship with cardinality 1 on the owner side.`);
        }
    }

    for (const isa of isas) {
        const connected = [...new Set(connectionsOf(isa).map(c => c.entity))];
        if (connected.length < 2) {
            warn('An ISA triangle needs a supertype above it and at least one subtype below it.');
            continue;
        }
        // The triangle points down: the supertype sits above it
        const center = getCenter(isa);
        const above = connected.filter(el => getCenter(el).y < center.y);
        const distance = el => Math.hypot(getCenter(el).x - center.x, getCenter(el).y - center.y);
        let superEl;
        if (above.length) {
            superEl = above.reduce((best, el) => (distance(el) < distance(best) ? el : best));
        } else {
            superEl = connected.reduce((best, el) => (getCenter(el).y < getCenter(best).y ? el : best));
            warn(`ISA: no entity is placed above the triangle – "${textOf(superEl)}" is used as the supertype.`);
        }
        connected
            .filter(el => el !== superEl)
            .forEach(sub => addParent(entityTables.get(sub), entityTables.get(superEl), 'isa'));
    }

    // --- 3. Resolve full primary keys (recursively, any depth) ---
    const keyState = new Map();
    const resolveKey = table => {
        const status = keyState.get(table);
        if (status === 'done') return table.key;
        if (status === 'visiting') {
            warn(`Circular key dependency involving "${table.name}" (weak entities / ISA).`);
            return table.columns.filter(c => c.isPK).map(c => c.name);
        }
        keyState.set(table, 'visiting');
        for (const parent of parents.get(table) || []) {
            const parentKey = resolveKey(parent.table);
            addForeignKey(table, parent.table, parentKey, { asPK: true, notNull: true, mergePK: parent.kind === 'isa' });
        }
        table.key = table.columns.filter(c => c.isPK).map(c => c.name);
        keyState.set(table, 'done');
        if (!table.key.length) warn(`Entity "${table.name}" has no primary key – select an attribute and press "Primary Key" (P).`);
        return table.key;
    };
    entityTables.forEach(table => resolveKey(table));

    // --- 4. Multivalued attributes -> own table ---
    for (const table of [...entityTables.values()]) {
        for (const multi of table.multi) {
            const mt = createTable(`${table.name}_${multi.name}`, 'multi', 'Multivalued');
            addForeignKey(mt, table, table.key, { asPK: true, notNull: true });
            multi.parts.forEach(part => addColumn(mt, [part.name], { isPK: true }));
            mt.key = mt.columns.filter(c => c.isPK).map(c => c.name);
        }
    }

    // --- 5. Relationships ---
    for (const rel of relationships) {
        const relName = textOf(rel) || 'Relationship';
        const conns = connectionsOf(rel).filter(c => entityTables.has(c.entity));
        const attrs = flattenRelationshipAttributes(collectAttributes(rel), relName, warn);

        if (identifying.has(rel)) {
            // Attributes of an identifying relationship belong to the weak entity
            conns
                .filter(c => c.entity.classList.contains('weak'))
                .forEach(c => attrs.forEach(a => addColumn(entityTables.get(c.entity), [a.name, `${relName}_${a.name}`], {})));
            continue;
        }

        if (conns.length < 2) {
            warn(`Relationship "${relName}" is connected to ${conns.length ? 'only one entity' : 'no entity'} – it was ignored.`);
            continue;
        }
        if (conns.some(c => !c.card)) warn(`Relationship "${relName}" has a missing cardinality – it was treated as 1.`);

        if (conns.length > 2) {
            const table = createTable(relName, 'relationship', 'Relationship');
            const prefixes = participantPrefixes(conns, entityTables);
            conns.forEach((c, i) => {
                const ref = entityTables.get(c.entity);
                addForeignKey(table, ref, ref.key, { asPK: true, notNull: true, prefix: prefixes[i], altPrefix: relName });
            });
            attrs.forEach(a => addColumn(table, [a.name], {}));
            table.key = table.columns.filter(c => c.isPK).map(c => c.name);
            continue;
        }

        const [a, b] = conns;
        const ta = entityTables.get(a.entity);
        const tb = entityTables.get(b.entity);
        const recursive = ta === tb;
        if (recursive && (!a.role || !b.role)) {
            warn(`Recursive relationship "${relName}": give both lines a role name (double-click a line) to get clear column names.`);
        }

        const aSingle = isSingle(a, b);
        const bSingle = isSingle(b, a);

        if (aSingle || bSingle) {
            // 1:1 or 1:N -> foreign key in one of the two tables
            let holder, other;
            if (aSingle && bSingle) {
                // 1:1: prefer the side that must participate
                const aMandatory = isMandatory(a, b);
                const bMandatory = isMandatory(b, a);
                [holder, other] = bMandatory && !aMandatory ? [b, a] : [a, b];
            } else {
                [holder, other] = aSingle ? [a, b] : [b, a];
            }
            const holderTable = entityTables.get(holder.entity);
            const otherTable = entityTables.get(other.entity);
            addForeignKey(holderTable, otherTable, otherTable.key, {
                prefix: other.role || (recursive ? relName : ''),
                altPrefix: relName,
                unique: aSingle && bSingle,
                notNull: isMandatory(holder, other),
            });
            attrs.forEach(attr => addColumn(holderTable, [attr.name, `${relName}_${attr.name}`], {}));
        } else {
            // N:M -> own table
            const table = createTable(relName, 'relationship', 'Relationship');
            const [prefixA, prefixB] = recursive
                ? [a.role, b.role || relName]
                : participantPrefixes(conns, entityTables);
            addForeignKey(table, ta, ta.key, { asPK: true, notNull: true, prefix: prefixA, altPrefix: relName });
            addForeignKey(table, tb, tb.key, { asPK: true, notNull: true, prefix: prefixB, altPrefix: relName });
            attrs.forEach(attr => addColumn(table, [attr.name], {}));
            table.key = table.columns.filter(c => c.isPK).map(c => c.name);
        }
    }

    // --- 6. Attributes the user marked as foreign key by hand ---
    for (const table of tables) {
        for (const col of table.columns) {
            if (!col.manualFK || col.usedByFK) continue;
            const target = guessReferencedTable(col.name, table, tables);
            if (target) {
                table.foreignKeys.push({ columns: [col.name], refTable: target, refColumns: [...target.key] });
            } else {
                sqlNotes.push(`${table.name}.${col.name} is marked as foreign key, but the referenced table could not be determined – no constraint was generated.`);
            }
        }
    }

    return { tables, warnings, sqlNotes };
}

export function renderSchemaHTML(model) {
    const entityTables = model.tables.filter(t => t.kind === 'entity');
    const otherTables = model.tables.filter(t => t.kind !== 'entity');
    let html = '<b>Relationsmodell:</b><br><br>';
    html += entityTables.map(renderTableHTML).join('');
    if (otherTables.length) {
        html += '<br><i>Zwischentabellen / Multivalued:</i><br>';
        html += otherTables.map(renderTableHTML).join('');
    }
    return html;
}

function renderTableHTML(table) {
    const ordered = [...table.columns.filter(c => c.isPK), ...table.columns.filter(c => !c.isPK)];
    const parts = ordered.map(col => {
        // Primary key: underline, foreign key: overline (both: both)
        const classes = [col.isPK && 'pk', col.isFK && 'fk'].filter(Boolean).join(' ');
        const name = escapeHTML(col.name);
        return classes ? `<span class="${classes}">${name}</span>` : name;
    });
    return `<b>${escapeHTML(table.name)}</b> ( ${parts.join(', ')} )<br>`;
}

// --- Table helpers ---

function findColumn(table, name) {
    const lower = name.toLowerCase();
    return table.columns.find(c => c.name.toLowerCase() === lower);
}

/** Adds a column using the first candidate name that is still free. */
function addColumn(table, candidates, props) {
    const names = candidates.filter(Boolean);
    let name = names.find(n => !findColumn(table, n));
    if (!name) {
        const base = names[0] || 'column';
        let i = 2;
        while (findColumn(table, `${base}_${i}`)) i++;
        name = `${base}_${i}`;
    }
    const column = { name, isPK: false, isFK: false, notNull: false, ...props };
    table.columns.push(column);
    return column;
}

/**
 * Adds the columns of `refKey` (the key of `ref`) to `table` as one foreign key.
 * Existing columns are reused when the user already drew them as foreign key
 * attributes, or (for ISA) when the subtype already has the same key column.
 */
function addForeignKey(table, ref, refKey, { asPK = false, notNull = false, unique = false, prefix = '', altPrefix = '', mergePK = false } = {}) {
    if (!refKey.length) return;
    const columns = refKey.map(refCol => {
        const base = prefix ? `${prefix}_${refCol}` : refCol;
        const existing = findColumn(table, base);
        const reusable = existing && ((existing.manualFK && !existing.usedByFK) || (mergePK && existing.isPK && !existing.isFK));
        if (reusable) {
            existing.usedByFK = true;
            existing.isFK = true;
            if (asPK) existing.isPK = true;
            if (notNull) existing.notNull = true;
            return existing.name;
        }
        const candidates = [base, `${ref.name}_${refCol}`, altPrefix && `${altPrefix}_${refCol}`];
        return addColumn(table, candidates, { isPK: asPK, isFK: true, notNull: notNull || asPK, usedByFK: true }).name;
    });
    table.foreignKeys.push({ columns, refTable: ref, refColumns: [...refKey] });
    if (unique) table.uniques.push(columns);
}

/**
 * Column prefixes for the participants of a relationship table: the role name
 * if there is one, otherwise the entity name when its key columns would clash
 * with another participant's (e.g. both keys are called "ID").
 */
function participantPrefixes(conns, entityTables) {
    const keyNames = conns.map(c => entityTables.get(c.entity).key.map(k => (c.role ? `${c.role}_${k}` : k).toLowerCase()));
    return conns.map((c, i) => {
        if (c.role) return c.role;
        const clashes = keyNames[i].some(name => keyNames.some((other, j) => j !== i && other.includes(name)));
        return clashes ? entityTables.get(c.entity).name : '';
    });
}

function guessReferencedTable(columnName, ownTable, tables) {
    const candidates = tables.filter(t => t !== ownTable && t.kind === 'entity' && t.key.length === 1);
    const lower = columnName.toLowerCase();

    const sameKeyName = candidates.filter(t => t.key[0].toLowerCase() === lower);
    if (sameKeyName.length === 1) return sameKeyName[0];

    // e.g. "AbteilungID" or "Abteilung_Nr" -> table "Abteilung"
    const normalize = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const col = normalize(columnName);
    const byName = candidates
        .filter(t => normalize(t.name) && (col.startsWith(normalize(t.name)) || col.endsWith(normalize(t.name))))
        .sort((x, y) => normalize(y.name).length - normalize(x.name).length);
    return byName.length ? byName[0] : null;
}

// --- Diagram helpers ---

function textOf(el) {
    return (el.querySelector('.element-text')?.innerText || '').replace(/\s+/g, ' ').trim();
}

function neighbours(el) {
    return (el.lines || []).map(line => getOtherEnd(line, el)).filter(Boolean);
}

function isAttribute(el) {
    return el.dataset.type?.startsWith('attribute');
}

/** Entities connected to `el`, with the cardinality written next to the entity. */
function connectionsOf(el) {
    return (el.lines || []).flatMap(line => {
        const other = getOtherEnd(line, el);
        if (!other || other.dataset.type !== 'entity') return [];
        const cardSpan = line._start === el ? line.querySelector('.end') : line.querySelector('.start');
        return [{
            entity: other,
            card: (cardSpan?.textContent || '').trim(),
            role: (line.dataset.role || '').trim(),
            double: line.classList.contains('double'),
        }];
    });
}

/**
 * Collects the leaf attributes of an entity or relationship. Composite
 * attributes are flattened (a PK/FK flag on the parent applies to its parts);
 * the visited set prevents endless loops between connected attributes.
 */
function collectAttributes(root) {
    const visited = new Set([root]);
    const result = [];

    const walk = (el, flags, sink) => {
        for (const other of neighbours(el)) {
            if (visited.has(other) || !isAttribute(other)) continue;
            visited.add(other);

            const type = other.dataset.type;
            const own = {
                isPK: !!flags.isPK || other.classList.contains('primary-key'),
                isFK: !!flags.isFK || other.classList.contains('foreign-key'),
                derived: !!flags.derived || type === 'attribute-derived',
            };
            const name = textOf(other) || 'Attribute';
            const hasParts = neighbours(other).some(n => !visited.has(n) && isAttribute(n));

            if (type === 'attribute-multi' && !flags.inMulti) {
                const parts = [];
                if (hasParts) walk(other, { ...own, inMulti: true }, parts);
                else parts.push({ name, ...own });
                sink.push({ name, multi: true, parts, derived: own.derived });
            } else if (hasParts) {
                walk(other, { ...own, inMulti: flags.inMulti }, sink);
            } else {
                sink.push({ name, ...own });
            }
        }
    };

    walk(root, {}, result);
    return result;
}

function flattenRelationshipAttributes(attrs, relName, warn) {
    return attrs
        .filter(a => !a.derived)
        .flatMap(a => {
            if (!a.multi) return [a];
            warn(`Multivalued attribute "${a.name}" on relationship "${relName}" is not supported – it was treated as a normal attribute.`);
            return a.parts;
        });
}

// --- Cardinalities ---
// Labels are read per line, so Chen (1/N/M), modified Chen (1/C/M/MC) and
// (min,max) all work, whatever notation is selected for clicking through values.

function isMany(card) {
    const s = card.toUpperCase();
    return /[NM*]/.test(s) || (/^\d+$/.test(s) && Number(s) > 1);
}

function parseMinMax(card) {
    const match = card.match(/^\(?\s*(\d+|[*nm])\s*[,;.]+\s*(\d+|[*nm])\s*\)?$/i);
    if (!match) return null;
    return {
        min: /^\d+$/.test(match[1]) ? Number(match[1]) : 0,
        max: /^\d+$/.test(match[2]) ? Number(match[2]) : Infinity,
    };
}

/** Can one instance of side `a` be related to at most one instance of side `b`? */
function isSingle(a, b) {
    const minMax = parseMinMax(a.card);
    if (minMax) return minMax.max <= 1;  // (min,max) is written next to the entity it describes
    return !isMany(b.card);              // Chen: the label next to b says how many b per a
}

/** Must every instance of side `a` take part in the relationship? */
function isMandatory(a, b) {
    if (a.double) return true; // total participation
    const minMax = parseMinMax(a.card);
    if (minMax) return minMax.min >= 1;
    if (state.notation === 'mc') {
        const s = b.card.toUpperCase();
        return s === '1' || s === 'M' || s === 'N';
    }
    return false;
}
