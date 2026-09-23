'use strict';

/**
 * Immunia.ai — Service Worker
 * ---------------------------------------------------------------------
 * Rôle strictement limité à deux choses :
 *   1. Mettre en cache la coquille applicative (index.html, fichier unique
 *      et auto-contenu) pour un chargement instantané et un minimum
 *      d'usage hors-ligne — condition requise pour l'installabilité PWA.
 *   2. Ne JAMAIS intercepter les appels vers le backend Render (/api/...)
 *      ni vers toute autre origine (Replicate, Stripe, etc.) : ces
 *      requêtes doivent toujours atteindre le réseau directement, sans
 *      mise en cache, pour rester fraîches et fiables.
 * ---------------------------------------------------------------------
 */

const CACHE_NAME = 'immunia-shell-v1';
const SHELL_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // On ne gère que les requêtes GET : tout le reste (POST vers /api/protect,
  // etc.) est laissé passer tel quel, sans intervention du Service Worker.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jamais d'interception cross-origin (backend Render, Replicate, Stripe...)
  // ni de la route /api/ même si elle était un jour servie en same-origin.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isShellRequest =
    request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';

  if (isShellRequest) {
    // Réseau d'abord : la vitrine (tarifs, design, logique) doit toujours
    // refléter la dernière version déployée quand une connexion est
    // disponible. Le cache ne sert qu'en secours hors-ligne.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseCopy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  // Toute autre ressource statique same-origin (rare : tout est inline dans
  // index.html) : cache d'abord, avec repli réseau.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
