"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { ForecastInterval } from "../../lib/forecast-types";

type PriceHour = { startAt: string; priceCentsPerKwh: number | null };
type Series = "wind" | "solar" | "price";
type DateLabelPosition = { left: number; alignment: "start" | "center" | "end" };

type Props = {
  points: ForecastInterval[];
  prices: PriceHour[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const WIDTH = 1080;
const HEIGHT = 146;
const LEFT = 60;
const RIGHT = 16;
const TOP = 12;
const BOTTOM = 32;
const plotHeight = HEIGHT - TOP - BOTTOM;
const number = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });
const priceNumber = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });
const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hour: "2-digit", hourCycle: "h23" });
const clockTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayAndDate = new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", weekday: "short", day: "numeric", month: "numeric" });
const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" });
const dateTime = new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

function x(index: number, length: number, left = LEFT) {
  const width = WIDTH - left - RIGHT;
  return left + (length < 2 ? width / 2 : index * width / (length - 1));
}

function y(value: number, minimum: number, maximum: number) {
  return TOP + (maximum - value) / (maximum - minimum) * plotHeight;
}

function segments(values: (number | null)[], minimum: number, maximum: number, left = LEFT) {
  const paths: string[] = [];
  let commands: string[] = [];
  const flush = () => { if (commands.length) paths.push(commands.join(" ")); commands = []; };
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) { flush(); return; }
    commands.push(`${commands.length ? "L" : "M"} ${x(index, values.length, left).toFixed(2)} ${y(value, minimum, maximum).toFixed(2)}`);
  });
  flush();
  return paths;
}

function label(value: number | null, unit: "MW" | "snt/kWh") {
  if (value === null || !Number.isFinite(value)) return "Ei saatavilla";
  return `${unit === "MW" ? number.format(Math.round(value)) : priceNumber.format(value)} ${unit}`;
}

function selectedIntervalLabel(point: ForecastInterval) {
  const start = new Date(point.startAt);
  const interval = point.label || `${clockTime.format(start)}–${clockTime.format(new Date(point.endAt))}`;
  return `Valittu tunti: ${dayAndDate.format(start)} · ${interval}`;
}

