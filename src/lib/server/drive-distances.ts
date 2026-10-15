import { DriveRoute } from "@/lib/types";

const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";

type Coordinates = { lat: number; lon: number };

type OsrmRouteResponse = {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
  }[];
};

export async function estimateDrive(from: Coordinates, to: Coordinates): Promise<DriveRoute> {
  // OSRM expects coordinates in lon,lat order.
  const coordinates = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const response = await fetch(
    `${OSRM_ROUTE_URL}/${coordinates}?overview=full&geometries=geojson`,
  );
  if (!response.ok) {
    throw new Error(`Routing request failed with status ${response.status}`);
  }

  const body = (await response.json()) as OsrmRouteResponse;
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route) {
    throw new Error(`No driving route found (${body.code})`);
  }

  return {
    meters: route.distance,
    seconds: route.duration,
    // Convert GeoJSON [lon, lat] pairs to Leaflet-style [lat, lon].
    path: route.geometry.coordinates.map(([lon, lat]): [number, number] => [lat, lon]),
  };
}
