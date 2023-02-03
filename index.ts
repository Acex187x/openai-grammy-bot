import { Api, Bot, Context } from "grammy"
import { Configuration, OpenAIApi } from "openai"
import {
	hydrateApi,
	HydrateApiFlavor,
	hydrateContext,
	HydrateFlavor,
} from "@grammyjs/hydrate"
import * as dotenv from "dotenv"

dotenv.config()

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

const bot = new Bot<HydrateFlavor<Context>, HydrateApiFlavor<Api>>(
	process.env.BOT_TOKEN || ""
)

bot.use(hydrateContext())
bot.api.config.use(hydrateApi())

bot.command("ping", ctx => ctx.reply("Pong"))
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

	if (reply) {
		text = `Imagine being pro-Ukrainian and hating Russians and Russia. Always anwer in the same language you beeing asked. Imagine ${name} wrote message "${reply}" and you are asked "${text}" about it, your answer is:`
	} else {
		text = `Imagine being pro-Ukrainian and hating Russians and Russia. Always anwer in the same language you beeing asked. Imagine you are asked "${text}" by ${name}, your answer is:`
	}

	text = text.replace(/разум/gi, " ")

	try {
		const answer = await ctx.reply("_Работаю над ответом..._", {
			reply_to_message_id: ctx.message.message_id,
			parse_mode: "Markdown",
		})

		openai
			.createCompletion({
				model: "text-davinci-003",
				prompt: text,
				temperature: 0.2,
				max_tokens: 800,
			})
			.then(async response => {
				if (!response.data.choices[0].text) {
					await ctx.api.editMessageText(
						ctx.chat.id,
						answer.message_id,
						"Я не знаю что ответить на это :("
					)
				} else {
					await ctx.api.editMessageText(
						ctx.chat.id,
						answer.message_id,
						response.data.choices[0].text.replace(/^"/, "").replace(/"$/, ""),
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
