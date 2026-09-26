"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { ForecastInterval } from "../../lib/forecast-types";

type PriceHour = { startAt: string; priceCentsPerKwh: number | null };
type Series = "wind" | "solar" | "price";

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
const plotWidth = WIDTH - LEFT - RIGHT;
const plotHeight = HEIGHT - TOP - BOTTOM;
const number = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });
const priceNumber = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });
const hour = new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", hour: "2-digit" });
const day = new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", weekday: "short" });
const dateTime = new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

function x(index: number, length: number) {
  return LEFT + (length < 2 ? plotWidth / 2 : index * plotWidth / (length - 1));
}

function y(value: number, minimum: number, maximum: number) {
  return TOP + (maximum - value) / (maximum - minimum) * plotHeight;
}

function segments(values: (number | null)[], minimum: number, maximum: number) {
  const paths: string[] = [];
  let commands: string[] = [];
  const flush = () => { if (commands.length) paths.push(commands.join(" ")); commands = []; };
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) { flush(); return; }
    commands.push(`${commands.length ? "L" : "M"} ${x(index, values.length).toFixed(2)} ${y(value, minimum, maximum).toFixed(2)}`);
  });
  flush();
  return paths;
}

function label(value: number | null, unit: "MW" | "snt/kWh") {
  if (value === null || !Number.isFinite(value)) return "Ei saatavilla";
  return `${unit === "MW" ? number.format(Math.round(value)) : priceNumber.format(value)} ${unit}`;
}

export function RenewableComparison({ points, prices, selectedId, onSelect }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const priceByStart = new Map(prices.map((point) => [point.startAt, point.priceCentsPerKwh]));
  const selectedIndex = points.findIndex((point) => point.id === selectedId);
  const selected = points[selectedIndex] ?? null;
  const priceValues = points.map((point) => priceByStart.get(point.startAt) ?? null);
  const selectedPrice = selectedIndex < 0 ? null : priceValues[selectedIndex];
  const tracks: { kind: Series; title: string; values: (number | null)[]; capacity?: (number | null)[]; unit: "MW" | "snt/kWh" }[] = [
    { kind: "wind", title: "Tuuli", values: points.map((point) => point.windMw), capacity: points.map((point) => point.windCapacityMw), unit: "MW" },
    { kind: "solar", title: "Aurinko", values: points.map((point) => point.solarMw), capacity: points.map((point) => point.solarCapacityMw), unit: "MW" },
    { kind: "price", title: "Spot-hinta", values: priceValues, unit: "snt/kWh" },
  ];
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || selectedIndex < 0 || scroller.scrollWidth <= scroller.clientWidth) return;
    const hit = scroller.querySelectorAll<HTMLElement>(".renewable-comparison__track--wind .renewable-comparison__hit")[selectedIndex];
    if (!hit) return;
    const scrollerBounds = scroller.getBoundingClientRect();
    const hitBounds = hit.getBoundingClientRect();
    scroller.scrollLeft += hitBounds.left - scrollerBounds.left - scroller.clientWidth / 2 + hitBounds.width / 2;
  }, [selectedIndex, points.length]);

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
      <div className="renewable-comparison__reading" aria-live="polite" aria-atomic="true">
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
                </div>
                <div className="renewable-comparison__plot">
                  <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${track.title} tunneittain; valitse tunti kaaviosta`}>
                    {[0, 0.5, 1].map((fraction) => {
                      const value = minimum + (maximum - minimum) * fraction;
                      const position = y(value, minimum, maximum);
                      return <line key={fraction} x1={LEFT} x2={WIDTH - RIGHT} y1={position} y2={position} className="renewable-comparison__grid" />;
                    })}
                    {segments(track.values, minimum, maximum).map((path, index) => <path key={`value-${index}`} d={path} className="renewable-comparison__line" />)}
                    {selectedIndex >= 0 && <g><line x1={x(selectedIndex, points.length)} x2={x(selectedIndex, points.length)} y1={TOP} y2={TOP + plotHeight} className="renewable-comparison__selection" />{track.values[selectedIndex] !== null && <circle cx={x(selectedIndex, points.length)} cy={y(track.values[selectedIndex]!, minimum, maximum)} r="5" className="renewable-comparison__dot" />}</g>}
                  </svg>
                  <div className="renewable-comparison__axis" aria-hidden="true">
                    {[0, 0.5, 1].map((fraction) => {
                      const value = minimum + (maximum - minimum) * fraction;
                      return <span key={fraction} style={{ top: `${y(value, minimum, maximum) / HEIGHT * 100}%` }}>{track.unit === "MW" ? number.format(Math.round(value)) : priceNumber.format(value)}</span>;
                    })}
                  </div>
                  <div className="renewable-comparison__times" aria-hidden="true">
                    {track.values.map((_, index) => index % 6 === 0 ? <span key={index} style={{ left: `${x(index, points.length) / WIDTH * 100}%` }}>{day.format(new Date(points[index].startAt))} {hour.format(new Date(points[index].startAt))}</span> : null)}
                  </div>
                  <div className="renewable-comparison__hits" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
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
