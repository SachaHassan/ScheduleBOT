require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const db = require('./db');
const app = require('./api/server');

const PORT = process.env.PORT || 3000;

// ─── REST API Server ─────────────────────────────────────────────────────────
// Serves the dashboard API AND acts as the keepalive endpoint for UptimeRobot
app.listen(PORT, () => {
    console.log(`🌐 API server démarré sur le port ${PORT}`);
    console.log(`   → Health check : GET /api/health`);
});

// ─── Discord Client ──────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load all command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.warn(`[WARNING] ${filePath} — propriété "data" ou "execute" manquante, ignoré.`);
    }
}

// ─── Events ──────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, c => {
    console.log(`\n✅ Bot Discord connecté en tant que ${c.user.tag}`);
    // Start reminder loop immediately then every minute
    checkReminders();
    setInterval(checkReminders, 60 * 1000);
    // Cleanup old events every 6 hours
    setInterval(() => db.cleanupOldEvents().catch(console.error), 6 * 60 * 60 * 1000);
});

client.on(Events.Error, err => {
    console.error('❌ Discord client error:', err);
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        // ── Slash Commands ──
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction, client);
            return;
        }

        // ── Select Menus ──
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('cancel_')) {
                const cmd = client.commands.get('cancel');
                if (cmd?.handleSelect) await cmd.handleSelect(interaction);
            }
            return;
        }

        // ── Buttons ──
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('cancel_')) {
                const cmd = client.commands.get('cancel');
                if (cmd?.handleButton) await cmd.handleButton(interaction);
            }
            if (interaction.customId.startsWith('list_')) {
                const cmd = client.commands.get('list');
                if (cmd?.handleButton) await cmd.handleButton(interaction);
            }
            return;
        }
    } catch (err) {
        console.error(`Erreur interaction (${interaction.type}):`, err);
        const reply = { content: '❌ Une erreur est survenue.', ephemeral: true };
        try {
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
            else await interaction.reply(reply);
        } catch { /* ignore */ }
    }
});

// ─── Reminder Logic ───────────────────────────────────────────────────────────

const EVENT_TYPE_EMOJI = {
    training: '🏋️', scrim: '⚔️', tournament: '🏆', meeting: '📋', general: '📅'
};

function formatOffset(minutes) {
    if (minutes === 0) return "à l'heure J";
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}j`;
}

async function checkReminders() {
    try {
        const res = await db.getEventsForReminders();
        const now = Date.now();

        for (const event of res.rows) {
            const eventTime = new Date(event.event_time).getTime();
            let offsets;
            try { offsets = JSON.parse(event.reminder_offsets); } catch { offsets = [0]; }
            let sentReminders;
            try { sentReminders = JSON.parse(event.sent_reminders || '[]'); } catch { sentReminders = []; }

            let updated = false;
            for (const offsetMinutes of offsets) {
                if (sentReminders.includes(offsetMinutes)) continue;

                const reminderTime = eventTime - offsetMinutes * 60_000;
                const diff = now - reminderTime;

                // Fire if due and not more than 5 minutes stale (handles bot restart gaps)
                if (diff >= 0 && diff < 5 * 60_000) {
                    await sendReminder(event, offsetMinutes);
                    sentReminders.push(offsetMinutes);
                    updated = true;
                }
            }

            if (updated) {
                await db.updateSentReminders(event.id, sentReminders);
            }
        }
    } catch (err) {
        console.error('Erreur checkReminders:', err);
    }
}

async function sendReminder(event, offsetMinutes) {
    try {
        const channel = await client.channels.fetch(event.channel_id);
        if (!channel) return;

        const emoji = EVENT_TYPE_EMOJI[event.event_type] || '📅';
        const dateStr = new Date(event.event_time).toLocaleString('fr-FR', {
            timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short'
        });

        let pingStr;
        if (event.target_type === 'everyone')     pingStr = '@everyone';
        else if (event.target_type === 'role')    pingStr = `<@&${event.target_id}>`;
        else                                       pingStr = `<@${event.target_id}>`;

        const timeLabel = offsetMinutes === 0
            ? `🚨 **C'est maintenant !**`
            : `⏰ Dans **${formatOffset(offsetMinutes)}** !`;

        const lines = [
            pingStr,
            `${emoji} **${event.title}**`,
            timeLabel,
            `📅 ${dateStr}`,
        ];
        if (event.description) lines.push(`📝 ${event.description}`);

        await channel.send({
            content: lines.join('\n'),
            allowedMentions: { parse: ['everyone', 'roles', 'users'] }
        });
    } catch (error) {
        console.error(`Erreur envoi rappel event #${event.id}:`, error);
    }
}

// ─── Login ───────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);
