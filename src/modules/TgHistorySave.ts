import { BotContext, MessageStored } from "../types"
import { Message } from "grammy/out/types.node"
import { encode, decode } from "gpt-3-encoder"
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from "openai"

export class TgHistorySave {

	private ctx: BotContext

	constructor(ctx: BotContext) {
		this.ctx = ctx

		if (!this.ctx.session.messages) this.ctx.session.messages = []
	}

	public tokenizeMessageStored(message: MessageStored[] | MessageStored) {
		return encode((Array.isArray(message) ? message : [message]).map(m => `[${m.name}] ${m.text}`).join("")).length
	}

	public saveMessage(message: Message = this.ctx.message as Message) {

		// If storage has more than 100 messages, remove the oldest one
		if (this.ctx.session.messages.length > 100) {
			this.ctx.session.messages.shift()
		}

		const messageStored = this.convertTgMessageToMessageStored(message);

		if (!messageStored) return;

		this.ctx.session.messages.push(messageStored)
	}

	public async saveMessageEdited(message: Message = this.ctx.message as Message) {

		if (!message) return

		const text = message.text || message.caption || ""
		const id = message.message_id

		const messageStored = this.ctx.session.messages.find(m => m.id === id)
		if (!messageStored) return

		messageStored.text = text
	}

	// Method to get reply tree for a message
	public getReplyTree(tokenLimit = 3500) {

		const replyToId = this.ctx.message?.reply_to_message?.message_id
		if (!replyToId) return []

		const replyTree = [];
		let replyToMessage = this.ctx.session.messages.find(m => m.id === replyToId)

		while (replyToMessage) {
			replyTree.push(replyToMessage)
			if (replyToMessage.reply_to_id) {
				replyToMessage = this.ctx.session.messages.find(m => m.id === replyToMessage.reply_to_id)
			} else {
				break;
			}
		}

		let res = [...replyTree.reverse(), ...(this.ctx.message ? [this.convertTgMessageToMessageStored(this.ctx.message)] : [])];

		let tokens = this.tokenizeMessageStored(res);

		// Remove oldest messages until tokens are less than tokenLimit
		while (tokens > tokenLimit) {
			res.shift();
			tokens = this.tokenizeMessageStored(res);
		}

		return this.convertMessageStoredToOpenAIChat(res);
	}

	// Method to get the latest message history with a limit of tokenLimit

	public getHistory(tokenLimit = 3500) {

		let history = JSON.parse(JSON.stringify(this.ctx.session.messages));

		let tokens = this.tokenizeMessageStored(history);

		// Remove messages from start until tokens are less than tokenLimit
		while (tokens > tokenLimit) {
			history.shift();
			tokens = this.tokenizeMessageStored(history);
		}

		return this.convertMessageStoredToOpenAIChat(history);
	}

	public convertTgMessageToMessageStored(message: Message): MessageStored {

		if (!message) return null;
		const text = message.text || message.caption || ""
		if (!text) return null;

		const name = message.from?.first_name || message.from?.username || "Anon"
		const id = message.message_id
		const reply_to_id = message.reply_to_message?.message_id || 0

		const messageStored: MessageStored = {
			text,
			id,
			name,
			...(reply_to_id ? {reply_to_id} : {}),
			is_ai: message.from.is_bot,
		}

		return messageStored
	}

	public convertMessageStoredToOpenAIChat(messageStored: MessageStored[] | MessageStored ): ChatCompletionRequestMessage[] {

		const messages = Array.isArray(messageStored) ? messageStored : [messageStored];

		return messages.map((message) => ({
			role: message.is_ai ? ChatCompletionRequestMessageRoleEnum.Assistant : ChatCompletionRequestMessageRoleEnum.User,
			content: message.is_ai ? message.text : `[${message.name}] ${message.text}`
		}))

	}

	public convertMessageToOpenAIChat(messageStored: Message[] | Message ): ChatCompletionRequestMessage[] {

		let messages = Array.isArray(messageStored) ? messageStored : [messageStored];
		const messagesStored = messages.map(el => this.convertTgMessageToMessageStored(el));

		return messagesStored.map((message) => ({
			role: message.is_ai ? ChatCompletionRequestMessageRoleEnum.Assistant : ChatCompletionRequestMessageRoleEnum.User,
			content: message.is_ai ? message.text : `[${message.name}] ${message.text}`
		}))

	}
}