import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAyXZ9t8tMwVUuXV0SbWAz9OhJiWFFxDE8",
  authDomain: "yatirim-takibi.firebaseapp.com",
  projectId: "yatirim-takibi",
  storageBucket: "yatirim-takibi.firebasestorage.app",
  messagingSenderId: "854566476509",
  appId: "1:854566476509:web:1ae4a80335486220a0d934"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
