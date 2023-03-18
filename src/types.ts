import { Api, Context, SessionFlavor } from "grammy"
import { HydrateApiFlavor, HydrateFlavor } from "@grammyjs/hydrate"
import { MaybeArray } from "grammy/out/context"

export interface MessageStored {
	text: string
	id: number
	name: string
	reply_to_id?: number
	is_ai: boolean
}

export interface SessionData {
	// Start of message sent to GPT model
	promptStart: string
	debug: boolean
	maxTokens: number
	temperature: number
	rememberContext: boolean
	messages: MessageStored[]
	currentPersona: string
}

export type BotContext = Context &
	HydrateFlavor<Context> &
	SessionFlavor<SessionData>

export interface Persona {
	id: string
	name: string
	description: string
	prompt: string
}

export interface BotCommand {
	command: string
	description: string
}
