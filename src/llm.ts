import OpenAI from "openai";
import type { ReportData, Disruption, WeatherSummary } from "./types";

const SYSTEM_PROMPT = `Du bist ein präziser Pendler-Assistent für Frankfurt und Offenbach. \
Erstelle eine kurze, strukturierte Zusammenfassung für den Morgen-Pendler. \
Antworte auf Deutsch. Maximal 300 Wörter. \
Schreibe in flüssigen Absätzen ohne Aufzählungszeichen. \
Struktur: 1. Wetterlage für den Morgen (1–2 Sätze). \
2. Störungen und Hinweise zu den überwachten Linien — nur erwähnen wenn vorhanden, sonst weglassen. \
3. Kurzes Fazit oder Empfehlung (1 Satz).`;

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
        (s) => `${s.line} (${s.fromName} → ${s.toName})`
      ),
    },
    null,
    2
  );

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 400,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  return response.choices[0]?.message.content ?? buildFallbackSummary(data.disruptions, data.weather);
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
