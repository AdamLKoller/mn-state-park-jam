import { NextResponse } from "next/server";
import { FALLBACK_UNIT_NOTE, PARK_CATALOG } from "@/lib/parks";

export async function GET() {
  return NextResponse.json({
    parks: PARK_CATALOG,
    notes: {
      reservationData:
        "Live unit inventory is not publicly exposed by official DNR APIs. Booking and availability checks happen in the official reservation portal.",
      unitData: FALLBACK_UNIT_NOTE,
      trailData:
        "Trail geometry and allowed-use references should be treated as guidance layers and verified with official park notices.",
    },
  });
}
