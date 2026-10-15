import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/auth";

type InviteBody = {
  email: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const { tripId } = await params;
    const body = (await request.json()) as InviteBody;
    const inviteEmail = body.email.trim().toLowerCase();
    if (!inviteEmail.includes("@")) {
      return NextResponse.json({ error: "Invalid invite email" }, { status: 400 });
    }

    const ref = adminDb.collection("trips").doc(tripId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    const trip = snap.data();
    if (trip?.creatorEmail !== auth.email) {
      return NextResponse.json({ error: "Only creator can invite members" }, { status: 403 });
    }

    const existingMembers = (trip?.memberEmails as string[]) ?? [];
    if (existingMembers.includes(inviteEmail)) {
      return NextResponse.json({ ok: true, alreadyMember: true });
    }

    await ref.update({
      memberEmails: [...existingMembers, inviteEmail],
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to invite member";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
