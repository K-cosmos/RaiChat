const CACHE_NAME = 'lai-chat-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/main.js',
    '/style.css', // あれば
    '/icon.png', // manifestにあるアイコン
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📦 キャッシュ中...');
            return cache.addAll(urlsToCache);
        })
    );
});

// オフライン時にキャッシュを返す
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() =>
            caches.match(event.request).then((response) => {
                return response || caches.match('/index.html');
            })
        )
    );
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((keyList) =>
            Promise.all(
                keyList.map((key) => {
                    if (!cacheWhitelist.includes(key)) {
                        return caches.delete(key);
                    }
                })
            )
        )
    );
});

// 通知許可のボタン
self.addEventListener('push', event => {
    const options = {
        body: event.data.text(),
        icon: '/images/notification-icon.png',
        badge: '/images/notification-badge.png',
    };

    event.waitUntil(
        self.registration.showNotification('新しい通知', options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    // 通知クリック時の動作をここで設定
});

