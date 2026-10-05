const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const { getMemberAccess } = require('../utils/permissions');

const EVENT_TYPE_EMOJI = { training: '🏋️', scrim: '⚔️', tournament: '🏆', meeting: '📋', general: '📅' };
const EVENT_TYPE_LABEL = { training: 'Entraînement', scrim: 'Scrim', tournament: 'Tournoi', meeting: 'Réunion', general: 'Général' };

function getTimeUntil(date) {
    const diff    = date - Date.now();
    if (diff < 0) return 'passé';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60)  return `dans ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)    return `dans ${hours}h`;
    const days = Math.floor(hours / 24);
    return `dans ${days}j`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('myplanning')
        .setDescription('Affiche ton planning personnel (événements où tu es créateur ou cible)')
        .addUserOption(o => o
            .setName('joueur')
            .setDescription('Voir le planning d\'un autre joueur (managers et modérateurs seulement)')
            .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const access = getMemberAccess(interaction);
        if (!access.isMember) {
            return interaction.editReply({
                content: '⛔ Seuls les membres ayant le rôle **Member** peuvent consulter le planning.',
            });
        }

        const targetUser    = interaction.options.getUser('joueur') || interaction.user;
        const isOtherPlayer = targetUser.id !== interaction.user.id;

        if (isOtherPlayer && !access.isManager) {
            return interaction.editReply({
                content: '⛔ Seuls les **managers** ou **modérateurs** peuvent consulter le planning d\'un autre joueur.',
            });
        }

        const result = await db.getUserEvents(interaction.guildId, targetUser.id);
        const events = result.rows;

        // Split into "as creator" and "as target"
        const asCreator = events.filter(e => e.creator_id === targetUser.id);
        const asTarget  = events.filter(e => e.target_id   === targetUser.id && e.creator_id !== targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(0x00AA00)
            .setTitle(`📅 Planning de ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp();

        if (events.length === 0) {
            embed.setDescription(`Aucun événement à venir pour ${isOtherPlayer ? 'ce joueur' : 'toi'}.`);
        } else {
            embed.setDescription(
                `**${events.length} événement${events.length > 1 ? 's' : ''}** à venir`
            );
        }

        // ── Events as creator ──
        if (asCreator.length > 0) {
            const lines = asCreator.slice(0, 8).map(e => {
                const emoji   = EVENT_TYPE_EMOJI[e.event_type] || '📅';
                const label   = EVENT_TYPE_LABEL[e.event_type] || 'Général';
                const date    = new Date(e.event_time);
                const dateStr = date.toLocaleString('fr-FR', {
                    timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short'
                });
                return `${emoji} \`#${e.id}\` **${e.title}** *(${label})*\n   📅 ${dateStr} — *${getTimeUntil(date)}*`;
            }).join('\n');

            embed.addFields({
                name:  `✏️ Événements organisés (${asCreator.length})`,
                value: lines + (asCreator.length > 8 ? `\n*...et ${asCreator.length - 8} autre(s)*` : ''),
            });
        }

        // ── Events as target ──
        if (asTarget.length > 0) {
            const lines = asTarget.slice(0, 5).map(e => {
                const emoji   = EVENT_TYPE_EMOJI[e.event_type] || '📅';
                const label   = EVENT_TYPE_LABEL[e.event_type] || 'Général';
                const date    = new Date(e.event_time);
                const dateStr = date.toLocaleString('fr-FR', {
                    timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short'
                });
                return `${emoji} \`#${e.id}\` **${e.title}** *(${label})*\n   📅 ${dateStr} — *${getTimeUntil(date)}*\n   👤 Organisé par <@${e.creator_id}>`;
            }).join('\n');

            embed.addFields({
                name:  `🎯 Ciblé par (${asTarget.length})`,
                value: lines + (asTarget.length > 5 ? `\n*...et ${asTarget.length - 5} autre(s)*` : ''),
            });
        }

        embed.setFooter({ text: 'Utilisez /list pour voir le planning complet du serveur' });

        await interaction.editReply({ embeds: [embed] });
    },
};
