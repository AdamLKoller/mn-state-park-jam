import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const now = new Date().toISOString();

    const userRef = adminDb.collection("users").doc(auth.uid);
    await userRef.set(
      {
        uid: auth.uid,
        email: auth.email,
        displayName: auth.name ?? auth.email.split("@")[0],
        displayNameLower: (auth.name ?? auth.email.split("@")[0]).toLowerCase(),
        emailLower: auth.email,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true },
    );
    const userSnap = await userRef.get();

    const tripsSnap = await adminDb
      .collection("trips")
      .where("memberEmails", "array-contains", auth.email)
      .get();

    const batch = adminDb.batch();
    tripsSnap.docs.forEach((tripDoc) => {
      const data = tripDoc.data();
      const memberUids: string[] = data.memberUids ?? [];
      if (!memberUids.includes(auth.uid)) {
        batch.update(tripDoc.ref, {
          memberUids: [...memberUids, auth.uid],
          updatedAt: now,
        });
      }
    });
    await batch.commit();

    return NextResponse.json({ ok: true, address: userSnap.data()?.address ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upsert user";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
