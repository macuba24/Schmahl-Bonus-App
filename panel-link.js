(function () {
  var host = document.getElementById("panel-live");
  if (!host) return;

  function localHost(name) {
    return (
      name === "localhost" ||
      name === "127.0.0.1" ||
      name === "::1" ||
      name === "[::1]" ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(name) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(name)
    );
  }

  var pageHost = location.hostname;
  var ORIGIN;
  if (localHost(pageHost)) {
    var protocol = location.protocol === "https:" ? "https:" : "http:";
    ORIGIN = protocol + "//" + pageHost + ":3000";
  } else {
    var published = host.getAttribute("data-public-origin") || "";
    ORIGIN = published.replace(/\/$/, "") || location.origin;
  }
  var SLUG = host.getAttribute("data-slug") || "schmahl";

  var status = document.createElement("p");
  status.className = "hint live-status";
  var dot = document.createElement("span");
  dot.className = "live-dot";
  dot.setAttribute("aria-hidden", "true");
  var statusText = document.createElement("span");
  status.appendChild(dot);
  status.appendChild(statusText);
  var body = document.createElement("div");
  host.replaceChildren(status, body);

  var lastSignature = "";

  function when(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function flashText(deal) {
    var start = when(deal.startsAt);
    var end = when(deal.countdownEnd);
    return [deal.discountValue, start ? "Start " + start : "", end ? "Ende " + end : ""].filter(Boolean).join(" · ");
  }

  function benefit(title, text) {
    var box = document.createElement("article");
    box.className = "benefit";
    var heading = document.createElement("p");
    heading.style.fontWeight = "700";
    heading.textContent = title;
    box.appendChild(heading);
    if (text) {
      var copy = document.createElement("p");
      copy.textContent = text;
      box.appendChild(copy);
    }
    return box;
  }

  function euro(cents) {
    return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  function priceCents(value) {
    var cleaned = String(value).trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    return Math.round(Number(cleaned) * 100);
  }

  function legalUrl(value) {
    return /^https?:\/\//.test(String(value || ""));
  }

  function orderForm(slip) {
    var box = document.createElement("article");
    box.className = "benefit slip";
    var heading = document.createElement("p");
    heading.style.fontWeight = "700";
    heading.textContent = slip.title || "Bestellzettel";
    box.appendChild(heading);
    if (slip.note) {
      var note = document.createElement("p");
      note.textContent = slip.note;
      box.appendChild(note);
    }

    var lines = document.createElement("div");
    box.appendChild(lines);

    function addLine() {
      var row = document.createElement("div");
      row.className = "slip-row";
      ["Artikel", "Menge", "Preis"].forEach(function (label, index) {
        var input = document.createElement("input");
        input.setAttribute("aria-label", label);
        input.placeholder = index === 2 ? "0,00" : label;
        if (index === 1) input.value = "1";
        input.addEventListener("input", sync);
        row.appendChild(input);
      });
      lines.appendChild(row);
    }
    addLine();

    var add = document.createElement("button");
    add.type = "button";
    add.className = "quiet";
    add.textContent = "Zeile";
    add.addEventListener("click", function () {
      addLine();
      sync();
    });
    box.appendChild(add);

    var sum = document.createElement("p");
    sum.className = "slip-sum";
    box.appendChild(sum);
    if (slip.taxNote) {
      var tax = document.createElement("p");
      tax.textContent = slip.taxNote;
      box.appendChild(tax);
    }
    if (slip.fulfillment !== "delivery") {
      var pickup = document.createElement("p");
      pickup.textContent = "Abholung: " + (slip.pickupText || "Hinweis fehlt");
      box.appendChild(pickup);
    }
    if (slip.fulfillment !== "pickup") {
      var delivery = document.createElement("p");
      delivery.textContent = "Lieferung: " + (slip.deliveryText || "Hinweis fehlt");
      box.appendChild(delivery);
    }

    var mode = slip.fulfillment === "both" ? "" : slip.fulfillment;
    var address = null;
    if (slip.fulfillment === "both") {
      var choice = document.createElement("div");
      choice.className = "slip-choice";
      ["pickup", "delivery"].forEach(function (value) {
        var label = document.createElement("label");
        var radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "slip-fulfillment";
        radio.addEventListener("change", function () {
          mode = value;
          if (address) address.hidden = value !== "delivery";
          sync();
        });
        label.appendChild(radio);
        label.appendChild(document.createTextNode(value === "pickup" ? " Abholung" : " Lieferung"));
        choice.appendChild(label);
      });
      box.appendChild(choice);
    }
    if (slip.fulfillment !== "pickup") {
      address = document.createElement("textarea");
      address.setAttribute("aria-label", "Lieferadresse");
      address.placeholder = "Lieferadresse";
      address.hidden = slip.fulfillment === "both";
      address.addEventListener("input", sync);
      box.appendChild(address);
    }

    var payment = document.createElement("p");
    payment.textContent = "Zahlung: " + (slip.paymentLabel || "System des Geschäfts");
    box.appendChild(payment);
    if (slip.paymentInstructions) {
      var instructions = document.createElement("p");
      instructions.textContent = slip.paymentInstructions;
      box.appendChild(instructions);
    }

    var links = document.createElement("p");
    links.className = "slip-links";
    [
      ["Impressum", slip.impressumUrl],
      ["Datenschutz", slip.privacyUrl],
      ["AGB", slip.termsUrl],
      ["Widerrufsbelehrung", slip.withdrawalUrl],
    ].forEach(function (item) {
      var anchor = document.createElement("a");
      anchor.textContent = item[0];
      if (legalUrl(item[1])) {
        anchor.href = item[1];
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
      }
      links.appendChild(anchor);
    });
    box.appendChild(links);

    var checkLabel = document.createElement("label");
    checkLabel.className = "slip-check";
    var check = document.createElement("input");
    check.type = "checkbox";
    check.addEventListener("change", sync);
    checkLabel.appendChild(check);
    checkLabel.appendChild(document.createTextNode(" Ich habe die AGB gelesen und akzeptiere sie."));
    box.appendChild(checkLabel);

    var submit = document.createElement("button");
    submit.type = "button";
    submit.className = "send";
    submit.textContent = "zahlungspflichtig bestellen";
    submit.disabled = true;
    var status = document.createElement("p");
    status.className = "hint";
    box.appendChild(submit);
    box.appendChild(status);

    function collected() {
      var items = [];
      Array.prototype.forEach.call(lines.children, function (row) {
        var fields = row.querySelectorAll("input");
        var unit = priceCents(fields[2].value);
        var quantity = Number(fields[1].value);
        if (!fields[0].value.trim() || unit === null || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
        items.push({ article: fields[0].value.trim(), quantity: quantity, unitPriceCents: unit });
      });
      return items;
    }

    function sync() {
      var items = collected();
      var total = items.reduce(function (sum, item) { return sum + item.quantity * item.unitPriceCents; }, 0);
      sum.textContent = "Gesamtpreis inklusive Steuer: " + euro(total);
      var legal = legalUrl(slip.impressumUrl) && legalUrl(slip.privacyUrl) && legalUrl(slip.termsUrl) && legalUrl(slip.withdrawalUrl);
      var addressOk = mode !== "delivery" || (address && address.value.trim().length >= 5);
      submit.disabled = !(legal && items.length && total > 0 && mode && addressOk && check.checked);
    }

    submit.addEventListener("click", function () {
      var items = collected();
      if (submit.disabled) return;
      submit.disabled = true;
      status.textContent = "Bestellung wird aufgenommen.";
      fetch(ORIGIN + "/api/v1/orders/" + encodeURIComponent(SLUG), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: items,
          fulfillment: mode,
          deliveryAddress: mode === "delivery" && address ? address.value.trim() : "",
          termsAccepted: check.checked === true,
        }),
      }).then(function (response) {
        return response.json().then(function (payload) {
          return { ok: response.ok, payload: payload };
        });
      }).then(function (result) {
        if (!result.ok) {
          status.textContent = (result.payload && result.payload.error) || "Die Bestellung konnte nicht gespeichert werden.";
          sync();
          return;
        }
        if (legalUrl(slip.paymentUrl)) window.open(slip.paymentUrl, "_blank", "noopener");
        box.replaceChildren();
        var done = document.createElement("p");
        done.style.fontWeight = "700";
        done.textContent = "Bestellung aufgenommen";
        var detail = document.createElement("p");
        detail.textContent = "Gesamtpreis inklusive Steuer: " + euro(result.payload.totalCents || 0) + ". Die Zahlung schließen Sie über " + (slip.paymentLabel || "das System des Geschäfts") + " ab. Diese App belastet keine Karte.";
        box.appendChild(done);
        box.appendChild(detail);
      }).catch(function () {
        status.textContent = "Die Bestellung konnte nicht gespeichert werden.";
        sync();
      });
    });

    sync();
    return box;
  }

  function urlBase64ToUint8Array(value) {
    var padding = "=".repeat((4 - (value.length % 4)) % 4);
    var base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var output = new Uint8Array(raw.length);
    for (var index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
    return output;
  }

  function pushReady(box, button, hint) {
    box.hidden = true;
    button.hidden = true;
    hint.hidden = true;
    hint.textContent = "";
  }

  function currentPushRegistration() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistrations().then(function (registrations) {
      return Promise.all(registrations.map(function (registration) {
        var worker = registration.active || registration.waiting || registration.installing;
        var script = worker ? worker.scriptURL : "";
        if (script.indexOf("sw.js?") !== -1) return registration.unregister();
        return null;
      }));
    }).then(function () {
      return navigator.serviceWorker.register("sw.js");
    }).then(function (registration) {
      return navigator.serviceWorker.ready.then(function () { return registration; });
    });
  }

  function storePushSubscription(subscription) {
    if (!subscription || !subscription.endpoint) throw new Error("save");
    return fetch(ORIGIN + "/api/v1/push/subscriptions/" + encodeURIComponent(SLUG), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription),
    }).then(function (response) {
      if (!response.ok) throw new Error("save");
      return subscription;
    });
  }

  function subscribeForPush() {
    return currentPushRegistration().then(function (registration) {
      if (!registration) throw new Error("worker");
      return registration.pushManager.getSubscription().then(function (existing) {
        if (existing) return existing;
        return fetch(ORIGIN + "/api/v1/push/public-key", { cache: "no-store" })
          .then(function (response) { return response.json(); })
          .then(function (payload) {
            if (!payload.publicKey) throw new Error("key");
            return registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(payload.publicKey),
            });
          });
      });
    }).then(storePushSubscription);
  }

  function pushOptIn() {
    var box = benefit("Mitteilungen", "Erlauben Sie Mitteilungen für dieses Handy.");
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Mitteilungen auf diesem Handy erlauben";
    var hint = document.createElement("p");
    hint.className = "hint";
    if (!window.isSecureContext) {
      button.disabled = true;
      hint.textContent = "Dieses Handy zeigt Mitteilungen nur über eine https-Adresse. Die aktuelle Adresse ist unverschlüsselt.";
    } else if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      button.disabled = true;
      hint.textContent = "Dieser Browser kann keine Mitteilungen auf dem Sperrbildschirm zeigen.";
    } else if (Notification.permission === "granted") {
      box.hidden = true;
      button.hidden = true;
      hint.hidden = true;
      subscribeForPush().then(function () {
        pushReady(box, button, hint);
      }).catch(function () {
        box.hidden = false;
        button.hidden = false;
        button.disabled = false;
        hint.hidden = false;
        hint.textContent = "";
      });
    } else if (Notification.permission === "denied") {
      button.disabled = true;
      hint.textContent = "Die Erlaubnis ist in den Browser-Einstellungen ausgeschaltet.";
    }
    button.addEventListener("click", function () {
      button.disabled = true;
      var ask = Notification.permission === "granted"
        ? Promise.resolve("granted")
        : Notification.requestPermission();
      ask.then(function (permission) {
        if (permission !== "granted") {
          hint.textContent = "Ohne Erlaubnis bleibt der Sperrbildschirm leer.";
          button.disabled = false;
          return null;
        }
        hint.hidden = true;
        return subscribeForPush()
          .then(storePushSubscription)
          .then(function () { pushReady(box, button, hint); });
      }).catch(function () {
        hint.hidden = false;
        hint.textContent = "Die Erlaubnis ist fehlgeschlagen. Auf dem iPhone muss die App auf dem Home-Bildschirm liegen.";
        button.disabled = false;
      });
    });
    box.appendChild(button);
    box.appendChild(hint);
    return box;
  }

  var geoWatch = 0;

  function distanceMeters(aLat, aLon, bLat, bLon) {
    var earth = 6371000;
    var p1 = aLat * Math.PI / 180;
    var p2 = bLat * Math.PI / 180;
    var dLat = (bLat - aLat) * Math.PI / 180;
    var dLon = (bLon - aLon) * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function geofenceCard(fence) {
    var box = benefit(fence.title || "Geofencing", "Tippen Sie auf Standort prüfen. Die Position bleibt auf diesem Handy.");
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Standort prüfen";
    var status = document.createElement("p");
    status.className = "hint";
    button.addEventListener("click", function () {
      if (!navigator.geolocation) {
        status.textContent = "Dieses Handy kann den Standort nicht prüfen.";
        return;
      }
      if (geoWatch) navigator.geolocation.clearWatch(geoWatch);
      geoWatch = navigator.geolocation.watchPosition(function (position) {
        var meters = distanceMeters(
          position.coords.latitude,
          position.coords.longitude,
          Number(fence.latitude),
          Number(fence.longitude),
        );
        status.textContent = meters <= Number(fence.radiusMeters)
          ? (fence.message || "Sie sind im Umkreis des Geschäfts.")
          : "Sie sind außerhalb des Umkreises.";
      }, function () {
        status.textContent = "Ohne Standort-Erlaubnis bleibt der Umkreis unsichtbar.";
      }, { enableHighAccuracy: false, maximumAge: 15000, timeout: 20000 });
    });
    box.appendChild(button);
    box.appendChild(status);
    return box;
  }

  function moduleCards(modules, order) {
    var source = modules || {};
    var builders = {
      stampCard: function () {
        return [
          benefit(
            "Stempelpass",
            [source.stampCard.stampCount + " Stempel", source.stampCard.rewardText, source.stampCard.redeemCode]
              .filter(Boolean)
              .join(" · "),
          ),
        ];
      },
      challengePass: function () {
        return [
          benefit(
            "Challenge-Pass",
            [source.challengePass.visitTarget + " Besuche", source.challengePass.rewardText].filter(Boolean).join(" · "),
          ),
        ];
      },
      birthdayGreeting: function () {
        return [benefit(source.birthdayGreeting.title || "Alles Gute!", source.birthdayGreeting.message || "")];
      },
      seasonalGreeting: function () {
        return [benefit(source.seasonalGreeting.bannerTitle || "Saisongruß", source.seasonalGreeting.text || "")];
      },
      eventCalendar: function () {
        var cards = [];
        if (Array.isArray(source.eventCalendar.events)) {
          source.eventCalendar.events.forEach(function (event) {
            cards.push(
              benefit(event.name || "Event", [event.date, event.location, event.description].filter(Boolean).join(" · ")),
            );
          });
        }
        return cards;
      },
      quickPoll: function () {
        return [
          benefit(
            source.quickPoll.question || "Umfrage",
            Array.isArray(source.quickPoll.options) ? source.quickPoll.options.join(" · ") : "",
          ),
        ];
      },
      wheel: function () {
        var prizes = Array.isArray(source.wheel.prizes)
          ? source.wheel.prizes.map(function (prize) { return prize.label; }).filter(Boolean).join(" · ")
          : "";
        return [benefit("Tages-Chance", prizes)];
      },
      flashDeal: function () {
        return [benefit(source.flashDeal.title || "Flash-Deal", flashText(source.flashDeal))];
      },
      pushCenter: function () {
        return [pushOptIn(source.pushCenter || {})];
      },
      orderSlip: function () {
        return [orderForm(source.orderSlip || {})];
      },
      geofence: function () {
        return [geofenceCard(source.geofence || {})];
      },
      photos: function () {
        if (!Array.isArray(source.photos.items) || !source.photos.items.length) return [];
        var gallery = document.createElement("div");
        gallery.className = "steps";
        source.photos.items.slice(0, 3).forEach(function (item, index) {
          var image = document.createElement("img");
          image.alt = "Foto " + (index + 1);
          image.src = item.url && item.url.indexOf("http") === 0 ? item.url : ORIGIN + item.url;
          image.style.width = "100%";
          image.style.aspectRatio = "1";
          image.style.objectFit = "cover";
          image.style.border = "2px solid #111";
          image.style.borderRadius = "0.5rem";
          gallery.appendChild(image);
        });
        return [gallery];
      },
    };
    var seen = {};
    var keys = [];
    var preferred = Array.isArray(order) ? order : Object.keys(source);
    preferred.concat(Object.keys(source)).forEach(function (key) {
      if (seen[key] || !source[key] || !builders[key]) return;
      seen[key] = true;
      keys.push(key);
    });
    var cards = [];
    keys.forEach(function (key) {
      builders[key]().forEach(function (card) { cards.push(card); });
    });
    return cards;
  }

  function applyBranding(data) {
    var color = data.branding && data.branding.primaryColor;
    if (color) {
      document.querySelectorAll(".logo-band, .logo-button").forEach(function (node) {
        node.style.background = color;
      });
      var theme = document.querySelector('meta[name="theme-color"]');
      if (theme) theme.setAttribute("content", color);
    }
  }

  function sha256(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text))).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
        return ("0" + byte.toString(16)).slice(-2);
      }).join("");
    });
  }

  window.SchmahlClaim = function (jpeg) {
    return sha256(jpeg).then(function (hash) {
      return fetch(ORIGIN + "/api/v1/receipts/" + encodeURIComponent(SLUG), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash: hash }),
      }).then(function (response) {
        if (response.status === 409) return { ok: false, error: "Diese Rechnung wurde schon erfasst." };
        if (!response.ok) return { ok: false, error: "Die Rechnung konnte nicht geprüft werden." };
        return { ok: true, hash: hash };
      });
    }).catch(function () {
      return { ok: false, error: "Die Rechnung konnte nicht geprüft werden." };
    });
  };

  function paint(data) {
    var signature = JSON.stringify({
      branding: data.branding || null,
      modules: data.modules || null,
      order: data.order || null,
      factory: data.factory || null,
      updatedAt: data.updatedAt || null,
    });
    var clock = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var name = data.tenant && data.tenant.name ? data.tenant.name : "Schmahl";
    statusText.textContent = "Live · " + name + " · " + clock;
    dot.style.background = "#2dd4bf";
    if (signature === lastSignature) return;
    lastSignature = signature;
    applyBranding(data);
    var live = window.ShopLive || window.SchmahlLive;
    if (live && live.apply) live.apply(data.factory);
    body.replaceChildren();
    if (data.branding && data.branding.welcomeMessage) {
      var welcome = document.createElement("p");
      welcome.textContent = data.branding.welcomeMessage;
      body.appendChild(welcome);
    }
    var cards = moduleCards(data.modules, data.order);
    if (!cards.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Im Backpanel ist gerade kein Modul eingeschaltet.";
      body.appendChild(empty);
      return;
    }
    cards.forEach(function (card) { body.appendChild(card); });
  }

  function fail() {
    lastSignature = "";
    dot.style.background = "#a1a1aa";
    statusText.textContent = "Backpanel nicht erreichbar. Die übrige App bleibt nutzbar.";
  }

  function load() {
    fetch(ORIGIN + "/api/v1/app-config/" + encodeURIComponent(SLUG), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then(paint)
      .catch(fail);
  }

  load();
  window.setInterval(load, 2000);
})();
