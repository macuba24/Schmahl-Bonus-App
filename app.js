var SVG_NS = "http://www.w3.org/2000/svg";
var PATTERNS = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "11000111010",
];
var STOP = "1100011101011";

var kunde = document.querySelector("#kunde");
var kasse = document.querySelector("#kasse");
var shopLines = document.querySelector("#shop-lines");
var store = Schmahl.createStore(localStorage);
var pendingReceipts = [];
var pendingMessage = "";
var kasseNumber = "";
var benefitFields = [];
var monthTurnoverNode = null;
var monthFeeNode = null;
var monthTitleNode = null;
var kasseResult = null;
var kasseNote = null;

function euro(cents) {
  var n = Math.trunc(Number(cents) || 0);
  var sign = n < 0 ? "-" : "";
  var abs = Math.abs(n);
  var whole = Math.floor(abs / 100);
  var frac = String(abs % 100).padStart(2, "0");
  var grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return sign + grouped + "," + frac + " \u20AC";
}

function euroWords(cents) {
  var n = Math.abs(Math.trunc(Number(cents) || 0));
  var whole = Math.floor(n / 100);
  var frac = n % 100;
  var grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (frac === 0) return grouped + " Euro";
  return grouped + "," + String(frac).padStart(2, "0") + " Euro";
}

function cleanNumber(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function stamp(iso) {
  if (!iso || iso.length < 16) return "";
  return iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) + ", " + iso.slice(11, 16);
}

function el(tag, attrs, children) {
  var node = document.createElement(tag);
  var values = attrs || {};
  Object.keys(values).forEach(function (key) {
    var value = values[key];
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (typeof value === "function" && key.indexOf("on") === 0) {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  });
  var list = Array.isArray(children) ? children : children == null ? [] : [children];
  list.forEach(function (child) {
    if (child == null || child === false) return;
    if (typeof child === "string" || typeof child === "number") {
      node.append(document.createTextNode(String(child)));
    } else node.append(child);
  });
  return node;
}

function encodeCode128B(text) {
  var values = [104];
  var i;
  for (i = 0; i < text.length; i += 1) {
    var code = text.charCodeAt(i);
    if (code < 32 || code > 126) throw new Error("Die Kundennummer lässt sich nicht als Barcode zeichnen.");
    values.push(code - 32);
  }
  var sum = values[0];
  for (i = 1; i < values.length; i += 1) sum += i * values[i];
  values.push(sum % 103);
  var bits = "";
  values.forEach(function (value) { bits += PATTERNS[value]; });
  return bits + STOP;
}

function barcodeSvg(text) {
  var bits = encodeCode128B(text);
  var module = 2;
  var quiet = 10;
  var height = 100;
  var width = (bits.length + quiet * 2) * module;
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Barcode des Kunden-Codes " + text);
  var background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", "#ffffff");
  svg.append(background);
  var x = quiet * module;
  var i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      var run = 1;
      while (i + run < bits.length && bits[i + run] === "1") run += 1;
      var bar = document.createElementNS(SVG_NS, "rect");
      bar.setAttribute("x", String(x));
      bar.setAttribute("y", "0");
      bar.setAttribute("width", String(run * module));
      bar.setAttribute("height", String(height));
      bar.setAttribute("fill", "#111111");
      svg.append(bar);
      x += run * module;
      i += run;
    } else {
      x += module;
      i += 1;
    }
  }
  return svg;
}

function checkBarcode() {
  if (PATTERNS.length !== 107 || PATTERNS.some(function (pattern) { return pattern.length !== 11; })) {
    throw new Error("Barcode-Muster stimmen nicht.");
  }
  var sample = [103, 48, 42, 42, 17, 18, 19, 35];
  var sum = sample[0];
  var i;
  for (i = 1; i < sample.length; i += 1) sum += i * sample[i];
  if (sum % 103 !== 54) throw new Error("Barcode-Prüfsumme stimmt nicht.");
  var bits = encodeCode128B("HI");
  if (bits.indexOf(PATTERNS[104]) !== 0 || bits.slice(-STOP.length) !== STOP) {
    throw new Error("Barcode-Rahmen stimmt nicht.");
  }
}

