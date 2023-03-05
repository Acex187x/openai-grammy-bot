import { BotContext, Persona } from "../types"
import { db } from "../db"
import { Menu, MenuRange } from "@grammyjs/menu"

export const personasMenu = new Menu<BotContext>("personas")
personasMenu.dynamic(async (ctx: BotContext, range) => {
	const personas = await db.collection("personas").find().toArray()

	personas.forEach((persona, i) => {
		if (i % 3 === 0 && i !== 0) range.row()
		range.text(
			`${ctx.session.currentPersona == persona.id ? "✅" : "☑️"} ${
				persona.name
			}`,
			ctx => {
				const isChanged = ctx.session.currentPersona != persona.id
				ctx.session.currentPersona = persona.id
				ctx.session.promptStart = persona.prompt
				isChanged && ctx.menu.update()
			}
		)
	})
})

export async function getPersonasList() {
	const personas = await db.collection("personas").find().toArray()
	return (
		`Выбери персону для Разума:\n\n` +
		personas
			.map(persona => `*${persona.name}*\n${persona.description}\n\n`)
			.join("")
	)
}
