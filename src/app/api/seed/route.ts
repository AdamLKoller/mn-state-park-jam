import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { friendshipId } from "@/lib/server/friends";
import { geocodeUsAddress } from "@/lib/server/geocode";
import { loadUsersByEmail } from "@/lib/server/users";
import { UserAddress } from "@/lib/types";

const ADAM_EMAIL = "kolleradaml01@gmail.com";
const STEPH_EMAIL = "steph.lewis13c@gmail.com";

const SEED_ADDRESSES: { email: string; label: string }[] = [
  { email: ADAM_EMAIL, label: "201 4th St SE, Rochester, MN 55904" },
  { email: STEPH_EMAIL, label: "15520 Central Ave NE, Ham Lake, MN 55304" },
];

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.SEED_SECRET;
  return Boolean(secret) && request.headers.get("x-seed-secret") === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const friendRef = adminDb.collection("friendships").doc(friendshipId(ADAM_EMAIL, STEPH_EMAIL));
  await friendRef.set({
    id: friendRef.id,
    emailA: ADAM_EMAIL,
    emailB: STEPH_EMAIL,
    status: "accepted",
    requestedByEmail: ADAM_EMAIL,
    createdAt: now,
    updatedAt: now,
  });

  const tripRef = adminDb.collection("trips").doc("seed-interstate-shared-trip");
  await tripRef.set(
    {
      id: tripRef.id,
      title: "Interstate Shared Trip",
      creatorEmail: ADAM_EMAIL,
      startDate: "2026-10-16",
      endDate: "2026-10-17",
      memberEmails: [ADAM_EMAIL, STEPH_EMAIL],
      memberUids: [],
      parks: [
        {
          parkId: "interstate",
          parkName: "Interstate State Park",
          arrivalDate: "2026-10-16",
          departureDate: "2026-10-17",
          reservationUrl: "https://reservemn.usedirect.com/MinnesotaWeb/",
          parkInfoUrl: "https://www.dnr.state.mn.us/state_parks/park.html?id=spk00178",
          booked: false,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  const users = await loadUsersByEmail(SEED_ADDRESSES.map((seed) => seed.email));
  const pendingAddressEmails: string[] = [];
  for (const seed of SEED_ADDRESSES) {
    const user = users.get(seed.email);
    if (!user) {
      pendingAddressEmails.push(seed.email);
      continue;
    }

    const geocoded = await geocodeUsAddress(seed.label);
    const address: UserAddress = {
      label: seed.label,
      matchedAddress: geocoded.matchedAddress,
      lat: geocoded.lat,
      lon: geocoded.lon,
      updatedAt: now,
    };
    await adminDb.collection("users").doc(user.uid).set({ address, updatedAt: now }, { merge: true });
  }

  return NextResponse.json({ ok: true, pendingAddressEmails });
}
