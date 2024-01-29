export const BasicPrompt = ` For multi-user conversations where users begin messages with [Name]: Message, AI should only include it's message and reply  on his own behalf. DO NOT INCLUDE ANY SERVICE MESSAGES OR SYMBOLS IN YOUR REPLY`
export const SinglePrompt = process.env.SINGLE_PROMPT
export const IsSinglePrompt = process.env.SINGLE_PROMPT !== undefined
export const CallSigns = process.env.CALLSIGN?.split(",") || ['разум','mind']
export const BotName = process.env.BOT_NAME || "Разум"