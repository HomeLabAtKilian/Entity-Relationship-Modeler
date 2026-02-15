import { generateSchema } from './schema.js';

export function generateSQL() {
    const { schemaMap, intermediateTables } = generateSchema();
    let sql = "-- Generated SQL\n\n";

    const createTableSQL = (name, columns) => {
        let lines = [];
        let pks = [];
        let fks = [];

        columns.forEach(col => {
            // Basic column def
            lines.push(`    ${col.name.replace(/\s+/g, '_')} VARCHAR(255)`);
            
            if (col.isPK) pks.push(col.name.replace(/\s+/g, '_'));
            if (col.isFK && col.source) {
                fks.push({ col: col.name.replace(/\s+/g, '_'), ref: col.source.replace(/\s+/g, '_') });
            }
        });

        if (pks.length > 0) {
            lines.push(`    PRIMARY KEY (${pks.join(', ')})`);
        }

        fks.forEach(fk => {
            // Assuming referenced column is same name or ID. 
            // In a perfect world we'd track the exact referenced column name, 
            // but usually it's the PK of the source.
            // For now, we assume the FK name matches the PK name of the target, 
            // or we just reference the table.
            // SQL Syntax: FOREIGN KEY (Col) REFERENCES Table(RefCol)
            // We will guess RefCol is same as Col name for now, or 'ID' if not found.
            lines.push(`    FOREIGN KEY (${fk.col}) REFERENCES ${fk.ref}(${fk.col})`); 
        });

        return `CREATE TABLE ${name.replace(/\s+/g, '_')} (\n${lines.join(',\n')}\n);\n\n`;
    };

    // 1. Entities
    schemaMap.forEach(table => {
        // Convert Entity format to generic columns
        const columns = [
            ...table.pks.map(p => ({ name: p, isPK: true, isFK: false })),
            ...table.attributes.map(a => ({ name: a, isPK: false, isFK: false })),
            ...table.fks.map(f => ({ name: f.name, isPK: f.isPartOfPK, isFK: true, source: f.source }))
        ];
        sql += createTableSQL(table.name, columns);
    });

    // 2. Intermediate Tables
    intermediateTables.forEach(table => {
        sql += createTableSQL(table.name, table.columns);
    });

    const blob = new Blob([sql], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "database.sql";
    a.click();
}