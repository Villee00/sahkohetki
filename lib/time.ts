const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

const HELSINKI_LOCAL_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: HELSINKI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const HELSINKI_OFFSET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: HELSINKI_TIME_ZONE,
  hour: "2-digit",
  timeZoneName: "shortOffset",
});

type Instant = Date | string | number;

type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalDateTimeParts = CalendarDateParts & {
  hour: number;
  minute: number;
  second: number;
};

function getPartValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPart["type"],
): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new Error(`Missing ${type} part from Helsinki time formatter.`);
  }
  return value;
}

function toMilliseconds(instant: Instant): number {
  let milliseconds: number;
  if (instant instanceof Date) {
    milliseconds = instant.getTime();
  } else if (typeof instant === "number") {
    milliseconds = instant;
  } else {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(instant)) {
      throw new RangeError("String instants must include an explicit Z or timezone offset.");
    }
    milliseconds = Date.parse(instant);
  }
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError("Invalid instant.");
  }
  return milliseconds;
}

function getLocalDateTimeParts(milliseconds: number): LocalDateTimeParts {
  const parts = HELSINKI_LOCAL_PARTS_FORMATTER.formatToParts(new Date(milliseconds));
  return {
    year: Number(getPartValue(parts, "year")),
    month: Number(getPartValue(parts, "month")),
    day: Number(getPartValue(parts, "day")),
    hour: Number(getPartValue(parts, "hour")),
    minute: Number(getPartValue(parts, "minute")),
    second: Number(getPartValue(parts, "second")),
  };
}

function formatCalendarDate(parts: CalendarDateParts): string {
  return [parts.year, parts.month, parts.day]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function parseDateKey(dateKey: string): CalendarDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`Invalid Helsinki date key: ${dateKey}`);

  const parts: CalendarDateParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const candidate = new Date(0);
  candidate.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  candidate.setUTCHours(0, 0, 0, 0);
  if (
    candidate.getUTCFullYear() !== parts.year ||
    candidate.getUTCMonth() !== parts.month - 1 ||
    candidate.getUTCDate() !== parts.day
  ) {
    throw new RangeError(`Invalid Helsinki date key: ${dateKey}`);
  }
  return parts;
}

function datePartsToUtcGuess(parts: CalendarDateParts): number {
  const guess = new Date(0);
  guess.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  guess.setUTCHours(0, 0, 0, 0);
  return guess.getTime();
}

function getOffsetMilliseconds(milliseconds: number): number {
  const parts = HELSINKI_OFFSET_FORMATTER.formatToParts(new Date(milliseconds));
  const label = getPartValue(parts, "timeZoneName");
  if (label === "GMT" || label === "UTC") return 0;

  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(label);
  if (!match) throw new Error(`Unsupported Helsinki offset: ${label}`);

  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  const totalMinutes = hours * MINUTES_PER_HOUR + minutes;
  return (match[1] === "-" ? -1 : 1) * totalMinutes * MILLISECONDS_PER_MINUTE;
}

function formatOffset(milliseconds: number): string {
  const offsetMinutes = getOffsetMilliseconds(milliseconds) / MILLISECONDS_PER_MINUTE;
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / MINUTES_PER_HOUR);
  const minutes = absoluteMinutes % MINUTES_PER_HOUR;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

function localMidnightToMilliseconds(dateKey: string): number {
  const dateParts = parseDateKey(dateKey);
  const utcGuess = datePartsToUtcGuess(dateParts);
  const firstEstimate = utcGuess - getOffsetMilliseconds(utcGuess);
  return utcGuess - getOffsetMilliseconds(firstEstimate);
}

function addCalendarDays(dateKey: string, days: number): string {
  const date = new Date(datePartsToUtcGuess(parseDateKey(dateKey)));
  date.setUTCDate(date.getUTCDate() + days);
  return formatCalendarDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function localWallKey(milliseconds: number): string {
  const parts = getLocalDateTimeParts(milliseconds);
  return `${formatCalendarDate(parts)}T${String(parts.hour).padStart(2, "0")}:${String(
    parts.minute,
  ).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
}

function isAmbiguousLocalInstant(milliseconds: number): boolean {
  const wallKey = localWallKey(milliseconds);
  for (
    let delta = 15 * MILLISECONDS_PER_MINUTE;
    delta <= 3 * MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE;
    delta += 15 * MILLISECONDS_PER_MINUTE
  ) {
    if (localWallKey(milliseconds - delta) === wallKey || localWallKey(milliseconds + delta) === wallKey) {
      return true;
    }
  }
  return false;
}

function formatLocalTime(milliseconds: number): string {
  const parts = getLocalDateTimeParts(milliseconds);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function getHelsinkiDateKey(instant: Instant): string {
  const parts = getLocalDateTimeParts(toMilliseconds(instant));
  return formatCalendarDate(parts);
}

export function getNextHelsinkiDateKey(dateKey: string): string {
  return addCalendarDays(dateKey, 1);
}

export function getHelsinkiDateBounds(dateKey: string): {
  startAt: string;
  endAt: string;
} {
  const startMilliseconds = localMidnightToMilliseconds(dateKey);
  const endMilliseconds = localMidnightToMilliseconds(getNextHelsinkiDateKey(dateKey));
  return {
    startAt: new Date(startMilliseconds).toISOString(),
    endAt: new Date(endMilliseconds).toISOString(),
  };
}

export function formatIntervalLabel(startAt: Instant, endAt: Instant): string {
  const startMilliseconds = toMilliseconds(startAt);
  const endMilliseconds = toMilliseconds(endAt);
  const label = `${formatLocalTime(startMilliseconds)}–${formatLocalTime(endMilliseconds)}`;
  const startOffset = formatOffset(startMilliseconds);
  const endOffset = formatOffset(endMilliseconds);

  if (
    !isAmbiguousLocalInstant(startMilliseconds) &&
    !isAmbiguousLocalInstant(endMilliseconds) &&
    startOffset === endOffset
  ) {
    return label;
  }

  const offsetSuffix = startOffset === endOffset
    ? startOffset
    : `${startOffset}→${endOffset}`;
  return `${label} (${offsetSuffix})`;
}
