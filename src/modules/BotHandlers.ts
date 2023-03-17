import { Bot } from "grammy"
import { BotContext, SessionData } from "../types"

export class BotHandlers {
	bot: Bot<BotContext>
	constructor(bot: Bot<BotContext>) {
		this.bot = bot
	}

	initBooleanConfigHandler(command: string | string[], key: keyof SessionData) {
		this.bot.command(command, ctx => {
			if (!ctx.message) return
			// @ts-ignore
			ctx.session[key] = !ctx.session[key]
			ctx.reply(`${key}: ${ctx.session[key]}`)
		})
	}

	initNumberConfigHandler(
		command: string | string[],
		key: keyof SessionData,
		validate: (value: number) => boolean
	) {
		this.bot.command(command, ctx => {
			if (!ctx.message) return
			const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
			if (validate(parseFloat(text))) {
				// @ts-ignore
				ctx.session[key] = parseFloat(text)
			}
			ctx.reply(`${key}: ${ctx.session[key]}`)
		})
	}

	 initStringConfigHandler(command: string | string[], key: keyof SessionData) {
		this.bot.command(command, ctx => {
			if (!ctx.message) return
			const text =
				ctx.message.text?.split(" ").slice(1).join(" ").trim() || ""
			if (text) {
				// @ts-ignore
				ctx.session[key] = text
			}
			ctx.reply(`${key}: ${ctx.session[key]}`)
		})
	}

	initConfigurationHandlers() {
		this.initStringConfigHandler(["prompt_start", "ps"], "promptStart")
		this.initBooleanConfigHandler(["debug", "d"], "debug")
		this.initBooleanConfigHandler(["context", "rc"], "rememberContext")
		this.initNumberConfigHandler(
			["max_tokens", "tokens", "mt"],
			"maxTokens",
			value => value > 0 && value <= 2000 && Number.isInteger(value)
		)
		this.initNumberConfigHandler(
			["temp", "temperature", "t"],
			"temperature",
			value => value > 0 && value <= 1
		)
	}

	async registerHandlers() {
		this.initConfigurationHandlers()
	}
}
