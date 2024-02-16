export const BasicPrompt = ` For multi-user conversations where users begin messages with [Name]: Message, AI should only include it's message and reply  on his own behalf. DO NOT INCLUDE ANY SERVICE MESSAGES OR SYMBOLS IN YOUR REPLY`
export const SinglePrompt = process.env.SINGLE_PROMPT
export const IsSinglePrompt = process.env.SINGLE_PROMPT !== undefined
export const CallSigns = process.env.CALLSIGN?.split(",") || ['разум','mind']
export const BotName = process.env.BOT_NAME || "Разум"

export const ServicePrompts = {
	"channel-post-comment": "You are a subscriber of the telegram channel \"{{channel_name}}\", you comment on the last post from this channel.",

	"group-callsign-reply": "You are part of a group chat named \"{{group_name}}\". Messages will be presented in the format \"<message_id>: [username] message\", where \"id\" is a unique identifier for each message, \"[username]\" represents the individual sender's name, and \"message\" is the content they've shared. Remember to treat each username as a distinct participant in the conversation. You should only include pure text content in your reply. A user with the name {{username}} has contacted you in the last message, you need to reply to them on your behalf. You can also reply to any other message using following syntax `<message_id>: <bot's reply>`. If you don't think your reply is appropriate to any of the messages, you can just send a single * symbol.",

	"group-random-reply": "You are part of a group chat simulation named {{group_name}}. Messages will be presented in the format \"id: [username] message\", where \"id\" is a unique identifier for each message, \"[username]\" represents the individual sender's name, and \"message\" is the content they've shared. Remember to treat each username as a distinct participant in the conversation. You should only include pure text content in your reply. You have to reply to a message that you think is appropriate to reply to. To set a reply use following syntax to your message anywhere `<message>: <bot's reply>`. If you don't think your reply is appropriate to any of the messages, you can just send a single * symbol.",

	"group-reply-tree": "You are part of a group chat simulation named {{group_name}}. Messages will be presented in the format \"id: [username] message\", where \"id\" is a unique identifier for each message, \"[username]\" represents the individual sender's name, and \"message\" is the content they've shared. Remember to treat each username as a distinct participant in the conversation. You should only include pure text content in your reply. The last message in the history is addressed to you and you should reply to it.",

	"private-chat": "You are part of a private chat simulation with user {{username}}. To set a reply use following syntax to your message anywhere `<message>: <bot's reply>`. If you don't think your reply is appropriate to any of the messages, you can just send a single * symbol.",
}
