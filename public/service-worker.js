self.addEventListener('install', (e) => {
    console.log('[ServiceWorker] Install');
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    console.log('[ServiceWorker] Activate');
});

self.addEventListener('push', (event) => {
    const data = event.data.json();
    const title = data.title || 'ÇÁÇ¢ÇøÇ·ÇÒÇ©ÇÁÇÃÇ®ímÇÁÇπÅI';
    const options = {
        body: data.body,
        icon: '/icon.png'
    };
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});
