"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  CircleMarker,
  LayerGroup,
  Map as LeafletMap,
  Renderer,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { ParkCatalogItem, TripRouteResponse } from "@/lib/types";
import styles from "./park-map.module.css";

type LeafletNamespace = typeof import("leaflet");

type FlatUnit = {
  parkId: string;
  lat: number;
  lon: number;
  campground: string;
  siteName: string;
  unitType: string;
  siteType: string;
  maxPeople: string;
  electric30: string;
  electric50: string;
  pets: string;
  ada: string;
  waterfront: string;
};

type MapContext = {
  L: LeafletNamespace;
  map: LeafletMap;
  unitLayer: LayerGroup;
  routeLayer: LayerGroup;
  renderer: Renderer;
  parksById: Map<string, ParkCatalogItem>;
  parkMarkers: Map<string, CircleMarker>;
  parkLayer: LayerGroup;
  selectPark: (park: ParkCatalogItem) => void;
  units: FlatUnit[] | null;
  unitsRequested: boolean;
};

// Tuple order matches the `fields` array written by scripts/build-park-data.mjs.
type UnitTuple = [
  number,
  number,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
type UnitsPayload = { fields: string[]; parks: Record<string, UnitTuple[]> };
type TmbRoutes = { ways: [number, number][][]; variants: [number, number][][] };
type StatesGeoJson = {
  features: { geometry: { coordinates: [number, number][][] } }[];
};

export const UNIT_MIN_ZOOM = 12;

const MN_CENTER: [number, number] = [46.4, -94.6];
const MN_ZOOM = 6;
const UNITS_URL = "/data/mn-park-units.json";
const TMB_ROUTES_URL = "/data/tmb-routes.json";

// Keeps auto-panned popups clear of the search overlay at the top of the map.
const POPUP_OPTIONS = { autoPanPaddingTopLeft: [12, 72] as [number, number] };
const STATES_URL = "/data/mn-neighbor-states.json";
const WORLD_RING: [number, number][] = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];
const MASK_COLOR = "#e2e8f0";

const PARK_TYPE_COLORS: Record<string, string> = {
  "State Park": "#15803d",
  "State Forest": "#4d7c0f",
  "State Water Trail": "#0369a1",
  "State Recreation Area": "#7c3aed",
};
const DEFAULT_PARK_COLOR = "#475569";
const UNIT_COLOR = "#f59e0b";
const SEARCH_RESULT_LIMIT = 8;
// Sits below the park markers (overlay pane, z-index 400) so markers stay clickable on top of routes.
const ROUTE_PANE = "tripRoutes";
export const ROUTE_COLORS = [
  "#2563eb",
  "#db2777",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
];

