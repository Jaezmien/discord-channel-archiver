"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/index.ts
var src_exports = {};
__export(src_exports, {
  default: () => archive_channel,
  fetch_new_messages: () => fetch_new_messages
});
module.exports = __toCommonJS(src_exports);
var import_discord = require("discord.js");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_prompts = __toESM(require("prompts"));
var import_sanitize_filename = __toESM(require("sanitize-filename"));
var import_xlsx = __toESM(require("xlsx"));
var ROOT_PATH = import_path.default.normalize(import_path.default.resolve(__dirname, "../")) + "/";
function format_message(msg) {
  var _a, _b, _c, _d, _e;
  const data = {
    MessageID: msg.id,
    AuthorID: (_b = (_a = msg.author) == null ? void 0 : _a.id) != null ? _b : "-1",
    Author: (_d = (_c = msg.author) == null ? void 0 : _c.tag) != null ? _d : "Deleted User#0000",
    Date: new Date(msg.createdTimestamp).toUTCString(),
    Content: "",
    Attachments: "",
    Reactions: ""
  };
  if (msg.cleanContent)
    data.Content = msg.cleanContent;
  else if (msg.embeds.length == 1) {
    const embed = msg.embeds[0];
    data.Content = [embed.title, embed.description, (_e = embed.footer) == null ? void 0 : _e.text].filter((x) => x).join("\n");
  }
  if (msg.attachments) {
    data.Attachments = msg.attachments.map((att) => att.url).join(", ");
  }
  data.Reactions = Array.from(msg.reactions.cache).map(([, reaction]) => `${reaction.emoji.name} (${reaction.count})`).join(", ");
  return data;
}
function fetch_new_messages(channel, latestMessageID) {
  return __async(this, null, function* () {
    var _a, _b;
    const messages = [];
    if (!latestMessageID) {
      const firstMessageID = (_a = (yield channel.messages.fetch({ limit: 1, after: "1" })).first()) == null ? void 0 : _a.id;
      if (!firstMessageID)
        return messages;
      latestMessageID = firstMessageID;
    }
    const lastCachedMessageID = (_b = (yield channel.messages.fetch({ limit: 1 })).first()) == null ? void 0 : _b.id;
    if (latestMessageID === lastCachedMessageID)
      return messages;
    const PARTIAL_LIMIT = 100;
    let lastSearchedID = void 0;
    while (true) {
      const options = { limit: PARTIAL_LIMIT };
      if (lastSearchedID)
        options.before = lastSearchedID;
      const partial = yield channel.messages.fetch(options);
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
  });
}
function mkdir(dir) {
  if (!import_fs.default.existsSync(dir))
    import_fs.default.mkdirSync(dir);
}
function create_worksheet(dir, sheets) {
  const workBook = import_xlsx.default.utils.book_new();
  for (const sheet of sheets)
    import_xlsx.default.utils.book_append_sheet(workBook, sheet.content, sheet.title);
  import_xlsx.default.writeFile(workBook, dir);
}
function archive_channel(channel, output_path, cache_path) {
  return __async(this, null, function* () {
    var _a, _b, _c;
    mkdir(output_path);
    mkdir(cache_path);
    if (channel.type !== import_discord.ChannelType.GuildText && channel.type !== import_discord.ChannelType.GuildForum)
      return false;
    const GUILD_PATH = import_path.default.join(output_path, channel.guild.name);
    mkdir(GUILD_PATH);
    if (channel.type === import_discord.ChannelType.GuildText) {
      const CHANNELS_PATH = import_path.default.join(GUILD_PATH, "Channels");
      mkdir(CHANNELS_PATH);
      const CHANNEL_PATH = import_path.default.join(CHANNELS_PATH, `${(0, import_sanitize_filename.default)(channel.name)} - ${channel.id}`);
      mkdir(CHANNEL_PATH);
      const CHANNEL_CACHE_PATH = import_path.default.join(cache_path, channel.id + ".json");
      let CHANNEL_CACHE = {
        name: channel.name,
        messages: []
      };
      if (import_fs.default.existsSync(CHANNEL_CACHE_PATH)) {
        CHANNEL_CACHE = JSON.parse(import_fs.default.readFileSync(CHANNEL_CACHE_PATH, "utf-8"));
      } else {
        import_fs.default.writeFileSync(CHANNEL_CACHE_PATH, JSON.stringify(CHANNEL_CACHE));
      }
      const messages = yield fetch_new_messages(
        channel,
        (_a = CHANNEL_CACHE.messages[CHANNEL_CACHE.messages.length - 1]) == null ? void 0 : _a.MessageID
      );
      if (messages.length) {
        CHANNEL_CACHE.messages.push(...messages);
        import_fs.default.writeFileSync(CHANNEL_CACHE_PATH, JSON.stringify(CHANNEL_CACHE));
        create_worksheet(import_path.default.join(CHANNEL_PATH, "messages.xlsx"), [
          { title: CHANNEL_CACHE.name, content: import_xlsx.default.utils.json_to_sheet(CHANNEL_CACHE.messages) }
        ]);
      }
      yield channel.threads.fetchActive();
      yield channel.threads.fetchArchived();
      const threads = Array.from(channel.threads.cache.keys());
      if (threads.length) {
        const thread_worksheets = [];
        for (const threadID of threads) {
          const thread = channel.threads.cache.get(threadID);
          if (!thread)
            continue;
          const THREAD_CACHE_PATH = import_path.default.join(cache_path, thread.id + ".json");
          let THREAD_CACHE = {
            name: channel.name,
            messages: []
          };
          if (import_fs.default.existsSync(THREAD_CACHE_PATH)) {
            THREAD_CACHE = JSON.parse(import_fs.default.readFileSync(THREAD_CACHE_PATH, "utf-8"));
          } else {
            import_fs.default.writeFileSync(THREAD_CACHE_PATH, JSON.stringify(THREAD_CACHE));
          }
          const messages2 = yield fetch_new_messages(
            thread,
            (_b = THREAD_CACHE.messages[THREAD_CACHE.messages.length - 1]) == null ? void 0 : _b.MessageID
          );
          const starterMessage = yield thread.fetchStarterMessage();
          if (starterMessage)
            messages2.unshift(format_message(starterMessage));
          if (messages2.length) {
            THREAD_CACHE.messages.push(...messages2);
            import_fs.default.writeFileSync(THREAD_CACHE_PATH, JSON.stringify(THREAD_CACHE));
            thread_worksheets.push({
              title: THREAD_CACHE.name,
              content: import_xlsx.default.utils.json_to_sheet(THREAD_CACHE.messages)
            });
          }
        }
        if (thread_worksheets.length) {
          create_worksheet(import_path.default.join(CHANNEL_PATH, "threads.xlsx"), thread_worksheets);
        }
      }
    } else if (channel.type === import_discord.ChannelType.GuildForum) {
      const FORUMS_PATH = import_path.default.join(GUILD_PATH, "Forums");
      mkdir(FORUMS_PATH);
      yield channel.threads.fetchActive();
      yield channel.threads.fetchArchived();
      const posts = Array.from(channel.threads.cache.keys());
      for (const postID of posts) {
        const post = channel.threads.cache.get(postID);
        if (!post)
          continue;
        const POST_CACHE_PATH = import_path.default.join(cache_path, post.id + ".json");
        let POST_CACHE = {
          name: post.name,
          messages: []
        };
        if (import_fs.default.existsSync(POST_CACHE_PATH)) {
          POST_CACHE = JSON.parse(import_fs.default.readFileSync(POST_CACHE_PATH, "utf-8"));
        } else {
          import_fs.default.writeFileSync(POST_CACHE_PATH, JSON.stringify(POST_CACHE));
        }
        const messages = yield fetch_new_messages(
          post,
          (_c = POST_CACHE.messages[POST_CACHE.messages.length - 1]) == null ? void 0 : _c.MessageID
        );
        const starterMessage = yield post.fetchStarterMessage();
        if (starterMessage)
          messages.unshift(format_message(starterMessage));
        if (messages.length) {
          POST_CACHE.messages.push(...messages);
          import_fs.default.writeFileSync(POST_CACHE_PATH, JSON.stringify(POST_CACHE));
          create_worksheet(import_path.default.join(FORUMS_PATH, `${(0, import_sanitize_filename.default)(post.name)} - ${post.id}.xlsx`), [
            { title: POST_CACHE.name, content: import_xlsx.default.utils.json_to_sheet(POST_CACHE.messages) }
          ]);
        }
      }
    }
    return true;
  });
}
function main(client) {
  return new Promise((res, rej) => __async(this, null, function* () {
    const OUTPUT_PATH = import_path.default.join(ROOT_PATH, "output/");
    mkdir(OUTPUT_PATH);
    const CACHE_PATH = import_path.default.join(ROOT_PATH, ".cache/");
    mkdir(CACHE_PATH);
    function cancel_prompt() {
      rej("\u{1F4A5} Operation cancelled");
      throw new Error("\u{1F4A5} Operation cancelled");
    }
    const { botToken } = yield (0, import_prompts.default)(
      {
        type: "invisible",
        name: "botToken",
        message: "\u{1F916} Enter bot token"
      },
      {
        onCancel: cancel_prompt
      }
    );
    yield client.login(botToken);
    client.on("ready", () => __async(this, null, function* () {
      if (!client.user)
        throw Error("An error has occured while trying to log in.");
      console.log("Logged in as " + client.user.username);
      const guilds = yield client.guilds.fetch();
      const { guildID } = yield (0, import_prompts.default)(
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
      const GUILD_PATH = import_path.default.join(OUTPUT_PATH, CURRENT_GUILD.name);
      mkdir(GUILD_PATH);
      const guild_channels = yield CURRENT_GUILD.channels.fetch();
      const { channelIDs } = yield (0, import_prompts.default)(
        {
          type: "multiselect",
          name: "channelIDs",
          message: "\u{1F4F0} Pick the channels to archive",
          choices: guild_channels.filter(
            (channel) => channel && [import_discord.ChannelType.GuildText, import_discord.ChannelType.GuildForum].includes(channel.type)
          ).sort((a, b) => a.name.localeCompare(b.name)).map((channel) => ({
            title: `${channel.type === import_discord.ChannelType.GuildForum ? "\u{1F5C3}" : "\u{1F4C2}"} ${channel.name} - ${channel.id}`,
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
        yield archive_channel(channel, OUTPUT_PATH, CACHE_PATH);
      }
      res();
    }));
  }));
}
if (require.main === module) {
  const client = new import_discord.Client({
    intents: [
      import_discord.GatewayIntentBits.Guilds,
      import_discord.GatewayIntentBits.GuildMessages,
      import_discord.GatewayIntentBits.GuildMessageReactions,
      import_discord.GatewayIntentBits.GuildMembers
    ],
    partials: [import_discord.Partials.Message, import_discord.Partials.Reaction]
  });
  main(client).catch(console.error).finally(() => client.destroy());
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  fetch_new_messages
});
