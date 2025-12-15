const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');
const chrono = require('chrono-node');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Planifie un événement')
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description de l\'événement')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Date de l\'événement (ex: "demain à 18h", "15 décembre 2025")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reminders')
                .setDescription('Rappels (ex: "1d, 1h, 0m" pour 1j avant, 1h avant, et maintenant)')
                .setRequired(false))
        .addMentionableOption(option =>
            option.setName('cible')
                .setDescription('Qui pinger ? (Laissez vide pour vous-même, ou mettez @everyone)')
                .setRequired(false)),
    async execute(interaction) {
        const description = interaction.options.getString('description');
        const dateInput = interaction.options.getString('date');
        const remindersInput = interaction.options.getString('reminders') || "0m";
        const targetOption = interaction.options.getMentionable('cible');

        // Parse date
        const parseDate = chrono.fr.parseDate(dateInput); // Using French locale
        if (!parseDate) {
            return interaction.reply({ content: `Je n'ai pas compris la date : "${dateInput}". Essayez un format comme "demain à 20h".`, ephemeral: true });
        }

        // Parse reminders
        // Expected format: numbers followed by d/h/m, separated by commas
        // e.g. "1d, 30m" -> [1440, 30]
        const reminders = [];
        const parts = remindersInput.split(',').map(s => s.trim());
        for (const part of parts) {
            const match = part.match(/^(\d+)([dhm])$/);
            if (match) {
                const val = parseInt(match[1]);
                const unit = match[2];
                let minutes = 0;
                if (unit === 'd') minutes = val * 24 * 60;
                if (unit === 'h') minutes = val * 60;
                if (unit === 'm') minutes = val;
                reminders.push(minutes);
            } else if (part === '0') { // allow just '0'
                reminders.push(0);
            }
        }
        if (reminders.length === 0) reminders.push(0); // Default to on time if parsing fails or empty logic

        // Determine target
        let targetId;
        if (targetOption) {
            // Check if it's a role or user. 
            // If it's @everyone, targetOption might be null depending on how discord.js handles it sometimes, 
            // but usually Mentions won't capture @everyone directly as a specific user object without role handling.
            // Actually SlashCommand Mentionable returns user or role.
            // If user types @everyone, it might not be a 'mentionable' in the standard object sense if not allowed,
            // but let's assume valid role/user.
            // Special case for @everyone text if passed as string? No, it's an option type.

            // If the user selects a role like @everyone (which is the guild ID role usually), use it.
            // Or if they explicitly mention a user.

            // For simplicitly, we store ID.
            if (targetOption.user) {
                targetId = targetOption.user.id;
            } else if (targetOption.role) {
                if (targetOption.role.name === '@everyone') {
                    targetId = 'everyone';
                } else {
                    targetId = targetOption.role.id;
                }
            }
        } else {
            targetId = interaction.user.id;
        }

        // Insert into DB
        const stmt = db.prepare('INSERT INTO events (userId, description, eventTime, reminderOffsets, target, channelId) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run(interaction.user.id, description, parseDate.toISOString(), JSON.stringify(reminders), targetId, interaction.channelId);

        await interaction.reply({ content: ` Événement planifié : **${description}**\n Date : ${parseDate.toLocaleString('fr-FR')}\n🔔 Rappels : ${reminders.join(', ')} minutes avant\n  Cible : ${targetId === 'everyone' ? '@everyone' : `<@${targetId}>`}` });
    },
};
