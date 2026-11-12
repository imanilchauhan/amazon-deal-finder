import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";

// Web config is public by design (it ships to every browser). Access is enforced by
// Firestore security rules: deals are read-only for clients, writes come from the backend.
const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function db() {
  if (!config.projectId) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_* env vars (see web/.env.example).");
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  return getFirestore(app);
}
