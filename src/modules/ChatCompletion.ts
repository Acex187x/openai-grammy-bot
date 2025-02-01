import { Bot } from "grammy"
import { Message } from "grammy/out/types.node"
import { HistorySave } from "../bot/HistorySave"
import { BasicPrompt, ServicePrompts, SinglePrompt } from "../constants"
import { openai } from "../openai"
import { BotContext } from "../types"
import { checkReplyType, getImageAsBase64 } from "../utils"
import { encode } from "gpt-tokenizer"
import OpenAI from "openai"
import {
  ChatCompletionMessageParam,
  ChatCompletionCreateParams,
} from "openai/resources/chat/completions"

export class ChatCompletion {
  bot: Bot<BotContext>
  private openai: OpenAI

  constructor(bot: Bot<BotContext>) {
    this.bot = bot
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    this.middleware = this.middleware.bind(this)
  }

  async generateCompletion(
    messages: ChatCompletionMessageParam[],
    maxTokens: number = 1000,
    temperature: number = 0.7
  ) {
    try {
      const model = process.env.MODEL || "gpt-3.5-turbo"
      const isReasoning = process.env.MODEL_IS_REASONING === "1"
      const reasoningEffort = (process.env.REASONING_EFFORT || "medium") as
        | "low"
        | "medium"
        | "high"

      console.log("Completion params:", {
        model,
        isReasoning,
        reasoningEffort,
        maxTokens,
        temperature,
        messagesCount: messages.length,
      })

      const completion = await this.openai.chat.completions.create({
        messages: messages,
        model: model,
        ...(isReasoning
          ? {
              max_completion_tokens: maxTokens,
              response_format: { type: "text" },
              seed: 1234,
              reasoning_effort: reasoningEffort,
            }
          : {
              max_tokens: maxTokens,
              temperature: temperature,
            }),
      })

      console.log("Got completion response:", {
        content:
          completion.choices[0].message.content?.substring(0, 50) + "...",
        finish_reason: completion.choices[0].finish_reason,
      })

      return completion.choices[0].message.content
    } catch (error) {
      console.error("Error generating completion:", error)
      throw error
    }
  }

  private createDefaultHistory(
    ctx: BotContext,
    tgSaveUtil: HistorySave,
    addIds: boolean
  ) {
    const message = ctx.message as Message
    console.log(ctx.session.rememberContext)
    if (ctx.session.rememberContext) {
      return tgSaveUtil.getHistory(
        parseInt(process.env.HISTORY_LIMIT_TOKEN) || 300,
        addIds
      )
    } else {
      return tgSaveUtil.convertMessageToOpenAIChat(message)
    }
  }

