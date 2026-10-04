// Filled in at setup (SETUP.md). Imported by the page AND by sw.js,
// which is registered as a module service worker, so this is the only copy.
//
// API_BASE: the Cloud Functions HTTPS endpoint of the `api` function. Request
// paths ('/api/state', …) are appended to it as-is.
export const API_BASE = 'https://europe-west1-REPLACE-ME.cloudfunctions.net/api';

// Firebase web app config (Firebase console › Project settings › Your apps).
// These values are public identifiers, not secrets.
export const FIREBASE_CONFIG = {
  apiKey: 'REPLACE-ME',
  authDomain: 'REPLACE-ME',
  projectId: 'REPLACE-ME',
  appId: 'REPLACE-ME',
};

// Bump on every deploy: it names the service-worker shell cache.
export const APP_VERSION = '0.2.0';
