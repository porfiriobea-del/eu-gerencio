import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId;

const firestoreSettings = {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true,
  // Ensure long polling fallback works robustly through restricted proxy/cloud preview networks
  useFetchStreams: false
};

export const db = firestoreDbId
  ? initializeFirestore(app, firestoreSettings, firestoreDbId)
  : initializeFirestore(app, firestoreSettings);

export const auth = getAuth(app);
