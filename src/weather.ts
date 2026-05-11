import type { WeatherSummary, WeatherAlert, BrightSkyWeatherRecord, BrightSkyAlert } from "./types";

const BASE_URL = "https://api.brightsky.dev";

const ICON_TO_CONDITION: Record<string, string> = {
  "clear-day": "sonnig",
  "clear-night": "klar",
  "partly-cloudy-day": "teilweise bewölkt",
  "partly-cloudy-night": "teilweise bewölkt",
  cloudy: "bewölkt",
  fog: "neblig",
  wind: "windig",
  rain: "Regen",
  sleet: "Schneeregen",
  snow: "Schnee",
  hail: "Hagel",
  thunderstorm: "Gewitter",
};

function iconToCondition(icon: string | null): string {
  if (!icon) return "unbekannt";
  return ICON_TO_CONDITION[icon] ?? icon;
}

async function fetchWeatherRecords(
  lat: number,
  lon: number,
  date: string
): Promise<BrightSkyWeatherRecord[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    date: `${date}T00:00`,
    last_date: `${date}T23:59`,
    tz: "Europe/Berlin",
    units: "dwd",
  });

  const res = await fetch(`${BASE_URL}/weather?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Bright Sky /weather failed: HTTP ${res.status}`);

  const data = await res.json() as { weather?: BrightSkyWeatherRecord[] };
  return data.weather ?? [];
}

async function fetchAlerts(lat: number, lon: number): Promise<BrightSkyAlert[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });

  const res = await fetch(`${BASE_URL}/alerts?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Bright Sky /alerts failed: HTTP ${res.status}`);

  const data = await res.json() as { alerts?: BrightSkyAlert[] };
  return data.alerts ?? [];
}

function summariseRecords(records: BrightSkyWeatherRecord[]): Pick<WeatherSummary, "currentTemp" | "precipitation" | "windSpeed" | "condition"> {
  // Use 06:00–09:00 window for morning commute
  const morning = records.filter((r) => {
    const hour = new Date(r.timestamp).getHours();
    return hour >= 6 && hour <= 9;
  });

  const source = morning.length > 0 ? morning : records;

  const currentTemp = source[0]?.temperature ?? 0;
  const precipitation = source.reduce((sum, r) => sum + (r.precipitation ?? 0), 0);
  const windSpeed = Math.max(...source.map((r) => r.wind_speed ?? 0));
  const condition = iconToCondition(source[0]?.icon ?? null);

  return { currentTemp, precipitation, windSpeed, condition };
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherSummary> {
  const today = new Date().toISOString().slice(0, 10);

  const [records, rawAlerts] = await Promise.all([
    fetchWeatherRecords(lat, lon, today),
    fetchAlerts(lat, lon),
  ]);

  const { currentTemp, precipitation, windSpeed, condition } = summariseRecords(records);

  const alerts: WeatherAlert[] = rawAlerts.map((a) => ({
    headline: a.headline_de || a.headline_en,
    description: a.description_de || a.description_en,
    severity: a.severity,
    onset: a.onset,
    expires: a.expires,
  }));

  return { currentTemp, precipitation, windSpeed, condition, alerts };
}
