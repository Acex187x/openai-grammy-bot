# OpenAI Grammy Bot
Telegram bot written in TypeScript using the Grammy framework to communicate with OpenAI's GPT-3 API.

## Features
- Bot is fully adapted for both private and group chats
- User can reply to a bot's message, and prompt will contain both your message and the bot's message
- User can reply to any message, mentioning the bot and prompt will contain both user's message and the message user replied to.
- Bot can be used in any language

## Commands
- promptStart (ps) - Starts a prompt start message
- debug (d) - Sends a full prompt to answer message
- maxTokens (mt) - Sets the maximum number of tokens for the prompt and answer
- temperature (t) - Sets the temperature for the model
- ping - Pong!

## Requirements
- **Node.js** 
- **ts-node** package (globally installed)
- **Yarn** or any other Node package manager
- **OpenAI API key**
- A Telegram bot token (you can get one from *@BotFather*)
## Getting started
1. Clone this repository:
```bash
git clone https://github.com/Acex187x/openai-grammy-bot.git
```
2. Install the dependencies:
```bash
yarn install
```
3. Create a .env file in the root directory with the following variables:
```bash
OPENAI_API_KEY=<your_openai_api_key>
TELEGRAM_BOT_TOKEN=<your_telegram_bot_token>
```
4. Start the bot:
```bash
yarn start
```
## Contributing
All contributions are welcome. Feel free to open an issue or a pull request.

## License
This project is licensed under the MIT License.