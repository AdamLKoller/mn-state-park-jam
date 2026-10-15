import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/auth";
import { geocodeUsAddress } from "@/lib/server/geocode";
import { UserAddress } from "@/lib/types";

type AddressBody = { label?: unknown };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const snap = await adminDb.collection("users").doc(auth.uid).get();
    return NextResponse.json({ address: snap.data()?.address ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load address";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = (await request.json()) as AddressBody;
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const geocoded = await geocodeUsAddress(label);
    const now = new Date().toISOString();
    const address: UserAddress = {
      label,
      matchedAddress: geocoded.matchedAddress,
      lat: geocoded.lat,
      lon: geocoded.lon,
      updatedAt: now,
    };

    await adminDb.collection("users").doc(auth.uid).set({ address, updatedAt: now }, { merge: true });
    return NextResponse.json({ ok: true, address });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save address";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
