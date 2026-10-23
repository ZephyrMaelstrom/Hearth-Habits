import type { FirebaseOptions } from 'firebase/app';

// Sync is off until this holds your Firebase web app's config.
// Firebase console > Project settings > Your apps > Web app > SDK setup and configuration,
// then paste the object here, e.g.
//
// export const firebaseConfig: FirebaseOptions | null = {
//   apiKey: '...',
//   authDomain: 'hearth-habits.firebaseapp.com',
//   projectId: 'hearth-habits',
//   storageBucket: 'hearth-habits.appspot.com',
//   messagingSenderId: '...',
//   appId: '...',
// };
//
// These values are safe to commit: Firebase web config is public by design, and
// firestore.rules is what keeps each player's data private. See docs/SETUP.md.
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyBExoJEoy-GnlPUt8cI_cAaLTWqSM5DFIM',
  authDomain: 'hearth-habits.firebaseapp.com',
  projectId: 'hearth-habits',
  storageBucket: 'hearth-habits.firebasestorage.app',
  messagingSenderId: '1678200450',
  appId: '1:1678200450:web:003b16060efc4724576e9b',
};
