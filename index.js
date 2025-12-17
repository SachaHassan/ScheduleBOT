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

async function checkReminders() {
    console.log('Checking for reminders...');
    const now = new Date();

    try {
        // Get all events
        const res = await db.query('SELECT * FROM events');
        const events = res.rows;

        for (const event of events) {
            // PostgreSQL columns are lowercase by default
            const eventTime = new Date(event.eventtime);
            const offsets = JSON.parse(event.reminderoffsets);
            let sentReminders = [];
            try {
                sentReminders = JSON.parse(event.sentreminders || '[]');
            } catch (e) {
                sentReminders = [];
            }

            let updated = false;

            offsets.forEach(offsetMinutes => {
                // Check if already sent
                if (sentReminders.includes(offsetMinutes)) return;

                const reminderTime = new Date(eventTime.getTime() - offsetMinutes * 60000);
                const timeDiff = now.getTime() - reminderTime.getTime();

                // Logic: If time has passed (timeDiff > 0) AND it's not too old
                if (timeDiff >= 0 && timeDiff < 86400000) {
                    sendReminder(event, offsetMinutes);
                    sentReminders.push(offsetMinutes);
                    updated = true;
                }
            });

            if (updated) {
                await db.query('UPDATE events SET sentreminders = $1 WHERE id = $2', [JSON.stringify(sentReminders), event.id]);
            }
        }
    } catch (err) {
        console.error("Error checking reminders:", err);
    }
}

async function sendReminder(event, offsetMinutes) {
    try {
        const channel = await client.channels.fetch(event.channelid);
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
