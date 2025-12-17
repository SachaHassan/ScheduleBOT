const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche le guide d\'utilisation du bot'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 Guide d\'utilisation de ScheduleBOT')
            .setDescription('Voici comment planifier vos événements simplement !')
            .addFields(
                { name: '📅 Commande principale', value: '`/schedule`' },
                {
                    name: '✍️ Format des Dates',
                    value: 'Le bot comprend le langage naturel (grâce à Chrono) :\n' +
                        '• "Demain à 18h"\n' +
                        '• "Lundi prochain à 9h30"\n' +
                        '• "Le 25 décembre à midi"\n' +
                        '• "Dans 2 heures"'
                },
                {
                    name: '⏰ Format des Rappels',
                    value: 'Vous pouvez définir plusieurs rappels séparés par des virgules :\n' +
                        '• `10m` (10 minutes avant)\n' +
                        '• `1h, 30m` (1 heure avant ET 30 minutes avant)\n' +
                        '• `1j` (1 jour avant)\n' +
                        '*Si vous laissez vide, aucun rappel "avant" ne sera envoyé, juste au moment de l\'événement.*'
                },
                {
                    name: '🎯 Cible',
                    value: '• **@everyone** : Mentionne tout le serveur (attention !)\n' +
                        '• **Vide** : Ne mentionne personne (vous recevez le ping si c\'est vous qui l\'avez créé, ou juste un message dans le channel).'
                }
            )
            .setFooter({ text: 'ScheduleBOT - Votre assistant planning' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
