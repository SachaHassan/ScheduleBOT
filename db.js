const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const initDB = async () => {
  try {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                userId TEXT NOT NULL,
                description TEXT NOT NULL,
                eventTime TEXT NOT NULL,
                reminderOffsets TEXT NOT NULL,
                target TEXT NOT NULL,
                channelId TEXT NOT NULL,
                sentReminders TEXT DEFAULT '[]'
            );
        `);
    console.log("✅ Database initialized (PostgreSQL)");
  } catch (err) {
    console.error("❌ Error initializing database:", err);
  }
};

// Initialize on startup
initDB();

module.exports = pool;
