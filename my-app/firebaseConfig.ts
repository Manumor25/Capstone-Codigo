// Import the functions you need from the SDKs you need
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
import { getFirestore, initializeFirestore, Firestore } from "firebase/firestore";
// https://firebase.google.com/docs/web/setup#available-libraries
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAcYds_G6uTHfIk7PGZDA-vn9RGit4sS5Q",
  authDomain: "furgotruck-2a8e7.firebaseapp.com",
  projectId: "furgotruck-2a8e7",
  storageBucket: "furgotruck-2a8e7.appspot.com",
  messagingSenderId: "112283465575",
  appId: "1:112283465575:web:288e45272bf93dcf6de1c2",
  measurementId: "G-WRWTSEH9ZW"
};

// Initialize Firebase - Evitar múltiples inicializaciones
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Firestore con configuración específica para web y Android
// Esto previene el error "INTERNAL ASSERTION FAILED: Unexpected state"
let db: Firestore;
const isWeb = typeof window !== 'undefined';
const isAndroid = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

try {
  if (isWeb) {
    // En web, usar initializeFirestore con configuración explícita para evitar problemas de estado
    try {
      db = initializeFirestore(app, {
        experimentalForceLongPolling: false,
        ignoreUndefinedProperties: true,
      });
    } catch (error) {
      // Si ya está inicializado, obtener la instancia existente
      console.warn('Firestore ya inicializado, usando instancia existente');
      db = getFirestore(app);
    }
  } else {
    // En móvil (Android/iOS), usar getFirestore con configuración para mejor rendimiento
    try {
      db = getFirestore(app);
      // Verificar que Firestore esté funcionando correctamente
      console.log('Firestore inicializado correctamente para móvil');
    } catch (error) {
      console.error('Error al inicializar Firestore en móvil:', error);
      // Fallback: intentar obtener la instancia existente
      db = getFirestore(app);
    }
  }
} catch (error) {
  console.error('Error crítico al inicializar Firestore:', error);
  // Último fallback: intentar obtener la instancia existente
  try {
    db = getFirestore(app);
  } catch (fallbackError) {
    console.error('Error en fallback de Firestore:', fallbackError);
    throw new Error('No se pudo inicializar Firestore. Verifica tu conexión a internet.');
  }
}

// Initialize Firebase Storage
export const storage: FirebaseStorage = getStorage(app);

export { db };

