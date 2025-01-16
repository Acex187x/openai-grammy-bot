import { Bot } from "grammy"
import { Message } from "grammy/out/types.node"
import {
	ChatCompletionRequestMessage,
	ChatCompletionRequestMessageRoleEnum,
	Configuration,
	CreateChatCompletionRequest,
	OpenAIApi
} from "openai"
import { HistorySave } from "../bot/HistorySave"
import { BasicPrompt, ServicePrompts, SinglePrompt } from "../constants"
import { openai } from "../openai"
import { BotContext } from "../types"
import { checkReplyType } from "../utils"
import { encode } from "gpt-tokenizer"

export class ChatCompletion {
	bot: Bot<BotContext>

	constructor(bot: Bot<BotContext>) {
		this.bot = bot
		this.middleware = this.middleware.bind(this)

	}

	async callOpenAIChatCompletion(ctx: BotContext, history: ChatCompletionRequestMessage[]) {
		try {
			const completion = await openai.createChatCompletion(<
				CreateChatCompletionRequest
				>{
				model: process.env.MODEL || 'gpt-3.5-turbo',
				temperature: process.env.SINGLE_PROMPT ? parseFloat(process.env.TEMPERATURE || "0.5") : ctx.session.temperature,
				max_tokens: ctx.session.maxTokens,
				messages: history,
			})

			if (
				!completion.data.choices[0] ||
				!completion.data.choices[0].message
			) {
				throw new Error("No completion")
			}

			const content = completion.data.choices[0].message.content

			console.log(`Used reply tokes: ${encode(content).length}`)
			console.log({
				history,
				content
			})

			return content
		} catch (err) {
			console.log(err.response.data)
			console.error(err)
			return ""
		}
	}

	private createDefaultHistory(ctx: BotContext, tgSaveUtil: HistorySave, addIds: boolean) {
		const message = ctx.message as Message
		console.log(ctx.session.rememberContext);
		if (ctx.session.rememberContext) {
			return tgSaveUtil.getHistory(parseInt(process.env.HISTORY_LIMIT_TOKEN) || 300, addIds)
		} else {
			return tgSaveUtil.convertMessageToOpenAIChat(message)
		}
	}

	private async createChannelPostCommentHistory(ctx: BotContext) {
		const message = ctx.message as Message
		const photoSelected = message.photo.filter(el => el.file_size < 500000).sort((a, b) => b.file_size - a.file_size)[0]
		const photoFetched = await ctx.api.getFile(photoSelected.file_id)
		const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photoFetched.file_path}`

		return [
			{
				role: ChatCompletionRequestMessageRoleEnum.User,
				content: [
					message.text || message.caption ? {
						type: "text",
						text: message.text || message.caption || ""
					} : null,
					{
						type: "image_url",
						image_url: photoUrl
					}
				].filter(el => !!el)
			}
		]
	}

	private async createGroupCallsignReplyHistory(ctx: BotContext, tgSaveUtil: HistorySave) {
		return await this.createDefaultHistory(ctx, tgSaveUtil, true)
	}

	private async createGroupRandomReplyHistory(ctx: BotContext, tgSaveUtil: HistorySave) {
		return await this.createDefaultHistory(ctx, tgSaveUtil, true)
	}

	private async createGroupReplyTreeHistory(ctx: BotContext, tgSaveUtil: HistorySave) {
		return await tgSaveUtil.getReplyTree(parseInt(process.env.HISTORY_LIMIT_TOKEN) || 300)
	}

	private async createPrivateChatHistory(ctx: BotContext, tgSaveUtil: HistorySave) {
		console.log(ctx.message.photo)
		return await this.createDefaultHistory(ctx, tgSaveUtil, true)
	}

	private async createHistory(ctx: BotContext, tgSaveUtil: HistorySave, replyType: keyof typeof ServicePrompts): Promise<ChatCompletionRequestMessage[]> {
		switch (replyType) {
			case "channel-post-comment":
				return await this.createChannelPostCommentHistory(ctx)
			case "group-callsign-reply":
				return await this.createGroupCallsignReplyHistory(ctx, tgSaveUtil)
			case "group-random-reply":
				return await this.createGroupRandomReplyHistory(ctx, tgSaveUtil)
			case "group-reply-tree":
				return await this.createGroupReplyTreeHistory(ctx, tgSaveUtil)
			case "private-chat":
				return await this.createPrivateChatHistory(ctx, tgSaveUtil)
		}

	}

	private createSystemMessage(ctx: BotContext, replyType: keyof typeof ServicePrompts) {
		const message = ctx.message as Message
		if (replyType === null) return ""
		const systemPrompt = ServicePrompts[replyType] + ' ' + ServicePrompts["short-reply-note"]
		const inserts = {
			channel_name: message?.forward_from_chat?.type === "channel" ? message?.forward_from_chat?.title : "",
			group_name: message?.chat?.type === "group" || message?.chat?.type === "supergroup" ? message?.chat?.title : "",
			username: message?.from?.first_name || ""
		}
		const insertedPrompt = systemPrompt.replace(/{{(.*?)}}/g, (match, p1) => {
			return inserts[p1]
		})
		const promptStart = SinglePrompt || ctx.session.promptStart
		return `${promptStart || ""}. ${insertedPrompt}`
	}

	private async middleware(ctx: BotContext) {
		if (!ctx.message || !(ctx.message.text || ctx.message.caption || ctx.message.photo)) return

		const message = ctx.message as Message

		const tgSaveUtil = new HistorySave(ctx)
		tgSaveUtil.saveMessage()

		const replyType = checkReplyType(ctx)
		console.log(replyType)
		if (!replyType) {
			return
		}

		let history = await this.createHistory(ctx, tgSaveUtil, replyType);
		console.log({ history, replyType })
		await ctx.replyWithChatAction("typing")
		const typingInterval = setInterval(async () => {
			await ctx.replyWithChatAction("typing")
		}, 2000)

		const systemMessage = this.createSystemMessage(ctx, replyType)

		const finalHistory: ChatCompletionRequestMessage[] = [
			{
				role: "system",
				content: systemMessage
			},
			...history
		]

		console.log(`Used send tokes: ${tgSaveUtil.tokenizeHistory(finalHistory)}`)

		const completion = await this.callOpenAIChatCompletion(ctx, finalHistory)
		if (completion.trim() === '*') {
			clearInterval(typingInterval)
			return
		}

		if (typeof completion === 'string' && completion.length > 0) {
			let messageBuffer = completion
			let replyId = 0;
			const matchId = completion.match(/(\d+):/)
			if (replyType === 'group-callsign-reply' || replyType === 'group-reply-tree') {
				replyId = message.message_id
			} else if (replyType === 'channel-post-comment' && message.message_id) {
				replyId = message.message_id
			}
			if (matchId) {
				replyId = parseInt(matchId[1])
				messageBuffer = completion.replace(matchId[0], '')
			}
			const matchStupidBot = messageBuffer.match(/\[.+\]/) // Sometimes bot includes also user name in square brackets , we need to fix it
			if (matchStupidBot) {
				messageBuffer = messageBuffer.replace(matchStupidBot[0], '')
			}
			const replyMessage = await ctx.reply(messageBuffer, {
				parse_mode: "Markdown",
				reply_to_message_id: replyId,
				allow_sending_without_reply: true
			})
			tgSaveUtil.saveMessage(replyMessage)
		}

		clearInterval(typingInterval)
	}

	init() {
		this.bot.on("message", this.middleware)
	}
}
