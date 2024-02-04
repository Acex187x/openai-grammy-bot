import { Message } from "grammy/out/types.node"
import { BotContext } from "./types"
import { CallSigns, ServicePrompts } from "./constants"

export function checkReplyType(ctx: BotContext): (keyof typeof ServicePrompts) | null {
	const message = ctx.message as Message
	if (!message) return null

	const text = message.text || message.caption || ""
	if (!text) return null

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

	// 0.5% chance of responding to a message not addressed to the bot
	if (Math.random() < 0.05) return 'group-random-reply'

	return null
}
