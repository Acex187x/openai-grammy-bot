import { Bot } from "grammy"
import { Message } from "grammy/out/types.node"
import { Configuration, CreateChatCompletionRequest, OpenAIApi } from "openai"
import { HistorySave } from "../bot/HistorySave"
import { BasicPrompt } from "../constants"
import { openai } from "../openai"
import { BotContext } from "../types"
import { checkIfMessageAddressedToBot } from "../utils"

export class ChatCompletion {
	bot: Bot<BotContext>

	constructor(bot: Bot<BotContext>) {
		this.bot = bot
	}

	async middleware(ctx: BotContext) {
		if (!ctx.message || !(ctx.message.text || ctx.message.caption)) return

		const message = ctx.message as Message

		const tgSaveUtil = new HistorySave(ctx)
		tgSaveUtil.saveMessage()

		const isMessageForBot = checkIfMessageAddressedToBot(message, ctx)

		if (!isMessageForBot) {
			return
		}

		let history
		if (message.reply_to_message) {
			history = tgSaveUtil.getReplyTree()
		} else {
			if (ctx.session.rememberContext) {
				history = tgSaveUtil.getHistory(process.env.HISTORY_LIMIT_TOKEN || 300)
			} else {
				history = tgSaveUtil.convertMessageToOpenAIChat(message)
			}
		}

		await ctx.replyWithChatAction("typing")
		const typingInterval = setInterval(async () => {
			await ctx.replyWithChatAction("typing")
		}, 2000)

		console.log([
			{
				role: "system",
				content: (ctx.session.promptStart || "") + `. ${BasicPrompt}`,
			},
			...history,
		])

		try {
			const completion = await openai.createChatCompletion(<
				CreateChatCompletionRequest
			>{
				model: process.env.MODEL || 'gpt-3.5-turbo',
				temperature: ctx.session.temperature,
				max_tokens: ctx.session.maxTokens,
				messages: [
					{
						role: "system",
						content:
							(ctx.session.promptStart || "") +
							`. ${BasicPrompt}`,
					},
					...history,
				],
			})

			if (
				!completion.data.choices[0] ||
				!completion.data.choices[0].message
			)
				return

			const reply = completion.data.choices[0].message.content

			const replyMessage = await ctx.reply(reply, {
				parse_mode: "Markdown",
				reply_to_message_id: message.message_id,
			})

			tgSaveUtil.saveMessage(replyMessage)
		} catch (err) {
			console.error(err)
		} finally {
			clearInterval(typingInterval)
		}
	}

	init() {
		this.bot.on("message", this.middleware)
	}
}
