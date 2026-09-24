import { useState } from "react";
import type {
  HistoryDayCell,
  HistoryPeriodSummary,
  HistoryPriceBasis,
} from "../../lib/history-types";

const CHART_WIDTH = 960;
const CHART_HEIGHT = 280;
const PLOT_LEFT = 52;
const PLOT_RIGHT = 18;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 34;
const PLOT_WIDTH = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;

const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const numberFormatter = new Intl.NumberFormat("fi-FI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type HistoryTrendGranularity = "day" | "week";

type HistoryTrendChartProps = {
  days: readonly HistoryDayCell[];
  periods: {
    week: readonly HistoryPeriodSummary[];
  };
  basis: HistoryPriceBasis;
  selectedStartDateKey: string;
  selectedEndDateKey: string;
  onSelectPeriod: (
    granularity: HistoryTrendGranularity,
    periodId: string,
  ) => void;
};

type TrendPoint = {
  id: string;
  startDateKey: string;
  endDateKey: string;
  value: number | null;
  x: number;
  y: number | null;
  selected: boolean;
};

function valueForDay(
  day: HistoryDayCell,
  basis: HistoryPriceBasis,
): number | null {
  if (!day.complete || !day.average) return null;
  return basis === "raw"
    ? day.average.rawEurPerMwh
    : day.average.householdCentsPerKwh;
}

function unitForBasis(basis: HistoryPriceBasis): string {
  return basis === "raw" ? "€/MWh" : "snt/kWh sis. alv.";
}

function tooltipX(pointX: number, halfWidth: number): number {
  return Math.min(
    CHART_WIDTH - PLOT_RIGHT - halfWidth,
    Math.max(PLOT_LEFT + halfWidth, pointX),
  );
}

function dateLabel(dateKey: string): string {
  return dateFormatter.format(new Date(`${dateKey}T00:00:00.000Z`));
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function periodLabel(
  startDateKey: string,
  endDateKey: string,
  granularity: HistoryTrendGranularity,
): string {
  if (granularity === "day") return dateLabel(startDateKey);
  return `${dateLabel(startDateKey)}–${dateLabel(endDateKey)}`;
}

function pointAccessibleLabel(
  point: TrendPoint,
  unit: string,
  granularity: HistoryTrendGranularity,
): string {
  const kind = granularity === "week" ? "viikko" : "päivä";
  return `Valitse ${kind} ${periodLabel(
    point.startDateKey,
    point.endDateKey,
    granularity,
  )}, keskihinta ${numberFormatter.format(point.value ?? 0)} ${unit}`;
}

function yForValue(value: number, minimum: number, maximum: number): number {
  const range = maximum - minimum || 1;
  return PLOT_TOP + ((maximum - value) / range) * PLOT_HEIGHT;
}

function valueForPeriod(
  period: HistoryPeriodSummary,
  basis: HistoryPriceBasis,
): number {
  return basis === "raw"
    ? period.average.rawEurPerMwh
    : period.average.householdCentsPerKwh;
}

function weeklyTrendData(
  periods: readonly HistoryPeriodSummary[],
  basis: HistoryPriceBasis,
): Array<{
  id: string;
  startDateKey: string;
  endDateKey: string;
  value: number | null;
}> {
  const trendData: Array<{
    id: string;
    startDateKey: string;
    endDateKey: string;
    value: number | null;
  }> = [];
  let previousStartDateKey: string | null = null;

  for (const period of periods) {
    if (previousStartDateKey) {
      let gapStartDateKey = addDays(previousStartDateKey, 7);
      while (gapStartDateKey < period.startDateKey) {
        trendData.push({
          id: `gap:${gapStartDateKey}`,
          startDateKey: gapStartDateKey,
          endDateKey: addDays(gapStartDateKey, 6),
          value: null,
        });
        gapStartDateKey = addDays(gapStartDateKey, 7);
      }
    }

    trendData.push({
      id: period.id,
      startDateKey: period.startDateKey,
      endDateKey: period.endDateKey,
      value: valueForPeriod(period, basis),
    });
    previousStartDateKey = period.startDateKey;
  }

  return trendData;
}

function buildTrendPoints(
  trendData: readonly {
    id: string;
    startDateKey: string;
    endDateKey: string;
    value: number | null;
  }[],
  selectedStartDateKey: string,
  selectedEndDateKey: string,
): { points: TrendPoint[]; minimum: number; maximum: number } {
  const values = trendData.flatMap((datum) =>
    datum.value === null ? [] : [datum.value],
  );
  const minimumValue = values.length > 0 ? Math.min(...values) : 0;
  const maximumValue = values.length > 0 ? Math.max(...values) : 1;
  const padding = Math.max((maximumValue - minimumValue) * 0.08, 1);
  const minimum = minimumValue - padding;
  const maximum = maximumValue + padding;
  const denominator = Math.max(trendData.length - 1, 1);

  return {
    minimum,
    maximum,
    points: trendData.map((datum, index) => {
      const value = datum.value;
      return {
        id: datum.id,
        startDateKey: datum.startDateKey,
        endDateKey: datum.endDateKey,
        value,
        x: PLOT_LEFT + (index / denominator) * PLOT_WIDTH,
        y: value === null ? null : yForValue(value, minimum, maximum),
        selected:
          datum.startDateKey <= selectedEndDateKey &&
          datum.endDateKey >= selectedStartDateKey,
      };
    }),
  };
}

function lineSegments(points: readonly TrendPoint[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length > 0) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${point.x},${point.y}`);
  }
  if (current.length > 0) segments.push(current.join(" "));
  return segments;
}

function tickValues(minimum: number, maximum: number): number[] {
  const range = maximum - minimum || 1;
  return [0, 0.25, 0.5, 0.75, 1].map((position) => maximum - range * position);
}

export function HistoryTrendChart({
  days,
  periods,
  basis,
  selectedStartDateKey,
  selectedEndDateKey,
  onSelectPeriod,
}: HistoryTrendChartProps) {
  const [trendGranularity, setTrendGranularity] =
    useState<HistoryTrendGranularity>("week");
  const [activePointId, setActivePointId] = useState<string | null>(
    null,
  );
  const trendData =
    trendGranularity === "week"
      ? weeklyTrendData(periods.week, basis)
      : days.map((day) => ({
          id: `day:${day.dateKey}`,
          startDateKey: day.dateKey,
          endDateKey: day.dateKey,
          value: valueForDay(day, basis),
        }));
  const { points, minimum, maximum } = buildTrendPoints(
    trendData,
    selectedStartDateKey,
    selectedEndDateKey,
  );
  const segments = lineSegments(points);
  const unit = unitForBasis(basis);
  const trendLabel =
    trendGranularity === "week"
      ? "Viikoittainen hintakehitys"
      : "Päivittäinen hintakehitys";
  const tableLabel =
    trendGranularity === "week"
      ? "Viikoittaiset hintatiedot"
      : "Päivittäiset hintatiedot";
  const axisIndexes = [
    ...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  ];
  const activePoint = points.find(
    (point) => point.id === activePointId,
  );
  const hitWidth = Math.max(
    8,
    PLOT_WIDTH / Math.max(points.length - 1, 1),
  );
  const tooltipHalfWidth = trendGranularity === "week" ? 98 : 68;

  return (
    <section
      className="history-trend glass-panel"
      aria-labelledby="history-trend-heading"
    >
      <div className="history-trend__header">
        <div>
          <p className="history-eyebrow">
            {trendGranularity === "week"
              ? "Viikkokohtainen näkymä"
              : "Päiväkohtainen näkymä"}
          </p>
          <h2 id="history-trend-heading">{trendLabel}</h2>
          <p className="history-trend__description">
            Viiva näyttää kunkin{" "}
            {trendGranularity === "week" ? "täydellisen ISO-viikon" : "täydellisen päivän"}{" "}
            keskihinnan. Katkos tarkoittaa, että tietoja puuttuu. Vie hiiri
            pisteen päälle tai valitse se näppäimistöllä.
          </p>
        </div>
        <div className="history-trend__tools">
          <div
            className="history-trend__controls"
            role="group"
            aria-label="Kaavion aikaväli"
          >
            <button
              type="button"
              aria-pressed={trendGranularity === "week"}
              className={trendGranularity === "week" ? "is-active" : ""}
              onClick={() => setTrendGranularity("week")}
            >
              Viikko
            </button>
            <button
              type="button"
              aria-pressed={trendGranularity === "day"}
              className={trendGranularity === "day" ? "is-active" : ""}
              onClick={() => setTrendGranularity("day")}
            >
              Päivä
            </button>
          </div>
          <span className="history-trend__unit">{unit}</span>
        </div>
      </div>

      <div className="history-trend__canvas">
        <svg
          className="history-trend__svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="group"
          aria-labelledby="history-trend-heading history-trend-description"
          preserveAspectRatio="none"
        >
          <desc id="history-trend-description">
            {trendGranularity === "week" ? "Viikoittaiset" : "Päivittäiset"}{" "}
            {unit} hinnat valitulta historiajaksolta.
          </desc>
          {tickValues(minimum, maximum).map((value, index) => {
            const y = yForValue(value, minimum, maximum);
            return (
              <g key={index} aria-hidden="true">
                <line
                  className="history-trend__grid-line"
                  x1={PLOT_LEFT}
                  x2={CHART_WIDTH - PLOT_RIGHT}
                  y1={y}
                  y2={y}
                />
                <text
                  className="history-trend__tick"
                  x={PLOT_LEFT - 10}
                  y={y + 4}
                  textAnchor="end"
                >
                  {numberFormatter.format(value)}
                </text>
              </g>
            );
          })}
          {axisIndexes.map((index) => {
            const point = points[index];
            if (!point) return null;
            return (
              <text
                key={point.id}
                className="history-trend__axis-label"
                x={point.x}
                y={CHART_HEIGHT - 8}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === points.length - 1
                      ? "end"
                      : "middle"
                }
                aria-hidden="true"
              >
                {dateLabel(point.startDateKey)}
              </text>
            );
          })}
          {segments.map((segment, index) => (
            <path
              key={index}
              className="history-trend__line"
              d={segment}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {points.map((point) =>
            point.y === null || point.value === null ? null : (
              <g
                key={point.id}
                className={`history-trend__interactive-point${
                  point.selected ? " is-selected" : ""
                }`}
                role="button"
                tabIndex={0}
                aria-label={pointAccessibleLabel(
                  point,
                  unit,
                  trendGranularity,
                )}
                aria-pressed={point.selected}
                onBlur={() => setActivePointId(null)}
                onClick={() => onSelectPeriod(trendGranularity, point.id)}
                onFocus={() => setActivePointId(point.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectPeriod(trendGranularity, point.id);
                  }
                }}
                onMouseEnter={() => setActivePointId(point.id)}
                onMouseLeave={() => setActivePointId(null)}
              >
                <rect
                  className="history-trend__hit-area"
                  x={point.x - hitWidth / 2}
                  y={PLOT_TOP}
                  width={hitWidth}
                  height={PLOT_HEIGHT}
                  aria-hidden="true"
                />
                <circle
                  className={`history-trend__point${
                    point.selected ? " is-selected" : ""
                  }`}
                  cx={point.x}
                  cy={point.y}
                  r={point.selected ? 4 : 2.5}
                  aria-hidden="true"
                />
              </g>
            ),
          )}
          {activePoint && activePoint.y !== null && activePoint.value !== null ? (
            <g
              className="history-trend__tooltip"
              role="tooltip"
              transform={`translate(${tooltipX(activePoint.x, tooltipHalfWidth)}, ${Math.max(
                PLOT_TOP + 24,
                activePoint.y - 34,
              )})`}
              pointerEvents="none"
            >
              <rect
                x={-tooltipHalfWidth}
                y={-24}
                width={tooltipHalfWidth * 2}
                height={42}
                rx={7}
              />
              <text className="history-trend__tooltip-date" x={0} y={-7}>
                {periodLabel(
                  activePoint.startDateKey,
                  activePoint.endDateKey,
                  trendGranularity,
                )}
              </text>
              <text className="history-trend__tooltip-price" x={0} y={11}>
                {numberFormatter.format(activePoint.value)} {unit}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      <table
        className="history-trend__table sr-only"
        aria-label={tableLabel}
      >
        <caption>{tableLabel}</caption>
        <thead>
          <tr>
            <th scope="col">
              {trendGranularity === "week" ? "Viikko" : "Päivä"}
            </th>
            <th scope="col">Keskihinta ({unit})</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.id}>
              <th scope="row">
                {periodLabel(
                  point.startDateKey,
                  point.endDateKey,
                  trendGranularity,
                )}
              </th>
              <td>
                {point.value === null
                  ? "Hintatieto puuttuu"
                  : numberFormatter.format(point.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
