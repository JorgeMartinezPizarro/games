import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

// Función para abrir la base de datos
async function getDatabase() {
  return open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });
}

// Función para inicializar la base de datos y crear las tablas si no existen
async function initializeDatabase() {
  const db = await getDatabase()

  // Crear tabla trees
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      audio TEXT NOT NULL
    );
  `);

  // Crear tabla entries
  await db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      audio TEXT NOT NULL,
      tree_id INTEGER NOT NULL,
      FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
    );
  `);

  return db;
}

// Función para inicializar la base de datos y crear las tablas si no existen
export async function resetDatabase() {
  const db = await getDatabase()

  // Crear tabla trees
  await db.exec(`
    DROP TABLE trees;
  `);

  // Crear tabla entries
  await db.exec(`
    DROP TABLE entries;
  `);

  return db;
}



// 🔹 1. Insertar un nuevo árbol (tree)
export async function insertTree(title: string, audio: string) {
  const db = await initializeDatabase();
  const result = await db.run(`INSERT INTO trees (title, audio) VALUES (?, ?)`, [title, audio]);
  return { id: result.lastID };
}

// 🔹 2. Insertar una nueva entrada (entry)
export async function insertEntry(title: string, audio: string, tree_id: number) {
  const db = await initializeDatabase();
  const result = await db.run(`INSERT INTO entries (title, audio, tree_id) VALUES (?, ?, ?)`, [title, audio, tree_id]);
  return { id: result.lastID };
}

// 🔹 3. Obtener un árbol con todas sus entradas
export async function getTreeWithEntries(tree_id: number) {
  const db = await initializeDatabase();

  // Obtener el árbol
  const tree = await db.get(`SELECT * FROM trees WHERE id = ?`, [tree_id]);
  if (!tree) return null; // Si no existe, devolvemos null

  // Obtener las entradas asociadas
  const entries = await db.all(`SELECT * FROM entries WHERE tree_id = ?`, [tree_id]);

  return { ...tree, entries };
}

export async function getAllTrees() {
    const db = await initializeDatabase();
    const trees = await db.all(`SELECT * FROM trees`);
    return trees;
  }
