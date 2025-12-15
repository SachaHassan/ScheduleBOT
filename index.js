require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const db = require('./db');

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

        // We need to store state of sent reminders to avoid spamming.
        // For simplicity in this first version, we might just check if "now" is close to "eventTime - offset"
        // But better approach: Store "sentReminders" in DB or check if time is within a small window.
        // Let's refine the logic:
        // We will assume the check runs every minute. 
        // If (eventTime - offset) is within the last minute, send ping.

        offsets.forEach(offsetMinutes => {
            const reminderTime = new Date(eventTime.getTime() - offsetMinutes * 60000);
            const timeDiff = now.getTime() - reminderTime.getTime();

            // If the reminder time was within the last 60 seconds (inclusive of 0, typically)
            // AND we ensure we don't double send (could be tricky with just simple interval, but 1 min interval + 1 min window is standard "cron" logic)
            if (timeDiff >= 0 && timeDiff < 60000) {
                sendReminder(event, offsetMinutes);
            }
        });
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
                message += `Dans ${offsetMinutes} minutes !`; // Basic formatting, can be improved to "1 jour", "1 heure"
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
