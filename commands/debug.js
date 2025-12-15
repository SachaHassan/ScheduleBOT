const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-time')
        .setDescription('Affiche l\'heure du serveur pour débogage'),
    async execute(interaction) {
        const now = new Date();
        const options = { timeZone: 'Europe/Paris', timeZoneName: 'short' };

        await interaction.reply({
            content: `🕒 **Info Debug Serveur**
            
**Heure UTC (serveur)** : ${now.toISOString()}
**Heure Locale Serveur** : ${now.toString()}
**Heure "Europe/Paris"** : ${now.toLocaleString('fr-FR', options)}
**Timezone Offset** : ${now.getTimezoneOffset()} minutes
**Process TZ** : ${process.env.TZ || 'Non défini'}

Si tu vois que l'heure locale serveur n'est pas la tienne, c'est que la variable TZ n'a pas été prise en compte !`,
            ephemeral: true
        });
    },
};