function element(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function linkButton(href: string, label: string): HTMLAnchorElement {
  const link = element("a", styles.popupButton, label) as HTMLAnchorElement;
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  return link;
}

function buildParkPopup(
  park: ParkCatalogItem,
  zoomTo: () => void,
): HTMLElement {
  const root = element("div", styles.popup);
  root.append(element("strong", styles.popupTitle, park.name));
  const meta = [park.parkType, park.region];
  if (park.counties.length) meta.push(`${park.counties.join(", ")} County`);
  root.append(element("p", styles.popupMeta, meta.filter(Boolean).join(" · ")));
  root.append(element("p", undefined, park.summary));

  root.append(element("p", styles.popupHeading, `Units (${park.unitCount})`));
  const unitList = element("ul", styles.popupList);
  for (const unitType of park.unitTypes) {
    unitList.append(
      element("li", undefined, `${unitType.name}: ${unitType.count}`),
    );
  }
  root.append(unitList);

  if (park.trails.length) {
    root.append(element("p", styles.popupHeading, "Trails"));
    const trailList = element("ul", styles.popupList);
    for (const trail of park.trails) {
      trailList.append(
        element(
          "li",
          undefined,
          `${trail.name} (${trail.allowedUses.join(", ")})`,
        ),
      );
    }
    root.append(trailList);
  }

  const actions = element("div", styles.popupActions);
  const zoomButton = element(
    "button",
    styles.popupButton,
    "Zoom in to see units",
  ) as HTMLButtonElement;
  zoomButton.type = "button";
  zoomButton.addEventListener("click", zoomTo);
  actions.append(
    zoomButton,
    linkButton(park.parkInfoUrl, "Park info"),
    linkButton(park.reservationUrl, "Reserve on DNR"),
  );
  root.append(actions);
  return root;
}

function buildUnitPopup(
  unit: FlatUnit,
  park: ParkCatalogItem | undefined,
): HTMLElement {
  const root = element("div", styles.popup);
  root.append(
    element(
      "strong",
      styles.popupTitle,
      unit.campground || park?.name || "Campsite unit",
    ),
  );
  if (park) root.append(element("p", styles.popupMeta, park.name));

  const rows: [string, string][] = [
    ["Site", unit.siteName],
    ["Unit type", unit.unitType],
    ["Site type", unit.siteType],
    ["Max people", unit.maxPeople],
    ["Electric 30A", unit.electric30],
    ["Electric 50A", unit.electric50],
    ["Pets allowed", unit.pets],
    ["ADA accessible", unit.ada],
    ["Waterfront", unit.waterfront],
  ];
  const list = element("ul", styles.popupList);
  for (const [label, value] of rows) {
    list.append(
      element(
        "li",
        undefined,
        `${label}: ${value && value !== "UNKNOWN" ? value : "Not listed"}`,
      ),
    );
  }
  root.append(list);

  if (park) {
    const actions = element("div", styles.popupActions);
    actions.append(linkButton(park.reservationUrl, "Reserve on DNR"));
    root.append(actions);
  }
  return root;
}

function flattenUnits(payload: UnitsPayload): FlatUnit[] {
  return Object.entries(payload.parks).flatMap(([parkId, tuples]) =>
    tuples.map(
      ([
        lat,
        lon,
        campground,
        siteName,
        unitType,
        siteType,
        maxPeople,
        electric30,
        electric50,
        pets,
        ada,
        waterfront,
      ]) => ({
        parkId,
        lat,
        lon,
        campground,
        siteName,
        unitType,
        siteType,
        maxPeople,
        electric30,
        electric50,
        pets,
        ada,
        waterfront,
      }),
    ),
  );
}

function fetchJson<T>(url: string): Promise<T | null> {
  return fetch(url)
    .then((response) => (response.ok ? (response.json() as Promise<T>) : null))
    .catch(() => null);
}

async function loadUnits(ctx: MapContext) {
  if (ctx.unitsRequested) return;
  ctx.unitsRequested = true;
  try {
    const response = await fetch(UNITS_URL);
    if (!response.ok)
      throw new Error(`Unit data request failed: ${response.status}`);
    ctx.units = flattenUnits((await response.json()) as UnitsPayload);
    refreshUnits(ctx);
  } catch (error) {
    ctx.unitsRequested = false;
    console.error(error);
  }
}

function refreshUnits(ctx: MapContext) {
  ctx.unitLayer.clearLayers();
  if (!ctx.map.hasLayer(ctx.unitLayer) || ctx.map.getZoom() < UNIT_MIN_ZOOM)
    return;
  if (!ctx.units) {
    void loadUnits(ctx);
    return;
  }

  const bounds = ctx.map.getBounds();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  for (const unit of ctx.units) {
    if (
      unit.lat < south ||
      unit.lat > north ||
      unit.lon < west ||
      unit.lon > east
    )
      continue;
    const marker: CircleMarker = ctx.L.circleMarker([unit.lat, unit.lon], {
      renderer: ctx.renderer,
      radius: 5,
      color: "#92400e",
      weight: 1,
      fillColor: UNIT_COLOR,
      fillOpacity: 0.9,
    });
    marker.bindPopup(
      () => buildUnitPopup(unit, ctx.parksById.get(unit.parkId)),
      POPUP_OPTIONS,
    );
    marker.addTo(ctx.unitLayer);
  }
}

function drawParks(ctx: MapContext, parks: ParkCatalogItem[]) {
  ctx.parkLayer.clearLayers();
  ctx.parksById = new Map(parks.map((park) => [park.id, park]));
  ctx.parkMarkers = new Map();
  for (const park of parks) {
    const marker = ctx.L.circleMarker([park.lat, park.lon], {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: PARK_TYPE_COLORS[park.parkType] ?? DEFAULT_PARK_COLOR,
      fillOpacity: 0.9,
    });
    marker.bindTooltip(park.name);
    marker.bindPopup(
      () =>
        buildParkPopup(park, () =>
          ctx.map.setView([park.lat, park.lon], UNIT_MIN_ZOOM + 1),
        ),
      POPUP_OPTIONS,
    );
    marker.on("click", () => ctx.selectPark(park));
    marker.addTo(ctx.parkLayer);
    ctx.parkMarkers.set(park.id, marker);
  }
  refreshUnits(ctx);
}

function drawRoutes(ctx: MapContext, routes: TripRouteResponse | null) {
  ctx.routeLayer.clearLayers();
  if (!routes) return;

  const bounds = ctx.L.latLngBounds([
    [routes.park.lat, routes.park.lon],
  ]);
  routes.members.forEach((member, index) => {
    const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
    if (member.route) {
      const line = ctx.L.polyline(member.route.path, {
        pane: ROUTE_PANE,
        color,
        weight: 5,
        opacity: 0.85,
        interactive: false,
      });
      line.addTo(ctx.routeLayer);
      bounds.extend(line.getBounds());
    }
    if (member.origin) {
      const home = ctx.L.circleMarker([member.origin.lat, member.origin.lon], {
        pane: ROUTE_PANE,
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      });
      home.bindTooltip(member.displayName);
      home.addTo(ctx.routeLayer);
      bounds.extend(home.getLatLng());
    }
  });
  ctx.map.fitBounds(bounds, { padding: [60, 60], maxZoom: UNIT_MIN_ZOOM + 1 });
}

function focusPark(ctx: MapContext, park: ParkCatalogItem) {
  if (!ctx.map.hasLayer(ctx.parkLayer)) ctx.map.addLayer(ctx.parkLayer);
  ctx.map.setView([park.lat, park.lon], UNIT_MIN_ZOOM + 1);
  ctx.parkMarkers.get(park.id)?.openPopup();
  ctx.selectPark(park);
}

function matchParks(
  parks: ParkCatalogItem[],
  query: string,
): ParkCatalogItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return parks
    .filter((park) => {
      const haystack = [park.name, park.parkType, park.region, ...park.counties]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, SEARCH_RESULT_LIMIT);
}

function formatCounties(counties: string[]): string {
  if (!counties.length) return "";
  const shown = counties.slice(0, 3).map((county) => `${county} County`);
  const hidden = counties.length - shown.length;
  return hidden > 0 ? `${shown.join(", ")} +${hidden} more` : shown.join(", ");
}

function ParkSearch({
  parks,
  onSelect,
}: {
  parks: ParkCatalogItem[];
  onSelect: (park: ParkCatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const results = useMemo(() => matchParks(parks, query), [parks, query]);
  const showList = open && query.trim().length > 0;
  const lastIndex = Math.max(results.length - 1, 0);
  const active = Math.min(activeIndex, lastIndex);
  const current = results[active];

  function choose(park: ParkCatalogItem) {
    onSelect(park);
    setQuery(park.name);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        setActiveIndex((index) => Math.min(index + 1, lastIndex));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter":
        if (showList && current) {
          event.preventDefault();
          choose(current);
        }
        break;
      case "Escape":
        setQuery("");
        setOpen(false);
        break;
    }
  }

  return (
    <div
      className={styles.search}
      role="search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <input
        className={styles.searchInput}
        type="text"
        role="combobox"
        aria-label="Search state parks"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={
          showList && current ? `${listId}-${active}` : undefined
        }
        placeholder="Search parks by name, county, or region"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching parks"
          className={styles.searchResults}
          // Keep focus in the input so blur doesn't close the list before a click lands.
          onMouseDown={(event) => event.preventDefault()}
        >
          {results.map((park, index) => (
            <li
              key={park.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={
                index === active ? styles.searchResultActive : styles.searchResult
              }
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(park)}
            >
              <strong>{park.name}</strong>
              <span className={styles.searchMeta}>
                {[park.parkType, formatCounties(park.counties)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
          {!results.length && (
            <li role="presentation" className={styles.searchEmpty}>
              No parks match &ldquo;{query.trim()}&rdquo;.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ParkMap({
  parks,
  routes,
  onParkSelect,
}: {
  parks: ParkCatalogItem[];
  routes: TripRouteResponse | null;
  onParkSelect: (park: ParkCatalogItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<MapContext | null>(null);
  const parksRef = useRef<ParkCatalogItem[]>(parks);
  const routesRef = useRef<TripRouteResponse | null>(routes);
  const onParkSelectRef = useRef(onParkSelect);

  useEffect(() => {
    onParkSelectRef.current = onParkSelect;
  }, [onParkSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function initialize() {
      const [L, tmbRoutes, states] = await Promise.all([
        import("leaflet"),
        fetchJson<TmbRoutes>(TMB_ROUTES_URL),
        fetchJson<StatesGeoJson>(STATES_URL),
      ]);
      if (cancelled || !container) return;

      const stateRings = (states?.features ?? []).flatMap((feature) =>
        feature.geometry.coordinates.map((ring) =>
          ring.map(([lon, lat]): [number, number] => [lat, lon]),
        ),
      );
      const stateBounds = L.latLngBounds(stateRings.flat());

      const map = L.map(container, {
        center: MN_CENTER,
        zoom: MN_ZOOM,
        maxZoom: 18,
        ...(stateBounds.isValid()
          ? { maxBounds: stateBounds, maxBoundsViscosity: 1 }
          : {}),
      });
      if (stateRings.length) {
        // Sits above tiles and overlays but below markers; the state rings are holes.
        map.createPane("stateMask").style.zIndex = "450";
        L.polygon([WORLD_RING, ...stateRings], {
          pane: "stateMask",
          stroke: false,
          fillColor: MASK_COLOR,
          fillOpacity: 1,
          interactive: false,
        }).addTo(map);
      }
      const esri = (service: string, attribution: string) =>
        L.tileLayer(
          `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`,
          {
            maxZoom: 18,
            attribution,
          },
        );
      const lightTerrain = esri("World_Topo_Map", "Tiles © Esri");
      const baseLayers = {
        "Light terrain (Esri)": lightTerrain,
        "Satellite (Esri)": esri(
          "World_Imagery",
          "Imagery © Esri, Maxar, Earthstar Geographics",
        ),
        "OpenTopoMap (strong relief)": L.tileLayer(
          "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 17,
            attribution: "© OpenTopoMap, © OpenStreetMap contributors",
          },
        ),
        OpenStreetMap: L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution: "© OpenStreetMap contributors",
          },
        ),
      };
      lightTerrain.addTo(map);

      const tmbMain = L.layerGroup(
        (tmbRoutes?.ways ?? []).map((way) =>
          L.polyline(way, {
            color: "#f97316",
            weight: 3,
            opacity: 0.75,
            interactive: false,
          }),
        ),
      ).addTo(map);
      const tmbVariants = L.layerGroup(
        (tmbRoutes?.variants ?? []).map((way) =>
          L.polyline(way, {
            color: "#fdba74",
            weight: 3,
            opacity: 0.55,
            interactive: false,
          }),
        ),
      ).addTo(map);
      const waymarked = L.tileLayer(
        "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",
        {
          maxZoom: 18,
          opacity: 0.8,
          attribution: "Trails © waymarkedtrails.org",
        },
      );
      const parkLayer = L.layerGroup().addTo(map);
      const unitLayer = L.layerGroup().addTo(map);
      map.createPane(ROUTE_PANE).style.zIndex = "390";
      const routeLayer = L.layerGroup().addTo(map);

      L.control
        .layers(baseLayers, {
          "TMB main route": tmbMain,
          "TMB variants": tmbVariants,
          "Waymarked hiking trails": waymarked,
          "State parks": parkLayer,
          [`Campsite units (zoom ${UNIT_MIN_ZOOM}+)`]: unitLayer,
        })
        .addTo(map);

      const ctx: MapContext = {
        L,
        map,
        unitLayer,
        routeLayer,
        renderer: L.canvas({ padding: 0.5 }),
        parksById: new Map(),
        parkMarkers: new Map(),
        parkLayer,
        selectPark: (park) => onParkSelectRef.current(park),
        units: null,
        unitsRequested: false,
      };
      contextRef.current = ctx;

      map.on("moveend", () => refreshUnits(ctx));
      map.on("overlayadd overlayremove", () => refreshUnits(ctx));
      drawParks(ctx, parksRef.current);
      drawRoutes(ctx, routesRef.current);

      resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(container);
    }

    void initialize();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      contextRef.current?.map.remove();
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    parksRef.current = parks;
    if (contextRef.current) drawParks(contextRef.current, parks);
  }, [parks]);

  useEffect(() => {
    routesRef.current = routes;
    if (contextRef.current) drawRoutes(contextRef.current, routes);
  }, [routes]);

  return (
    <div className={styles.wrapper}>
      <div
        ref={containerRef}
        className={styles.map}
        role="region"
        aria-label="Minnesota state parks map"
      />
      <ParkSearch
        parks={parks}
        onSelect={(park) => {
          if (contextRef.current) focusPark(contextRef.current, park);
        }}
      />
      <div className={styles.legend}>
        <strong>Parks</strong>
        {Object.entries(PARK_TYPE_COLORS).map(([type, color]) => (
          <span key={type}>
            <span className={styles.swatch} style={{ background: color }} />
            {type}
          </span>
        ))}
        <span>
          <span className={styles.swatch} style={{ background: UNIT_COLOR }} />
          Campsite units
        </span>
        <span className={styles.hint}>
          Zoom to level {UNIT_MIN_ZOOM} or closer to see units.
        </span>
      </div>
    </div>
  );
}
