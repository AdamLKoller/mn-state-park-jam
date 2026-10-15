import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

export type AuthContext = {
  uid: string;
  email: string;
  name?: string;
};

export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing Bearer token");
  }

  const token = authHeader.slice("Bearer ".length);
  const decoded = await adminAuth.verifyIdToken(token);
  const email = decoded.email?.toLowerCase();

  if (!email) {
    throw new Error("Authenticated account has no email");
  }

  return {
    uid: decoded.uid,
    email,
    name: decoded.name,
  };
}
