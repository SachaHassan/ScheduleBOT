const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const db = require('../db');

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

const EVENT_TYPE_EMOJI  = { training: '🏋️', scrim: '⚔️', tournament: '🏆', meeting: '📋', general: '📅' };
const EVENT_TYPE_LABEL  = { training: 'Entraînement', scrim: 'Scrim', tournament: 'Tournoi', meeting: 'Réunion', general: 'Général' };
const EVENT_TYPE_COLOR  = { training: 0x00AA00, scrim: 0xFF6600, tournament: 0xFFD700, meeting: 0x0099FF, general: 0x7289DA };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeUntil(date) {
    const diff = date - Date.now();
    if (diff < 0) return 'passé';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60)  return `dans ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)    return `dans ${hours}h`;
    const days = Math.floor(hours / 24);
    return `dans ${days}j`;
}

function formatTarget(event) {
    if (event.target_type === 'everyone') return '@everyone';
    if (event.target_type === 'role')     return `<@&${event.target_id}>`;
    return `<@${event.target_id}>`;
}

function formatReminderOffsets(offsetsJson, sentJson) {
    let offsets; try { offsets = JSON.parse(offsetsJson); } catch { offsets = [0]; }
    let sent;    try { sent    = JSON.parse(sentJson || '[]'); } catch { sent = []; }

    const pending = offsets.filter(o => !sent.includes(o));
    const done    = offsets.filter(o =>  sent.includes(o));

    const fmt = (m) => {
        if (m === 0)    return 'à J';
        if (m < 60)     return `${m}min`;
        if (m < 1440)   return `${Math.floor(m / 60)}h`;
        return `${Math.floor(m / 1440)}j`;
    };

    const parts = [];
    if (pending.length > 0) parts.push(`⏳ ${pending.map(fmt).join(', ')}`);
    if (done.length > 0)    parts.push(`✅ ${done.map(fmt).join(', ')}`);
    return parts.join(' | ') || '—';
}

// ─── Embed Builder ───────────────────────────────────────────────────────────

function buildListEmbed(events, page) {
    const total      = events.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const slice      = events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    // Pick color from the first event type on the page
    const firstType = slice[0]?.event_type || 'general';
    const color = EVENT_TYPE_COLOR[firstType] ?? 0x7289DA;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`📅 Planning — ${total} événement${total !== 1 ? 's' : ''} à venir`)
        .setFooter({ text: `Page ${page + 1} / ${totalPages} • ScheduleBOT v2` })
        .setTimestamp();

    if (slice.length === 0) {
        embed.setDescription('Aucun événement à venir.\nUtilisez `/schedule` pour en créer un !');
        return embed;
    }

    for (const event of slice) {
        const emoji     = EVENT_TYPE_EMOJI[event.event_type] || '📅';
        const typeLabel = EVENT_TYPE_LABEL[event.event_type] || 'Général';
        const date      = new Date(event.event_time);
        const dateStr   = date.toLocaleString('fr-FR', {
            timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short'
        });

        embed.addFields({
            name:  `${emoji} #${event.id} — ${event.title} *(${typeLabel})*`,
            value: [
                `📅 **${dateStr}** — *${getTimeUntil(date)}*`,
                `🎯 Cible : ${formatTarget(event)}  |  👤 <@${event.creator_id}>`,
                `⏰ ${formatReminderOffsets(event.reminder_offsets, event.sent_reminders)}`,
                event.description ? `📝 ${event.description}` : null,
            ].filter(Boolean).join('\n'),
        });
    }

    return embed;
}

function buildButtons(page, totalPages, guildId) {
    if (totalPages <= 1) return [];
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`list_prev_${guildId}_${page}`)
            .setLabel('◀ Précédent')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`list_next_${guildId}_${page}`)
            .setLabel('Suivant ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1),
    );
    return [row];
}

// ─── Command ─────────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription('Affiche les prochains événements planifiés du serveur'),

    async execute(interaction) {
        await interaction.deferReply();

        const result     = await db.getUpcomingEvents(interaction.guildId);
        const events     = result.rows;
        const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
        const embed      = buildListEmbed(events, 0);
        const buttons    = buildButtons(0, totalPages, interaction.guildId);

        await interaction.editReply({ embeds: [embed], components: buttons });
    },

    async handleButton(interaction) {
        // customId format: list_prev_<guildId>_<page>  OR  list_next_<guildId>_<page>
        const parts     = interaction.customId.split('_');
        const direction = parts[1];      // 'prev' | 'next'
        const guildId   = parts[2];
        const curPage   = parseInt(parts[3]);
        const newPage   = direction === 'next' ? curPage + 1 : curPage - 1;

        const result     = await db.getUpcomingEvents(guildId);
        const events     = result.rows;
        const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
        const embed      = buildListEmbed(events, newPage);
        const buttons    = buildButtons(newPage, totalPages, guildId);

        await interaction.update({ embeds: [embed], components: buttons });
    },
};
