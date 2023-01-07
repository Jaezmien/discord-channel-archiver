import { TextChannel, ThreadChannel, Channel } from 'discord.js';

interface ExportMessage {
    MessageID: string;
    AuthorID: string;
    Author: string;
    Date: string;
    Content: string;
    Attachments: string;
    Reactions: string;
}
declare function fetch_new_messages(channel: TextChannel | ThreadChannel, latestMessageID?: string): Promise<ExportMessage[]>;
declare function archive_channel(channel: Channel, output_path: string, cache_path: string): Promise<boolean>;

export { archive_channel as default, fetch_new_messages };
