import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/auth";
import { friendshipId } from "@/lib/server/friends";

type ResponseBody = {
  email: string;
  accept: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = (await request.json()) as ResponseBody;
    const targetEmail = body.email.trim().toLowerCase();
    const id = friendshipId(auth.email, targetEmail);
    const ref = adminDb.collection("friendships").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Friend request not found" }, { status: 404 });
    }

    const record = snap.data();
    if (record?.status !== "pending") {
      return NextResponse.json({ error: "Friend request is not pending" }, { status: 400 });
    }

    if (body.accept) {
      await ref.update({
        status: "accepted",
        updatedAt: new Date().toISOString(),
      });
    } else {
      await ref.delete();
    }

    return NextResponse.json({ ok: true, status: body.accept ? "accepted" : "deleted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to respond to request";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
