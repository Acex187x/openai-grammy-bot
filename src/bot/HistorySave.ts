import { BotContext, MessageStored } from "../types"
import { Message } from "grammy/out/types.node"
import { encode, isWithinTokenLimit } from "gpt-tokenizer"
import { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { getImageAsBase64 } from "../utils"

export class HistorySave {
  private ctx: BotContext
  private messages: Message[] = []

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

  public tokenizeHistory(messages: ChatCompletionMessageParam[]): number {
    return messages.reduce((acc, message) => {
      return acc + encode(message.content as string).length
    }, 0)
  }

  public saveMessage(message: Message = this.ctx.message as Message) {
    // While storage has more than 15000 bytes, remove the oldest one
    while (JSON.stringify(this.ctx.session.messages).length > 15000) {
      this.ctx.session.messages.shift()
    }

    const messageStored = this.convertTgMessageToMessageStored(message)

    if (!messageStored) return

    // Check if message with same ID already exists
    const exists = this.ctx.session.messages.some(
      m => m.id === messageStored.id
    )
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
  public async getReplyTree(
    tokenLimit = 3500
  ): Promise<ChatCompletionMessageParam[]> {
    let result: ChatCompletionMessageParam[] = []
    let tokenCount = 0

    const message = this.ctx.message
    if (!message?.reply_to_message) return result

    let currentMessage: Message | undefined = message
    while (currentMessage && tokenCount < tokenLimit) {
      const content = currentMessage.text || currentMessage.caption || ""
      if (content) {
        const newMessage: ChatCompletionMessageParam = {
          role: "user",
          content: `${currentMessage.message_id}:${content}`,
        }

        const tokens = encode(content).length
        if (tokenCount + tokens > tokenLimit) break

        result.push(newMessage)
        tokenCount += tokens
      }

      currentMessage = currentMessage.reply_to_message
    }

    return result.reverse()
  }

  // Method to get the latest message history with a limit of tokenLimit

  public getHistory(
    tokenLimit = 3500,
    addIds: boolean = false
  ): ChatCompletionMessageParam[] {
    let result: ChatCompletionMessageParam[] = []
    let tokenCount = 0

    for (const message of this.ctx.session.messages.reverse()) {
      const content = message.text || ""
      if (!content) continue

      const newMessage: ChatCompletionMessageParam = {
        role: message.is_ai ? "assistant" : "user",
        content: addIds ? `${message.id}:${content}` : content,
      }

      const tokens = encode(content).length
      if (tokenCount + tokens > tokenLimit) break

      result.push(newMessage)
      tokenCount += tokens
    }

    return result.reverse()
  }

  public convertTgMessageToMessageStored(message: Message): MessageStored {
    const text = message.text || message.caption || ""

    const name = message.from?.first_name || message.from?.username || "Anon"
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

  public convertMessageToOpenAIChat(
    message: Message
  ): ChatCompletionMessageParam[] {
    const content = message.text || message.caption || ""
    return [
      {
        role: "user",
        content: content,
      },
    ]
  }
}
