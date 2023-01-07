import {
	Channel,
	ChannelType,
	Client,
	FetchMessagesOptions,
	GatewayIntentBits,
	Message,
	Partials,
	TextChannel,
	ThreadChannel,
} from 'discord.js'
import fs from 'fs'
import path from 'path'
import prompts from 'prompts'
import sanitize from 'sanitize-filename'
import xlsx from 'xlsx'

const ROOT_PATH = path.normalize(path.resolve(__dirname, '../')) + '/'

interface ExportMessage {
	MessageID: string
	AuthorID: string
	Author: string
	Date: string
	Content: string
	Attachments: string
	Reactions: string
}
function format_message(id: string, msg: Message): ExportMessage {
	const data = {
		MessageID: id,
		AuthorID: msg.author?.id ?? '-1',
		Author: msg.author?.tag ?? 'Deleted User#0000',
		Date: new Date(msg.createdTimestamp).toUTCString(),
		Content: '',
		Attachments: '',
		Reactions: '',
	} as ExportMessage

	if (msg.cleanContent) data.Content = msg.cleanContent
	else if (msg.embeds.length == 1) {
		const embed = msg.embeds[0]
		data.Content = [embed.title, embed.description].filter((x) => x).join('\n')
	}

	if (msg.attachments) {
		data.Attachments = msg.attachments.map((att) => att.url).join(', ')
	}

	data.Reactions = Array.from(msg.reactions.cache)
		.map(([, reaction]) => `${reaction.emoji.name} (${reaction.count})`)
		.join(', ')

	return data
}
export async function fetch_new_messages(
	channel: TextChannel | ThreadChannel,
	latestMessageID?: string
): Promise<ExportMessage[]> {
	const messages: ExportMessage[] = []

	if (!latestMessageID) {
		const firstMessageID = (await channel.messages.fetch({ limit: 1, after: '1' })).first()?.id
		if (!firstMessageID) return messages

		latestMessageID = firstMessageID
	}

	const lastCachedMessageID = (await channel.messages.fetch({ limit: 1 })).first()?.id
	if (latestMessageID === lastCachedMessageID) return messages

	const PARTIAL_LIMIT = 100
	let lastSearchedID: string | undefined = undefined
	while (true) {
		const options: FetchMessagesOptions = { limit: PARTIAL_LIMIT }
		if (lastSearchedID) options.before = lastSearchedID

		const partial = await channel.messages.fetch(options)
		if (partial.size === 0) break

		for (const partial_message of Array.from(partial)) {
			const [id, message] = partial_message

			if (id === latestMessageID) break
			messages.push(format_message(id, message))
		}

		lastSearchedID = partial.last()!.id

		// 1. Fetch is lower than partial fetch limit (which means we are at the end)
		// 2. Fetch contains first message
		if (Array.from(partial).length != PARTIAL_LIMIT || partial.get(latestMessageID)) break
	}

	// Sort from old to new
	messages.reverse()

	return messages
}

function mkdir(dir: string) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir)
}

interface ArchiveSheet {
	title: string
	content: xlsx.WorkSheet
}
function create_worksheet(dir: string, sheets: ArchiveSheet[]) {
	const workBook = xlsx.utils.book_new()
	for (const sheet of sheets) xlsx.utils.book_append_sheet(workBook, sheet.content, sheet.title)
	xlsx.writeFile(workBook, dir)
}

