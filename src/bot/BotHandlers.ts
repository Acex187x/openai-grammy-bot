import { Bot, CommandMiddleware } from "grammy"
import { MaybeArray } from "grammy/out/context"
import { BotCommand, BotContext } from "../types"

export class BotHandlers {
	bot: Bot<BotContext>
	commands: BotCommand[] = []
	constructor(bot: Bot<BotContext>) {
		this.bot = bot
	}

	command(
		command: MaybeArray<string>,
		middleware: CommandMiddleware<BotContext>,
		description?: string
	) {
		this.bot.command(command, middleware)
		this.commands.push({ command: command.toString(), description })
	}

	async initBooleanConfigHandler(
		command: MaybeArray<string>,
		key: string,
		description?: string
	) {
		this.command(
			command,
			ctx => {
				if (!ctx.message) return
				ctx.session[key] = !ctx.session[key]
				ctx.reply(`${key}: ${ctx.session[key]}`)
			},
			description
		)
	}

	async initNumberConfigHandler(
		command: MaybeArray<string>,
		key: string,
		validate: (value: number) => boolean,
		description?: string
	) {
		this.command(
			command,
			ctx => {
				if (!ctx.message) return
				const text =
					ctx.message.text?.split(" ").slice(1).join(" ") || ""
				if (validate(parseFloat(text))) {
					ctx.session[key] = parseFloat(text)
				}
				ctx.reply(`${key}: ${ctx.session[key]}`)
			},
			description
		)
	}

	async initStringConfigHandler(
		command: MaybeArray<string>,
		key: string,
		description?: string
	) {
		this.command(
			command,
			ctx => {
				if (!ctx.message) return
				const text =
					ctx.message.text?.split(" ").slice(1).join(" ").trim() || ""
				if (text) {
					ctx.session[key] = text
				}
				ctx.reply(`${key}: ${ctx.session[key]}`)
			},
			description
		)
	}

	async initHelpHandler() {
		this.command(
			["help", "start"],
			ctx => {
				ctx.reply(
					`Добро пожаловать в Разум! Я могу ответь на любой твой вопрос, просто начини общаться со мной\n` +
						`Также меня можно добавить в группу и я буду поддерживать беседу.\n\n` +
						`Список доступных команд:\n` +
						this.commands
							.map(
								command =>
									`*${command.command}*\n${command.description}\n`
							)
							.join("")
				)
			},
			"показать список команд"
		)
	}

	async initConfigurationHandlers() {
		this.initStringConfigHandler(
			["prompt_start", "ps"],
			"promptStart",
			"Установка промпта для генерации сообщения"
		)
		// this.initBooleanConfigHandler(["debug", "d"], "debug", "Включение/выключение режима отладки")
		this.initBooleanConfigHandler(
			["context", "rc"],
			"rememberContext",
			"Включение/выключение сохранения контекста"
		)
		this.initNumberConfigHandler(
			["max_tokens", "tokens", "mt"],
			"maxTokens",
			value => value > 0 && value <= 2000 && Number.isInteger(value),
			"Установка максимального количества токенов для генерации сообщения (1-2000)"
		)
		this.initNumberConfigHandler(
			["temp", "temperature", "t"],
			"temperature",
			value => value > 0 && value <= 1,
			"Установка температуры для генерации сообщения, cм. документацию OpenAI (0-1)"
		)
	}

	async registerHandlers() {
		this.initConfigurationHandlers()
	}
}
