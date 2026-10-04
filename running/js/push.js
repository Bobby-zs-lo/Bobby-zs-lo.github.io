// Web Push subscription (Android Chrome: VAPID + aes128gcm on the server).
import { api } from './api.js';

export function pushSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
}

/** base64url VAPID public key → Uint8Array for applicationServerKey */
export function urlBase64ToUint8Array(b64) {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(a, b) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export function permissionState() {
  return pushSupported() ? Notification.permission : 'unsupported';
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(vapidPublicKey) {
  if (!pushSupported()) throw new Error('This browser does not support push notifications. Install the app from Chrome on Android.');
  if (!vapidPublicKey) throw new Error('The server did not send a push key (push.vapidPublicKey).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied'
      ? 'Notifications are blocked. Allow them under Chrome › Site settings › Notifications.'
      : 'Notification permission was not granted.');
  }
  const reg = await navigator.serviceWorker.ready;
  const key = urlBase64ToUint8Array(vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options && sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
  return sub;
}
