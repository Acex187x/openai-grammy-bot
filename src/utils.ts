import { Message } from "grammy/out/types.node"
import { BotContext } from "./types"

export function checkIfMessageAddressedToBot(
	message: Message,
	ctx: BotContext
): boolean {
	if (!message) return false

	const text = message.text || message.caption || ""
	if (!text) return false
	if (message.chat.type === "private") return true
	if (text.toLowerCase().startsWith("разум")) return true
	if (text.toLowerCase().startsWith("mind")) return true
	if (text.toLowerCase().startsWith("the mind")) return true
	if (message.reply_to_message?.from?.id === ctx.me.id) return true

	return false
}
