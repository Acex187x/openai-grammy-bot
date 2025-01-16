import { Message } from "grammy/out/types.node"
import { BotContext } from "./types"
import { CallSigns, ServicePrompts } from "./constants"
import axios from "axios"

export function checkReplyType(ctx: BotContext): (keyof typeof ServicePrompts) | null {
	const message = ctx.message as Message
	if (!message) return null

	const text = message.text || message.caption || ""
	if (!(text || message.photo)) return null

	if (message.chat.type === "private") return 'private-chat'
	if (
		CallSigns.reduce(
			(acc, sign) => acc || text.toLowerCase().startsWith(sign),
			false
		)
	)
		return 'group-callsign-reply'

	// Channel forwards in "Comment chat" of channel
	if (
		message.from.id === 777000 &&
		message.forward_from_chat.type === "channel"
	)
		return 'channel-post-comment'

	if (message.reply_to_message?.from?.id === ctx.me.id) {
		return 'group-reply-tree'
	}

	// 3% chance of responding to a message not addressed to the bot
	if (Math.random() < (parseInt(process.env.RANDOM_REPLY_CHANCE) || 0.03)) return 'group-random-reply'

	return null
}

export async function getImageAsBase64(imageUrl: string) {
  try {
    // Download the image using axios
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer'
    });

    // Convert the image buffer to base64
    const base64Image = Buffer.from(response.data, 'binary').toString('base64');
    
    // Return in the specific format: data:image/jpeg;base64,{base64_image}
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error) {
    console.error('Error downloading or converting image:', error);
    throw error;
  }
}
