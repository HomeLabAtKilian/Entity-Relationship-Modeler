import { generateSchema } from './schema.js';

export function generateSQL() {
    const { schemaMap, intermediateTables } = generateSchema();
    let sql = "-- Generated SQL\n\n";

    // Helper to create table SQL
    const createTableSQL = (name, pks, attributes, fks) => {
        let lines = [];
        
        // Columns
        // Merge PKs and Attributes
        const allCols = [...pks, ...attributes];
        allCols.forEach(col => {
            lines.push(`    ${col.replace(/\s+/g, '_')} VARCHAR(255)`);
        });

        // Primary Key Constraint
        if (pks.length > 0) {
            const pkStr = pks.map(p => p.replace(/\s+/g, '_')).join(', ');
            lines.push(`    PRIMARY KEY (${pkStr})`);
        }

        // Foreign Key Constraints
        fks.forEach(fk => {
            const colName = fk.name.replace(/\s+/g, '_');
            const refTable = fk.source.replace(/\s+/g, '_');
            // Assuming referenced col has same name for simplicity, usually PK of ref table
            lines.push(`    FOREIGN KEY (${colName}) REFERENCES ${refTable}(${colName})`);
        });

        return `CREATE TABLE ${name.replace(/\s+/g, '_')} (\n${lines.join(',\n')}\n);\n\n`;
    };

    // 1. Entities
    schemaMap.forEach(table => {
        sql += createTableSQL(table.name, table.pks, table.attributes, table.fks);
    });

    // 2. Intermediate Tables
    intermediateTables.forEach(table => {
        sql += createTableSQL(table.name, table.pks, table.attributes, table.fks);
    });

    // Download
    const blob = new Blob([sql], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "database.sql";
    a.click();
}