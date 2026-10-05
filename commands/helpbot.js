const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('helpbot')
        .setDescription('Affiche le guide complet de ScheduleBOT'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x7289DA)
            .setTitle('📖 ScheduleBOT v2 — Esport Edition')
            .setDescription('Bot de planification pour structures esport. Toutes les données sont persistées en base de données.')
            .addFields(
                {
                    name: '📅 `/schedule`',
                    value:
                        '**Planifier un événement**\n' +
                        '• **Types** : 🏋️ Entraînement · ⚔️ Scrim · 🏆 Tournoi · 📋 Réunion · 📅 Général\n' +
                        '• **Dates** : langage naturel — *"demain à 20h"*, *"lundi 18h30"*, *"15 octobre 19h"*\n' +
                        '• **Rappels** : *"1j, 2h, 30m"* = rappel 1 jour avant, 2h avant, 30min avant\n' +
                        '• **Cible** : @rôle, @utilisateur, ou `everyone:Oui` pour @everyone',
                },
                {
                    name: '📋 `/list`',
                    value:
                        '**Planning du serveur** — Tous les événements à venir avec pagination.\n' +
                        'Affiche statut des rappels (⏳ en attente · ✅ envoyés)',
                },
                {
                    name: '🗑️ `/cancel`',
                    value:
                        '**Annuler un de tes événements** — Menu déroulant pour choisir, puis confirmation.',
                },
                {
                    name: '🗓️ `/myplanning`',
                    value:
                        '**Ton planning personnel** — Événements où tu es créateur ou cible.\n' +
                        '• `/myplanning joueur:@quelquun` — Voir le planning d\'un autre joueur',
                },
                {
                    name: '🌐 API Web (Futur Dashboard)',
                    value:
                        'Le bot expose une API REST pour le futur dashboard :\n' +
                        '• `GET /api/health` — Statut du bot\n' +
                        '• `GET /api/events?guild_id=xxx` — Tous les événements\n' +
                        '• `GET /api/players?guild_id=xxx` — Roster complet\n' +
                        '• `GET /api/players/:id/events?guild_id=xxx` — Planning d\'un joueur',
                },
                {
                    name: '🔧 `/debug-time`',
                    value: 'Afficher l\'heure du serveur (debug timezone)',
                },
            )
            .setFooter({ text: 'ScheduleBOT v2 — Esport Edition • Données persistées sur PostgreSQL' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
