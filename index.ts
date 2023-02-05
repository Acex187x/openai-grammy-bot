import { Api, Bot, Context, session, SessionFlavor } from "grammy"
import { Configuration, OpenAIApi } from "openai"
import {
	hydrateApi,
	HydrateApiFlavor,
	hydrateContext,
	HydrateFlavor,
} from "@grammyjs/hydrate"
import * as dotenv from "dotenv"
import { freeStorage } from "@grammyjs/storage-free"
import { Message } from "grammy/out/types.node"

dotenv.config()

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

type BotContext = Context & HydrateFlavor<Context> & SessionFlavor<SessionData>

const bot = new Bot<BotContext, HydrateApiFlavor<Api>>(
	process.env.BOT_TOKEN || ""
)

interface SessionData {
	// Start of message sent to GPT model
	promptStart: string
	debug: boolean
	maxTokens: number
	temperature: number
}

bot.use(
	session({
		initial: () => ({
			promptStart: "Imagine you are a telegram bot",
			debug: false,
			maxTokens: 800,
			temperature: 0.2,
		}),
		storage: freeStorage<SessionData>(bot.token),
	})
)

bot.use(hydrateContext())
bot.api.config.use(hydrateApi())

bot.command("ping", ctx => ctx.reply("Pong"))

// Create command handlers to change every session variable. One handler for each variable. Do not use loops
bot.command(["prompt_start", "ps"], ctx => {
	if (!ctx.message) return
	const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
	if (text.trim().length === 0)
		return ctx.reply(`promptStart: ${ctx.session.promptStart}`)
	ctx.session.promptStart = text
	ctx.reply(`promptStart: ${text}`)
})
bot.command(["debug", "d"], ctx => {
	if (!ctx.message) return
	ctx.session.debug = !ctx.session.debug
	ctx.reply(`debug: ${ctx.session.debug}`)
})
bot.command(["max_tokens", "tokens", "mt"], ctx => {
	if (!ctx.message) return
	const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
	const tokens = parseInt(text) > 2000 ? 2000 : parseInt(text)
	if (text.trim().length === 0)
		return ctx.reply(`maxTokens: ${ctx.session.maxTokens}`)
	ctx.session.maxTokens = tokens
	ctx.reply(`maxTokens: ${ctx.session.maxTokens}`)
})
bot.command(["temp", "temperature", "t"], ctx => {
	if (!ctx.message) return
	const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
	const temp = parseFloat(text) > 1 ? 1 : parseFloat(text)
	if (text.trim().length === 0)
		return ctx.reply(`temperature: ${ctx.session.temperature}`)
	ctx.session.temperature = temp
	ctx.reply(`temperature: ${ctx.session.temperature}`)
})

// Make command /row to generate completions for raw text
bot.command("raw", async ctx => {
	if (!ctx.message) return
	const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
	await generatePromptAndSend(ctx, text)
})

bot.on("message", async ctx => {
	if (!ctx.message.text) return

	let text = ctx.message.text

	const isAnsweredToMe = ctx.message.reply_to_message?.from?.id === ctx.me.id

	// If message doesn't start with "разум" and it's not private chat and it's not answered to me
	if (
		!(
			text.toLowerCase().startsWith("разум") ||
			ctx.chat.type === "private" ||
			isAnsweredToMe
		)
	)
		return

	// Remove "разум" from the beginning of the message
	text = text.replace(/^разум\s*/i, "")

	const name = ctx.from.first_name || ctx.from.username || "Anon"

	const reply =
		ctx.update.message.reply_to_message?.text ||
		ctx.update.message.reply_to_message?.caption

	let replyToName =
		ctx.update.message.reply_to_message?.from?.first_name ||
		ctx.update.message.reply_to_message?.from?.username ||
		"Anon"

	const isAnsweredToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id

	console.log({
		text,
		name,
		reply,
		replyToName,
		isAnsweredToBot,
	})

	if (isAnsweredToBot) {
		replyToName = "you"
	}

	const promptStart = ctx.session.promptStart || ""

	if (reply) {
		text = `${promptStart}. Always answer in the same language in which you are asked and use Markdown formatting when needed. Imagine ${replyToName} wrote message "${reply}" and you are asked by ${name} "${text}" about it, your answer is:`
	} else {
		text = `${promptStart}. Always answer in the same language in which you are asked and use Markdown formatting when needed. Imagine you are asked "${text}" by ${name}, your answer is:`
	}

	await generatePromptAndSend(ctx, text)
})

bot.start()

async function generatePromptAndSend(ctx: BotContext, prompt: string) {
	if (!ctx.message && !ctx.chat) return

	let typingInterval: NodeJS.Timeout
	let answer: Message.TextMessage
	if (ctx.session.debug) {
		answer = await ctx.reply(`\[Debug\] ${prompt}`, {
			reply_to_message_id: ctx.message.message_id,
			parse_mode: "Markdown",
		})
	} else {
		await ctx.replyWithChatAction("typing")
		typingInterval = setInterval(async () => {
			await ctx.replyWithChatAction("typing")
		}, 2000)
	}

	try {
		openai
			.createCompletion({
				model: "text-davinci-003",
				prompt,
				temperature: 0.2,
				max_tokens: ctx.session.maxTokens || 800,
			})
			.then(async response => {
				if (!ctx.session.debug) clearInterval(typingInterval)

				console.log({
					response: response.data.choices[0].text,
					name: ctx.message.from.first_name,
				})

				if (!response.data.choices[0].text) {
					if (ctx.session.debug) {
						await ctx.api.editMessageText(
							ctx.chat?.id,
							answer.message_id,
							`\[Debug\] ${prompt} Empty response from OpenAI`
						)
					} else {
						await ctx.reply("I don't know what to answer :(")
					}
				} else {
					let answerText =
						"\n" +
						response.data.choices[0].text
							.trim()
							.replace(/^"/g, "")
							.replace(/"$/g, "")

					if (ctx.session.debug) {
						answerText = `\[Debug\] ${prompt} ${answerText}`
						await ctx.api.editMessageText(
							ctx.chat.id,
							answer.message_id,
							answerText,
							{
								parse_mode: "Markdown",
							}
						)
					} else {
						await ctx.reply(answerText, {
							parse_mode: "Markdown",
							reply_to_message_id: ctx?.message?.message_id,
						})
					}
				}
			})
	} catch (e) {
		console.log(e)
		ctx.reply("Some error occured :( Try again later")
	}
}
