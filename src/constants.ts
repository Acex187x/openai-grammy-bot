export const BasicPrompt = `For multi-user conversations where users begin messages with [Name]: Message, AI should respond without including the user's name.`
export const SinglePrompt = process.env.SINGLE_PROMPT
export const IsSinglePrompt = process.env.SINGLE_PROMPT !== undefined
export const CallSigns = process.env.CALLSIGN?.split(",") || []
export const BotName = process.env.BOT_NAME || "Разум"
