/* 앱 푸시 알림 — vite-plugin-pwa 가 생성한 sw.js 가 importScripts 로 불러온다.
   모든 푸시는 알림을 띄운다. iOS 는 알림 없이 받은 푸시가 몇 번 쌓이면 구독을 끊는다.
   페이로드 JSON: {title, body, tag, url}. 알림을 누르면 열린 앱 창을 앞으로 가져오거나 새로 연다. */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  if (!data || typeof data !== 'object') data = {};
  var scope = self.registration.scope;
  var options = {
    body: data.body || '',
    tag: data.tag || 'h2-routine',
    renotify: true,
    icon: scope + 'icons/icon-192.png',
    badge: scope + 'icons/icon-192.png',
    data: { url: data.url || scope }
  };
  var work = [self.registration.showNotification(data.title || 'H2 루틴', options)];
  if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
    work.push(Promise.resolve(self.navigator.setAppBadge(1)).catch(function () {}));
  }
  event.waitUntil(Promise.all(work));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i].focus === 'function') return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
