import { generateSchema } from './schema.js';

export function generateSQL() {
    const { schemaMap, intermediateTables } = generateSchema();
    let sql = "-- Generated SQL\n\n";

    const createTableSQL = (name, pks, attributes, fks) => {
        let lines = [];
        const allCols = [...pks, ...attributes];
        allCols.forEach(col => {
            lines.push(`    ${col.replace(/\s+/g, '_')} VARCHAR(255)`);
        });

        if (pks.length > 0) {
            const pkStr = pks.map(p => p.replace(/\s+/g, '_')).join(', ');
            lines.push(`    PRIMARY KEY (${pkStr})`);
        }

        fks.forEach(fk => {
            const colName = fk.name.replace(/\s+/g, '_');
            const refTable = fk.source.replace(/\s+/g, '_');
            lines.push(`    FOREIGN KEY (${colName}) REFERENCES ${refTable}(${colName})`);
        });

        return `CREATE TABLE ${name.replace(/\s+/g, '_')} (\n${lines.join(',\n')}\n);\n\n`;
    };

    schemaMap.forEach(table => {
        sql += createTableSQL(table.name, table.pks, table.attributes, table.fks);
    });

    intermediateTables.forEach(table => {
        sql += createTableSQL(table.name, table.pks, table.attributes, table.fks);
    });

    const blob = new Blob([sql], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "database.sql";
    a.click();
}