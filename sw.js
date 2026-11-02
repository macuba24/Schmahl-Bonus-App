self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  if (event.request.url.indexOf("http") !== 0) return;
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {};
  }
  var title = payload.title || "Nachricht";
  var options = {
    body: payload.message || "",
    data: { url: payload.url || "./" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = event.notification.data && event.notification.data.url ? event.notification.data.url : "./";
  if (!/^https?:\/\//.test(target) && target.charAt(0) !== "." && target.charAt(0) !== "/") target = "./";
  event.waitUntil(self.clients.openWindow(target));
});
