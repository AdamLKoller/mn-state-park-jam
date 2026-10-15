export type ParkUnit = {
  name: string;
  description: string;
};

export type TrailInfo = {
  name: string;
  allowedUses: string[];
  notes: string;
};

export type ParkUnitTypeCount = {
  name: string;
  count: number;
};

export type ParkCatalogItem = {
  id: string;
  name: string;
  parkType: string;
  region: string;
  counties: string[];
  lat: number;
  lon: number;
  unitCount: number;
  unitTypes: ParkUnitTypeCount[];
  summary: string;
  parkInfoUrl: string;
  reservationUrl: string;
  units: ParkUnit[];
  trails: TrailInfo[];
};

export type TripParkStop = {
  parkId: string;
  parkName: string;
  arrivalDate: string;
  departureDate: string;
  reservationUrl: string;
  parkInfoUrl: string;
  booked: boolean;
  bookingReference?: string;
  bookingNotes?: string;
};

export type TripRecord = {
  id: string;
  title: string;
  creatorEmail: string;
  creatorUid?: string;
  startDate: string;
  endDate: string;
  memberEmails: string[];
  memberUids: string[];
  parks: TripParkStop[];
  createdAt: string;
  updatedAt: string;
};

export type UserAddress = {
  label: string;
  matchedAddress: string;
  lat: number;
  lon: number;
  updatedAt: string;
};

export type DriveEstimate = {
  meters: number;
  seconds: number;
};

export type DriveRoute = DriveEstimate & {
  path: [number, number][];
};

export type TripRouteMember = {
  email: string;
  displayName: string;
  origin: { lat: number; lon: number } | null;
  route: DriveRoute | null;
  error?: string;
};

export type TripRouteResponse = {
  park: { id: string; name: string; lat: number; lon: number };
  members: TripRouteMember[];
};

export type FriendRecord = {
  id: string;
  emailA: string;
  emailB: string;
  status: "pending" | "accepted";
  requestedByEmail: string;
  createdAt: string;
  updatedAt: string;
};
