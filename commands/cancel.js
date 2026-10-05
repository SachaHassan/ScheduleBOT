const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const db = require('../db');
const { getMemberAccess } = require('../utils/permissions');

const EVENT_TYPE_EMOJI = { training: '🏋️', scrim: '⚔️', tournament: '🏆', meeting: '📋', general: '📅' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Annule un événement planifié'),

    // ── Step 1 : Show select menu ────────────────────────────────────────────
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const access = getMemberAccess(interaction);
        if (!access.isMember) {
            return interaction.editReply({
                content: '⛔ Seuls les membres ayant le rôle **Member** peuvent utiliser cette commande.',
            });
        }

        // Admins can see and cancel all events, others only their own
        let eventsToCancel = [];
        if (access.isAdmin) {
            const result = await db.getUpcomingEvents(interaction.guildId);
            eventsToCancel = result.rows;
        } else {
            const result = await db.getUserEvents(interaction.guildId, interaction.user.id);
            eventsToCancel = result.rows.filter(e => e.creator_id === interaction.user.id);
        }

        if (eventsToCancel.length === 0) {
            return interaction.editReply({
                content: '📭 Aucun événement planifié à annuler.',
            });
        }

        const options = eventsToCancel.slice(0, 25).map(e => {
            const emoji   = EVENT_TYPE_EMOJI[e.event_type] || '📅';
            const dateStr = new Date(e.event_time).toLocaleString('fr-FR', {
                timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short'
            });
            const creatorTag = access.isAdmin && e.creator_id !== interaction.user.id ? ` [par <@${e.creator_id}>]` : '';
            return {
                label:       `#${e.id} — ${e.title}`.slice(0, 100),
                description: `${dateStr}${creatorTag}`.slice(0, 100),
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

        const access  = getMemberAccess(interaction);
        if (!event || (!access.isAdmin && event.creator_id !== interaction.user.id)) {
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

            const access  = getMemberAccess(interaction);
            if (!event || (!access.isAdmin && event.creator_id !== interaction.user.id)) {
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
