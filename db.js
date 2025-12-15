const Database = require('better-sqlite3');
const db = new Database('schedule.db', { verbose: console.log });

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    description TEXT NOT NULL,
    eventTime TEXT NOT NULL,
    reminderOffsets TEXT NOT NULL, -- JSON array of offsets in minutes
    target TEXT NOT NULL,
    channelId TEXT NOT NULL,
    sentReminders TEXT DEFAULT '[]' -- JSON array of sent offsets
  )
`);

// Migration for existing tables
try {
  db.exec('ALTER TABLE events ADD COLUMN sentReminders TEXT DEFAULT \'[]\'');
} catch (error) {
  // Column likely already exists
}

module.exports = db;
