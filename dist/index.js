// src/index.ts
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials
} from "discord.js";
import fs from "fs";
import path from "path";
import prompts from "prompts";
import sanitize from "sanitize-filename";
import { fileURLToPath } from "url";
import xlsx from "xlsx";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var ROOT_PATH = path.normalize(path.resolve(__dirname, "../")) + "/";
function format_message(msg) {
  const data = {
    MessageID: msg.id,
    AuthorID: msg.author?.id ?? "-1",
    Author: msg.author?.tag ?? "Deleted User#0000",
    Date: new Date(msg.createdTimestamp).toUTCString(),
    Content: "",
    Attachments: "",
    Reactions: ""
  };
  if (msg.cleanContent)
    data.Content = msg.cleanContent;
  else if (msg.embeds.length == 1) {
    const embed = msg.embeds[0];
    data.Content = [embed.title, embed.description, embed.footer?.text].filter((x) => x).join("\n");
  }
  if (msg.attachments) {
    data.Attachments = msg.attachments.map((att) => att.url).join(", ");
  }
  data.Reactions = Array.from(msg.reactions.cache).map(([, reaction]) => `${reaction.emoji.name} (${reaction.count})`).join(", ");
  return data;
}
async function fetch_new_messages(channel, latestMessageID) {
  const messages = [];
  if (!latestMessageID) {
    const firstMessageID = (await channel.messages.fetch({ limit: 1, after: "1" })).first()?.id;
    if (!firstMessageID)
      return messages;
    latestMessageID = firstMessageID;
  }
  const lastCachedMessageID = (await channel.messages.fetch({ limit: 1 })).first()?.id;
  if (latestMessageID === lastCachedMessageID)
    return messages;
  const PARTIAL_LIMIT = 100;
  let lastSearchedID = void 0;
  while (true) {
    const options = { limit: PARTIAL_LIMIT };
    if (lastSearchedID)
      options.before = lastSearchedID;
    const partial = await channel.messages.fetch(options);
    if (partial.size === 0)
      break;
    for (const partial_message of Array.from(partial)) {
      const [id, message] = partial_message;
      if (id === latestMessageID)
        break;
      messages.push(format_message(message));
    }
    lastSearchedID = partial.last().id;
    if (Array.from(partial).length != PARTIAL_LIMIT || partial.get(latestMessageID))
      break;
  }
  messages.reverse();
  return messages;
}
function mkdir(dir) {
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir);
}
function create_worksheet(dir, sheets) {
  const workBook = xlsx.utils.book_new();
  for (const sheet of sheets)
    xlsx.utils.book_append_sheet(workBook, sheet.content, sheet.title);
  xlsx.writeFile(workBook, dir);
}
async function archive_channel(channel, output_path, cache_path) {
  mkdir(output_path);
  mkdir(cache_path);
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildForum)
    return false;
  const GUILD_PATH = path.join(output_path, channel.guild.name);
  mkdir(GUILD_PATH);
  if (channel.type === ChannelType.GuildText) {
    const CHANNELS_PATH = path.join(GUILD_PATH, "Channels");
    mkdir(CHANNELS_PATH);
    const CHANNEL_PATH = path.join(CHANNELS_PATH, `${sanitize(channel.name)} - ${channel.id}`);
    mkdir(CHANNEL_PATH);
    const CHANNEL_CACHE_PATH = path.join(cache_path, channel.id + ".json");
    let CHANNEL_CACHE = {
      name: channel.name,
      messages: []
    };
    if (fs.existsSync(CHANNEL_CACHE_PATH)) {
      CHANNEL_CACHE = JSON.parse(fs.readFileSync(CHANNEL_CACHE_PATH, "utf-8"));
    } else {
      fs.writeFileSync(CHANNEL_CACHE_PATH, JSON.stringify(CHANNEL_CACHE));
    }
    const messages = await fetch_new_messages(
      channel,
      CHANNEL_CACHE.messages[CHANNEL_CACHE.messages.length - 1]?.MessageID
    );
    if (messages.length) {
      CHANNEL_CACHE.messages.push(...messages);
      fs.writeFileSync(CHANNEL_CACHE_PATH, JSON.stringify(CHANNEL_CACHE));
      create_worksheet(path.join(CHANNEL_PATH, "messages.xlsx"), [
        { title: CHANNEL_CACHE.name, content: xlsx.utils.json_to_sheet(CHANNEL_CACHE.messages) }
      ]);
    }
    await channel.threads.fetchActive();
    await channel.threads.fetchArchived();
    const threads = Array.from(channel.threads.cache.keys());
    if (threads.length) {
      const thread_worksheets = [];
      for (const threadID of threads) {
        const thread = channel.threads.cache.get(threadID);
        if (!thread)
          continue;
        const THREAD_CACHE_PATH = path.join(cache_path, thread.id + ".json");
        let THREAD_CACHE = {
          name: thread.name,
          messages: []
        };
        if (fs.existsSync(THREAD_CACHE_PATH)) {
          THREAD_CACHE = JSON.parse(fs.readFileSync(THREAD_CACHE_PATH, "utf-8"));
        } else {
          fs.writeFileSync(THREAD_CACHE_PATH, JSON.stringify(THREAD_CACHE));
        }
        const messages2 = await fetch_new_messages(
          thread,
          THREAD_CACHE.messages[THREAD_CACHE.messages.length - 1]?.MessageID
        );
        const starterMessage = await thread.fetchStarterMessage();
        if (starterMessage)
          messages2.unshift(format_message(starterMessage));
        if (messages2.length) {
          THREAD_CACHE.messages.push(...messages2);
          fs.writeFileSync(THREAD_CACHE_PATH, JSON.stringify(THREAD_CACHE));
          thread_worksheets.push({
            title: THREAD_CACHE.name,
            content: xlsx.utils.json_to_sheet(THREAD_CACHE.messages)
          });
        }
      }
      if (thread_worksheets.length) {
        create_worksheet(path.join(CHANNEL_PATH, "threads.xlsx"), thread_worksheets);
      }
    }
  } else if (channel.type === ChannelType.GuildForum) {
    const FORUMS_PATH = path.join(GUILD_PATH, "Forums");
    mkdir(FORUMS_PATH);
    await channel.threads.fetchActive();
    await channel.threads.fetchArchived();
    const posts = Array.from(channel.threads.cache.keys());
    for (const postID of posts) {
      const post = channel.threads.cache.get(postID);
      if (!post)
        continue;
      const POST_CACHE_PATH = path.join(cache_path, post.id + ".json");
      let POST_CACHE = {
        name: post.name,
        messages: []
      };
      if (fs.existsSync(POST_CACHE_PATH)) {
        POST_CACHE = JSON.parse(fs.readFileSync(POST_CACHE_PATH, "utf-8"));
      } else {
        fs.writeFileSync(POST_CACHE_PATH, JSON.stringify(POST_CACHE));
      }
      const messages = await fetch_new_messages(
        post,
        POST_CACHE.messages[POST_CACHE.messages.length - 1]?.MessageID
      );
      const starterMessage = await post.fetchStarterMessage();
      if (starterMessage)
        messages.unshift(format_message(starterMessage));
      if (messages.length) {
        POST_CACHE.messages.push(...messages);
        fs.writeFileSync(POST_CACHE_PATH, JSON.stringify(POST_CACHE));
        create_worksheet(path.join(FORUMS_PATH, `${sanitize(post.name)} - ${post.id}.xlsx`), [
          { title: POST_CACHE.name, content: xlsx.utils.json_to_sheet(POST_CACHE.messages) }
        ]);
      }
    }
  }
  return true;
}
function main(client) {
  return new Promise(async (res, rej) => {
    const OUTPUT_PATH = path.join(ROOT_PATH, "output/");
    mkdir(OUTPUT_PATH);
    const CACHE_PATH = path.join(ROOT_PATH, ".cache/");
    mkdir(CACHE_PATH);
    function cancel_prompt() {
      rej("\u{1F4A5} Operation cancelled");
      throw new Error("\u{1F4A5} Operation cancelled");
    }
    const { botToken } = await prompts(
      {
        type: "invisible",
        name: "botToken",
        message: "\u{1F916} Enter bot token"
      },
      {
        onCancel: cancel_prompt
      }
    );
    await client.login(botToken);
    client.on("ready", async () => {
      if (!client.user)
        throw Error("An error has occured while trying to log in.");
      console.log("Logged in as " + client.user.username);
      const guilds = await client.guilds.fetch();
      const { guildID } = await prompts(
        {
          type: "select",
          name: "guildID",
          message: "\u{1F5C3} Pick a server",
          choices: guilds.map((guild) => ({
            title: guild.name,
            value: guild.id
          }))
        },
        {
          onCancel: cancel_prompt
        }
      );
      const CURRENT_GUILD = client.guilds.cache.get(guildID);
      if (CURRENT_GUILD === void 0)
        throw Error("An error has occured while trying to fetch the guild");
      const GUILD_PATH = path.join(OUTPUT_PATH, CURRENT_GUILD.name);
      mkdir(GUILD_PATH);
      const guild_channels = await CURRENT_GUILD.channels.fetch();
      const { channelIDs } = await prompts(
        {
          type: "multiselect",
          name: "channelIDs",
          message: "\u{1F4F0} Pick the channels to archive",
          choices: guild_channels.filter(
            (channel) => channel && [ChannelType.GuildText, ChannelType.GuildForum].includes(channel.type)
          ).sort((a, b) => a.name.localeCompare(b.name)).map((channel) => ({
            title: `${channel.type === ChannelType.GuildForum ? "\u{1F5C3}" : "\u{1F4C2}"} ${channel.name} - ${channel.id}`,
            value: channel.id
          })),
          min: 1
        },
        {
          onCancel: cancel_prompt
        }
      );
      for (const channelID of channelIDs) {
        const channel = client.channels.cache.get(channelID);
        if (!channel)
          continue;
        await archive_channel(channel, OUTPUT_PATH, CACHE_PATH);
      }
      res();
    });
  });
}
if (import.meta.url.startsWith("file:") && process.argv[1] === __filename) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Reaction]
  });
  main(client).catch(console.error).finally(() => client.destroy());
}
export {
  archive_channel as default,
  fetch_new_messages
};
