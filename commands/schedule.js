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
        // Expected format: numbers followed by d/h/m/j, separated by commas
        const reminders = [];
        // If user didn't provide reminders, we default to 0 (at event time) 
        // but we might want to track this difference for display.
        const hasRemindersInput = !!remindersInput;

        if (hasRemindersInput) {
            // Flexible parsing: allow spaces, french units (j/h/m/min)
            const parts = remindersInput.split(',').map(s => s.trim().toLowerCase());
            for (const part of parts) {
                // Regex: Number + optional space + unit (d, j, h, m, min...)
                const match = part.match(/^(\d+)\s*(j|d|jour|jours|h|heure|heures|m|min|minute|minutes)?$/);
                if (match) {
                    const val = parseInt(match[1]);
                    const unit = match[2] || 'm'; // default to minutes if no unit? or strict? let's default 'm' if they just type number

                    let minutes = 0;
                    if (['d', 'j', 'jour', 'jours'].includes(unit)) minutes = val * 24 * 60;
                    else if (['h', 'heure', 'heures'].includes(unit)) minutes = val * 60;
                    else minutes = val; // m, min, minutes

                    reminders.push(minutes);
                }
            }
        }

        if (reminders.length === 0) reminders.push(0); // Always ensure at least ping at event time

        // Determine target
        let targetId;
        if (targetOption) {
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
        // Insert into DB
        await db.query(
            'INSERT INTO events (userId, description, eventTime, reminderOffsets, target, channelId, sentReminders) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [interaction.user.id, description, parseDate.toISOString(), JSON.stringify(reminders), targetId, interaction.channelId, '[]']
        );

        // Format display
        let reminderText = "";
        const preReminders = reminders.filter(r => r > 0);
        if (preReminders.length > 0) {
            reminderText = `\n🔔 Rappels : ${preReminders.map(r => `${r} min`).join(', ')} avant`;
        } else if (hasRemindersInput) {
            // User explicitly typed "0" or something that parsed to 0
            reminderText = "";
        } else {
            // Default case (no input) -> Don't show "Rappels" line, or just say basic.
            // User asked "j'aimerai ne pas afficher un 'Rappel: 0 minutes avant'"
            // So we show nothing specific about reminders, implying standard behavior.
        }

        await interaction.reply({ content: ` Événement planifié : **${description}**\n Date : ${parseDate.toLocaleString('fr-FR')}${reminderText}\n Cible : ${targetId === 'everyone' ? '@everyone' : `<@${targetId}>`}` });
    },
};
