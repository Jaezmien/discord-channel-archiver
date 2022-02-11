const { Client, Intents } = require('discord.js')
const prompts = require('prompts')
const xlsx = require('xlsx')
const fs = require('fs')

function format_message(id, msg) {
	const data = {
		MessageID: id,
		AuthorID: msg.author?.id ?? '-1',
		Author: msg.author?.tag ?? 'Deleted User#0000',
		Date: new Date(msg.createdTimestamp).toUTCString(),
		Content: '',
		Attachments: '',
		Reactions: '',
	}

	if (msg.cleanContent) data.Content = msg.cleanContent
	else if (msg.embeds.length && msg.embeds[0].type === 'rich') {
		const embed = msg.embeds[0]
		data.Content = [embed.title, embed.description].filter((x) => x).join('\n')
	}

	if (msg.attachments) {
		data.Attachments = msg.attachments.map((att) => att.url).join(', ')
	}

	data.Reactions = Array.from(msg.reactions.cache)
		.map(([id, reaction]) => {
			return `${reaction.emoji.name} (${reaction.count})`
		})
		.join(', ')

	return data
}

const client = new Client({
	intents: [
		Intents.FLAGS.GUILDS,
		Intents.FLAGS.GUILD_MESSAGES,
		Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
		Intents.FLAGS.GUILD_MEMBERS,
	],
	partials: ['MESSAGE', 'REACTION'],
})

async function main() {
	if (!fs.existsSync('output/')) fs.mkdirSync('output/')

	const { botToken } = await prompts(
		{
			type: 'invisible',
			name: 'botToken',
			message: 'Enter bot token',
		},
		{
			onCancel() {
				throw new Error('💥 Operation cancelled')
			},
		}
	)

	await client.login(botToken)
	console.log('Logged in as ' + client.user.username)

	const guilds = await client.guilds.fetch()
	const { serverID } = await prompts(
		{
			type: 'select',
			name: 'serverID',
			message: 'Pick a server',
			choices: guilds.map((guild) => ({
				title: guild.name,
				value: guild.id,
			})),
		},
		{
			onCancel() {
				throw new Error('💥 Operation cancelled')
			},
		}
	)

	const GUILD_NAME = client.guilds.cache.get(serverID).name
	if (!fs.existsSync(`output/${GUILD_NAME}`)) fs.mkdirSync(`output/${GUILD_NAME}`)

	const guild_channels = await client.guilds.cache.get(serverID).channels.fetch()
	const { channelIDs } = await prompts(
		{
			type: 'multiselect',
			name: 'channelIDs',
			message: 'Pick the channels to archive',
			choices: guild_channels
				.filter((channel) => channel.type === 'GUILD_TEXT')
				.sort((a, b) => {
					return a.name.localeCompare(b.name)
				})
				.map((channel) => ({
					title: channel.name,
					value: channel.id,
				})),
			min: 1,
		},
		{
			onCancel() {
				throw new Error('💥 Operation cancelled')
			},
		}
	)

	for (const channelID of channelIDs) {
		const channel = client.channels.cache.get(channelID)
		const channelName = channel.name

		let stop_id
		if (fs.existsSync(`output/${GUILD_NAME}/${channelID}.cache`)) {
			const cache = JSON.parse(fs.readFileSync(`output/${GUILD_NAME}/${channelID}.cache`))
			stop_id = cache[cache.length - 1].MessageID
		} else {
			const firstMessage = (await channel.messages.fetch({ limit: 1, after: 1 })).first()
			if (!firstMessage) {
				console.log('❎ ' + channelName + ' is empty')
				fs.writeFileSync(`output/${GUILD_NAME}/${channelID}.cache`, '[]')
				continue
			}
			stop_id = firstMessage.id
		}

		let lastMessageID = (await channel.messages.fetch({ limit: 1 })).first().id
		if (stop_id === lastMessageID) {
			console.log('✅ ' + channelName + ' is up-to-date')
			continue
		}

		console.log('🗄 Archiving ' + channelName)

		const LIMIT = 999999
		const PARTIAL_LIMIT = 100
		const messages = []
		let lastSeenCount = 500
		{
			let last_id

			while (true) {
				if (messages.length >= lastSeenCount) {
					console.log(messages.length + ' messages deep...')
					lastSeenCount += 500
				}

				const options = { limit: PARTIAL_LIMIT }
				if (last_id) options.before = last_id

				const partial = await channel.messages.fetch(options)

				for (const part of Array.from(partial)) {
					const [id, msg] = part

					// We found the latest cached message
					if (id === stop_id) break

					messages.push(format_message(id, msg))
				}

				last_id = partial.last().id

				// 1. Fetch is lower than partial fetch limit (which means we are at the end)
				// 2. We reached our limit
				// 3. Fetch contains first message
				if (Array.from(partial).length != PARTIAL_LIMIT || messages.length >= LIMIT || partial.get(stop_id))
					break
			}
		}

		// Sort messages from old to new
		messages.reverse()

		if (fs.existsSync(`output/${GUILD_NAME}/${channelID}.cache`)) {
			const cache = JSON.parse(fs.readFileSync(`output/${GUILD_NAME}/${channelID}.cache`)) // message[]
			cache.push(...messages)
			fs.writeFileSync(`output/${GUILD_NAME}/${channelID}.cache`, JSON.stringify(cache))
		} else {
			fs.writeFileSync(`output/${GUILD_NAME}/${channelID}.cache`, JSON.stringify(messages))
		}
	}

	// Create all-in-one .xlsx file
	const filename = `${client.guilds.cache.get(serverID).name.replace(/\s/g, '_')}-${new Date()
		.toISOString()
		.replace(/[\:]/g, '_')
		.replace(/(\..+)/, '')}.xlsx`

	const workBook = xlsx.utils.book_new()
	for (const channelID of channelIDs) {
		const cache = JSON.parse(fs.readFileSync(`output/${GUILD_NAME}/${channelID}.cache`))
		const sheet = xlsx.utils.json_to_sheet(cache)
		xlsx.utils.book_append_sheet(workBook, sheet, client.channels.cache.get(channelID).name)
	}
	xlsx.writeFile(workBook, `output/${GUILD_NAME}/${filename}`)

	client.destroy()
}

main().catch((err) => {
	console.error(err)
	if (client.isReady()) client.destroy()
})
