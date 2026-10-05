const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const db = require('../db');

const EVENT_TYPE_EMOJI = { training: '🏋️', scrim: '⚔️', tournament: '🏆', meeting: '📋', general: '📅' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Annule un de vos événements planifiés'),

    // ── Step 1 : Show select menu ────────────────────────────────────────────
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // Only show events the user CREATED (they can't cancel others' events)
        const result    = await db.getUserEvents(interaction.guildId, interaction.user.id);
        const myEvents  = result.rows.filter(e => e.creator_id === interaction.user.id);

        if (myEvents.length === 0) {
            return interaction.editReply({
                content: '📭 Tu n\'as aucun événement planifié à annuler.\nUtilise `/schedule` pour en créer un !',
            });
        }

        const options = myEvents.slice(0, 25).map(e => {
            const emoji   = EVENT_TYPE_EMOJI[e.event_type] || '📅';
            const dateStr = new Date(e.event_time).toLocaleString('fr-FR', {
                timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short'
            });
            return {
                label:       `#${e.id} — ${e.title}`.slice(0, 100),
                description: dateStr.slice(0, 100),
                value:       String(e.id),
                emoji,
            };
        });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('cancel_select')
                .setPlaceholder('Choisis l\'événement à annuler...')
                .addOptions(options)
        );

        await interaction.editReply({
            content: '🗑️ **Quel événement veux-tu annuler ?**',
            components: [row],
        });
    },

    // ── Step 2 : Confirm with embed + buttons ────────────────────────────────
    async handleSelect(interaction) {
        const eventId = parseInt(interaction.values[0]);
        const res     = await db.getEventById(eventId);
        const event   = res.rows[0];

        if (!event || event.creator_id !== interaction.user.id) {
            return interaction.update({
                content:    '❌ Événement introuvable ou accès refusé.',
                components: [],
            });
        }

        const emoji   = EVENT_TYPE_EMOJI[event.event_type] || '📅';
        const dateStr = new Date(event.event_time).toLocaleString('fr-FR', {
            timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short'
        });

        const embed = new EmbedBuilder()
            .setColor(0xFF4444)
            .setTitle('🗑️ Confirmer l\'annulation')
            .setDescription('Es-tu sûr ? Cette action est **irréversible**.')
            .addFields(
                { name: `${emoji} Événement`,  value: event.title,   inline: true },
                { name: '📅 Date',              value: dateStr,        inline: true },
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`cancel_confirm_${eventId}`)
                .setLabel('Confirmer l\'annulation')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('cancel_abort')
                .setLabel('Garder l\'événement')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌'),
        );

        await interaction.update({ content: null, embeds: [embed], components: [row] });
    },

    // ── Step 3 : Delete or abort ─────────────────────────────────────────────
    async handleButton(interaction) {
        if (interaction.customId === 'cancel_abort') {
            return interaction.update({
                content:    '✅ Annulation abandonnée. L\'événement est conservé.',
                embeds:     [],
                components: [],
            });
        }

        if (interaction.customId.startsWith('cancel_confirm_')) {
            const eventId = parseInt(interaction.customId.replace('cancel_confirm_', ''));
            const res     = await db.getEventById(eventId);
            const event   = res.rows[0];

            if (!event || event.creator_id !== interaction.user.id) {
                return interaction.update({
                    content:    '❌ Événement introuvable ou accès refusé.',
                    embeds:     [],
                    components: [],
                });
            }

            await db.deleteEvent(eventId);

            return interaction.update({
                content:    `✅ L'événement **${event.title}** (\`#${event.id}\`) a été annulé.`,
                embeds:     [],
                components: [],
            });
        }
    },
};
