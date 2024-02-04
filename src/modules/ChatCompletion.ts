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
				temperature: ctx.session.temperature,
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

	private createChannelPostCommentHistory(ctx: BotContext) {
		const message = ctx.message as Message
		return [
			{
				role: ChatCompletionRequestMessageRoleEnum.User,
				content: message.text || message.caption || ""
			}
		]
	}

	private createGroupCallsignReplyHistory(ctx: BotContext, tgSaveUtil: HistorySave) {
		return this.createDefaultHistory(ctx, tgSaveUtil, false)
	}

	private createGroupRandomReplyHistory(ctx: BotContext, tgSaveUtil: HistorySave) {
		return this.createDefaultHistory(ctx, tgSaveUtil, true)
	}

	private createGroupReplyTreeHistory(ctx: BotContext, tgSaveUtil: HistorySave) {
		return tgSaveUtil.getReplyTree(parseInt(process.env.HISTORY_LIMIT_TOKEN) || 300)
	}

	private createPrivateChatHistory(ctx: BotContext, tgSaveUtil: HistorySave) {
		return this.createDefaultHistory(ctx, tgSaveUtil, false)
	}

	private createHistory(ctx: BotContext, tgSaveUtil: HistorySave, replyType: keyof typeof ServicePrompts): ChatCompletionRequestMessage[] {
		switch (replyType) {
			case "channel-post-comment":
				return this.createChannelPostCommentHistory(ctx)
			case "group-callsign-reply":
				return this.createGroupCallsignReplyHistory(ctx, tgSaveUtil)
			case "group-random-reply":
				return this.createGroupRandomReplyHistory(ctx, tgSaveUtil)
			case "group-reply-tree":
				return this.createGroupReplyTreeHistory(ctx, tgSaveUtil)
			case "private-chat":
				return this.createPrivateChatHistory(ctx, tgSaveUtil)
		}

	}

	private createSystemMessage(ctx: BotContext, replyType: keyof typeof ServicePrompts) {
		const message = ctx.message as Message
		if (replyType === null) return ""
		const systemPrompt = ServicePrompts[replyType]
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
		if (!ctx.message || !(ctx.message.text || ctx.message.caption)) return

		const message = ctx.message as Message

		const tgSaveUtil = new HistorySave(ctx)
		tgSaveUtil.saveMessage()

		const replyType = checkReplyType(ctx)

		if (!replyType) {
			return
		}

		let history = this.createHistory(ctx, tgSaveUtil, replyType);
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
			let replyMessage: Message | Message.TextMessage;
			if (replyType === "group-random-reply") {
				const match = completion.match(/【(\d+)】/)
				if (match) {
					const id = parseInt(match[1])
					replyMessage = await ctx.reply(completion.replace(match[0], ''), {
						parse_mode: "Markdown",
						reply_to_message_id: id
					})
				} else {
					replyMessage = await ctx.reply(completion, {
						parse_mode: "Markdown",
					})
				}
			} else  {
				replyMessage = await ctx.reply(completion, {
					parse_mode: "Markdown",
					reply_to_message_id: message.message_id,
				})
			}
			tgSaveUtil.saveMessage(replyMessage)
		}

		clearInterval(typingInterval)
	}

	init() {
		this.bot.on("message", this.middleware)
	}
}