  private async createChannelPostCommentHistory(ctx: BotContext) {
    const message = ctx.message as Message
    const textContent = message.text || message.caption || ""

    if (message.photo && process.env.MODEL_SUPPORT_IMAGE === "1") {
      const photoSelected = message.photo
        .filter(el => el.file_size < 500000)
        .sort((a, b) => b.file_size - a.file_size)[0]
      const photoFetched = await ctx.api.getFile(photoSelected.file_id)
      const photoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photoFetched.file_path}`
      const photoBase64 = await getImageAsBase64(photoUrl)

      // @ts-ignore TODO: update openai types
      return [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: photoBase64 },
            },
          ],
        },
      ] as ChatCompletionMessageParam[]
    } else {
      return [
        {
          role: "user",
          content: textContent,
        },
      ] as ChatCompletionMessageParam[]
    }
  }

  private async createGroupCallsignReplyHistory(
    ctx: BotContext,
    tgSaveUtil: HistorySave
  ) {
    return await this.createDefaultHistory(ctx, tgSaveUtil, true)
  }

  private async createGroupRandomReplyHistory(
    ctx: BotContext,
    tgSaveUtil: HistorySave
  ) {
    return await this.createDefaultHistory(ctx, tgSaveUtil, true)
  }

  private async createGroupReplyTreeHistory(
    ctx: BotContext,
    tgSaveUtil: HistorySave
  ) {
    return await tgSaveUtil.getReplyTree(
      parseInt(process.env.HISTORY_LIMIT_TOKEN) || 300
    )
  }

  private async createPrivateChatHistory(
    ctx: BotContext,
    tgSaveUtil: HistorySave
  ) {
    console.log(ctx.message.photo)
    return await this.createDefaultHistory(ctx, tgSaveUtil, true)
  }

  private async createHistory(
    ctx: BotContext,
    tgSaveUtil: HistorySave,
    replyType: keyof typeof ServicePrompts
  ): Promise<ChatCompletionMessageParam[]> {
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

  private createSystemMessage(
    ctx: BotContext,
    replyType: keyof typeof ServicePrompts
  ) {
    const message = ctx.message as Message
    if (replyType === null) return ""
    const systemPrompt =
      ServicePrompts[replyType] + " " + ServicePrompts["short-reply-note"]
    const inserts = {
      channel_name:
        message?.forward_from_chat?.type === "channel"
          ? message?.forward_from_chat?.title
          : "",
      group_name:
        message?.chat?.type === "group" || message?.chat?.type === "supergroup"
          ? message?.chat?.title
          : "",
      username: message?.from?.first_name || "",
    }
    const insertedPrompt = systemPrompt.replace(/{{(.*?)}}/g, (match, p1) => {
      return inserts[p1]
    })
    const promptStart = SinglePrompt || ctx.session.promptStart
    return `${promptStart || ""}. ${insertedPrompt}`
  }

  private async middleware(ctx: BotContext) {
    try {
      if (
        !ctx.message ||
        !(ctx.message.text || ctx.message.caption || ctx.message.photo)
      )
        return

      console.log("Processing message:", {
        text: ctx.message.text || ctx.message.caption,
        hasPhoto: !!ctx.message.photo,
      })

      const message = ctx.message as Message

      const tgSaveUtil = new HistorySave(ctx)
      tgSaveUtil.saveMessage()

      const replyType = checkReplyType(ctx)
      console.log("Reply type:", replyType)
      if (!replyType) {
        console.log("No reply type, skipping")
        return
      }

      let history = await this.createHistory(ctx, tgSaveUtil, replyType)
      console.log("Created history:", {
        historyLength: history.length,
        firstMessage: history[0]?.content?.toString().substring(0, 50) + "...",
      })

      await ctx.replyWithChatAction("typing")
      const typingInterval = setInterval(async () => {
        await ctx.replyWithChatAction("typing")
      }, 2000)

      const systemMessage = this.createSystemMessage(ctx, replyType)
      console.log("System message:", systemMessage.substring(0, 50) + "...")

      const finalHistory: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemMessage,
        },
        ...history,
      ]

      console.log("Final history length:", finalHistory.length)
      console.log("Used send tokens:", tgSaveUtil.tokenizeHistory(finalHistory))

      const completion = await this.generateCompletion(finalHistory)
      if (completion.trim() === "*") {
        console.log("Got * as completion, skipping")
        clearInterval(typingInterval)
        return
      }

      if (typeof completion === "string" && completion.length > 0) {
        let messageBuffer = completion
        let replyId = 0
        const matchId = completion.match(/(\d+):/)
        if (
          replyType === "group-callsign-reply" ||
          replyType === "group-reply-tree"
        ) {
          replyId = message.message_id
        } else if (replyType === "channel-post-comment" && message.message_id) {
          replyId = message.message_id
        }
        if (matchId) {
          replyId = parseInt(matchId[1])
          messageBuffer = completion.replace(matchId[0], "")
        }
        const matchStupidBot = messageBuffer.match(/\[.+\]/)
        if (matchStupidBot) {
          messageBuffer = messageBuffer.replace(matchStupidBot[0], "")
        }

        console.log("Sending reply:", {
          messageLength: messageBuffer.length,
          replyId,
        })

        const replyMessage = await ctx.reply(messageBuffer, {
          parse_mode: "Markdown",
          reply_to_message_id: replyId,
          allow_sending_without_reply: true,
        })
        tgSaveUtil.saveMessage(replyMessage)
      }

      clearInterval(typingInterval)
    } catch (error) {
      console.error("Error in middleware:", error)
    }
  }

  init() {
    this.bot.on("message", this.middleware)
  }
}
