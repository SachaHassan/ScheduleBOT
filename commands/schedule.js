const { SlashCommandBuilder, EmbedBuilder, Role } = require('discord.js');
const db = require('../db');
const chrono = require('chrono-node');
const { getMemberAccess } = require('../utils/permissions');

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_TYPES = {
    training:   { label: 'Entraînement', emoji: '🏋️', color: 0x00AA00 },
    scrim:      { label: 'Scrim',        emoji: '⚔️',  color: 0xFF6600 },
    tournament: { label: 'Tournoi',      emoji: '🏆',  color: 0xFFD700 },
    meeting:    { label: 'Réunion',      emoji: '📋',  color: 0x0099FF },
    general:    { label: 'Général',      emoji: '📅',  color: 0x7289DA },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseReminders(input) {
    const reminders = [];
    const parts = input.split(',').map(s => s.trim().toLowerCase());
    for (const part of parts) {
        const match = part.match(/^(\d+)\s*(j|d|jour|jours|h|heure|heures|m|min|minute|minutes)?$/);
        if (match) {
            const val = parseInt(match[1]);
            const unit = match[2] || 'm';
            let minutes;
            if (['j', 'd', 'jour', 'jours'].includes(unit)) minutes = val * 1440;
            else if (['h', 'heure', 'heures'].includes(unit))  minutes = val * 60;
            else                                                minutes = val;
            reminders.push(minutes);
        }
    }
    return reminders.length > 0 ? [...new Set(reminders)].sort((a, b) => b - a) : [0];
}

function formatOffset(minutes) {
    if (minutes === 0) return "au moment de l'événement";
    if (minutes < 60)   return `${minutes} min avant`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h avant`;
    return `${Math.floor(minutes / 1440)}j avant`;
}

// ─── Command ─────────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Planifie un événement pour ton équipe esport')
        .addStringOption(o => o
            .setName('titre')
            .setDescription('Nom de l\'événement (ex: "Scrim vs Team Alpha")')
            .setRequired(true)
            .setMaxLength(100))
        .addStringOption(o => o
            .setName('type')
            .setDescription('Type d\'événement')
            .setRequired(true)
            .addChoices(
                { name: '🏋️ Entraînement', value: 'training' },
                { name: '⚔️  Scrim',        value: 'scrim'    },
                { name: '🏆 Tournoi',       value: 'tournament'},
                { name: '📋 Réunion',       value: 'meeting'  },
                { name: '📅 Général',       value: 'general'  },
            ))
        .addStringOption(o => o
            .setName('date')
            .setDescription('Date/heure (ex: "demain à 20h", "lundi 18h30", "15 octobre 19h")')
            .setRequired(true))
        .addStringOption(o => o
            .setName('rappels')
            .setDescription('Rappels avant l\'event (ex: "1j, 2h, 30m"). Défaut : juste au moment J')
            .setRequired(false))
        .addStringOption(o => o
            .setName('description')
            .setDescription('Détails supplémentaires (adversaire, map pool, lien…)')
            .setRequired(false)
            .setMaxLength(500))
        .addMentionableOption(o => o
            .setName('cible')
            .setDescription('Qui pinger ? (@rôle ou @utilisateur). Vide = vous-même')
            .setRequired(false))
        .addBooleanOption(o => o
            .setName('everyone')
            .setDescription('Pinger @everyone ? (remplace la cible)')
            .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const access = getMemberAccess(interaction);
        if (!access.isMember) {
            return interaction.editReply({
                content: '⛔ Seuls les membres ayant le rôle **Member** peuvent utiliser le planificateur.',
            });
        }

        const titre       = interaction.options.getString('titre');
        const type        = interaction.options.getString('type');
        const dateInput   = interaction.options.getString('date');
        const rappelsInput = interaction.options.getString('rappels') || '0m';
        const descDetail  = interaction.options.getString('description') || '';
        const cible       = interaction.options.getMentionable('cible');
        const pingEveryone = interaction.options.getBoolean('everyone') ?? false;

        // ── Check permissions for targeting @everyone or roles ──
        if (pingEveryone && !access.isAdmin) {
            return interaction.editReply({
                content: '⛔ Seuls les modérateurs/administrateurs peuvent mentionner **@everyone**.',
            });
        }

        // ── Parse date ──
        const parsedDate = chrono.fr.parseDate(dateInput, new Date(), { forwardDate: true });
        if (!parsedDate) {
            return interaction.editReply({
                content: `❌ Date non reconnue : **"${dateInput}"**\n` +
                         `Essayez : "demain à 20h", "lundi 18h30", "15 octobre 19h"`,
            });
        }
        if (parsedDate < new Date()) {
            return interaction.editReply({
                content: `❌ La date est dans le passé (**${parsedDate.toLocaleString('fr-FR')}**).\nVérifiez et réessayez.`,
            });
        }

        // ── Parse reminders ──
        const reminders = parseReminders(rappelsInput);

        // ── Determine target ──
        let targetType = 'user';
        let targetId   = interaction.user.id;

        if (pingEveryone) {
            targetType = 'everyone';
            targetId   = 'everyone';
        } else if (cible) {
            // Role has .hexColor (and no .user), GuildMember/User has .user or .username
            const isRole = cible instanceof Role || ('hexColor' in cible && !('user' in cible));
            if (isRole) {
                // Mentioning roles or everyone requires Manager or Moderator
                if (!access.isManager) {
                    return interaction.editReply({
                        content: '⛔ Seuls les **managers** ou **modérateurs** peuvent programmer un rappel avec mention d\'équipe/rôle.',
                    });
                }

                // @everyone role has the same ID as the guild
                if (cible.id === interaction.guildId) {
                    if (!access.isAdmin) {
                        return interaction.editReply({
                            content: '⛔ Seuls les modérateurs/administrateurs peuvent mentionner **@everyone**.',
                        });
                    }
                    targetType = 'everyone';
                    targetId   = 'everyone';
                } else {
                    targetType = 'role';
                    targetId   = cible.id;
                }
            } else {
                // GuildMember or User
                const targetUserId = cible.user?.id ?? cible.id;
                // If pinging someone else, must be Manager or Moderator
                if (targetUserId !== interaction.user.id && !access.isManager) {
                    return interaction.editReply({
                        content: '⛔ Tu ne peux planifier un rappel que pour toi-même. Seuls les **managers** peuvent assigner des événements à d\'autres membres.',
                    });
                }
                targetType = 'user';
                targetId   = targetUserId;
            }
        }

        // ── Insert to DB ──
        const result = await db.createEvent({
            guildId:         interaction.guildId,
            creatorId:       interaction.user.id,
            channelId:       interaction.channelId,
            title:           titre,
            description:     descDetail,
            eventType:       type,
            eventTime:       parsedDate.toISOString(),
            reminderOffsets: JSON.stringify(reminders),
            targetType,
            targetId,
        });

        const eventId = result.rows[0].id;

        // ── Reply embed ──
        const typeInfo = EVENT_TYPES[type] || EVENT_TYPES.general;
        const dateStr = parsedDate.toLocaleString('fr-FR', {
            timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short'
        });

        let targetDisplay;
        if (targetType === 'everyone')  targetDisplay = '@everyone';
        else if (targetType === 'role') targetDisplay = `<@&${targetId}>`;
        else                            targetDisplay = `<@${targetId}>`;

        const embed = new EmbedBuilder()
            .setColor(typeInfo.color)
            .setTitle(`${typeInfo.emoji} Événement planifié — ${typeInfo.label}`)
            .addFields(
                { name: '📌 Titre',    value: titre,                              inline: true  },
                { name: '🆔 ID',       value: `\`#${eventId}\``,                  inline: true  },
                { name: '\u200b',      value: '\u200b',                            inline: true  },
                { name: '📅 Date',     value: dateStr,                             inline: false },
                { name: '⏰ Rappels',  value: reminders.map(formatOffset).join('\n'), inline: true },
                { name: '🎯 Cible',    value: targetDisplay,                       inline: true  },
            )
            .setFooter({ text: `Créé par ${interaction.user.username} • ScheduleBOT v2` })
            .setTimestamp();

        if (descDetail) {
            embed.addFields({ name: '📝 Détails', value: descDetail });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
