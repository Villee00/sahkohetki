import { describe, expect, it } from "vitest";
import {
  mergeMarketPriceIntervals,
  parseEntsoePriceXml,
  toVatInclusiveQuarterPrices,
  type MarketPriceInterval,
} from "./entsoe-prices";

function publicationXml({
  documentId = "document-1",
  revision = 1,
  resolution = "PT15M",
  curveType = "A03",
  start = "2026-01-01T00:00Z",
  end = "2026-01-01T01:00Z",
  points = [
    [1, 20],
    [3, -4],
  ],
}: {
  documentId?: string;
  revision?: number;
  resolution?: string;
  curveType?: string;
  start?: string;
  end?: string;
  points?: Array<[number, number]>;
} = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Publication_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-3:publicationdocument:7:3">
  <mRID>${documentId}</mRID>
  <revisionNumber>${revision}</revisionNumber>
  <createdDateTime>2026-01-01T10:00:00Z</createdDateTime>
  <type>A44</type>
  <process.processType>A01</process.processType>
  <TimeSeries>
    <mRID>series-1</mRID>
    <contract_MarketAgreement.type>A01</contract_MarketAgreement.type>
    <in_Domain.mRID>10YFI-1--------U</in_Domain.mRID>
    <out_Domain.mRID>10YFI-1--------U</out_Domain.mRID>
    <currency_Unit.name>EUR</currency_Unit.name>
    <price_Measure_Unit.name>MWH</price_Measure_Unit.name>
    <curveType>${curveType}</curveType>
    <Period>
      <timeInterval><start>${start}</start><end>${end}</end></timeInterval>
      <resolution>${resolution}</resolution>
      ${points
        .map(
          ([position, price]) =>
            `<Point><position>${position}</position><price.amount>${price}</price.amount></Point>`,
        )
        .join("\n")}
    </Period>
  </TimeSeries>
</Publication_MarketDocument>`;
}

describe("ENTSO-E price document parser", () => {
  it("preserves source metadata and expands sparse PT15M block prices", () => {
    const result = parseEntsoePriceXml(publicationXml());

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.documentCount).toBe(1);
    expect(result.intervals).toHaveLength(4);
    expect(result.intervals[0]).toEqual({
      id: "document-1:1:series-1:2026-01-01T00:00:00.000Z",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-01T00:15:00.000Z",
      resolutionMinutes: 15,
      priceEurPerMwh: 20,
      documentId: "document-1",
      documentRevision: 1,
      documentCreatedAt: "2026-01-01T10:00:00.000Z",
      seriesId: "series-1",
      processType: "A01",
      contractType: "A01",
      carriedForward: false,
    });
    expect(result.intervals.slice(1).map((interval) => [
      interval.priceEurPerMwh,
      interval.carriedForward,
    ])).toEqual([
      [20, true],
      [-4, false],
      [-4, true],
    ]);
  });

  it("accepts PT60M periods without inventing quarter-hour source intervals", () => {
    const result = parseEntsoePriceXml(
      publicationXml({ resolution: "PT60M", points: [[1, 80]] }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0]).toMatchObject({
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-01T01:00:00.000Z",
      resolutionMinutes: 60,
      priceEurPerMwh: 80,
    });
  });

  it("classifies no-data and too-many-document acknowledgements", () => {
    const acknowledgement = (text: string) => `
      <Acknowledgement_MarketDocument>
        <Reason><code>999</code><text>${text}</text></Reason>
      </Acknowledgement_MarketDocument>`;

    expect(parseEntsoePriceXml(acknowledgement("No matching data found"))).toEqual({
      status: "unavailable",
      reason: "no-data",
    });
    expect(
      parseEntsoePriceXml(acknowledgement("More than 200 matching documents")),
    ).toEqual({ status: "unavailable", reason: "too-many-documents" });
    expect(parseEntsoePriceXml("<broken")).toEqual({
      status: "unavailable",
      reason: "schema",
    });
  });

  it("keeps the latest revision, removes identical duplicates, and rejects conflicts", () => {
    const base = (overrides: Partial<MarketPriceInterval>): MarketPriceInterval => ({
      id: "document-1:1:series-1:2026-01-01T00:00:00.000Z",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-01T00:15:00.000Z",
      resolutionMinutes: 15,
      priceEurPerMwh: 20,
      documentId: "document-1",
      documentRevision: 1,
      documentCreatedAt: "2026-01-01T10:00:00.000Z",
      seriesId: "series-1",
      processType: "A01",
      contractType: "A01",
      carriedForward: false,
      ...overrides,
    });
    const revised = base({
      id: "document-1:2:series-1:2026-01-01T00:00:00.000Z",
      documentRevision: 2,
      priceEurPerMwh: 25,
    });

    expect(mergeMarketPriceIntervals([base({}), revised, { ...revised }])).toEqual({
      status: "ready",
      intervals: [revised],
      documentCount: 1,
    });
    expect(
      mergeMarketPriceIntervals([
        revised,
        base({ documentId: "document-2", id: "other", priceEurPerMwh: 30 }),
      ]),
    ).toEqual({ status: "unavailable", reason: "schema" });
  });

  it("adapts PT60M raw prices to the current VAT-inclusive quarter contract", () => {
    const result = parseEntsoePriceXml(
      publicationXml({ resolution: "PT60M", points: [[1, 80]] }),
    );
    if (result.status !== "ready") throw new Error(result.reason);

    const quarters = toVatInclusiveQuarterPrices(result.intervals);

    expect(quarters).toHaveLength(4);
    expect(quarters.map((quarter) => quarter.startAt)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:15:00.000Z",
      "2026-01-01T00:30:00.000Z",
      "2026-01-01T00:45:00.000Z",
    ]);
    expect(quarters.every((quarter) => quarter.priceCentsPerKwh === 10.04)).toBe(
      true,
    );
  });
});
