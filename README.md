# gleisbot

A personal Telegram bot that sends a daily voice message every morning before your commute. It checks for transit disruptions on your configured route and combines them with the current weather into a short, natural-sounding summary.

## How it works

Each morning, gleisbot:

1. Fetches real-time disruptions from the [RMV](https://www.rmv.de) (Rhein-Main-Verkehrsverbund) API for your configured lines
2. Fetches current weather data via [Bright Sky](https://brightsky.dev) (DWD)
3. Generates a concise, personal summary using GPT-4o
4. Converts it to speech using OpenAI TTS
5. Sends it as a voice message to your Telegram chat

## Requirements

- [Bun](https://bun.sh)
- RMV API key
- OpenAI API key
- Telegram bot token

## Setup

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

## Usage

Run once immediately (useful for testing):
```bash
bun run src/index.ts --now
```

Run in scheduler mode (fires at 6:00 AM Europe/Berlin on weekdays):
```bash
bun run src/index.ts
```
