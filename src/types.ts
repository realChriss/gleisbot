export interface RouteSegment {
  type: "ubahn" | "sbahn" | "bus" | "tram";
  line: string;
  fromStopId: string;
  toStopId: string;
  fromName: string;
  toName: string;
}

export interface Config {
  route: RouteSegment[];
  weather: { lat: number; lon: number };
  targetHour: number;
  targetTimezone: string;
  language: string;
  disruptionLookaheadDays: number;
}

export interface Disruption {
  himId: string;
  line: string;
  headline: string;
  description: string;
  validFrom: string;
  validTo: string;
  priority: number;
  category?: string;
}

export interface WeatherAlert {
  headline: string;
  description: string;
  severity: string;
  onset: string;
  expires: string;
}

export interface WeatherSummary {
  currentTemp: number;
  precipitation: number;
  windSpeed: number;
  condition: string;
  alerts: WeatherAlert[];
}

export interface ReportData {
  date: string;
  disruptions: Disruption[];
  weather: WeatherSummary;
  language: string;
  segments: RouteSegment[];
}

export interface RmvHimMessage {
  himId: string;
  act: boolean;
  head: string;
  text: string;
  lead?: string;
  prio: number;
  cat?: string;
  sDate: string;
  sTime: string;
  eDate: string;
  eTime: string;
  affectedProducts?: Array<{
    name: string;
    line: string;
    catCode: string;
  }>;
}

export interface BrightSkyWeatherRecord {
  timestamp: string;
  temperature: number | null;
  precipitation: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  condition: string | null;
  icon: string | null;
  cloud_cover: number | null;
}

export interface BrightSkyAlert {
  id: number;
  alert_id: string;
  onset: string;
  expires: string;
  severity: string;
  headline_en: string;
  headline_de: string;
  description_en: string;
  description_de: string;
  event_de: string;
  event_en: string;
}
