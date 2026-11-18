# ER Diagram Maker

A browser tool for drawing entity-relationship diagrams (Chen notation) and turning them into a relational model ("Relationsmodell") or an SQL script.

## Running it

The app uses JavaScript modules, which browsers don't load from `file://`. Opening `index.html` by double-clicking won't work. Use one of these instead:

- **GitHub Pages** (easiest for classmates): enable Pages for the repository and open the published URL.
- **Local web server**: in the project folder, run

  ```
  python -m http.server 8000
  ```

  then open <http://localhost:8000>.

Image export uses [html2canvas](https://html2canvas.hertzen.com/) from a CDN, so it needs an internet connection. Everything else works offline.

## Features

- Entities, attributes, relationships and labels. Advanced mode adds multivalued and derived attributes, ISA (generalization) and SQL export.
- **Primary keys** are underlined (`P`). **Foreign keys** are overlined (`F`). An attribute can be both.
- Weak entities and identifying relationships (`W`).
- Cardinalities in Chen (`1 / N / M`), modified Chen (`1 / C / M / MC`) or `(min,max)` notation. Click a label to cycle through values, or Shift+click to type any value.
- Double lines for total participation (right-click a line) and role names (double-click a line).
- Recursive relationships: connect an entity to the same relationship twice.
- **Relationsmodell**: generates the relational model next to the diagram, with hints about missing keys, missing cardinalities and similar problems.
- **Export SQL**: `CREATE TABLE` script for MySQL/MariaDB, PostgreSQL or SQLite, with primary, foreign and unique keys.
- Undo/redo, autosave in the browser, project files (`.json`) and PNG export.

Press `?` in the app for all shortcuts.

## How the relational model is built

| Diagram | Result |
| --- | --- |
| Entity | Table with its attributes. Composite attributes are split into their parts. Derived attributes are left out. |
| Multivalued attribute | Own table: key of the entity plus the value |
| 1:N relationship | Foreign key in the table on the N side |
| 1:1 relationship | Foreign key (unique) on the side with total participation, otherwise on the first side |
| N:M or ternary relationship | Own table with the keys of all participants |
| Weak entity | Inherits the key of its owner (through the identifying relationship) |
| ISA | Subtypes inherit the key of the supertype (the entity above the triangle) |

If a column name already exists in a table, foreign key columns get the referenced table's name as a prefix (e.g. `Abteilung_ID`). If you draw a foreign-key attribute yourself with the same name as the generated column, the existing column is reused.

## Project structure

```
index.html        page and menu
styles.css        all styles
js/main.js        menu, keyboard, viewport (pan / zoom / box selection)
js/elements.js    creating, selecting, dragging and deleting elements
js/lines.js       connections, cardinalities, role names
js/schema.js      ER diagram -> relational model
js/sql.js         relational model -> SQL
js/io.js          save / load / image export
js/history.js     undo / redo and autosave
js/state.js       shared state
js/utils.js       helpers (escaping, sanitizing, downloads, toasts)
```
