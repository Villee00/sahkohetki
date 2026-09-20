import type {
  HistoryDayCell,
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

type HistoryTrendChartProps = {
  days: readonly HistoryDayCell[];
  basis: HistoryPriceBasis;
  selectedStartDateKey: string;
  selectedEndDateKey: string;
};

type TrendPoint = {
  dateKey: string;
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

function dateLabel(dateKey: string): string {
  return dateFormatter.format(new Date(`${dateKey}T00:00:00.000Z`));
}

function yForValue(value: number, minimum: number, maximum: number): number {
  const range = maximum - minimum || 1;
  return PLOT_TOP + ((maximum - value) / range) * PLOT_HEIGHT;
}

function buildTrendPoints(
  days: readonly HistoryDayCell[],
  basis: HistoryPriceBasis,
  selectedStartDateKey: string,
  selectedEndDateKey: string,
): { points: TrendPoint[]; minimum: number; maximum: number } {
  const values = days.flatMap((day) => {
    const value = valueForDay(day, basis);
    return value === null ? [] : [value];
  });
  const minimumValue = values.length > 0 ? Math.min(...values) : 0;
  const maximumValue = values.length > 0 ? Math.max(...values) : 1;
  const padding = Math.max((maximumValue - minimumValue) * 0.08, 1);
  const minimum = minimumValue - padding;
  const maximum = maximumValue + padding;
  const denominator = Math.max(days.length - 1, 1);

  return {
    minimum,
    maximum,
    points: days.map((day, index) => {
      const value = valueForDay(day, basis);
      return {
        dateKey: day.dateKey,
        value,
        x: PLOT_LEFT + (index / denominator) * PLOT_WIDTH,
        y: value === null ? null : yForValue(value, minimum, maximum),
        selected:
          day.dateKey >= selectedStartDateKey &&
          day.dateKey <= selectedEndDateKey,
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
  basis,
  selectedStartDateKey,
  selectedEndDateKey,
}: HistoryTrendChartProps) {
  const { points, minimum, maximum } = buildTrendPoints(
    days,
    basis,
    selectedStartDateKey,
    selectedEndDateKey,
  );
  const segments = lineSegments(points);
  const unit = unitForBasis(basis);
  const axisIndexes = [
    ...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  ];

  return (
    <section
      className="history-trend glass-panel"
      aria-labelledby="history-trend-heading"
    >
      <div className="history-trend__header">
        <div>
          <p className="history-eyebrow">Päiväkohtainen näkymä</p>
          <h2 id="history-trend-heading">Päivittäinen hintakehitys</h2>
          <p className="history-trend__description">
            Viiva näyttää kunkin täydellisen päivän keskihinnan. Katkos
            tarkoittaa, että kyseiseltä päivältä puuttuu tietoja.
          </p>
        </div>
        <span className="history-trend__unit">{unit}</span>
      </div>

      <div className="history-trend__canvas">
        <svg
          className="history-trend__svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-labelledby="history-trend-heading history-trend-description"
          preserveAspectRatio="none"
        >
          <desc id="history-trend-description">
            Päivittäiset {unit} hinnat valitulta historiajaksolta.
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
                key={point.dateKey}
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
                {dateLabel(point.dateKey)}
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
            point.y === null ? null : (
              <circle
                key={point.dateKey}
                className={`history-trend__point${
                  point.selected ? " is-selected" : ""
                }`}
                cx={point.x}
                cy={point.y}
                r={point.selected ? 4 : 2.5}
                aria-hidden="true"
              />
            ),
          )}
        </svg>
      </div>

      <table
        className="history-trend__table sr-only"
        aria-label="Päivittäiset hintatiedot"
      >
        <caption>Päivittäiset hinnat</caption>
        <thead>
          <tr>
            <th scope="col">Päivä</th>
            <th scope="col">Keskihinta ({unit})</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.dateKey}>
              <th scope="row">{dateLabel(point.dateKey)}</th>
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
