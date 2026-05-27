import OpenAI from "openai";
import type { ReportData, Disruption, WeatherSummary, CryptoPrice } from "./types";
import { numberToGermanWords } from "./numbers";

const SYSTEM_PROMPT = `Du erstellst eine tägliche Morgeninfo auf Deutsch, die per Text-to-Speech vorgelesen wird. Schreibe ausschließlich natürliche, gesprochene Sätze. Keine Anrede, kein Abschluss, keine Aufzählungszeichen, keine Sonderzeichen.

PFLICHTSTRUKTUR — alle vier Blöcke müssen in dieser Reihenfolge erscheinen, sofern die Daten vorhanden sind:

1. WETTER (immer angeben):
   Nenne Temperatur und Wetterzustand immer. Bei Wetterwarnungen, Regen oder Sturm ergänzen.
   Schreibe "Grad" statt "°C". Keine Rohdaten wie "km/h" oder "mm".

2. ÖPNV-STATUS (immer angeben):
   Wenn keine Störungen vorhanden sind: Sage ausdrücklich, dass alle überwachten Linien planmäßig fahren.
   Wenn Störungen vorhanden sind: Ein kurzer Satz pro betroffener Linie aus "ueberwachte_linien".
   STRIKT: Nenne ausschließlich Linien aus "ueberwachte_linien". Andere Linien oder Verkehrsmittel, die in Störungsbeschreibungen erwähnt werden, komplett ignorieren.

3. KRYPTO:
   Nenne ALLE Kurse aus dem "krypto"-Array, jeden einzeln mit Name und Betrag. Keinen Coin auslassen, nicht zusammenfassen. Übernimm den Wert von "kurs" wortwörtlich (er ist bereits als deutsches Zahlwort ausgeschrieben). Wandle ihn nicht zurück in Ziffern um.

Kein Satz darf mitten im Gedanken enden.`;



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
        krypto: cryptoPrices.map((c) => ({
          name: c.name,
          kurs: `${numberToGermanWords(Math.round(c.usdPrice))} Dollar`,
        })),
      }),
      ueberwachte_linien: data.segments.map(
        (s) => `${s.lines.join("/")} (${s.fromName} → ${s.toName})`
      ),
    },
    null,
    2
  );

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 500,
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
      ? `Krypto: ${cryptoPrices.map((c) => `${c.name} ${numberToGermanWords(Math.round(c.usdPrice))} Dollar`).join(", ")}`
      : "";

  return [weatherLine, alertLines, "Störungen:", disruptionLines, cryptoLine]
    .filter(Boolean)
    .join("\n\n");
}
