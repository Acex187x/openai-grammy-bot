import { Configuration, OpenAIApi } from "openai"

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
	...(process.env.OPENAI_ORG_ID
		? { organization: process.env.OPENAI_ORG_ID }
		: {}),
	...(process.env.OPENAI_PROJECT_ID
		? { project: process.env.OPENAI_PROJECT_ID }
		: {}),
})
export const openai = new OpenAIApi(configuration)