function act(note, button, work) {
  if (button) button.disabled = true;
  note.textContent = "";
  note.className = "";
  try {
    var result = work();
    if (button) button.disabled = false;
    return result;
  } catch (error) {
    if (button) button.disabled = false;
    note.className = "error";
    note.textContent = error.message || "Das hat nicht geklappt.";
    return null;
  }
}

function tierShare(turnoverCents, tierCents) {
  if (!tierCents) return 0;
  var value = Math.round((turnoverCents || 0) * 100 / tierCents);
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function tierBar(item, turnoverCents, status, button) {
  var value = tierShare(turnoverCents, item.tierCents);
  var fill = el("div", { class: "step-fill" });
  fill.style.width = value + "%";
  var cls = "step" + (item.reached ? " reached" : "");
  return el("article", {
    class: cls,
    role: "progressbar",
    "aria-valuemin": "0",
    "aria-valuemax": "100",
    "aria-valuenow": String(value),
    "aria-label": "ab " + item.label + ". " + item.text + (status ? ". " + status : ""),
  }, [
    fill,
    el("div", { class: "step-copy" }, [
      el("p", { class: "tier-label" }, "ab " + item.label),
      el("p", { class: "step-rate" }, item.text),
      status ? el("p", {}, status) : null,
      button,
    ]),
  ]);
}

function bonusList(card, onRedeem) {
  return el("div", { class: "steps" }, card.benefits.map(function (item) {
    var button = onRedeem && item.reached && !item.redeemed
      ? el("button", { type: "button", class: "quiet" }, "Als eingelöst markieren")
      : null;
    if (button) button.addEventListener("click", function () { onRedeem(item, button); });
    var status = null;
    if (item.reached) status = item.redeemed ? "Eingelöst." : "Erreicht.";
    else if (item.tierCents === card.nextTierCents) status = "Noch " + euroWords(card.remainingCents) + ".";
    return tierBar(item, card.turnoverCents, status, button);
  }));
}

function openBonusList() {
  return el("div", { class: "steps" }, store.shop().tiers.map(function (item) {
    return tierBar(item, 0, null, null);
  }));
}

var BIRTHDAY_MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function birthdayText(card) {
  if (!card.birthdayDay || !card.birthdayMonth) return "—";
  return card.birthdayDay + ". " + BIRTHDAY_MONTHS[card.birthdayMonth - 1];
}

function tierSentence(card) {
  if (!card.reachedTierCents) return "Stufe noch nicht erreicht.";
  var tier = card.benefits.find(function (item) { return item.tierCents === card.reachedTierCents; });
  return "Stufe " + (tier ? tier.label : euroWords(card.reachedTierCents)) + " erreicht.";
}

function factoryPart(key) {
  var source = window.SCHMAHL_FACTORY;
  return source && source[key] ? source[key] : null;
}

function factoryOn(key) {
  var part = factoryPart(key);
  return !part || part.enabled !== false;
}

function factoryText(key, field, fallback) {
  var part = factoryPart(key);
  var value = part && part[field] != null ? String(part[field]).trim() : "";
  return value || fallback;
}

function nextSentence(card) {
  if (card.nextTierCents == null) return factoryText("bonusBar", "topText", "Die höchste Stufe ist erreicht.");
  return factoryText("bonusBar", "nextText", "Noch {betrag} bis zur nächsten Stufe.").replace(/\{betrag\}/g, euroWords(card.remainingCents));
}

function progressBar(card) {
  var start = card.reachedTierCents || 0;
  var end = card.nextTierCents;
  var value = 100;
  if (end != null && end > start) {
    value = Math.round((card.turnoverCents - start) * 100 / (end - start));
    if (value < 0) value = 0;
    if (value > 100) value = 100;
  }
  var label = nextSentence(card);
  var fill = el("div", { class: "progress-fill" });
  fill.style.width = value + "%";
  return el("div", { class: "progress-block" }, [
    el("div", {
      class: "progress",
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": String(value),
      "aria-label": label,
    }, fill),
    el("p", { class: "progress-label" }, label),
  ]);
}

function cardNodes(card, onRedeem) {
  var nodes = [];
  if (factoryOn("name")) nodes.push(el("h3", {}, card.name));
  if (factoryOn("address") && card.address) nodes.push(el("p", {}, card.address));
  if (factoryOn("customerNumber")) {
    nodes.push(el("p", { class: "tier-label" }, factoryText("customerNumber", "label", "Kundennummer")));
    nodes.push(el("p", { class: "number", translate: "no" }, card.kundennummer || "—"));
  }
  if (factoryOn("birthday")) {
    nodes.push(el("p", { class: "tier-label" }, factoryText("birthday", "label", "Geburtstag")));
    nodes.push(el("p", {}, birthdayText(card)));
  }
  if (factoryOn("customerCode")) {
    var box = el("div", { class: "barcode" });
    box.append(barcodeSvg(card.kode || card.number));
    nodes.push(el("p", { class: "tier-label" }, "Kunden-Code"));
    nodes.push(el("p", { class: "number", translate: "no" }, card.kode || card.number));
    nodes.push(box);
    nodes.push(el("p", { class: "hint" }, factoryText("customerCode", "hint", "Diesen Kunden-Code an der Kasse zeigen. Falls sie nicht scannt, den Code nennen.")));
  }
  if (factoryOn("bonusBar")) {
    nodes.push(el("p", {}, card.bonusCents
      ? "Bonus " + card.bonusPercent + " Prozent: " + euro(card.bonusCents) + "."
      : "Bonus ab 1.000 Euro: 1 Prozent auf den Einkauf."));
  }
  nodes.push(el("p", { class: "tier-label" }, "Jahresumsatz " + card.year));
  nodes.push(el("p", { class: "figure" }, euro(card.turnoverCents)));
  nodes.push(el("p", {}, tierSentence(card)));
  if (factoryOn("tiers")) {
    nodes.push(el("h3", {}, "Bonusstufen"));
    nodes.push(bonusList(card, onRedeem));
  }
  return nodes;
}

function receiptMoney(item) {
  if (item.amountCents) return " · " + euro(item.amountCents);
  if (item.amount) return " · " + String(item.amount) + " Euro";
  return "";
}

function receiptArchive(items) {
  var list = items || [];
  if (!list.length) return el("p", { class: "hint" }, "Der Rechnungsspeicher ist leer.");
  return el("div", { class: "receipt-store" }, list.slice().reverse().map(function (item, index) {
    var label = item.storedAt ? stamp(item.storedAt) : "Noch nicht abgelegt";
    return el("figure", { class: "stored-receipt" }, [
      el("figcaption", { class: "hint" }, "Beleg " + (list.length - index) + (label ? " · " + label : "") + receiptMoney(item)),
      el("img", { class: "shot", alt: "Gespeicherter Kassenbon", src: item.jpeg }),
    ]);
  }));
}

function receiptDraft(jpeg, onConfirm) {
  var amount = el("input", {
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    placeholder: "0,00",
    "aria-label": "Betrag auf dem Kassenbon in Euro",
  });
  var note = el("p", { role: "status" });
  var button = el("button", { type: "button" }, "Betrag buchen");
  button.addEventListener("click", function () {
    var cents = act(note, button, function () { return store.checkAmount(amount.value); });
    if (!cents) return;
    button.disabled = true;
    claimReceipt(jpeg, note, function (hash) {
      onConfirm(amount.value, hash, note, button);
    });
  });
  return el("div", { class: "stack" }, [
    el("p", { class: "hint" }, "Tragen Sie den Betrag vom Kassenbon ein. Das Foto bleibt als Beleg gespeichert."),
    el("img", { class: "shot", alt: "Kassenbon", src: jpeg }),
    el("label", {}, "Betrag auf dem Kassenbon in Euro"),
    amount,
    button,
    note,
  ]);
}

function readReceipt(file, onJpeg, note) {
  note.textContent = "";
  note.className = "";
  var image = new Image();
  var url = URL.createObjectURL(file);
  image.onload = function () {
    URL.revokeObjectURL(url);
    var canvas = document.createElement("canvas");
    var scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    onJpeg(canvas.toDataURL("image/jpeg", 0.72));
  };
  image.onerror = function () {
    URL.revokeObjectURL(url);
    note.className = "error";
    note.textContent = "Die Rechnung ließ sich nicht lesen.";
  };
  image.src = url;
}

function scanPicker(id, preview, onJpeg) {
  var note = el("p", { role: "status" });
  var input = el("input", {
    id: id,
    class: "scan-input",
    type: "file",
    accept: "image/*",
    capture: "environment",
  });
  input.addEventListener("change", function () {
    var file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    readReceipt(file, onJpeg, note);
  });
  return el("div", { class: "scan" }, [
    el("h3", {}, factoryText("receipt", "title", "Rechnungsspeicher")),
    el("p", { class: "hint" }, factoryText("receipt", "hint", "Fotografieren Sie den Kassenbon und tragen Sie den Betrag ein. Das Foto bleibt als Beleg gespeichert. Dieselbe Rechnung kann nicht ein zweites Mal zählen.")),
    preview,
    el("label", { class: "scan-button", for: id }, factoryText("receipt", "buttonLabel", "Rechnung scannen")),
    input,
    note,
  ]);
}

function scanSection(card) {
  var preview = el("div");
  preview.append(receiptArchive(card.receipts));
  return scanPicker("rechnung-scan", preview, function (jpeg) {
    preview.replaceChildren(receiptDraft(jpeg, function (amount, hash, note, button) {
      var updated = act(note, button, function () {
        return store.bookReceipt(card.number, amount, jpeg, hash);
      });
      if (!updated) return;
      note.className = "ok";
      note.textContent = "Gebucht. Der Kassenbon liegt als Beleg im Speicher.";
      publishCard(updated);
    }), receiptArchive(card.receipts));
  });
}

function claimReceipt(jpeg, note, onOk) {
  var claim = window.SchmahlClaim;
  if (!claim) {
    note.className = "error";
    note.textContent = "Die Rechnung kann gerade nicht geprüft werden.";
    return;
  }
  claim(jpeg).then(function (result) {
    if (!result.ok) {
      note.className = "error";
      note.textContent = result.error;
      var button = note.parentNode && note.parentNode.querySelector("button");
      if (button) button.disabled = false;
      return;
    }
    onOk(result.hash);
  });
}

function infoPrompt() {
  return el("div", { class: "info-ask" }, [
    el("p", { class: "info-title" }, factoryText("feedback", "title", "INFO an Firma Schmahl")),
    el("p", {}, factoryText("feedback", "prompt", "Was finden Sie gut, was finden Sie schlecht?")),
  ]);
}

function messageSection(card, sender) {
  var note = el("p", { role: "status" });
  var area = el("textarea", {
    maxlength: "1000",
    "aria-label": sender === "kunde" ? "INFO an Firma Schmahl" : "Antwort an den Kunden",
  });
  var button = el("button", { type: "button", class: sender === "kunde" ? "send" : "" }, sender === "kunde" ? "Senden" : "Antworten");
  var lines = (card.messages || []).map(function (item) {
    return el("p", { class: item.sender === "firma" ? "note-line firma" : "note-line" }, [
      el("span", { class: "who" }, (item.sender === "firma" ? "Schmahl" : "Kunde") + " "),
      document.createTextNode(stamp(item.at)),
      document.createElement("br"),
      document.createTextNode(item.text),
    ]);
  });
  button.addEventListener("click", function () {
    var updated = act(note, button, function () {
      return store.postMessage(card.number, area.value, sender);
    });
    if (!updated) return;
    area.value = "";
    note.className = "ok";
    note.textContent = "Gesendet.";
    publishCard(updated);
  });
  var thread = el("div", { class: "thread" }, lines.length ? lines : [el("p", { class: "hint" }, "Noch keine Nachricht.")]);
  return el("div", { class: "mail" }, [
    el("h3", {}, "Schreiben"),
    thread,
    sender === "kunde" ? infoPrompt() : null,
    area,
    button,
    note,
  ]);
}

function draftMessage() {
  var note = el("p", { role: "status" });
  var area = el("textarea", {
    id: "nachricht-neu",
    maxlength: "1000",
    "aria-label": "INFO an Firma Schmahl",
    placeholder: "Was finden Sie gut, was finden Sie schlecht?",
  });
  area.value = pendingMessage;
  area.addEventListener("input", function () { pendingMessage = area.value; });
  var button = el("button", { type: "button", class: "send" }, "Senden");
  button.addEventListener("click", function () {
    pendingMessage = area.value;
    if (!String(area.value || "").trim()) {
      note.className = "error";
      note.textContent = "Bitte eine Nachricht schreiben.";
      return;
    }
    note.className = "ok";
    note.textContent = "Gespeichert. Die Nachricht geht mit dem Kunden-Code an die Firma.";
  });
  return el("div", { class: "mail" }, [
    el("h3", {}, "Schreiben"),
    infoPrompt(),
    area,
    button,
    note,
  ]);
}

function renderCustomer(card) {
  paintLevel("kunde", card);
  var nodes = [el("h2", {}, "Kunde")];
  if (factoryOn("bonusBar")) nodes.push(progressBar(card));
  kunde.replaceChildren.apply(kunde, nodes);
  if (factoryOn("feedback")) kunde.append(messageSection(card, "kunde"));
  cardNodes(card, null).forEach(function (node) { kunde.append(node); });
  if (factoryOn("receipt")) kunde.append(scanSection(card));
}

function renderNameForm(message) {
  var nameInput = el("input", {
    id: "customer-name",
    type: "text",
    maxlength: "40",
    autocomplete: "name",
    "aria-label": "Ihr Name",
  });
  var addressInput = el("input", {
    id: "customer-address",
    type: "text",
    maxlength: "120",
    autocomplete: "street-address",
    "aria-label": "Adresse",
  });
  var numberInput = el("input", {
    id: "customer-number-given",
    type: "text",
    maxlength: "32",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    "aria-label": "Kundennummer",
  });
  var dayInput = el("input", {
    id: "customer-birthday-day",
    type: "text",
    inputmode: "numeric",
    maxlength: "2",
    autocomplete: "bday-day",
    "aria-label": "Tag",
  });
  var monthInput = el("input", {
    id: "customer-birthday-month",
    type: "text",
    inputmode: "numeric",
    maxlength: "2",
    autocomplete: "bday-month",
    "aria-label": "Monat",
  });
  var note = el("p", { class: "error", role: "alert" }, message || "");
  var button = el("button", { type: "submit" }, factoryText("customerCode", "label", "Kunden-Code erzeugen"));
  var formFields = [];
  if (factoryOn("name")) {
    formFields.push(el("label", { for: "customer-name" }, factoryText("name", "label", "Name")), nameInput);
  }
  if (factoryOn("address")) {
    formFields.push(el("label", { for: "customer-address" }, factoryText("address", "label", "Adresse")), addressInput);
  }
  if (factoryOn("birthday")) {
    formFields.push(
      el("p", { class: "tier-label" }, factoryText("birthday", "label", "Geburtstag")),
      el("div", { class: "birthday" }, [
        el("div", {}, [
          el("label", { for: "customer-birthday-day" }, "Tag"),
          dayInput,
        ]),
        el("div", {}, [
          el("label", { for: "customer-birthday-month" }, "Monat"),
          monthInput,
        ]),
      ])
    );
  }
  if (factoryOn("customerNumber")) {
    formFields.push(el("label", { for: "customer-number-given" }, factoryText("customerNumber", "label", "Kundennummer")), numberInput);
  }
  if (factoryOn("customerCode")) {
    formFields.push(el("p", { class: "hint" }, factoryText("customerCode", "hint", "Danach entsteht der Kunden-Code. Er bleibt auf diesem Handy.")), button);
  }
  formFields.push(note);
  var form = el("form", {
    class: "stack",
    onsubmit: function (event) {
      event.preventDefault();
      if (!factoryOn("customerCode")) return;
      var created = act(note, button, function () {
        return store.createCustomer({
          name: factoryOn("name") ? nameInput.value : "Kunde",
          address: factoryOn("address") ? addressInput.value : "—",
          kundennummer: factoryOn("customerNumber") ? numberInput.value : ("AUTO" + Date.now().toString(36).slice(-6).toUpperCase()),
          birthdayDay: factoryOn("birthday") ? dayInput.value : "1",
          birthdayMonth: factoryOn("birthday") ? monthInput.value : "1",
        });
      });
      if (!created) return;
      if (pendingReceipts.length) {
        try {
          pendingReceipts.forEach(function (item) {
            created = store.bookReceipt(created.number, item.amount, item.jpeg || item, item.hash || "");
          });
        } catch (error) {
          note.className = "error";
          note.textContent = error.message;
        }
        pendingReceipts = [];
      }
      if (String(pendingMessage || "").trim()) {
        try {
          created = store.postMessage(created.number, pendingMessage, "kunde");
          pendingMessage = "";
        } catch (error) {
          note.className = "error";
          note.textContent = error.message;
        }
      }
      renderCustomer(created);
    },
  }, formFields);
  var preview = el("div");
  preview.append(receiptArchive(pendingReceipts));
  paintLevel("kunde", null);
  var firstTier = store.shop().tiers[0];
  var firstCents = firstTier ? firstTier.tierCents : 100000;
  var openNodes = [el("h2", {}, "Kunde")];
  if (factoryOn("bonusBar")) {
    openNodes.push(progressBar({
      turnoverCents: 0,
      reachedTierCents: null,
      nextTierCents: firstCents,
      remainingCents: firstCents,
    }));
  }
  if (factoryOn("tiers")) {
    openNodes.push(el("h3", {}, "Bonusstufen"), openBonusList());
  }
  openNodes.push(form);
  if (factoryOn("receipt")) {
    openNodes.push(scanPicker("rechnung-neu", preview, function (jpeg) {
      preview.replaceChildren(receiptDraft(jpeg, function (amount, hash) {
        pendingReceipts.push({ jpeg: jpeg, hash: hash, amount: amount });
        preview.replaceChildren(
          el("p", { class: "ok", role: "status" }, "Betrag vorgemerkt. Der Bon wird mit dem Kunden-Code abgelegt."),
          receiptArchive(pendingReceipts),
        );
      }), receiptArchive(pendingReceipts));
    }));
  }
  if (factoryOn("feedback")) openNodes.push(draftMessage());
  kunde.replaceChildren.apply(kunde, openNodes);
}

function renderKasseCard(card) {
  paintLevel("kasse", card);
  kasseNumber = card.number;
  var nodes = cardNodes(card, function (item, button) {
    var updated = act(kasseNote, button, function () {
      return store.redeem(kasseNumber, item.tierCents);
    });
    if (updated) showOnKasse(updated);
  });
  if (factoryOn("bonusBar")) nodes.unshift(progressBar(card));
  if (factoryOn("receipt")) {
    nodes.push(el("h3", {}, factoryText("receipt", "title", "Rechnungsspeicher")));
    nodes.push(receiptArchive(card.receipts));
  }
  if (factoryOn("feedback")) nodes.push(messageSection(card, "firma"));
  kasseResult.replaceChildren.apply(kasseResult, nodes);
}

function publishCard(card) {
  var device = store.deviceCard();
  if (device && card.number === device.number) renderCustomer(card);
  if (kasseNumber && card.number === kasseNumber) renderKasseCard(card);
}

function showOnKasse(card) {
  renderKasseCard(card);
  var device = store.deviceCard();
  if (device && card.number === device.number) renderCustomer(card);
}

function showMonth(month) {
  monthTitleNode.textContent = "Monatsumsatz " + month.monthName + " " + month.year;
  monthTurnoverNode.textContent = euro(month.turnoverCents);
  monthFeeNode.textContent = euro(month.feeCents);
}

function setEingang(name) {
  document.body.dataset.eingang = name;
  document.querySelector("#tab-kunde").setAttribute("aria-pressed", name === "kunde" ? "true" : "false");
  document.querySelector("#tab-kasse").setAttribute("aria-pressed", name === "kasse" ? "true" : "false");
  applyLevel(name);
}

var levelByView = { kunde: "0", kasse: "0" };

function levelOf(card) {
  var cents = card && card.reachedTierCents;
  if (!cents) return "0";
  if (cents >= 500000) return "3";
  if (cents >= 300000) return "2";
  return "1";
}

function paintLevel(view, card) {
  levelByView[view] = levelOf(card);
  if (document.body.dataset.eingang === view) applyLevel(view);
}

function applyLevel(view) {
  var level = levelByView[view] || "0";
  if (level === "0") delete document.body.dataset.stufe;
  else document.body.dataset.stufe = level;
}

function renderShop(shop) {
  var home = document.querySelector(".homepage");
  if (home) {
    home.hidden = !factoryOn("homepage");
    var link = home.querySelector("a");
    if (link) {
      link.textContent = factoryText("homepage", "label", "Homepage");
      var href = factoryText("homepage", "url", "");
      if (href) link.href = href;
    }
  }
  if (!factoryOn("company")) {
    shopLines.replaceChildren();
    return;
  }
  var hours = shop.hours || [];
  shopLines.replaceChildren(
    el("p", {}, shop.name),
    shop.street ? el("p", {}, shop.street) : null,
    shop.district ? el("p", {}, shop.district) : null,
    el("p", {}, [shop.postalCode, shop.city].filter(Boolean).join(" ")),
    shop.phone ? el("p", {}, el("a", { class: "call", href: shop.phoneHref }, shop.phone)) : null,
    hours[0] ? el("p", {}, hours[0]) : null,
    hours[1] ? el("p", {}, hours[1]) : null
  );
}

function loadLocalCustomer() {
  var card = store.deviceCard();
  if (!card) renderNameForm();
  else renderCustomer(card);
}

function buildKasse(shop) {
  var numberInput = el("input", {
    id: "kasse-nummer",
    type: "text",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    "aria-label": "Kunden-Code oder Kundennummer",
  });
  numberInput.addEventListener("input", function () {
    var next = cleanNumber(numberInput.value);
    if (next !== numberInput.value) numberInput.value = next;
  });
  var amountInput = el("input", {
    id: "kasse-betrag",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    placeholder: "0,00",
    "aria-label": "Gezahlter Betrag in Euro",
  });
  kasseNote = el("p", { role: "status" });
  var showButton = el("button", { type: "button", class: "quiet" }, "Anzeigen");
  var bookButton = el("button", { type: "submit" }, "Buchen");

  showButton.addEventListener("click", function () {
    numberInput.value = cleanNumber(numberInput.value);
    var card = act(kasseNote, showButton, function () { return store.lookup(numberInput.value); });
    if (card) showOnKasse(card);
  });

  var form = el("form", {
    class: "stack",
    onsubmit: function (event) {
      event.preventDefault();
      numberInput.value = cleanNumber(numberInput.value);
      var result = act(kasseNote, bookButton, function () {
        return store.book(numberInput.value, amountInput.value);
      });
      if (!result) return;
      amountInput.value = "";
      kasseNote.className = "ok";
      kasseNote.textContent = "Gebucht.";
      showMonth(result.month);
      showOnKasse(result.card);
    },
  }, [
    el("label", { for: "kasse-nummer" }, "Kunden-Code oder Kundennummer"),
    numberInput,
    showButton,
    el("label", { for: "kasse-betrag" }, "Gezahlter Betrag in Euro"),
    amountInput,
    bookButton,
    kasseNote,
  ]);

  kasseResult = el("div", { id: "kasse-stand" });
  monthTitleNode = el("p", { class: "tier-label" }, "Monatsumsatz");
  monthTurnoverNode = el("p", { class: "figure" }, euro(0));
  monthFeeNode = el("p", { class: "figure" }, euro(0));
  var monthBox = el("div", { class: "month" }, [
    monthTitleNode,
    monthTurnoverNode,
    el("p", { class: "tier-label" }, "Rechnung, 2 Prozent"),
    monthFeeNode,
    el("p", { class: "hint" }, "Aus den Buchungen auf diesem Handy. Die Karte eines anderen Handys sieht die Kasse hier nicht."),
  ]);

  benefitFields = shop.tiers.map(function (tier) {
    var area = el("textarea", { id: "vorteil-" + tier.tierCents, maxlength: "240" });
    area.value = tier.text;
    return { tier: tier, area: area };
  });
  var saveNote = el("p", { role: "status" });
  var saveButton = el("button", { type: "submit" }, "Sätze speichern");
  var benefitForm = el("form", {
    class: "stack",
    onsubmit: function (event) {
      event.preventDefault();
      var texts = {};
      benefitFields.forEach(function (field) {
        texts[String(field.tier.tierCents)] = field.area.value;
      });
      var tiers = act(saveNote, saveButton, function () { return store.updateBenefits(texts); });
      if (!tiers) return;
      tiers.forEach(function (tier) {
        var field = benefitFields.find(function (item) { return item.tier.tierCents === tier.tierCents; });
        if (field) {
          field.tier.text = tier.text;
          field.area.value = tier.text;
        }
      });
      saveNote.className = "ok";
      saveNote.textContent = "Gespeichert.";
      loadLocalCustomer();
      if (kasseNumber) {
        try { renderKasseCard(store.lookup(kasseNumber)); } catch (error) { /* Karte bleibt, der Satz ist gespeichert. */ }
      }
    },
  }, [saveButton, saveNote]);
  benefitFields.forEach(function (field) {
    benefitForm.insertBefore(field.area, saveButton);
    benefitForm.insertBefore(el("label", { for: field.area.id }, field.tier.label), field.area);
  });

  kasse.replaceChildren(
    el("h2", {}, "Kasse"),
    form,
    kasseResult,
    monthBox,
    el("h3", {}, "Vorteilssätze"),
    benefitForm
  );
  showMonth(shop.month);
}

function applyLogo() {
  var logo = document.querySelector("#logo");
  var wordmark = document.querySelector("#wordmark");
  if (logo.naturalWidth > 0) {
    logo.hidden = false;
    wordmark.hidden = true;
  } else {
    logo.hidden = true;
    wordmark.hidden = false;
  }
}

var deferredInstall = null;

function installedApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function iosBrowser() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function showInstallAsk() {
  if (installedApp()) return;
  if (sessionStorage.getItem("schmahl-install") === "nein") return;
  document.querySelector("#install-ask").hidden = false;
}

function hideInstallAsk(remember) {
  document.querySelector("#install-ask").hidden = true;
  if (remember) sessionStorage.setItem("schmahl-install", "nein");
}

function installByHand() {
  var hint = document.querySelector("#install-hint");
  hint.textContent = iosBrowser()
    ? "Tippe auf das Teilen-Zeichen und dann auf „Zum Home-Bildschirm“."
    : "Öffne das Browser-Menü und tippe auf „App installieren“ oder „Zum Startbildschirm hinzufügen“.";
  hint.hidden = false;
}

function waitForInstallPrompt() {
  return new Promise(function (resolve) {
    if (deferredInstall) {
      resolve(deferredInstall);
      return;
    }
    var left = 8;
    var timer = setInterval(function () {
      left -= 1;
      if (deferredInstall || left <= 0) {
        clearInterval(timer);
        resolve(deferredInstall);
      }
    }, 200);
  });
}

function bindInstallAsk() {
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredInstall = event;
    showInstallAsk();
  });
  document.querySelector("#install-yes").addEventListener("click", function () {
    waitForInstallPrompt().then(function (prompt) {
      if (!prompt) {
        installByHand();
        return;
      }
      prompt.prompt();
      prompt.userChoice.then(function (choice) {
        deferredInstall = null;
        hideInstallAsk(choice.outcome !== "accepted");
      });
    });
  });
  document.querySelector("#install-no").addEventListener("click", function () {
    hideInstallAsk(true);
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js?v=push-sofort").then(function (registration) {
      return registration.update();
    }).catch(function () {});
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }
  showInstallAsk();
}

