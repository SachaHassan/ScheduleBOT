const express = require('express');
const db = require('../db');

const app = express();
app.use(express.json());

// ─── Auth Middleware ─────────────────────────────────────────────────────────

/**
 * Simple API key auth. Set API_SECRET env var to enable.
 * Clients send: header `x-api-key: <secret>` or query `?api_key=<secret>`
 * If API_SECRET is not configured, all requests are allowed (dev mode).
 */
const requireApiKey = (req, res, next) => {
    if (!process.env.API_SECRET) return next();
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== process.env.API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized. Provide x-api-key header.' });
    }
    next();
};

// ─── Public Routes ───────────────────────────────────────────────────────────

/** Root page — human-readable status */
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>ScheduleBOT — Esport Edition</title>
  <style>
    body { font-family: sans-serif; background: #2c2f33; color: #fff; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { background: #23272a; border-radius: 12px; padding: 40px 60px; text-align:center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { color: #7289da; margin-bottom: 8px; }
    .status { color: #43b581; font-size: 1.2em; margin: 16px 0; }
    .meta { color: #99aab5; font-size: 0.9em; }
    a { color: #7289da; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🏆 ScheduleBOT</h1>
    <p>Esport Edition — Discord Scheduler</p>
    <p class="status">✅ En ligne depuis ${Math.floor(process.uptime())}s</p>
    <p class="meta">API : <a href="/api/health">/api/health</a></p>
    <p class="meta">Dashboard web à venir...</p>
  </div>
</body>
</html>`);
});

/** Health check — used by UptimeRobot to keep the bot alive on Render free plan */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

// ─── Protected Routes ────────────────────────────────────────────────────────

/**
 * GET /api/events?guild_id=xxx
 * Returns all upcoming events for a guild — for the web dashboard calendar
 */
app.get('/api/events', requireApiKey, async (req, res) => {
    const { guild_id } = req.query;
    if (!guild_id) return res.status(400).json({ error: 'guild_id is required' });
    try {
        const result = await db.getUpcomingEvents(guild_id);
        res.json(result.rows);
    } catch (e) {
        console.error('API /api/events error:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/players?guild_id=xxx
 * Returns the full roster for a guild
 */
app.get('/api/players', requireApiKey, async (req, res) => {
    const { guild_id } = req.query;
    if (!guild_id) return res.status(400).json({ error: 'guild_id is required' });
    try {
        const result = await db.getPlayers(guild_id);
        res.json(result.rows);
    } catch (e) {
        console.error('API /api/players error:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/players/:userId/events?guild_id=xxx
 * Returns upcoming events for a specific player (for per-player calendar view)
 */
app.get('/api/players/:userId/events', requireApiKey, async (req, res) => {
    const { guild_id } = req.query;
    const { userId } = req.params;
    if (!guild_id) return res.status(400).json({ error: 'guild_id is required' });
    try {
        const result = await db.getUserEvents(guild_id, userId);
        res.json(result.rows);
    } catch (e) {
        console.error('API /api/players/:userId/events error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = app;
