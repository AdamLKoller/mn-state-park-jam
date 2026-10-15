import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { PARK_CATALOG } from "@/lib/parks";
import { requireAuth } from "@/lib/server/auth";
import { TripParkStop } from "@/lib/types";

type CreateTripBody = {
  title: string;
  startDate: string;
  endDate: string;
  parkId: string;
  memberEmails: string[];
};

function allowedMemberEmails(selfEmail: string, memberEmails: string[]): string[] {
  const set = new Set<string>([selfEmail, ...memberEmails.map((email) => email.trim().toLowerCase())]);
  return [...set].filter((email) => email.includes("@"));
}

function baseStop(parkId: string, startDate: string, endDate: string): TripParkStop {
  const park = PARK_CATALOG.find((item) => item.id === parkId);
  if (!park) {
    throw new Error("Unknown park");
  }

  return {
    parkId: park.id,
    parkName: park.name,
    arrivalDate: startDate,
    departureDate: endDate,
    reservationUrl: park.reservationUrl,
    parkInfoUrl: park.parkInfoUrl,
    booked: false,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const snap = await adminDb.collection("trips").where("memberEmails", "array-contains", auth.email).get();
    const trips = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ trips });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list trips";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = (await request.json()) as CreateTripBody;

    if (!body.title || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: "title, startDate, and endDate are required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const memberEmails = allowedMemberEmails(auth.email, body.memberEmails);
    const ref = adminDb.collection("trips").doc();
    await ref.set({
      id: ref.id,
      title: body.title,
      creatorEmail: auth.email,
      creatorUid: auth.uid,
      startDate: body.startDate,
      endDate: body.endDate,
      memberEmails,
      memberUids: [auth.uid],
      parks: [baseStop(body.parkId, body.startDate, body.endDate)],
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, tripId: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create trip";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
