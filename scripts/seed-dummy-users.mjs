// Writes dummy user profiles to the `users` collection so friend search has records to find.
// Usage: node --env-file=.env.local scripts/seed-dummy-users.mjs
// Re-running is safe: documents are merged by a fixed uid.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DUMMY_USERS = [
  { displayName: "Maya Johnson", email: "maya.johnson@example.com" },
  { displayName: "Samantha Lee", email: "samantha.lee@example.com" },
  { displayName: "Sam Carter", email: "sam.carter@example.com" },
  { displayName: "Jordan Blake", email: "jordan.blake@example.com" },
  { displayName: "Priya Patel", email: "priya.patel@example.com" },
  { displayName: "Luis Ortega", email: "luis.ortega@example.com" },
  { displayName: "Hannah Schultz", email: "hannah.schultz@example.com" },
  { displayName: "Ethan Nguyen", email: "ethan.nguyen@example.com" },
];

function initAdmin() {
  if (getApps()[0]) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required (run with --env-file=.env.local)");
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  return initializeApp({ projectId });
}

const db = getFirestore(initAdmin());
const now = new Date().toISOString();
const batch = db.batch();

for (const user of DUMMY_USERS) {
  const emailLower = user.email.toLowerCase();
  const uid = `dummy-${emailLower.split("@")[0].replaceAll(".", "-")}`;
  batch.set(
    db.collection("users").doc(uid),
    {
      uid,
      email: emailLower,
      emailLower,
      displayName: user.displayName,
      displayNameLower: user.displayName.toLowerCase(),
      isDummy: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
}

await batch.commit();
console.log(`Seeded ${DUMMY_USERS.length} dummy users:`);
DUMMY_USERS.forEach((user) => console.log(`  ${user.displayName} <${user.email}>`));
