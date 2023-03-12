import { Api, Bot, Context, session, SessionFlavor, webhookCallback } from "grammy"
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
import { TgHistorySave } from "./modules/TgHistorySave"
import { checkIfMessageAddressedToBot } from "./modules/Utils"
import { BasicPrompt } from "./modules/Const"
import { MongoDBAdapter, ISession } from "@grammyjs/storage-mongodb"
import { MongoClient } from "mongodb"
import { db } from "./db"
import { getPersonasList, personasMenu } from "./modules/PersonaSwitcher"
import express from "express";


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

// Enables bot's ability to remember context without reply
bot.command(["context", "rc"], ctx => {
	if (!ctx.message) return
	ctx.session.rememberContext = !ctx.session.rememberContext
	ctx.reply(`rememberContext: ${ctx.session.rememberContext}`)
})

bot.use(personasMenu)

bot.command(["mood", "pers", "persona"], async ctx => {
	await ctx.reply(await getPersonasList(), {
		reply_markup: personasMenu,
		parse_mode: "Markdown",
	})
})

bot.on("message", async ctx => {
	if (!(ctx.message.text || ctx.message.caption)) return

	const tgSaveUtil = new TgHistorySave(ctx)
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

bot.catch = (err) => {
	console.error(err);
}

if (process.env.WEBBHOOK_PORT) {
	const domain = String(process.env.DOMAIN);
	const secretPath = String(process.env.BOT_TOKEN);
	const app = express();

	app.use(express.json());
	app.use(`/${secretPath}`, webhookCallback(bot, "express"));

	app.listen(Number(process.env.PORT), async () => {
		await bot.api.setWebhook(`https://${domain}/${secretPath}`);
	});
} else {
	bot.start()
}


