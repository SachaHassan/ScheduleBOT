require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`  ✅ Commande chargée : ${command.data.name}`);
    } else {
        console.warn(`  ⚠️  ${file} — propriété "data" ou "execute" manquante, ignoré.`);
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        const guildId = process.env.GUILD_ID;

        if (guildId) {
            console.log(`\n🔄 Enregistrement INSTANTANÉ de ${commands.length} commande(s) sur le serveur (${guildId})...`);
            const data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands }
            );
            console.log(`✅ ${data.length} commande(s) enregistrée(s) instantanément sur le serveur !\n`);
        } else {
            console.log(`\n🔄 Enregistrement de ${commands.length} commande(s) slash (global)...`);
            const data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            console.log(`✅ ${data.length} commande(s) enregistrée(s) avec succès (propagation globale en cours) !\n`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement des commandes:', error);
        process.exit(1);
    }
})();
