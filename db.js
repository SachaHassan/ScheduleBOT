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
    channelId TEXT NOT NULL
  )
`);

module.exports = db;
