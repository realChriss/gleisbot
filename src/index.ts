import rawConfig from "../config.json";
import { fetchDisruptions, findStops } from "./rmv";
import { fetchWeather } from "./weather";
import { generateSummary, buildFallbackSummary, textToSpeech } from "./llm";
import { sendTelegramMessage, sendTelegramVoice } from "./telegram";
import type { Disruption, WeatherSummary, Config } from "./types";
import { Cron } from "croner";

const config = rawConfig as unknown as Config;

function loadEnv(): {
  rmvKey: string;
  openaiKey: string;
  botToken: string;
  chatId: string;
} {
  const required = [
    "RMV_API_KEY",
    "OPENAI_API_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
  ] as const;

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    rmvKey: process.env.RMV_API_KEY!,
    openaiKey: process.env.OPENAI_API_KEY!,
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  };
}


async function runReport(env: ReturnType<typeof loadEnv>): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[${new Date().toISOString()}] Running daily report for ${today}`);

  let disruptions: Disruption[] = [];
  try {
    disruptions = await fetchDisruptions(config.route, env.rmvKey);
    console.log(`  Disruptions fetched: ${disruptions.length}`);
  } catch (err) {
    console.error("  RMV fetch failed:", err);
  }

  let weather: WeatherSummary = {
    currentTemp: 0,
    precipitation: 0,
    windSpeed: 0,
    condition: "unbekannt",
    alerts: [],
  };
  try {
    weather = await fetchWeather(config.weather.lat, config.weather.lon);
    console.log(`  Weather fetched: ${weather.currentTemp}°C, ${weather.condition}`);
  } catch (err) {
    console.error("  Weather fetch failed:", err);
  }

  let summary: string;
  try {
    summary = await generateSummary(
      {
        date: today,
        disruptions,
        weather,
        language: config.language,
        segments: config.route,
      },
      env.openaiKey
    );
    console.log("  LLM summary generated.");
  } catch (err) {
    console.error("  OpenAI failed, using fallback summary:", err);
    summary = buildFallbackSummary(disruptions, weather);
  }

  try {
    const audio = await textToSpeech(summary, env.openaiKey);
    await sendTelegramVoice(audio, env.botToken, env.chatId);
    console.log("  Voice report sent to Telegram.");
  } catch (err) {
    console.error("  TTS failed, falling back to text:", err);
    await sendTelegramMessage(summary, env.botToken, env.chatId);
    console.log("  Text report sent to Telegram.");
  }
}

async function handleFindStops(apiKey: string): Promise<void> {
  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log("RMV Stop ID Finder — type a stop name to search, or 'exit' to quit.\n");

  while (true) {
    const query = await ask("Stop name: ");
    if (query.trim().toLowerCase() === "exit") break;
    if (!query.trim()) continue;

    try {
      const results = await findStops(query.trim(), apiKey);
      if (results.length === 0) {
        console.log("  No results found.\n");
      } else {
        for (const r of results) {
          console.log(`  ${r.extId}  ${r.name}`);
        }
        console.log();
      }
    } catch (err) {
      console.error("  Error:", err);
    }
  }

  rl.close();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const env = loadEnv();

  if (args.includes("--find-stops")) {
    await handleFindStops(env.rmvKey);
    return;
  }

  if (args.includes("--now")) {
    await runReport(env);
    return;
  }

  console.log(`Scheduler started. Will run at ${config.targetHour}:00 ${config.targetTimezone} on weekdays.`);
  console.log("(Tip: run with --now to trigger immediately, --find-stops to look up stop IDs)\n");

  new Cron(
    `0 ${config.targetHour} * * 1-5`,
    { timezone: config.targetTimezone },
    async () => {
      try {
        await runReport(env);
      } catch (err) {
        console.error("Report run failed:", err);
      }
    }
  );
}

process.on("SIGINT", () => {
  console.log("\nShutting down.");
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
