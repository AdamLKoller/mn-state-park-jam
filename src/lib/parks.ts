import generatedParks from "@/data/mn-state-parks.json";
import { ParkCatalogItem, ParkUnit, TrailInfo } from "@/lib/types";

const STATE_PARK_RESERVATIONS_URL =
  "https://reservemn.usedirect.com/MinnesotaWeb/";
const STATE_PARKS_INFO_URL =
  "https://www.dnr.state.mn.us/state_parks/index.html";

type CuratedParkContent = {
  region: string;
  summary: string;
  parkInfoUrl: string;
  reservationUrl: string;
  units: ParkUnit[];
  trails: TrailInfo[];
};

const CURATED_PARKS: Record<string, CuratedParkContent> = {
  interstate: {
    region: "East-central Minnesota",
    summary:
      "Basalt cliffs, glacial potholes, and river overlooks along the St. Croix. Great for shared hiking and fall colors.",
    parkInfoUrl:
      "https://www.dnr.state.mn.us/state_parks/park.html?id=spk00178",
    reservationUrl: STATE_PARK_RESERVATIONS_URL,
    units: [
      {
        name: "Drive-in campsites",
        description:
          "Standard tent and RV campsites; some sites include electric hookups.",
      },
      {
        name: "Group camp area",
        description:
          "Shared group camping options for larger parties (availability varies by season).",
      },
      {
        name: "Day-use and picnic facilities",
        description:
          "Picnic shelters and day-use access for non-overnight guests.",
      },
    ],
    trails: [
      {
        name: "Pothole Trail loop",
        allowedUses: ["Hiking"],
        notes:
          "Short interpretive route featuring glacial potholes and river views.",
      },
      {
        name: "River Bluffs trail segments",
        allowedUses: ["Hiking", "Snowshoeing (seasonal)"],
        notes: "Mixed terrain with stair climbs and scenic overlooks.",
      },
    ],
  },
  itasca: {
    region: "Northwestern Minnesota",
    summary:
      "Home of the Mississippi Headwaters with extensive forests, lakes, and multi-use trail access.",
    parkInfoUrl:
      "https://www.dnr.state.mn.us/state_parks/park.html?id=spk00181",
    reservationUrl: STATE_PARK_RESERVATIONS_URL,
    units: [
      {
        name: "Campsites and cabins",
        description:
          "A range of site types and cabin options managed through the DNR reservation portal.",
      },
    ],
    trails: [
      {
        name: "State park trail network",
        allowedUses: ["Hiking", "Biking", "Cross-country skiing (seasonal)"],
        notes: "Many trail segments; check DNR map references before travel.",
      },
    ],
  },
  "gooseberry-falls": {
    region: "North Shore",
    summary:
      "Lake Superior waterfalls and shoreline access with year-round trail opportunities.",
    parkInfoUrl:
      "https://www.dnr.state.mn.us/state_parks/park.html?id=spk00169",
    reservationUrl: STATE_PARK_RESERVATIONS_URL,
    units: [
      {
        name: "Campsites",
        description:
          "Reservable campsites with amenities determined by site type in the portal.",
      },
    ],
    trails: [
      {
        name: "Waterfall and shoreline routes",
        allowedUses: ["Hiking", "Snowshoeing (seasonal)"],
        notes: "Popular high-traffic trails with connected viewpoints.",
      },
    ],
  },
};

function buildPark(
  generated: (typeof generatedParks)[number],
): ParkCatalogItem {
  const curated = CURATED_PARKS[generated.id];
  const countyText = generated.counties.length
    ? ` Located in ${generated.counties.join(", ")} ${generated.counties.length > 1 ? "counties" : "county"}.`
    : "";
  const generatedSummary = `${generated.name} is a ${generated.parkType.toLowerCase()} with ${generated.unitCount} units across ${generated.campgroundCount} campgrounds.${countyText}`;

  return {
    id: generated.id,
    name: generated.name,
    parkType: generated.parkType,
    region: curated?.region ?? generated.region,
    counties: generated.counties,
    lat: generated.lat,
    lon: generated.lon,
    unitCount: generated.unitCount,
    unitTypes: generated.unitTypes,
    summary: curated?.summary ?? generatedSummary,
    parkInfoUrl: curated?.parkInfoUrl ?? STATE_PARKS_INFO_URL,
    reservationUrl: curated?.reservationUrl ?? STATE_PARK_RESERVATIONS_URL,
    units:
      curated?.units ??
      generated.unitTypes.map((unitType) => ({
        name: unitType.name,
        description: `${unitType.count} in the campsite dataset.`,
      })),
    trails: curated?.trails ?? [],
  };
}

export const PARK_CATALOG: ParkCatalogItem[] = generatedParks.map(buildPark);

export const FALLBACK_UNIT_NOTE =
  "Official DNR APIs do not publish statewide live unit inventory. Use the reservation portal for current availability and final booking.";
