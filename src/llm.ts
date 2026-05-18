import OpenAI from "openai";
import type { ReportData, Disruption, WeatherSummary, CryptoPrice } from "./types";

const SYSTEM_PROMPT = `Erstelle eine kurze Morgeninfo auf Deutsch, die vorgelesen wird. Schreibe natürliche, gesprochene Sätze — kein Aufzählen von Rohdaten, keine Einheiten wie "km/h" oder "mm". Keine Anrede, kein Abschluss, kein Fülltext.

STRIKTE REGEL:
Linien: Nenne ausschließlich Linien, die in "ueberwachte_linien" aufgeführt sind. Auch wenn eine Störungsbeschreibung andere Linien oder Verkehrsmittel erwähnt, darfst du diese nicht nennen. Filtere sie stillschweigend heraus.
Wetter: Nur erwähnen wenn relevant (Regen, Kälte, Sturm). Bei normalem Wetter kein Wort.
Störungen: Nur wenn vorhanden, ein kurzer Satz pro Linie. Nur die betroffene überwachte Linie nennen.
Krypto: Nur kurz erwähnen wenn vorhanden. Zahlen nie umformatieren — keine Tausenderpunkte, keine Kommas.`;


export async function generateSummary(
  data: ReportData,
  apiKey: string,
  cryptoPrices: CryptoPrice[] = []
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
      ...(cryptoPrices.length > 0 && {
        krypto: cryptoPrices.map((c) => ({ name: c.name, kurs: `${Math.round(c.usdPrice)} Dollar` })),
      }),
      ueberwachte_linien: data.segments.map(
        (s) => `${s.lines.join("/")} (${s.fromName} → ${s.toName})`
      ),
    },
    null,
    2
  );

  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 150,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  return response.choices[0]?.message.content || buildFallbackSummary(data.disruptions, data.weather, cryptoPrices);
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
  weather: WeatherSummary,
  cryptoPrices: CryptoPrice[] = []
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

  const cryptoLine =
    cryptoPrices.length > 0
      ? `Krypto: ${cryptoPrices.map((c) => `${c.name} ${Math.round(c.usdPrice)} Dollar`).join(", ")}`
      : "";

  return [weatherLine, alertLines, "Störungen:", disruptionLines, cryptoLine]
    .filter(Boolean)
    .join("\n\n");
}