interface ChannelCache {
	name: string
	messages: ExportMessage[]
}
export default async function archive_channel(
	channel: Channel,
	output_path: string,
	cache_path: string
): Promise<boolean> {
	mkdir(output_path)
	mkdir(cache_path)

	if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildForum) return false

	const GUILD_PATH = path.join(output_path, channel.guild.name)
	mkdir(GUILD_PATH)

	if (channel.type === ChannelType.GuildText) {
		const CHANNELS_PATH = path.join(GUILD_PATH, 'Channels')
		mkdir(CHANNELS_PATH)

		const CHANNEL_PATH = path.join(CHANNELS_PATH, `${sanitize(channel.name)} - ${channel.id}`)
		mkdir(CHANNEL_PATH)

		const CHANNEL_CACHE_PATH = path.join(cache_path, channel.id + '.json')
		let CHANNEL_CACHE = {
			name: channel.name,
			messages: [],
		} as ChannelCache

		if (fs.existsSync(CHANNEL_CACHE_PATH)) {
			CHANNEL_CACHE = JSON.parse(fs.readFileSync(CHANNEL_CACHE_PATH, 'utf-8')) as ChannelCache
		} else {
			fs.writeFileSync(CHANNEL_CACHE_PATH, JSON.stringify(CHANNEL_CACHE))
		}

		const messages = await fetch_new_messages(
			channel,
			CHANNEL_CACHE.messages[CHANNEL_CACHE.messages.length - 1]?.MessageID
		)

		if (messages.length) {
			CHANNEL_CACHE.messages.push(...messages)
			fs.writeFileSync(CHANNEL_CACHE_PATH, JSON.stringify(CHANNEL_CACHE))

			create_worksheet(path.join(CHANNEL_PATH, 'messages.xlsx'), [
				{ title: CHANNEL_CACHE.name, content: xlsx.utils.json_to_sheet(CHANNEL_CACHE.messages) },
			])
		}

		// -- Threads

		await channel.threads.fetchActive()
		await channel.threads.fetchArchived()
		const threads = Array.from(channel.threads.cache.keys())
		if (threads.length) {
			const thread_worksheets: ArchiveSheet[] = []
			for (const threadID of threads) {
				const thread = channel.threads.cache.get(threadID)
				if (!thread) continue

				const THREAD_CACHE_PATH = path.join(cache_path, thread.id + '.json')
				let THREAD_CACHE = {
					name: channel.name,
					messages: [],
				} as ChannelCache

				if (fs.existsSync(THREAD_CACHE_PATH)) {
					THREAD_CACHE = JSON.parse(fs.readFileSync(THREAD_CACHE_PATH, 'utf-8'))
				} else {
					fs.writeFileSync(THREAD_CACHE_PATH, JSON.stringify(THREAD_CACHE))
				}

				const messages = await fetch_new_messages(
					thread,
					THREAD_CACHE.messages[THREAD_CACHE.messages.length - 1]?.MessageID
				)

				if (messages.length) {
					THREAD_CACHE.messages.push(...messages)
					fs.writeFileSync(THREAD_CACHE_PATH, JSON.stringify(THREAD_CACHE))

					thread_worksheets.push({
						title: THREAD_CACHE.name,
						content: xlsx.utils.json_to_sheet(THREAD_CACHE.messages),
					})
				}
			}

			if (thread_worksheets.length) {
				create_worksheet(path.join(CHANNEL_PATH, 'threads.xlsx'), thread_worksheets)
			}
		}
	} else if (channel.type === ChannelType.GuildForum) {
		const FORUMS_PATH = path.join(GUILD_PATH, 'Forums')
		mkdir(FORUMS_PATH)

		await channel.threads.fetchActive()
		await channel.threads.fetchArchived()

		const posts = Array.from(channel.threads.cache.keys())

		for (const postID of posts) {
			const post = channel.threads.cache.get(postID)
			if (!post) continue

			const POST_CACHE_PATH = path.join(cache_path, post.id + '.json')
			let POST_CACHE = {
				name: post.name,
				messages: [],
			} as ChannelCache

			if (fs.existsSync(POST_CACHE_PATH)) {
				POST_CACHE = JSON.parse(fs.readFileSync(POST_CACHE_PATH, 'utf-8')) as ChannelCache
			} else {
				fs.writeFileSync(POST_CACHE_PATH, JSON.stringify(POST_CACHE))
			}

			const messages = await fetch_new_messages(
				post,
				POST_CACHE.messages[POST_CACHE.messages.length - 1]?.MessageID
			)

			if (messages.length) {
				POST_CACHE.messages.push(...messages)
				fs.writeFileSync(POST_CACHE_PATH, JSON.stringify(POST_CACHE))

				create_worksheet(path.join(FORUMS_PATH, `${sanitize(post.name)} - ${post.id}.xlsx`), [
					{ title: POST_CACHE.name, content: xlsx.utils.json_to_sheet(POST_CACHE.messages) },
				])
			}
		}
	}

	return true
}

function main(client: Client) {
	return new Promise<void>(async (res, rej) => {
		const OUTPUT_PATH = path.join(ROOT_PATH, 'output/')
		mkdir(OUTPUT_PATH)

		const CACHE_PATH = path.join(ROOT_PATH, '.cache/')
		mkdir(CACHE_PATH)

		function cancel_prompt() {
			rej('💥 Operation cancelled')
			throw new Error('💥 Operation cancelled')
		}

		const { botToken }: { botToken: string } = await prompts(
			{
				type: 'invisible',
				name: 'botToken',
				message: '🤖 Enter bot token',
			},
			{
				onCancel: cancel_prompt,
			}
		)

		await client.login(botToken)

		client.on('ready', async () => {
			if (!client.user) throw Error('An error has occured while trying to log in.')
			console.log('Logged in as ' + client.user.username)

			const guilds = await client.guilds.fetch()
			const { guildID }: { guildID: string } = await prompts(
				{
					type: 'select',
					name: 'guildID',
					message: '🗃 Pick a server',
					choices: guilds.map((guild) => ({
						title: guild.name,
						value: guild.id,
					})),
				},
				{
					onCancel: cancel_prompt,
				}
			)
			const CURRENT_GUILD = client.guilds.cache.get(guildID)
			if (CURRENT_GUILD === undefined) throw Error('An error has occured while trying to fetch the guild')
			const GUILD_PATH = path.join(OUTPUT_PATH, CURRENT_GUILD.name)
			mkdir(GUILD_PATH)

			const guild_channels = await CURRENT_GUILD.channels.fetch()
			const { channelIDs }: { channelIDs: string[] } = await prompts(
				{
					type: 'multiselect',
					name: 'channelIDs',
					message: '📰 Pick the channels to archive',
					choices: guild_channels
						.filter(
							(channel) =>
								channel && [ChannelType.GuildText, ChannelType.GuildForum].includes(channel.type)
						)
						.sort((a, b) => a!.name.localeCompare(b!.name))
						.map((channel) => ({
							title: `${channel!.type === ChannelType.GuildForum ? '🗃' : '📂'} ${channel!.name} - ${
								channel!.id
							}`,
							value: channel!.id,
						})),
					min: 1,
				},
				{
					onCancel: cancel_prompt,
				}
			)

			for (const channelID of channelIDs) {
				const channel = client.channels.cache.get(channelID)
				if (!channel) continue

				await archive_channel(channel, OUTPUT_PATH, CACHE_PATH)
			}

			res()
		})
	})
}

// Allow running as CLI
if (require.main === module) {
	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.GuildMembers,
		],
		partials: [Partials.Message, Partials.Reaction],
	})

	main(client)
		.catch(console.error)
		.finally(() => client.destroy())
}