function start() {
  checkBarcode();
  document.querySelector("#tab-kunde").addEventListener("click", function () {
    setEingang("kunde");
    loadLocalCustomer();
  });
  document.querySelector("#tab-kasse").addEventListener("click", function () { setEingang("kasse"); });
  var logo = document.querySelector("#logo");
  logo.addEventListener("load", applyLogo);
  logo.addEventListener("error", applyLogo);
  applyLogo();
  document.querySelector("#logo-button").addEventListener("click", function () {
    setEingang("kunde");
    loadLocalCustomer();
  });
  bindInstallAsk();
  try {
    var shop = store.shop();
    document.title = "Kundenapp " + shop.wordmark;
    renderShop(shop);
    buildKasse(shop);
    loadLocalCustomer();
  } catch (error) {
    shopLines.replaceChildren(el("p", { class: "error", role: "alert" }, error.message));
    kunde.replaceChildren(el("h2", {}, "Kunde"), el("p", { class: "error" }, error.message));
  }
}

window.SchmahlLive = {
  apply: function (factory) {
    window.SCHMAHL_FACTORY = factory || {};
    if (store.applyFactory) store.applyFactory(factory);
    try {
      var shop = store.shop();
      document.title = "Kundenapp " + shop.wordmark;
      renderShop(shop);
      buildKasse(shop);
      loadLocalCustomer();
    } catch (error) { /* Die letzte gute Ansicht bleibt. */ }
  },
};

start();
