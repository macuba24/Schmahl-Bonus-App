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
  event.waitUntil(self.registration.showNotification(title, options).catch(function () {
    return self.registration.showNotification(title, { body: options.body, data: options.data });
  }));
});

self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(fetch("https://app-backpanel.onrender.com/api/v1/push/public-key", { cache: "no-store" })
    .then(function (response) { return response.json(); })
    .then(function (payload) {
      if (!payload.publicKey) throw new Error("key");
      return self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(payload.publicKey),
      });
    })
    .then(function (subscription) {
      return fetch("https://app-backpanel.onrender.com/api/v1/push/subscriptions/schmahl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription),
      });
    }));
});

function urlBase64ToUint8Array(value) {
  var padding = "=".repeat((4 - (value.length % 4)) % 4);
  var base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  var raw = atob(base64);
  var output = new Uint8Array(raw.length);
  for (var index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = event.notification.data && event.notification.data.url ? event.notification.data.url : "./";
  if (!/^https?:\/\//.test(target) && target.charAt(0) !== "." && target.charAt(0) !== "/") target = "./";
  event.waitUntil(self.clients.openWindow(target));
});
