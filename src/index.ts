import { Api, Bot, Context, session, SessionFlavor } from "grammy"
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

dotenv.config()

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

const bot = new Bot<BotContext, HydrateApiFlavor<Api>>(
	process.env.BOT_TOKEN || ""
)

bot.use(
	session({
		initial: () => ({
			promptStart:
				"Imagine you are a telegram bot. Always answer in the same language as the question.",
			debug: false,
			maxTokens: 800,
			temperature: 0.2,
			messages: [],
		}) as SessionData,
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

bot.on("message:text", async ctx => {
	if (!ctx.message.text) return

	const tgSaveUtil = new TgHistorySave(ctx);
	tgSaveUtil.saveMessage()

	const isMessageForBot = checkIfMessageAddressedToBot(ctx.message, ctx)

	if (!isMessageForBot) {
		return;
	}

	let history;
	if (ctx.message.reply_to_message) {
		history = tgSaveUtil.getReplyTree()
	} else {
		history = tgSaveUtil.convertMessageToOpenAIChat(ctx.message)
		// history = tgSaveUtil.getHistory(3000)
	}

	await ctx.replyWithChatAction("typing")
	const typingInterval = setInterval(async () => {
		await ctx.replyWithChatAction("typing")
	}, 2000)

	console.log([
		{ role: "system", content: (ctx.session.promptStart || "") + `. ${BasicPrompt}` },
		...history,
	]);

	try {
		const completion = await openai.createChatCompletion(<CreateChatCompletionRequest>{
			model: "gpt-3.5-turbo",
			temperature: ctx.session.temperature,
			max_tokens: ctx.session.maxTokens,
			messages: [
				{ role: "system", content: (ctx.session.promptStart || "") + `. ${BasicPrompt}` },
				...history,
			],
		})

		if (!completion.data.choices[0] || !completion.data.choices[0].message) return;

		const reply = completion.data.choices[0].message.content

		const replyMessage = await ctx.reply(reply, {
			parse_mode: "Markdown",
			reply_to_message_id: ctx.message.message_id,
		})

		tgSaveUtil.saveMessage(replyMessage);

	} catch (err) {
		console.error(err)
		// console.log(err.response?.data)
	} finally {
		clearInterval(typingInterval)
	}
})

bot.start()