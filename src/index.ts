import {
	Api,
	Bot,
	Context,
	session,
	SessionFlavor,
	webhookCallback,
} from "grammy"
import { Configuration, CreateChatCompletionRequest, OpenAIApi } from "openai"
import {
	hydrateApi,
	HydrateApiFlavor,
	hydrateContext,
	HydrateFlavor,
} from "@grammyjs/hydrate"
import * as dotenv from "dotenv"
import { freeStorage } from "@grammyjs/storage-free"
import { Message } from "grammy/out/types.node"
import { BotContext, SessionData } from "./types"
import { HistorySave } from "./bot/HistorySave"
import { checkIfMessageAddressedToBot } from "./utils"
import { BasicPrompt } from "./constants"
import { MongoDBAdapter, ISession } from "@grammyjs/storage-mongodb"
import { MongoClient } from "mongodb"
import { db } from "./db"
import { getPersonasList, personasMenu } from "./modules/PersonaSwitcher"
import express from "express"
import { BotHandlers } from "./bot/BotHandlers"

dotenv.config()

function getMongoCollection() {
	if (!process.env.MONGO_URL) return null
	return db.collection<ISession>("users")
}

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

const bot = new Bot<BotContext, HydrateApiFlavor<Api>>(
	process.env.BOT_TOKEN || ""
)

if (process.env.MONGO_URL) {
	const collection = getMongoCollection()
	if (!collection) throw new Error("No collection")
	bot.use(
		session({
			initial: () =>
				({
					promptStart:
						"Imagine you are a telegram bot. Always answer in the same language as the question.",
					debug: false,
					maxTokens: 1500,
					temperature: 0.2,
					rememberContext: true,
					messages: [],
					currentPersona: "default",
				} as SessionData),
			storage: new MongoDBAdapter({ collection }),
		})
	)
} else {
	bot.use(
		session({
			initial: () =>
				({
					promptStart:
						"Imagine you are a telegram bot. Always answer in the same language as the question.",
					debug: false,
					maxTokens: 1500,
					temperature: 0.2,
					rememberContext: true,
					messages: [],
					currentPersona: "default",
				} as SessionData),
			storage: freeStorage<SessionData>(bot.token),
		})
	)
}

bot.use(hydrateContext())
bot.api.config.use(hydrateApi())

bot.command("ping", ctx => ctx.reply("Pong"))
bot.use(personasMenu)

const botHandlers = new BotHandlers(bot)

botHandlers.registerHandlers()

bot.command(["mood", "pers", "persona"], async ctx => {
	await ctx.reply(await getPersonasList(), {
		reply_markup: personasMenu,
		parse_mode: "Markdown",
	})
})

bot.on("message", async ctx => {
	if (!(ctx.message.text || ctx.message.caption)) return

	const tgSaveUtil = new HistorySave(ctx)
	tgSaveUtil.saveMessage()

	const isMessageForBot = checkIfMessageAddressedToBot(ctx.message, ctx)

	if (!isMessageForBot) {
		return
	}

	let history
	if (ctx.message.reply_to_message) {
		history = tgSaveUtil.getReplyTree()
	} else {
		if (ctx.session.rememberContext) {
			history = tgSaveUtil.getHistory(1000)
		} else {
			history = tgSaveUtil.convertMessageToOpenAIChat(ctx.message)
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
			model: "gpt-3.5-turbo",
			temperature: ctx.session.temperature,
			max_tokens: ctx.session.maxTokens,
			messages: [
				{
					role: "system",
					content:
						(ctx.session.promptStart || "") + `. ${BasicPrompt}`,
				},
				...history,
			],
		})

		if (!completion.data.choices[0] || !completion.data.choices[0].message)
			return

		const reply = completion.data.choices[0].message.content

		const replyMessage = await ctx.reply(reply, {
			parse_mode: "Markdown",
			reply_to_message_id: ctx.message.message_id,
		})

		tgSaveUtil.saveMessage(replyMessage)
	} catch (err) {
		console.error(err)
	} finally {
		clearInterval(typingInterval)
	}
})

bot.catch = err => {
	console.error(err)
}

if (process.env.DOMAIN && process.env.PORT) {
	const domain = String(process.env.DOMAIN)
	const secretPath = String(process.env.BOT_TOKEN)
	const app = express()

	app.use(express.json())
	app.use(
		`/${secretPath}`,
		webhookCallback(bot, "express", "return", 60 * 1000)
	)

	app.listen(Number(process.env.PORT), async () => {
		console.log(`Bot now listening on port ${process.env.PORT}!`)
		await bot.api.setWebhook(`https://${domain}/${secretPath}`)
	})
} else {
	bot.start()
}
