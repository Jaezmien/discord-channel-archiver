<div align="center">

# Discord Channel Archiver

Quickly archive channels using a bot account.

Exports into the .xlsx format, with every channel exported in its own sheet.

Fast archival via caching.

</div>

<hr>

## Difference from other archivers

This archiver creates a cache of the channel as it archives. When the script is ran again, it crawls up to the last seen cache message, instead of archiving the channel again.

This reduces the time needed to archive the channel, but this means that any changes in old messages (edits, deletions) are not accounted for.

If this doesn't suit your needs, it's recommended to use [Discord Chat Exporter](https://github.com/Tyrrrz/DiscordChatExporter) instead.

## Setup

```
$ git clone https://github.com/Jaezmien/DiscordChannelArchiver
$ yarn install
$ yarn start
```
