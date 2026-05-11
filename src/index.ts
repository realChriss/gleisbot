import rawConfig from "../config.json";
import { fetchDisruptions, findStops } from "./rmv";
import { fetchWeather } from "./weather";
import { generateSummary, buildFallbackSummary } from "./llm";
import { sendTelegramMessage } from "./telegram";
import type { Disruption, WeatherSummary, Config } from "./types";

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

function getBerlinHour(): number {
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: config.targetTimezone,
    hour: "numeric",
    hour12: false,
  });
  return Number(formatter.format(new Date()));
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

  await sendTelegramMessage(summary, env.botToken, env.chatId);
  console.log("  Report sent to Telegram.");
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

  // Scheduler mode: fires at 4 AM and 5 AM UTC (covers 6 AM Berlin in both CET and CEST)
  // Inside the handler we check the Berlin local hour to avoid running twice.
  let lastRunDate = "";

  console.log(`Scheduler started. Will run at ${config.targetHour}:00 ${config.targetTimezone} on weekdays.`);
  console.log("(Tip: run with --now to trigger immediately, --find-stops to look up stop IDs)\n");

  Bun.cron("0 4,5 * * 1-5", async () => {
    const berlinHour = getBerlinHour();
    const today = new Date().toISOString().slice(0, 10);

    if (berlinHour !== config.targetHour) return;
    if (lastRunDate === today) return;

    lastRunDate = today;

    try {
      await runReport(env);
    } catch (err) {
      console.error("Report run failed:", err);
    }
  });
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
