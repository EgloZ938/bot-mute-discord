require('dotenv').config();
const { Client, Events, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

function generateDefaultAvatarURL(servername) {
    const letter = servername.charAt(0).toUpperCase();
    // On utilise la couleur bleu-violet de Discord par défaut (#5865F2)
    const color = '5865F2';
    const encodedLetter = encodeURIComponent(letter);

    return `https://ui-avatars.com/api/?name=${encodedLetter}&color=fff&background=${color}&size=256&rounded=true&bold=true`;
}

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
        ),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche l\'aide et la configuration du bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    const serverInitial = interaction.guild.name.charAt(0).toUpperCase();
    const fallbackIconUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${serverInitial}&backgroundColor=random`;

    // Gestion des nouvelles commandes admin
    if (commandName === 'addmessage') {
        const message = interaction.options.getString('message');
        const guildId = interaction.guild.id;

        const messages = await readMessages();
        if (!messages[guildId]) messages[guildId] = [];

        messages[guildId].push(message);
        await saveMessages(messages);

        const addMessageEmbed = new EmbedBuilder()
            .setColor('#2ECC40') // Vert
            .setTitle('✅ Message Ajouté')
            .setDescription('Un nouveau message de démute a été ajouté avec succès !')
            .addFields({
                name: 'Nouveau message',
                value: `\`${message}\``
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [addMessageEmbed],
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

        const listMessagesEmbed = new EmbedBuilder()
            .setColor('#0074D9') // Bleu
            .setTitle('📝 Liste des Messages de Démute')
            .setDescription('Voici les messages disponibles pour le démute :')
            .addFields(
                messages[guildId].map((msg, index) => ({
                    name: `Message ${index + 1}`,
                    value: `\`${msg}\``,
                    inline: false
                }))
            )
            .setFooter({ text: 'Utilisez /deletemessage <numéro> pour supprimer un message' })
            .setTimestamp();

        await interaction.reply({
            embeds: [listMessagesEmbed],
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

        const deleteMessageEmbed = new EmbedBuilder()
            .setColor('#2ECC40') // Vert
            .setTitle('🗑️ Message Supprimé')
            .setDescription('Le message a été supprimé avec succès')
            .addFields({
                name: 'Message supprimé',
                value: `\`${deletedMessage}\``,
                inline: false
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [deleteMessageEmbed],
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

            // Message public de mute
            const muteEmbed = new EmbedBuilder()
                .setColor('#FF4136') // Rouge
                .setTitle('🔇 Utilisateur Mute')
                .setDescription(`**${member.displayName}** a été mute !`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
                .setFooter({
                    text: interaction.guild.name,
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || generateDefaultAvatarURL(interaction.guild.name)
                });

            await interaction.reply({ embeds: [muteEmbed] });

            // Message privé pour le démute
            const dmEmbed = new EmbedBuilder()
                .setColor('#0074D9') // Bleu
                .setTitle('🔄 Instructions de Démute')
                .setDescription(`Tu as été mute sur le serveur **${interaction.guild.name}**.\nPour être démute, utilise la commande \`/demute\` avec **exactement** ce message :`)
                .addFields({
                    name: 'Message à copier',
                    value: `\`${requiredMessage}\``,
                    inline: false
                })
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || generateDefaultAvatarURL(interaction.guild.name))
                .setTimestamp()
                .setFooter({
                    text: '⚠️ Le message doit être copié exactement comme il est écrit',
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || generateDefaultAvatarURL(interaction.guild.name)
                });

            try {
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (dmError) {
                const warningEmbed = new EmbedBuilder()
                    .setColor('#FF851B') // Orange
                    .setTitle('⚠️ Message Privé Non Envoyé')
                    .setDescription(`Impossible d'envoyer un message privé à **${targetUser.username}**`)
                    .addFields({
                        name: 'Message de démute à transmettre',
                        value: `\`${requiredMessage}\``,
                        inline: false
                    })
                    .setFooter({ text: 'Veuillez communiquer ce message à l\'utilisateur' });

                await interaction.followUp({
                    embeds: [warningEmbed],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error(error);
            const muteErrorEmbed = new EmbedBuilder()
                .setColor('#FF4136') // Rouge
                .setTitle('❌ Erreur')
                .setDescription('Une erreur est survenue lors du mute.')
                .setTimestamp();

            await interaction.reply({
                embeds: [muteErrorEmbed],
                ephemeral: true
            });
        }
    }

    if (commandName === 'demute') {
        const message = interaction.options.getString('message');
        const member = interaction.member;
        const mutedRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');

        if (!member.roles.cache.has(mutedRole.id)) {
            const notMutedEmbed = new EmbedBuilder()
                .setColor('#FF851B') // Orange
                .setTitle('❌ Non Mute')
                .setDescription('Tu n\'es pas mute !')
                .setFooter({ text: 'Cette commande est uniquement pour les utilisateurs mute' });

            return await interaction.reply({
                embeds: [notMutedEmbed],
                ephemeral: true
            });
        }

        const requiredMessage = requiredMessages.get(member.user.id);

        if (!requiredMessage) {
            const noDemuteMessageEmbed = new EmbedBuilder()
                .setColor('#FF4136') // Rouge
                .setTitle('❌ Erreur de Mute')
                .setDescription('Une erreur est survenue avec ton mute.')
                .addFields({
                    name: 'Solution',
                    value: 'Demande à un administrateur de te mute à nouveau.',
                    inline: false
                })
                .setTimestamp();

            return await interaction.reply({
                embeds: [noDemuteMessageEmbed],
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
                    .setDescription(`**${member.displayName}** a été démute !`)
                    .addFields({
                        name: 'Message utilisé',
                        value: `\`${message}\``
                    })
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp()
                    .setFooter({
                        text: interaction.guild.name,
                        iconURL: interaction.guild.iconURL({ dynamic: true }) || generateDefaultAvatarURL(interaction.guild.name)
                    });

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

    // Ajouter aux commandes existantes
    const commands = [
        // ... autres commandes existantes ...,
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Affiche l\'aide et la configuration du bot')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];

    // Dans le gestionnaire de commandes, ajouter :
    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0074D9')
            .setTitle('📚 Guide du Bot Mute')
            .setDescription('Voici tout ce que vous devez savoir pour configurer et utiliser le bot correctement.')
            .addFields(
                {
                    name: '⚙️ Configuration Requise',
                    value: [
                        '1️⃣ Créez un rôle nommé exactement `Muted`',
                        '2️⃣ Placez le rôle du bot au-dessus de tous les autres rôles dans les paramètres du serveur',
                        '3️⃣ Configurez au moins un message de démute avec `/addmessage`',
                        '4️⃣ Assurez-vous que le bot a les permissions : Gérer les rôles, Muter les membres'
                    ].join('\n')
                },
                {
                    name: '🛠️ Commandes Administrateur',
                    value: [
                        '`/mute <utilisateur>` - Mute un membre',
                        '`/addmessage <message>` - Ajoute un message de démute',
                        '`/listmessages` - Affiche tous les messages configurés',
                        '`/deletemessage <index>` - Supprime un message de démute',
                        '`/help` - Affiche ce message d\'aide'
                    ].join('\n')
                },
                {
                    name: '👥 Commandes Utilisateur',
                    value: '`/demute <message>` - Permet à un utilisateur muté de se démuter en tapant le bon message'
                },
                {
                    name: '🔄 Fonctionnement',
                    value: [
                        '1. Quand un admin mute quelqu\'un, un message aléatoire est choisi',
                        '2. L\'utilisateur reçoit le message en MP',
                        '3. Il doit utiliser `/demute` avec le message exact pour être démuté',
                        '4. Le mute s\'applique aussi automatiquement en vocal'
                    ].join('\n')
                },
                {
                    name: '⚠️ Important',
                    value: [
                        '• Le rôle Muted doit bloquer la permission "Envoyer des messages" dans tous les salons',
                        '• Si un utilisateur a ses MP fermés, le message sera envoyé dans le salon',
                        '• Les messages de démute sont spécifiques à chaque serveur'
                    ].join('\n')
                }
            )
            .setTimestamp()
            .setFooter({
                text: interaction.guild.name,
                iconURL: interaction.guild.iconURL({ dynamic: true }) || generateDefaultAvatarURL(interaction.guild.name)
            });

        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
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