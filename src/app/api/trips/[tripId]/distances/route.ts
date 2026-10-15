import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { PARK_CATALOG } from "@/lib/parks";
import { requireAuth } from "@/lib/server/auth";
import { estimateDrive } from "@/lib/server/drive-distances";
import { loadUsersByEmail } from "@/lib/server/users";
import { TripRecord, TripRouteMember, TripRouteResponse } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const { tripId } = await params;
    const parkId = request.nextUrl.searchParams.get("parkId");
    const park = PARK_CATALOG.find((item) => item.id === parkId);
    if (!park) {
      return NextResponse.json({ error: "Unknown park" }, { status: 400 });
    }

    const snap = await adminDb.collection("trips").doc(tripId).get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    const trip = snap.data() as TripRecord;
    if (!trip.memberEmails.includes(auth.email)) {
      return NextResponse.json({ error: "Only trip members can view routes" }, { status: 403 });
    }

    const users = await loadUsersByEmail(trip.memberEmails);
    const members = await Promise.all(
      trip.memberEmails.map(async (email): Promise<TripRouteMember> => {
        const user = users.get(email.toLowerCase());
        const address = user?.address;
        const displayName = user?.displayName ?? email;
        if (!address) {
          return { email, displayName, origin: null, route: null };
        }

        const origin = { lat: address.lat, lon: address.lon };
        try {
          const route = await estimateDrive(origin, park);
          return { email, displayName, origin, route };
        } catch (cause) {
          return {
            email,
            displayName,
            origin,
            route: null,
            error: cause instanceof Error ? cause.message : "Drive estimate failed",
          };
        }
      }),
    );

    const response: TripRouteResponse = {
      park: { id: park.id, name: park.name, lat: park.lat, lon: park.lon },
      members,
    };
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load routes";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