export function RenewableComparison({ points, prices, selectedId, onSelect }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [compactLayout, setCompactLayout] = useState(false);
  const [readingStickyTop, setReadingStickyTop] = useState<number | null>(null);
  const [dateLabelPositions, setDateLabelPositions] = useState<Record<number, DateLabelPosition>>({});
  const priceByStart = new Map(prices.map((point) => [point.startAt, point.priceCentsPerKwh]));
  const selectedIndex = points.findIndex((point) => point.id === selectedId);
  const selected = points[selectedIndex] ?? null;
  const priceValues = points.map((point) => priceByStart.get(point.startAt) ?? null);
  const selectedPrice = selectedIndex < 0 ? null : priceValues[selectedIndex];
  const chartLeft = compactLayout ? 18 : LEFT;
  const tracks: { kind: Series; title: string; values: (number | null)[]; capacity?: (number | null)[]; unit: "MW" | "snt/kWh" }[] = [
    { kind: "wind", title: "Tuuli", values: points.map((point) => point.windMw), capacity: points.map((point) => point.windCapacityMw), unit: "MW" },
    { kind: "solar", title: "Aurinko", values: points.map((point) => point.solarMw), capacity: points.map((point) => point.solarCapacityMw), unit: "MW" },
    { kind: "price", title: "Spot-hinta", values: priceValues, unit: "snt/kWh" },
  ];
  const dayBoundaries = useMemo(() => points.flatMap((point, index) => {
    const currentDate = dateKey.format(new Date(point.startAt));
    const previousDate = index > 0 ? dateKey.format(new Date(points[index - 1].startAt)) : null;
    return index === 0 || currentDate !== previousDate ? [index] : [];
  }), [points]);
  const dayBoundaryIndexes = useMemo(() => new Set(dayBoundaries), [dayBoundaries]);
  const timeLabels = useMemo(() => points.flatMap((point, index) => {
    const isDateBoundary = index > 0 && dayBoundaryIndexes.has(index);
    const isRegularTick = index % 6 === 0;
    const nearDateBoundary = !isDateBoundary && dayBoundaries.some((boundary) => boundary > 0 && Math.abs(boundary - index) <= 2);
    if ((!isDateBoundary && !isRegularTick) || nearDateBoundary) return [];
    const pointDate = new Date(point.startAt);
    return [{
      index,
      isDateBoundary,
      label: isDateBoundary ? dayAndDate.format(pointDate) : hour.format(pointDate),
    }];
  }), [dayBoundaries, dayBoundaryIndexes, points]);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      const updateLayout = () => setCompactLayout(window.innerWidth <= 768);
      updateLayout();
      window.addEventListener("resize", updateLayout);
      return () => window.removeEventListener("resize", updateLayout);
    }

    const media = window.matchMedia("(max-width: 47.999rem)");
    const updateLayout = () => setCompactLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;

    const updateStickyTop = () => {
      setReadingStickyTop(Math.ceil(header.getBoundingClientRect().height) + 8);
    };
    updateStickyTop();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateStickyTop);
      return () => window.removeEventListener("resize", updateStickyTop);
    }

    const observer = new ResizeObserver(updateStickyTop);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const readingStyle = readingStickyTop === null
    ? undefined
    : { "--renewable-reading-sticky-top": `${readingStickyTop}px` } as CSSProperties;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || selectedIndex < 0 || scroller.scrollWidth <= scroller.clientWidth) return;
    const hit = scroller.querySelectorAll<HTMLElement>(".renewable-comparison__track--wind .renewable-comparison__hit")[selectedIndex];
    if (!hit) return;
    const scrollerBounds = scroller.getBoundingClientRect();
    const hitBounds = hit.getBoundingClientRect();
    scroller.scrollLeft += hitBounds.left - scrollerBounds.left - scroller.clientWidth / 2 + hitBounds.width / 2;
  }, [selectedIndex, points.length, compactLayout]);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const canvas = scroller?.firstElementChild;
    if (!scroller || !(canvas instanceof HTMLElement)) return;
    if (!compactLayout) return;

    const updatePositions = () => {
      const dateLabels = new Map(
        Array.from(scroller.querySelectorAll<HTMLElement>(".renewable-comparison__time-label--date-boundary"))
          .map((element): [number, HTMLElement] => [Number(element.dataset.timeIndex), element]),
      );
      const next: Record<number, DateLabelPosition> = {};
      const leftSafeEdge = 52;
      const edgePadding = 8;
      const boundaries = new Map(timeLabels
        .filter((tick) => tick.isDateBoundary)
        .map((tick): [number, { pointX: number; labelWidth: number }] => [tick.index, {
          pointX: x(tick.index, points.length, chartLeft) / WIDTH * canvas.clientWidth,
          labelWidth: dateLabels.get(tick.index)?.getBoundingClientRect().width ?? 88,
        }]));
      const activeBoundary = Array.from(boundaries, ([index, boundary]) => ({ index, ...boundary }))
        .filter(({ pointX, labelWidth }) => pointX <= scroller.scrollLeft + leftSafeEdge + labelWidth / 2)
        .at(-1);

      for (const tick of timeLabels) {
        if (!tick.isDateBoundary) continue;
        const boundary = boundaries.get(tick.index);
        const labelWidth = boundary?.labelWidth ?? 88;
        const pointX = boundary?.pointX ?? 0;
        const visibleX = pointX - scroller.scrollLeft;
        const isActiveBoundary = activeBoundary?.index === tick.index;
        if ((visibleX + labelWidth / 2 < 0 && !isActiveBoundary)
          || visibleX - labelWidth / 2 > scroller.clientWidth) continue;

        if (visibleX - labelWidth / 2 < leftSafeEdge) {
          if (pointX <= scroller.scrollLeft + leftSafeEdge && !isActiveBoundary) continue;
          next[tick.index] = {
            left: Math.ceil(Math.max(pointX, scroller.scrollLeft + leftSafeEdge) / 8) * 8,
            alignment: "start",
          };
        } else if (visibleX + labelWidth / 2 > scroller.clientWidth - edgePadding) {
          next[tick.index] = {
            left: Math.floor((scroller.scrollLeft + scroller.clientWidth - edgePadding) / 8) * 8,
            alignment: "end",
          };
        } else {
          next[tick.index] = { left: pointX, alignment: "center" };
        }
      }

      setDateLabelPositions((current) => {
        const indexes = Object.keys(next);
        if (indexes.length !== Object.keys(current).length) return next;
        const unchanged = indexes.every((index) => {
          const currentPosition = current[Number(index)];
          return currentPosition?.alignment === next[Number(index)].alignment
            && currentPosition.left === next[Number(index)].left;
        });
        return unchanged ? current : next;
      });
    };

    updatePositions();
    scroller.addEventListener("scroll", updatePositions, { passive: true });
    window.addEventListener("resize", updatePositions);
    return () => {
      scroller.removeEventListener("scroll", updatePositions);
      window.removeEventListener("resize", updatePositions);
    };
  }, [chartLeft, compactLayout, points, timeLabels]);

  const selectRelative = (offset: number) => {
    const next = points[selectedIndex + offset];
    if (next) onSelect(next.id);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(points.length - 1, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = points.length - 1;
    else return;
    event.preventDefault();
    if (next !== index) {
      onSelect(points[next].id);
      (event.currentTarget.parentElement?.children.item(next) as HTMLElement | null)?.focus();
    }
  };

  return (
    <div className="renewable-comparison">
      <p className="renewable-comparison__intro">Napauta kaaviota tai vaihda tuntia nuolilla. Tuuli, aurinko ja hinta pysyvät samassa ajassa.</p>
      <div className="renewable-comparison__reading" style={readingStyle} aria-live="polite" aria-atomic="true">
        <strong>{selected ? `${dateTime.format(new Date(selected.startAt))}${selected.label ? ` · ${selected.label}` : ""}` : "Valitse tunti"}</strong>
        <div className="renewable-comparison__metrics">
          <span><i className="renewable-comparison__swatch renewable-comparison__swatch--wind" />Tuuli <b>{label(selected?.windMw ?? null, "MW")}</b></span>
          <span><i className="renewable-comparison__swatch renewable-comparison__swatch--solar" />Aurinko <b>{label(selected?.solarMw ?? null, "MW")}</b></span>
          <span><i className="renewable-comparison__swatch renewable-comparison__swatch--price" />Spot <b>{label(selectedPrice, "snt/kWh")}</b></span>
        </div>
      </div>
      <div className="renewable-comparison__mobile-controls">
        <button type="button" aria-label="Edellinen vertailutunti" disabled={selectedIndex <= 0} onClick={() => selectRelative(-1)}><ChevronLeft aria-hidden="true" />Edellinen</button>
        <span>Pyyhkäise kaaviota nähdäksesi lisää tunteja</span>
        <button type="button" aria-label="Seuraava vertailutunti" disabled={selectedIndex < 0 || selectedIndex >= points.length - 1} onClick={() => selectRelative(1)}>Seuraava<ChevronRight aria-hidden="true" /></button>
      </div>
      <div ref={scrollerRef} className="renewable-comparison__scroller" tabIndex={0} aria-label="Vieritettävä tuuli-, aurinko- ja hintavertailu">
        <div className="renewable-comparison__canvas" style={{ "--comparison-hour-count": points.length } as CSSProperties}>
          {tracks.map((track) => {
            const valid = track.values.filter((value): value is number => value !== null && Number.isFinite(value));
            const minimum = track.kind === "price" ? Math.min(0, ...valid) : 0;
            const rawMaximum = Math.max(1, ...valid);
            const maximum = rawMaximum <= minimum ? minimum + 1 : rawMaximum * 1.08;
            const selectedCapacity = selected && track.kind === "wind" ? selected.windCapacityMw : selected && track.kind === "solar" ? selected.solarCapacityMw : null;
            return (
              <div className={`renewable-comparison__track renewable-comparison__track--${track.kind}`} key={track.kind}>
                <div className="renewable-comparison__track-heading">
                  <h3>{track.title} <small>{track.unit}</small></h3>
                  {track.capacity && <span>{selectedCapacity === null ? "Kapasiteettiarviota ei saatavilla" : `Valitun tunnin kapasiteettiarvio ${label(selectedCapacity, "MW")}`}</span>}
                  {track.kind === "price" && <span>ALV sisältyy · vain julkaistut hinnat</span>}
                  {selected && <span className="renewable-comparison__selected-time"><i className={`renewable-comparison__swatch renewable-comparison__swatch--${track.kind}`} aria-hidden="true" />{selectedIntervalLabel(selected)}</span>}
                </div>
                <div className="renewable-comparison__plot">
                  <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${track.title} tunneittain; valitse tunti kaaviosta`}>
                    {[0, 0.5, 1].map((fraction) => {
                      const value = minimum + (maximum - minimum) * fraction;
                      const position = y(value, minimum, maximum);
                      return <line key={fraction} x1={chartLeft} x2={WIDTH - RIGHT} y1={position} y2={position} className="renewable-comparison__grid" />;
                    })}
                    {dayBoundaries.slice(1).map((index) => <line key={`day-${index}`} x1={x(index, points.length, chartLeft)} x2={x(index, points.length, chartLeft)} y1={TOP} y2={TOP + plotHeight} className="renewable-comparison__day-boundary" />)}
                    {segments(track.values, minimum, maximum, chartLeft).map((path, index) => <path key={`value-${index}`} d={path} className="renewable-comparison__line" />)}
                    {selectedIndex >= 0 && <line x1={x(selectedIndex, points.length, chartLeft)} x2={x(selectedIndex, points.length, chartLeft)} y1={TOP} y2={TOP + plotHeight} className="renewable-comparison__selection" />}
                  </svg>
                  {selectedIndex >= 0 && track.values[selectedIndex] !== null && <span className={`renewable-comparison__marker renewable-comparison__marker--${track.kind}`} aria-hidden="true" style={{ left: `${x(selectedIndex, points.length, chartLeft) / WIDTH * 100}%`, top: `${y(track.values[selectedIndex]!, minimum, maximum) / HEIGHT * 100}%` }} />}
                  <div className="renewable-comparison__axis" aria-hidden="true">
                    {[0, 0.5, 1].map((fraction) => {
                      const value = minimum + (maximum - minimum) * fraction;
                      return <span key={fraction} style={{ top: `${y(value, minimum, maximum) / HEIGHT * 100}%` }}>{track.unit === "MW" ? number.format(Math.round(value)) : priceNumber.format(value)}</span>;
                    })}
                  </div>
                  <div className="renewable-comparison__times" aria-hidden="true">
                    {timeLabels.map(({ index, isDateBoundary, label: tickLabel }) => {
                      const dateLabelPosition = compactLayout ? dateLabelPositions[index] : undefined;
                      return (
                        <span
                          key={index}
                          className={isDateBoundary ? "renewable-comparison__time-label renewable-comparison__time-label--date-boundary" : "renewable-comparison__time-label"}
                          data-time-index={isDateBoundary ? index : undefined}
                          data-alignment={isDateBoundary ? dateLabelPosition?.alignment : undefined}
                          style={{ left: dateLabelPosition ? `${dateLabelPosition.left}px` : `${x(index, points.length, chartLeft) / WIDTH * 100}%` }}
                        >
                          {tickLabel}
                        </span>
                      );
                    })}
                  </div>
                  <div className="renewable-comparison__hits" style={{ left: `${chartLeft / WIDTH * 100}%`, gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
                    {points.map((point, index) => <button key={point.id} type="button" className={index === selectedIndex ? "renewable-comparison__hit renewable-comparison__hit--selected" : "renewable-comparison__hit"} aria-label={`Valitse ${track.title.toLowerCase()} ${dateTime.format(new Date(point.startAt))}${point.label ? ` ${point.label}` : ""}, ${label(track.values[index], track.unit)}`} aria-pressed={index === selectedIndex} tabIndex={index === selectedIndex ? 0 : -1} onClick={() => onSelect(point.id)} onKeyDown={(event) => handleKeyDown(event, index)} />)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="renewable-comparison__note">Hinnat ovat Suomen ALV:n sisältäviä spot-hintoja. Tuotanto voi vaikuttaa hintaan, mutta tämä rinnakkaisnäkymä ei osoita syy-seuraussuhdetta. Ennuste jatkuu julkaistuja hintoja pidemmälle. Kapasiteetti on Fingridin ennustemallin arvio.</p>
    </div>
  );
}
