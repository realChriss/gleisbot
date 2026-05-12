# 🚆 gleisbot

A Telegram bot that sends you a daily voice briefing on transit disruptions and weather.

## 🎙️ How it works

Each morning, gleisbot:

1. 🚨 Fetches real-time disruptions from the [RMV](https://www.rmv.de) (Rhein-Main-Verkehrsverbund) API for your configured lines
2. 🌤️ Fetches current weather data via [Bright Sky](https://brightsky.dev) (DWD)
3. 🤖 Generates a concise, personal summary
4. 🔊 Converts it to speech
5. 📨 Sends it as a voice message to your Telegram chat

## 📋 Requirements

- [Bun](https://bun.sh)
- RMV API key
- OpenAI API key
- Telegram bot token

## ⚙️ Setup

1. Clone the repo and install dependencies:
   ```bash
   bun install
   ```

2. Copy and fill in the config files:
   ```bash
   cp config.example.json config.json
   cp .env.example .env
   ```

3. Look up your stop IDs using the built-in finder:
   ```bash
   bun run src/index.ts --find-stops
   ```

## 🚀 Usage

Run once immediately (useful for testing):
```bash
bun run src/index.ts --now
```

Run in scheduler mode:
```bash
bun run src/index.ts
```
