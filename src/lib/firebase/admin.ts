import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function serviceAccountCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    return undefined;
  }

  return cert({
    projectId,
    clientEmail,
    privateKey,
  });
}

const adminApp = (() => {
  if (getApps()[0]) {
    return getApps()[0];
  }

  const credential = serviceAccountCredential();
  if (credential) {
    return initializeApp({ credential });
  }

  return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
})();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
