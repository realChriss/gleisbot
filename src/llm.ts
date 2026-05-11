import OpenAI from "openai";
import type { ReportData, Disruption, WeatherSummary } from "./types";

const SYSTEM_PROMPT = `Du bist ein freundlicher persönlicher Assistent, der jeden Morgen kurz und direkt über den Pendelweg informiert. \
Sprich den Nutzer wie einen guten Bekannten an — locker, warm, ohne Förmlichkeit. \
Antworte auf Deutsch, maximal 100 Wörter, keine Aufzählungszeichen. \
Erwähne das Wetter nur wenn es relevant ist (Regen, Kälte, Sturm). \
Störungen nur wenn vorhanden — sonst kein Satz darüber. \
Schließe mit einem kurzen, natürlichen Satz ab.`;

export async function generateSummary(
  data: ReportData,
  apiKey: string
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const userContent = JSON.stringify(
    {
      datum: data.date,
      wetter: {
        temperatur: `${data.weather.currentTemp}°C`,
        niederschlag_mm: data.weather.precipitation,
        wind_kmh: data.weather.windSpeed,
        zustand: data.weather.condition,
        warnungen: data.weather.alerts.map((a) => ({
          schlagzeile: a.headline,
          schwere: a.severity,
        })),
      },
      stoerungen:
        data.disruptions.length > 0
          ? data.disruptions.map((d) => ({
              linie: d.line,
              schlagzeile: d.headline,
              beschreibung: d.description,
              gueltig_von: d.validFrom,
              gueltig_bis: d.validTo,
              prioritaet: d.priority,
            }))
          : "Keine bekannten Störungen auf den überwachten Linien.",
      ueberwachte_linien: data.segments.map(
        (s) => `${s.lines.join("/")} (${s.fromName} → ${s.toName})`
      ),
    },
    null,
    2
  );

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 150,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  return response.choices[0]?.message.content ?? buildFallbackSummary(data.disruptions, data.weather);
}

export async function textToSpeech(text: string, apiKey: string): Promise<ArrayBuffer> {
  const client = new OpenAI({ apiKey });
  const response = await client.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
    response_format: "opus",
  });
  return response.arrayBuffer();
}

export function buildFallbackSummary(
  disruptions: Disruption[],
  weather: WeatherSummary
): string {
  const weatherLine = `Wetter: ${weather.currentTemp}°C, ${weather.condition}, Wind ${weather.windSpeed} km/h, Niederschlag ${weather.precipitation} mm.`;

  const disruptionLines =
    disruptions.length > 0
      ? disruptions.map((d) => `${d.line}: ${d.headline}`).join("\n")
      : "Keine bekannten Störungen.";

  const alertLines =
    weather.alerts.length > 0
      ? `Wetterwarnungen: ${weather.alerts.map((a) => a.headline).join(", ")}`
      : "";

  return [weatherLine, alertLines, "Störungen:", disruptionLines]
    .filter(Boolean)
    .join("\n\n");
}
