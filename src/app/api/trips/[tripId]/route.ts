import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { PARK_CATALOG } from "@/lib/parks";
import { requireAuth } from "@/lib/server/auth";
import { TripParkStop } from "@/lib/types";

type UpdateTripBody = {
  title?: string;
  startDate?: string;
  endDate?: string;
  parks?: TripParkStop[];
};

function ensureStopReferences(stops: TripParkStop[]) {
  return stops.map((stop) => {
    const park = PARK_CATALOG.find((item) => item.id === stop.parkId);
    if (!park) {
      throw new Error(`Unknown park ID: ${stop.parkId}`);
    }
    return {
      ...stop,
      parkName: park.name,
      reservationUrl: park.reservationUrl,
      parkInfoUrl: park.parkInfoUrl,
    };
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const { tripId } = await params;
    const body = (await request.json()) as UpdateTripBody;
    const ref = adminDb.collection("trips").doc(tripId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    const existing = snap.data();
    const memberEmails = (existing?.memberEmails as string[]) ?? [];
    if (!memberEmails.includes(auth.email)) {
      return NextResponse.json({ error: "Only trip members can update trip details" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (typeof body.title === "string") {
      updates.title = body.title;
    }
    if (typeof body.startDate === "string") {
      updates.startDate = body.startDate;
    }
    if (typeof body.endDate === "string") {
      updates.endDate = body.endDate;
    }
    if (body.parks) {
      updates.parks = ensureStopReferences(body.parks);
    }

    await ref.update(updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update trip";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const { tripId } = await params;
    const ref = adminDb.collection("trips").doc(tripId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    const trip = snap.data();
    if (trip?.creatorEmail !== auth.email) {
      return NextResponse.json({ error: "Only creator can delete the trip" }, { status: 403 });
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete trip";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
