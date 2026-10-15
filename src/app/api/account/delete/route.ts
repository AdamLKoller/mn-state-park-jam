import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const [asEmailA, asEmailB, tripMembership] = await Promise.all([
      adminDb.collection("friendships").where("emailA", "==", auth.email).get(),
      adminDb.collection("friendships").where("emailB", "==", auth.email).get(),
      adminDb.collection("trips").where("memberEmails", "array-contains", auth.email).get(),
    ]);

    const batch = adminDb.batch();
    [...asEmailA.docs, ...asEmailB.docs].forEach((doc) => batch.delete(doc.ref));
    batch.delete(adminDb.collection("users").doc(auth.uid));
    batch.delete(adminDb.collection("driveDistances").doc(auth.uid));

    tripMembership.docs.forEach((doc) => {
      const data = doc.data();
      const members = (data.memberEmails as string[]).filter((email) => email !== auth.email);
      const memberUids = ((data.memberUids as string[]) ?? []).filter((uid) => uid !== auth.uid);
      if (data.creatorEmail === auth.email) {
        batch.delete(doc.ref);
      } else {
        batch.update(doc.ref, {
          memberEmails: members,
          memberUids,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    await batch.commit();
    await adminAuth.deleteUser(auth.uid);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete account";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
