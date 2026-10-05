const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

// ─── Constants ───────────────────────────────────────────────────────────────

const GAME_CHOICES = [
    { name: 'Counter-Strike 2',   value: 'CS2'          },
    { name: 'Valorant',           value: 'Valorant'     },
    { name: 'League of Legends',  value: 'LoL'          },
    { name: 'Rocket League',      value: 'Rocket League'},
    { name: 'Fortnite',           value: 'Fortnite'     },
    { name: 'Rainbow Six Siege',  value: 'R6'           },
    { name: 'Apex Legends',       value: 'Apex'         },
    { name: 'Overwatch 2',        value: 'OW2'          },
    { name: 'Autre',              value: 'Autre'        },
];

const GAME_EMOJI = {
    CS2: '🔫', Valorant: '🌀', LoL: '⚔️', 'Rocket League': '🚀',
    Fortnite: '🏗️', R6: '🛡️', Apex: '🎯', OW2: '🤖', Autre: '🎮',
};

const EVENT_TYPE_EMOJI = { training: '🏋️', scrim: '⚔️', tournament: '🏆', meeting: '📋', general: '📅' };

// ─── Command ─────────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roster')
        .setDescription('Gérer le roster de la structure esport')

        .addSubcommand(sub => sub
            .setName('ajouter')
            .setDescription('Ajouter ou mettre à jour un joueur dans le roster')
            .addUserOption(o => o.setName('joueur').setDescription('Membre Discord').setRequired(true))
            .addStringOption(o => o.setName('gamertag').setDescription('Pseudo in-game').setRequired(true))
            .addStringOption(o => o.setName('role').setDescription('Rôle dans l\'équipe (ex: IGL, AWPer, Support, Coach)').setRequired(true))
            .addStringOption(o => o.setName('jeu').setDescription('Jeu principal').setRequired(true)
                .addChoices(...GAME_CHOICES))
        )

        .addSubcommand(sub => sub
            .setName('retirer')
            .setDescription('Retirer un joueur du roster')
            .addUserOption(o => o.setName('joueur').setDescription('Membre Discord').setRequired(true))
        )

        .addSubcommand(sub => sub
            .setName('liste')
            .setDescription('Voir le roster complet du serveur')
            .addStringOption(o => o.setName('jeu').setDescription('Filtrer par jeu').setRequired(false)
                .addChoices(...GAME_CHOICES))
        )

        .addSubcommand(sub => sub
            .setName('profil')
            .setDescription('Voir le profil complet d\'un joueur')
            .addUserOption(o => o.setName('joueur').setDescription('Membre Discord').setRequired(true))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();

        // ── ajouter ──────────────────────────────────────────────────────────
        if (sub === 'ajouter') {
            const user     = interaction.options.getUser('joueur');
            const gamertag = interaction.options.getString('gamertag');
            const role     = interaction.options.getString('role');
            const game     = interaction.options.getString('jeu');

            await db.upsertPlayer({
                guildId:    interaction.guildId,
                userId:     user.id,
                gamertag,
                playerRole: role,
                game,
            });

            const emoji = GAME_EMOJI[game] || '🎮';
            const embed = new EmbedBuilder()
                .setColor(0x00AA00)
                .setTitle('✅ Joueur ajouté / mis à jour')
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: '👤 Discord',    value: `<@${user.id}>`, inline: true },
                    { name: `${emoji} Jeu`,  value: game,            inline: true },
                    { name: '\u200b',         value: '\u200b',        inline: true },
                    { name: '🎮 Gamertag',   value: gamertag,        inline: true },
                    { name: '⚡ Rôle',        value: role,            inline: true },
                )
                .setFooter({ text: 'ScheduleBOT v2 — Roster' });

            return interaction.editReply({ embeds: [embed] });
        }

        // ── retirer ──────────────────────────────────────────────────────────
        if (sub === 'retirer') {
            const user   = interaction.options.getUser('joueur');
            const result = await db.getPlayer(interaction.guildId, user.id);

            if (result.rows.length === 0) {
                return interaction.editReply({
                    content: `⚠️ **${user.username}** ne figure pas dans le roster.`,
                });
            }

            await db.removePlayer(interaction.guildId, user.id);
            return interaction.editReply({
                content: `✅ **${user.username}** a été retiré du roster.`,
            });
        }

        // ── liste ─────────────────────────────────────────────────────────────
        if (sub === 'liste') {
            const gameFilter = interaction.options.getString('jeu');
            const result     = await db.getPlayers(interaction.guildId);
            let players      = result.rows;

            if (gameFilter) {
                players = players.filter(p => p.game === gameFilter);
            }

            if (players.length === 0) {
                return interaction.editReply({
                    content: '📭 Le roster est vide' +
                             (gameFilter ? ` pour **${gameFilter}**` : '') +
                             '.\nUtilisez `/roster ajouter` pour enregistrer des joueurs.',
                });
            }

            // Group by game
            const byGame = {};
            for (const p of players) {
                if (!byGame[p.game]) byGame[p.game] = [];
                byGame[p.game].push(p);
            }

            const embed = new EmbedBuilder()
                .setColor(0x7289DA)
                .setTitle(`🏆 Roster — ${players.length} joueur${players.length > 1 ? 's' : ''}`)
                .setTimestamp()
                .setFooter({ text: 'ScheduleBOT v2 — Esport Edition' });

            for (const [game, gamePlayers] of Object.entries(byGame)) {
                const emoji = GAME_EMOJI[game] || '🎮';
                const lines = gamePlayers.map(p => {
                    const upcomingStr = p.upcoming_events > 0
                        ? ` • 📅 ${p.upcoming_events} event(s)`
                        : '';
                    return `<@${p.user_id}> **${p.gamertag}** *(${p.player_role})*${upcomingStr}`;
                }).join('\n');

                embed.addFields({
                    name:  `${emoji} ${game} — ${gamePlayers.length} joueur(s)`,
                    value: lines,
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }

        // ── profil ────────────────────────────────────────────────────────────
        if (sub === 'profil') {
            const user         = interaction.options.getUser('joueur');
            const playerResult = await db.getPlayer(interaction.guildId, user.id);
            const player       = playerResult.rows[0];
            const eventsResult = await db.getUserEvents(interaction.guildId, user.id);
            const events       = eventsResult.rows;

            const embed = new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle(`👤 Profil — ${user.username}`)
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'ScheduleBOT v2 — Roster' });

            if (player) {
                const emoji = GAME_EMOJI[player.game] || '🎮';
                embed.addFields(
                    { name: '🎮 Gamertag',  value: player.gamertag    || 'Non défini', inline: true },
                    { name: '⚡ Rôle',       value: player.player_role || 'Non défini', inline: true },
                    { name: `${emoji} Jeu`, value: player.game         || 'Non défini', inline: true },
                );
            } else {
                embed.addFields({
                    name:  '⚠️ Roster',
                    value: 'Ce joueur n\'est pas enregistré dans le roster.\nUtilisez `/roster ajouter` pour l\'ajouter.',
                });
            }

            if (events.length > 0) {
                const eventLines = events.slice(0, 6).map(e => {
                    const emoji   = EVENT_TYPE_EMOJI[e.event_type] || '📅';
                    const date    = new Date(e.event_time);
                    const dateStr = date.toLocaleString('fr-FR', {
                        timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short'
                    });
                    const role = e.creator_id === user.id ? '✏️' : '🎯';
                    return `${role} ${emoji} **${e.title}** — ${dateStr}`;
                }).join('\n');

                embed.addFields({
                    name:  `📅 Prochains événements (${Math.min(events.length, 6)}/${events.length})`,
                    value: eventLines,
                });
            } else {
                embed.addFields({ name: '📅 Événements', value: 'Aucun événement à venir.' });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
};
