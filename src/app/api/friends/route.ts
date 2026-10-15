import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/auth";
import { otherFriendEmail } from "@/lib/server/friends";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const [byEmailA, byEmailB] = await Promise.all([
      adminDb.collection("friendships").where("emailA", "==", auth.email).get(),
      adminDb.collection("friendships").where("emailB", "==", auth.email).get(),
    ]);

    const friendships = [...byEmailA.docs, ...byEmailB.docs].map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        status: data.status as "pending" | "accepted",
        requestedByEmail: data.requestedByEmail as string,
        friendEmail: otherFriendEmail(data.emailA as string, data.emailB as string, auth.email),
      };
    });

    return NextResponse.json({ friendships });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list friends";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
