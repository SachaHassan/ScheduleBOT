const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── Schema Init & Migration ────────────────────────────────────────────────

const initDB = async () => {
  try {
    // Create events table with full new schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id              SERIAL PRIMARY KEY,
        guild_id        TEXT NOT NULL DEFAULT 'legacy',
        creator_id      TEXT NOT NULL DEFAULT '',
        channel_id      TEXT NOT NULL DEFAULT '',
        title           TEXT NOT NULL DEFAULT '',
        description     TEXT DEFAULT '',
        event_type      TEXT DEFAULT 'general',
        event_time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reminder_offsets TEXT NOT NULL DEFAULT '[0]',
        sent_reminders  TEXT NOT NULL DEFAULT '[]',
        target_type     TEXT NOT NULL DEFAULT 'user',
        target_id       TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create players/roster table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id          SERIAL PRIMARY KEY,
        guild_id    TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        gamertag    TEXT DEFAULT '',
        player_role TEXT DEFAULT '',
        game        TEXT DEFAULT 'Non défini',
        joined_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(guild_id, user_id)
      );
    `);

    // Migration: safely add new columns to events if upgrading from old schema
    const columnMigrations = [
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS guild_id TEXT DEFAULT 'legacy'`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS creator_id TEXT DEFAULT ''`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS channel_id TEXT DEFAULT ''`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS title TEXT DEFAULT ''`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'general'`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TIMESTAMPTZ`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_offsets TEXT DEFAULT '[0]'`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS sent_reminders TEXT DEFAULT '[]'`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'user'`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS target_id TEXT DEFAULT ''`,
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
    ];

    for (const sql of columnMigrations) {
      try { await pool.query(sql); } catch (e) { /* column already exists */ }
    }

    // Data migration: populate new columns from old column names (if they exist)
    try {
      await pool.query(`
        UPDATE events SET
          creator_id       = COALESCE(NULLIF(creator_id, ''), userid, ''),
          channel_id       = COALESCE(NULLIF(channel_id, ''), channelid, ''),
          title            = COALESCE(NULLIF(title, ''), description, 'Sans titre'),
          event_time       = COALESCE(event_time, (eventtime)::TIMESTAMPTZ),
          reminder_offsets = COALESCE(NULLIF(reminder_offsets, ''), reminderoffsets, '[0]'),
          sent_reminders   = COALESCE(NULLIF(sent_reminders, ''), sentreminders, '[]'),
          target_id        = COALESCE(NULLIF(target_id, ''), target, ''),
          target_type      = CASE
            WHEN NULLIF(target_type, '') IS NOT NULL THEN target_type
            WHEN target = 'everyone'                 THEN 'everyone'
            ELSE 'user'
          END
        WHERE creator_id = '' OR event_time IS NULL OR target_id = ''
      `);
    } catch (e) {
      // Old columns don't exist — already on new schema, that's fine
    }

    console.log('✅ Base de données initialisée (PostgreSQL)');
  } catch (err) {
    console.error('❌ Erreur init DB:', err);
    process.exit(1);
  }
};

// ─── Events ─────────────────────────────────────────────────────────────────

const createEvent = ({ guildId, creatorId, channelId, title, description, eventType, eventTime, reminderOffsets, targetType, targetId }) =>
  pool.query(
    `INSERT INTO events
       (guild_id, creator_id, channel_id, title, description, event_type, event_time, reminder_offsets, sent_reminders, target_type, target_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]',$9,$10)
     RETURNING id`,
    [guildId, creatorId, channelId, title, description || '', eventType || 'general', eventTime, reminderOffsets, targetType, targetId]
  );

const getUpcomingEvents = (guildId) =>
  pool.query(
    `SELECT * FROM events WHERE guild_id = $1 AND event_time > NOW() ORDER BY event_time ASC`,
    [guildId]
  );

const getUserEvents = (guildId, userId) =>
  pool.query(
    `SELECT * FROM events
     WHERE guild_id = $1 AND (creator_id = $2 OR target_id = $2) AND event_time > NOW()
     ORDER BY event_time ASC`,
    [guildId, userId]
  );

const getEventById = (id) =>
  pool.query(`SELECT * FROM events WHERE id = $1`, [id]);

const deleteEvent = (id) =>
  pool.query(`DELETE FROM events WHERE id = $1`, [id]);

/** Returns events that may need reminder checks (1 day past → 31 days ahead) */
const getEventsForReminders = () =>
  pool.query(
    `SELECT * FROM events
     WHERE event_time > NOW() - INTERVAL '1 day'
       AND event_time < NOW() + INTERVAL '31 days'`
  );

const updateSentReminders = (id, sentReminders) =>
  pool.query(
    `UPDATE events SET sent_reminders = $1 WHERE id = $2`,
    [JSON.stringify(sentReminders), id]
  );

/** Cleanup events older than 7 days (runs every 6h) */
const cleanupOldEvents = () =>
  pool.query(`DELETE FROM events WHERE event_time < NOW() - INTERVAL '7 days'`);

// ─── Players / Roster ────────────────────────────────────────────────────────

const upsertPlayer = ({ guildId, userId, gamertag, playerRole, game }) =>
  pool.query(
    `INSERT INTO players (guild_id, user_id, gamertag, player_role, game)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (guild_id, user_id)
     DO UPDATE SET gamertag = EXCLUDED.gamertag, player_role = EXCLUDED.player_role, game = EXCLUDED.game`,
    [guildId, userId, gamertag || '', playerRole || '', game || 'Non défini']
  );

const getPlayers = (guildId) =>
  pool.query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM events e
        WHERE e.guild_id = $1
          AND (e.creator_id = p.user_id OR e.target_id = p.user_id)
          AND e.event_time > NOW()
       ) AS upcoming_events
     FROM players p
     WHERE p.guild_id = $1
     ORDER BY p.game, p.player_role`,
    [guildId]
  );

const getPlayer = (guildId, userId) =>
  pool.query(
    `SELECT * FROM players WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );

const removePlayer = (guildId, userId) =>
  pool.query(
    `DELETE FROM players WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );

// ─── Init & Export ───────────────────────────────────────────────────────────

initDB();

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  // Events
  createEvent,
  getUpcomingEvents,
  getUserEvents,
  getEventById,
  deleteEvent,
  getEventsForReminders,
  updateSentReminders,
  cleanupOldEvents,
  // Players
  upsertPlayer,
  getPlayers,
  getPlayer,
  removePlayer,
};
