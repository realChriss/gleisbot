# 🚆 gleisbot

A personal Telegram bot that sends a daily voice message every morning before your commute. It checks for transit disruptions on your configured route and combines them with the current weather into a short, natural-sounding summary.

## 🎙️ What it does

- Fetches real-time disruptions from the RMV (Rhein-Main-Verkehrsverbund) API for your configured lines
- 🌤️ Fetches weather data via Bright Sky (DWD)
- 🤖 Generates a concise, personal summary using GPT-4o
- 🔊 Converts the summary to speech using OpenAI TTS
- 📨 Sends it as a voice message to your Telegram chat

## ⚙️ Setup

**Requirements:** [Bun](https://bun.sh), an RMV API key, an OpenAI API key, a Telegram bot token

1. Clone the repo and install dependencies:
   ```bash
   bun install
   ```

2. Copy the example config and fill in your route:
   ```bash
   cp config.example.json config.json
   cp .env.example .env
   ```

3. 🔍 Look up your stop IDs using the built-in finder:
   ```bash
   bun run src/index.ts --find-stops
   ```

4. Run immediately to test:
   ```bash
   bun run src/index.ts --now
   ```

5. Run in scheduler mode (fires at 6:00 AM Europe/Berlin on weekdays):
   ```bash
   bun run src/index.ts
   ```
