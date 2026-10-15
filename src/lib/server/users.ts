import { adminDb } from "@/lib/firebase/admin";
import { UserAddress } from "@/lib/types";

export type UserRecord = {
  uid: string;
  email: string;
  displayName: string;
  address?: UserAddress;
};

export async function loadUsersByEmail(emails: string[]): Promise<Map<string, UserRecord>> {
  const normalizedEmails = [...new Set(emails.map((email) => email.toLowerCase()))];
  const snapshots = await Promise.all(
    normalizedEmails.map((email) =>
      adminDb.collection("users").where("emailLower", "==", email).limit(1).get(),
    ),
  );

  const users = new Map<string, UserRecord>();
  snapshots.forEach((snapshot) => {
    const doc = snapshot.docs[0];
    if (!doc) {
      return;
    }
    const data = doc.data();
    users.set(data.emailLower as string, {
      uid: data.uid as string,
      email: data.emailLower as string,
      displayName: data.displayName as string,
      address: data.address as UserAddress | undefined,
    });
  });

  return users;
}
