const CENSUS_ONELINE_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

export type GeocodedAddress = {
  matchedAddress: string;
  lat: number;
  lon: number;
};

type CensusOnelineResponse = {
  result?: {
    addressMatches?: {
      matchedAddress: string;
      coordinates: { x: number; y: number };
    }[];
  };
};

export async function geocodeUsAddress(address: string): Promise<GeocodedAddress> {
  const url = new URL(CENSUS_ONELINE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding request failed with status ${response.status}`);
  }

  const body = (await response.json()) as CensusOnelineResponse;
  const match = body.result?.addressMatches?.[0];
  if (!match) {
    throw new Error(`No geocoding match found for address: ${address}`);
  }

  // The Census API returns coordinates as x = longitude, y = latitude.
  return {
    matchedAddress: match.matchedAddress,
    lat: match.coordinates.y,
    lon: match.coordinates.x,
  };
}
