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
bot.command(["promptStart", "ps"], ctx => {
	if (!ctx.message) return
	const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
	ctx.session.promptStart = text
	ctx.reply(`promptStart: ${text}`)
})
bot.command(["debug", "d"], ctx => {
	if (!ctx.message) return
	ctx.session.debug = !ctx.session.debug
	ctx.reply(`debug: ${ctx.session.debug}`)
})
bot.command(["maxTokens", "tokens", "mt"], ctx => {
	if (!ctx.message) return
	const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
	ctx.session.maxTokens = parseInt(text)
	ctx.reply(`maxTokens: ${text}`)
})
bot.command(["temp", "temperature", "t"], ctx => {
	if (!ctx.message) return
	const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
	ctx.session.temperature = parseFloat(text)
	ctx.reply(`temperature: ${text}`)
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

	const name = ctx.from.first_name || ctx.from.username || "Anon"

	const reply =
		ctx.update.message.reply_to_message?.text ||
		ctx.update.message.reply_to_message?.caption

	const replyToName =
		ctx.update.message.reply_to_message?.from?.first_name ||
		ctx.update.message.reply_to_message?.from?.username ||
		"Anon"

	const promptStart = ctx.session.promptStart || ""

	if (reply) {
		text = `${promptStart}. Always answer in the same language in which you are asked and use Markdown formatting when needed. Imagine ${replyToName} wrote message "${reply}" and you are asked by ${name} "${text}" about it, your answer is:`
	} else {
		text = `${promptStart}. Always answer in the same language in which you are asked and use Markdown formatting when needed. Imagine you are asked "${text}" by ${name}, your answer is:`
	}

	text = text.replace(/разум/gi, " ")

	try {
		const answerText = ctx.session.debug
			? `\[Debug\] ${text}`
			: "_Работаю над ответом..._"

		const answer = await ctx.reply(answerText, {
			reply_to_message_id: ctx.message.message_id,
			parse_mode: "Markdown",
		})

		openai
			.createCompletion({
				model: "text-davinci-003",
				prompt: text,
				temperature: 0.2,
				max_tokens: ctx.session.maxTokens || 800,
			})
			.then(async response => {
				if (!response.data.choices[0].text) {
					await ctx.api.editMessageText(
						ctx.chat.id,
						answer.message_id,
						"Я не знаю что ответить на это :("
					)
				} else {
					let answerText = response.data.choices[0].text
						.replace(/^"/, "")
						.replace(/"$/, "")

					if (ctx.session.debug) {
						answerText = `\[Debug\] ${text} ${answerText}`
					}

					await ctx.api.editMessageText(
						ctx.chat.id,
						answer.message_id,
						answerText,
						{
							parse_mode: "Markdown",
						}
					)
				}
			})
	} catch (err) {
		console.log(err)
	}

	return
})

bot.start()
