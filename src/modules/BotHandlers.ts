import { Bot } from "grammy"
import { BotContext } from "../types"

export class BotHandlers {
	bot: Bot<BotContext>
	constructor(bot: Bot<BotContext>) {
		this.bot = bot
	}

	async initBooleanConfigHandler(command: string | string[], key: string) {
		this.bot.command(command, ctx => {
			if (!ctx.message) return
			ctx.session[key] = !ctx.session[key]
			ctx.reply(`${key}: ${ctx.session[key]}`)
		})
	}

	async initNumberConfigHandler(
		command: string | string[],
		key: string,
		validate: (value: number) => boolean
	) {
		this.bot.command(command, ctx => {
			if (!ctx.message) return
			const text = ctx.message.text?.split(" ").slice(1).join(" ") || ""
			if (validate(parseFloat(text))) {
				ctx.session[key] = parseFloat(text)
			}
			ctx.reply(`${key}: ${ctx.session[key]}`)
		})
	}

	async initStringConfigHandler(command: string | string[], key: string) {
		this.bot.command(command, ctx => {
			if (!ctx.message) return
			const text =
				ctx.message.text?.split(" ").slice(1).join(" ").trim() || ""
			if (text) {
				ctx.session[key] = text
			}
			ctx.reply(`${key}: ${ctx.session[key]}`)
		})
	}

	async initConfigurationHandlers() {
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
