import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/auth";
import { friendshipId } from "@/lib/server/friends";

type RequestBody = {
  email: string;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = (await request.json()) as RequestBody;
    const targetEmail = body.email.trim().toLowerCase();

    if (!targetEmail.includes("@")) {
      return NextResponse.json({ error: "Invalid target email" }, { status: 400 });
    }

    if (targetEmail === auth.email) {
      return NextResponse.json({ error: "Cannot friend yourself" }, { status: 400 });
    }

    const id = friendshipId(auth.email, targetEmail);
    const now = new Date().toISOString();
    const ref = adminDb.collection("friendships").doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      return NextResponse.json({ ok: true, status: existing.data()?.status });
    }

    await ref.set({
      id,
      emailA: [auth.email, targetEmail].sort()[0],
      emailB: [auth.email, targetEmail].sort()[1],
      status: "pending",
      requestedByEmail: auth.email,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, status: "pending" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Friend request failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
