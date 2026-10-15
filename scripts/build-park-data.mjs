// Converts the MN state campsite CSV into app data:
//   src/data/mn-state-parks.json  - one entry per park (centroid, counts, unit types)
//   public/data/mn-park-units.json - units grouped by park id, as compact tuples
// Usage: node scripts/build-park-data.mjs [path/to/campsites.csv]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = resolve(
  process.argv[2] ??
    join(
      root,
      "MN State Campsites - DevFest Coding Jam - MN State Campsites - DevFest Coding Jam.csv",
    ),
);

// Parks that already have hand-written content in src/lib/parks.ts. Their ids must stay stable
// because trips reference them.
const CURATED_IDS = {
  "Interstate State Park": "interstate",
  "Itasca State Park": "itasca",
  "Gooseberry Falls State Park": "gooseberry-falls",
};

const UNIT_FIELDS = [
  "lat",
  "lon",
  "campground",
  "siteName",
  "unitType",
  "siteType",
  "maxPeople",
  "electric30",
  "electric50",
  "pets",
  "ada",
  "waterfront",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);

  const [header, ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(
      header.map((name, index) => [name.trim(), (values[index] ?? "").trim()]),
    ),
  );
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const byPark = new Map();
let skippedNoCoords = 0;

for (const row of rows) {
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!row.park || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    skippedNoCoords += 1;
    continue;
  }
  if (!byPark.has(row.park)) byPark.set(row.park, []);
  byPark.get(row.park).push(row);
}

const missingCurated = Object.keys(CURATED_IDS).filter(
  (name) => !byPark.has(name),
);
if (missingCurated.length) {
  throw new Error(
    `Curated parks missing from CSV: ${missingCurated.join(", ")}`,
  );
}

const usedIds = new Set();
const parks = [];
const units = {};

for (const [name, parkRows] of [...byPark.entries()].sort((a, b) =>
  a[0].localeCompare(b[0]),
)) {
  let id = CURATED_IDS[name] ?? slugify(name);
  if (usedIds.has(id)) throw new Error(`Duplicate park id: ${id}`);
  usedIds.add(id);

  const unitTypeCounts = new Map();
  const campgrounds = new Set();
  const counties = new Set();
  const regions = new Set();
  for (const row of parkRows) {
    const unitType = row.unit_type || "Unspecified";
    unitTypeCounts.set(unitType, (unitTypeCounts.get(unitType) ?? 0) + 1);
    if (row.campground) campgrounds.add(row.campground);
    if (row.county) counties.add(row.county);
    if (row.tourism_region) regions.add(row.tourism_region);
  }

  parks.push({
    id,
    name,
    parkType: parkRows[0].park_type || "State Park",
    counties: [...counties].sort(),
    region: [...regions].sort().join(", ") || "Minnesota",
    lat: Number(median(parkRows.map((row) => Number(row.lat))).toFixed(5)),
    lon: Number(median(parkRows.map((row) => Number(row.lon))).toFixed(5)),
    unitCount: parkRows.length,
    campgroundCount: campgrounds.size,
    unitTypes: [...unitTypeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([unitType, count]) => ({ name: unitType, count })),
  });

  units[id] = parkRows.map((row) => [
    Number(row.lat),
    Number(row.lon),
    row.campground,
    row.site_name,
    row.unit_type,
    row.site_type,
    row.max_people,
    row.electric_30amp,
    row.electric_50amp,
    row.pets_allowed,
    row.ada_accessible,
    row.waterfront,
  ]);
}

mkdirSync(join(root, "src/data"), { recursive: true });
mkdirSync(join(root, "public/data"), { recursive: true });

writeFileSync(
  join(root, "src/data/mn-state-parks.json"),
  `${JSON.stringify(parks, null, 2)}\n`,
);
writeFileSync(
  join(root, "public/data/mn-park-units.json"),
  JSON.stringify({ fields: UNIT_FIELDS, parks: units }),
);

const unitTotal = Object.values(units).reduce(
  (sum, list) => sum + list.length,
  0,
);
console.log(
  `Wrote ${parks.length} parks and ${unitTotal} units (skipped ${skippedNoCoords} rows without coordinates).`,
);
