import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/server/auth";

function normalizeQuery(raw: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
    if (query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const exactByEmail = await adminDb.collection("users").where("emailLower", "==", query).limit(10).get();

    const byDisplayName = await adminDb
      .collection("users")
      .where("displayNameLower", ">=", query)
      .where("displayNameLower", "<=", `${query}\uf8ff`)
      .limit(10)
      .get();

    const map = new Map<string, { uid: string; displayName: string; maskedEmail: string; emailLower: string }>();
    [...exactByEmail.docs, ...byDisplayName.docs].forEach((doc) => {
      const data = doc.data();
      const emailLower = data.emailLower as string;
      if (emailLower === auth.email) {
        return;
      }

      const [local, domain] = emailLower.split("@");
      const maskedLocal = local.length <= 2 ? `${local[0]}*` : `${local.slice(0, 2)}***`;
      map.set(data.uid as string, {
        uid: data.uid as string,
        displayName: data.displayName as string,
        maskedEmail: `${maskedLocal}@${domain}`,
        emailLower,
      });
    });

    return NextResponse.json({ users: [...map.values()] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
