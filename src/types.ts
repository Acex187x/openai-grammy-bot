import { Context, SessionFlavor } from "grammy"
import { HydrateFlavor } from "@grammyjs/hydrate"

export interface MessageStored {
	text: string,
	id: number,
	name: string,
	reply_to_id?: number,
	is_ai: boolean,
}

export interface SessionData {
	// Start of message sent to GPT model
	promptStart: string
	debug: boolean
	maxTokens: number
	temperature: number,
	messages: MessageStored[],
}

export type BotContext = Context & HydrateFlavor<Context> & SessionFlavor<SessionData>