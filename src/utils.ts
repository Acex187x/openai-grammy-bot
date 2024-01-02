import { Message } from "grammy/out/types.node"
import { BotContext } from "./types"
import { CallSigns } from "./constants"

export function checkIfMessageAddressedToBot(
	message: Message,
	ctx: BotContext
): boolean {
	if (!message) return false

	const text = message.text || message.caption || ""
	if (!text) return false
	if (message.chat.type === "private") return true
	if (CallSigns.reduce((acc, sign) => acc || text.toLowerCase().startsWith(sign), false)) return true

	// 0.5% chance of responding to a message not addressed to the bot
	if (Math.random() < 0.005) return true

	return message.reply_to_message?.from?.id === ctx.me.id;
}
