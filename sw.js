self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
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
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: payload.url || "./" },
    tag: "schmahl-mitteilung",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = event.notification.data && event.notification.data.url ? event.notification.data.url : "./";
  if (!/^https?:\/\//.test(target) && target.charAt(0) !== "." && target.charAt(0) !== "/") target = "./";
  event.waitUntil(self.clients.openWindow(target));
});
