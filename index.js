require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const db = require('./db');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is alive!');
});

server.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    // Start the reminder loop
    checkReminders();
    setInterval(checkReminders, 60 * 1000); // Check every minute
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

function checkReminders() {
    console.log('Checking for reminders...');
    const now = new Date();

    // Get all events
    const stmt = db.prepare('SELECT * FROM events');
    const events = stmt.all();

    for (const event of events) {
        const eventTime = new Date(event.eventTime);
        const offsets = JSON.parse(event.reminderOffsets); // offsets in minutes
        let sentReminders = [];
        try {
            sentReminders = JSON.parse(event.sentReminders || '[]');
        } catch (e) {
            sentReminders = [];
        }

        let updated = false;

        offsets.forEach(offsetMinutes => {
            // Check if already sent
            if (sentReminders.includes(offsetMinutes)) return;

            const reminderTime = new Date(eventTime.getTime() - offsetMinutes * 60000);
            const timeDiff = now.getTime() - reminderTime.getTime();

            // Logic: If time has passed (timeDiff > 0) AND it's not too old (e.g., < 24 hours late)
            // We send the ping. This covers restart gaps.
            // 24 hours = 86400000 ms
            if (timeDiff >= 0 && timeDiff < 86400000) {
                sendReminder(event, offsetMinutes);
                sentReminders.push(offsetMinutes);
                updated = true;
            }
        });

        if (updated) {
            const updateStmt = db.prepare('UPDATE events SET sentReminders = ? WHERE id = ?');
            updateStmt.run(JSON.stringify(sentReminders), event.id);
        }
    }
}

async function sendReminder(event, offsetMinutes) {
    try {
        const channel = await client.channels.fetch(event.channelId);
        if (channel) {
            let message = `🔔 **Rappel !**\n${event.description}\n`;
            if (offsetMinutes === 0) {
                message += `C'est maintenant !`;
            } else {
                message += `Dans ${offsetMinutes} minutes !`;
            }

            let content = message;
            if (event.target === 'everyone') {
                content = `@everyone ${message}`;
            } else {
                content = `<@${event.target}> ${message}`;
            }

            await channel.send(content);
        }
    } catch (error) {
        console.error('Failed to send reminder:', error);
    }
}

client.login(process.env.DISCORD_TOKEN);
