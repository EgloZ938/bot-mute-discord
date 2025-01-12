require('dotenv').config();
const { Client, Events, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Création du client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Map pour stocker les messages requis pour chaque utilisateur
const requiredMessages = new Map();

// Fonction pour lire le fichier messages.json
async function readMessages() {
    try {
        const data = await fs.readFile('messages.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Fonction pour sauvegarder dans messages.json
async function saveMessages(messages) {
    await fs.writeFile('messages.json', JSON.stringify(messages, null, 2));
}

// Création des commandes slash
const commands = [
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute un utilisateur')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à mute')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('demute')
        .setDescription('Tente de se démute avec un message')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message de démute')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('addmessage')
        .setDescription('Ajoute un message de démute')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Le message à ajouter')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('listmessages')
        .setDescription('Liste tous les messages de démute')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('deletemessage')
        .setDescription('Supprime un message de démute')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option =>
            option.setName('index')
                .setDescription('L\'index du message à supprimer (utiliser /listmessages pour voir les index)')
                .setRequired(true)
        )
];

// Enregistrement des commandes
const rest = new REST({ version: '10' }).setToken(process.env.DS_TOKEN);

client.once(Events.ClientReady, async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Gestion des commandes slash
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // Gestion des nouvelles commandes admin
    if (commandName === 'addmessage') {
        const message = interaction.options.getString('message');
        const guildId = interaction.guild.id;

        const messages = await readMessages();
        if (!messages[guildId]) messages[guildId] = [];

        messages[guildId].push(message);
        await saveMessages(messages);

        await interaction.reply({
            content: `Message ajouté avec succès: "${message}"`,
            ephemeral: true
        });
    }

    if (commandName === 'listmessages') {
        const guildId = interaction.guild.id;
        const messages = await readMessages();

        if (!messages[guildId] || messages[guildId].length === 0) {
            const noMessagesEmbed = new EmbedBuilder()
                .setColor('#FF4136') // Rouge
                .setTitle('❌ Aucun Message')
                .setDescription('Aucun message de démute n\'a été configuré pour ce serveur.')
                .setFooter({ text: 'Utilisez /addmessage pour ajouter des messages' });

            return await interaction.reply({
                embeds: [noMessagesEmbed],
                ephemeral: true
            });
        }

        const messageList = messages[guildId]
            .map((msg, index) => `${index + 1}. "${msg}"`)
            .join('\n');

        await interaction.reply({
            content: `Messages de démute disponibles:\n${messageList}`,
            ephemeral: true
        });
    }

    if (commandName === 'deletemessage') {
        const index = interaction.options.getInteger('index') - 1;
        const guildId = interaction.guild.id;

        const messages = await readMessages();

        if (!messages[guildId] || !messages[guildId][index]) {
            const invalidIndexEmbed = new EmbedBuilder()
                .setColor('#FF4136') // Rouge
                .setTitle('❌ Index Invalide')
                .setDescription('L\'index spécifié n\'existe pas.')
                .setFooter({ text: 'Utilisez /listmessages pour voir les index disponibles' });

            return await interaction.reply({
                embeds: [invalidIndexEmbed],
                ephemeral: true
            });
        }

        const deletedMessage = messages[guildId][index];
        messages[guildId].splice(index, 1);
        await saveMessages(messages);

        await interaction.reply({
            content: `Message supprimé avec succès: "${deletedMessage}"`,
            ephemeral: true
        });
    }

    if (commandName === 'mute') {
        const targetUser = interaction.options.getUser('utilisateur');
        const member = await interaction.guild.members.fetch(targetUser.id);
        const mutedRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');
        const guildId = interaction.guild.id;

        if (!mutedRole) {
            const noRoleEmbed = new EmbedBuilder()
                .setColor('#FF4136') // Rouge
                .setTitle('❌ Rôle Manquant')
                .setDescription('Le rôle "Muted" n\'existe pas sur ce serveur!')
                .setFooter({ text: 'Créez d\'abord le rôle "Muted"' });

            return await interaction.reply({
                embeds: [noRoleEmbed],
                ephemeral: true
            });
        }

        const messages = await readMessages();
        if (!messages[guildId] || messages[guildId].length === 0) {
            const noConfiguredMessagesEmbed = new EmbedBuilder()
                .setColor('#FF4136') // Rouge
                .setTitle('❌ Aucun Message Configuré')
                .setDescription('Aucun message de démute n\'a été configuré pour ce serveur.')
                .setFooter({ text: 'Utilisez /addmessage pour ajouter des messages' });

            return await interaction.reply({
                embeds: [noConfiguredMessagesEmbed],
                ephemeral: true
            });
        }

        try {
            // Sélection d'un message aléatoire requis pour le démute
            const requiredMessage = messages[guildId][Math.floor(Math.random() * messages[guildId].length)];
            requiredMessages.set(targetUser.id, requiredMessage);

            await member.roles.add(mutedRole);

            if (member.voice.channel) {
                await member.voice.setMute(true);
            }

            await interaction.reply(`${targetUser.username} a été mute!`);

            try {
                await targetUser.send(`Pour être démute, tu dois utiliser la commande /demute avec exactement ce message :\n\`${requiredMessage}\``);
            } catch (dmError) {
                await interaction.followUp({
                    content: `⚠️ Je n'ai pas pu envoyer de message privé à ${targetUser.username}. Voici le message qu'il doit écrire pour être démute :\n\`${requiredMessage}\``,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: 'Une erreur est survenue lors du mute.',
                ephemeral: true
            });
        }
    }

    if (commandName === 'demute') {
        const message = interaction.options.getString('message');
        const member = interaction.member;
        const mutedRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');

        if (!member.roles.cache.has(mutedRole.id)) {
            return await interaction.reply({
                content: 'Tu n\'es pas mute!',
                ephemeral: true
            });
        }

        const requiredMessage = requiredMessages.get(member.user.id);

        if (!requiredMessage) {
            return await interaction.reply({
                content: 'Une erreur est survenue. Demande à un administrateur de te mute à nouveau.',
                ephemeral: true
            });
        }

        if (message === requiredMessage) {
            try {
                await member.roles.remove(mutedRole);

                if (member.voice.channel) {
                    await member.voice.setMute(false);
                }

                requiredMessages.delete(member.user.id);

                const demuteEmbed = new EmbedBuilder()
                    .setColor('#2ECC40') // Vert
                    .setTitle('🔊 Utilisateur Démute')
                    .setDescription(`**${member.user.username}** a été démute !`)
                    .addFields({ name: 'Message utilisé', value: `\`${message}\`` })
                    .setTimestamp();

                await interaction.reply({ embeds: [demuteEmbed] });
            } catch (error) {
                console.error(error);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF4136') // Rouge
                    .setTitle('❌ Erreur')
                    .setDescription('Une erreur est survenue lors du démute.')
                    .setTimestamp();

                await interaction.reply({
                    embeds: [errorEmbed],
                    ephemeral: true
                });
            }
        } else {
            const wrongMessageEmbed = new EmbedBuilder()
                .setColor('#FF851B') // Orange
                .setTitle('❌ Message Incorrect')
                .setDescription('Ce n\'est pas le bon message pour être démute !')
                .setFooter({ text: 'Essaie avec le message qui t\'a été donné' });

            await interaction.reply({
                embeds: [wrongMessageEmbed],
                ephemeral: true
            });
        }
    }
});

// Event listener pour les salons vocaux
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    // Si l'utilisateur rejoint un vocal ou change de vocal
    if (newState.channel) {
        const member = newState.member;
        const mutedRole = newState.guild.roles.cache.find(role => role.name === 'Muted');

        // Vérifie si l'utilisateur a le rôle Muted
        if (mutedRole && member.roles.cache.has(mutedRole.id)) {
            // Vérifie si l'utilisateur n'est pas déjà mute en vocal
            if (!newState.serverMute) {
                try {
                    await member.voice.setMute(true);
                } catch (error) {
                    console.error('Erreur lors du mute automatique:', error);
                }
            }
        }
    }
});

// Connexion du bot
client.login(process.env.DS_TOKEN);