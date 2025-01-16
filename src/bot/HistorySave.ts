import { BotContext, MessageStored } from "../types"
import { Message } from "grammy/out/types.node"
import { encode, isWithinTokenLimit } from "gpt-tokenizer"
import {
	ChatCompletionRequestMessage,
	ChatCompletionRequestMessageRoleEnum,
} from "openai"
import { getImageAsBase64 } from "../utils"

export class HistorySave {
	private ctx: BotContext

	constructor(ctx: BotContext) {
		this.ctx = ctx

		if (!this.ctx.session.messages) this.ctx.session.messages = []
	}

	public tokenizeMessageStored(message: MessageStored[] | MessageStored) {
		return encode(
			(Array.isArray(message) ? message : [message])
				.map(m => `[${m.name}] ${m.text}`)
				.join("")
		).length
	}

	public tokenizeHistory(message: ChatCompletionRequestMessage[]) {
		return encode(
			(Array.isArray(message) ? message : [message])
				.map(m => m.content)
				.join("")
		).length
	}

	public saveMessage(message: Message = this.ctx.message as Message) {
		// While storage has more than 15000 bytes, remove the oldest one
		while (JSON.stringify(this.ctx.session.messages).length > 15000) {
			this.ctx.session.messages.shift()
		}

		const messageStored = this.convertTgMessageToMessageStored(message)

		if (!messageStored) return

		// Check if message with same ID already exists
		const exists = this.ctx.session.messages.some(m => m.id === messageStored.id)
		if (exists) return

		this.ctx.session.messages.push(messageStored)
	}

	public async saveMessageEdited(
		message: Message = this.ctx.message as Message
	) {
		if (!message) return

		const text = message.text || message.caption || ""
		const id = message.message_id

		const messageStored = this.ctx.session.messages.find(m => m.id === id)
		if (!messageStored) return

		messageStored.text = text
	}

	// Method to get reply tree for a message
	public getReplyTree(tokenLimit = 3500) {
		const message = this.ctx.message as Message

		const replyToId = message?.reply_to_message?.message_id
		if (!replyToId) return []

		const replyTree = []
		let replyToMessage = this.ctx.session.messages.find(
			m => m.id === replyToId
		)

		while (replyToMessage) {
			replyTree.push(replyToMessage)
			if (replyToMessage?.reply_to_id) {
				replyToMessage = this.ctx.session.messages.find(
					m => m.id === replyToMessage?.reply_to_id
				)
			} else {
				break
			}
		}

		let res = [
			...replyTree.reverse(),
			...(message ? [this.convertTgMessageToMessageStored(message)] : []),
		]

		let tokens = this.tokenizeMessageStored(res)

		// Remove oldest messages until tokens are less than tokenLimit
		while (tokens > tokenLimit) {
			res.shift()
			tokens = this.tokenizeMessageStored(res)
		}

		return this.convertMessageStoredToOpenAIChat(res, true)
	}

	// Method to get the latest message history with a limit of tokenLimit

	public getHistory(tokenLimit = 3500, addIds: boolean = false) {
		let history = JSON.parse(JSON.stringify(this.ctx.session.messages))

		let tokens = this.tokenizeMessageStored(history)

		// Remove messages from start until tokens are less than tokenLimit
		while (tokens > tokenLimit && history.length > 1) {
			history.shift()
			tokens = this.tokenizeMessageStored(history)
		}

		return this.convertMessageStoredToOpenAIChat(history, addIds)
	}

	public convertTgMessageToMessageStored(message: Message): MessageStored {
		const text = message.text || message.caption || ""

		const name =
			message.from?.first_name || message.from?.username || "Anon"
		const id = message.message_id
		const reply_to_id = message.reply_to_message?.message_id || 0
		const photo = message.photo

		const messageStored: MessageStored = {
			text,
			id,
			name,
			photo,
			...(reply_to_id ? { reply_to_id } : {}),
			is_ai: message.from?.is_bot || false,
		}

		return messageStored
	}

	public convertMessageStoredToOpenAIChat(
		messageStored: MessageStored[] | MessageStored,
		addIds: boolean = false,
	): Promise<ChatCompletionRequestMessage[]> {
		const messages = Array.isArray(messageStored)
			? messageStored
			: [messageStored]

		// @ts-ignore TODO: update openai types
		return Promise.all(messages.map(async (message, i) => {
			if (!message.photo) {
				return {
					role: message.is_ai
						? ChatCompletionRequestMessageRoleEnum.Assistant
						: ChatCompletionRequestMessageRoleEnum.User,
					content: message.is_ai
						? message.text
						: `${addIds ? `${message.id}: ` : ''}[${message.name}] ${message.text}`,
				}
			} else {

				const photoSelected = message.photo.filter(el => el.file_size < 500000).sort((a, b) => b.file_size - a.file_size)[0]
				const photoFetched = await this.ctx.api.getFile(photoSelected.file_id)
				const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photoFetched.file_path}`
				const photoBase64 = await getImageAsBase64(photoUrl)

				const content = [
					message.text ? {
						type: "text",
						text: `${addIds ? `${message.id}: ` : ''}[${message.name}] ${message.text}`,
					} : null,
					{
						type: "image_url",
						image_url: {url: photoBase64},
					},
				].filter(el => !!el)

				console.log({photoUrl, content, photoFetched, photoSelected, photoBase64})

				return {
					role: message.is_ai
						? ChatCompletionRequestMessageRoleEnum.Assistant
						: ChatCompletionRequestMessageRoleEnum.User,
					content,
				}
			}
		}))
	}

	public convertMessageToOpenAIChat(
		messageStored: Message[] | Message,
		addIds: boolean = false,
	): Promise<ChatCompletionRequestMessage[]> {
		let messages = Array.isArray(messageStored)
			? messageStored
			: [messageStored]

		const messagesStored = messages
			.map(el => this.convertTgMessageToMessageStored(el))
			.filter(el => el)

		return this.convertMessageStoredToOpenAIChat(messagesStored, addIds)
	}
}
