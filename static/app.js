const NUMBER_KEY = "schmahl-kundennummer";
const SVG_NS = "http://www.w3.org/2000/svg";
const PATTERNS = [
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
const STOP = "1100011101011";

const kunde = document.querySelector("#kunde");
const kasse = document.querySelector("#kasse");
const shopLines = document.querySelector("#shop-lines");
let kasseNumber = "";
let benefitFields = [];
let monthTurnoverNode = null;
let monthFeeNode = null;
let monthTitleNode = null;
let kasseResult = null;
let kasseNote = null;

function loadNumber() {
  return (localStorage.getItem(NUMBER_KEY) || "").trim();
}

function saveNumber(number) {
  localStorage.setItem(NUMBER_KEY, number);
}

function euro(cents) {
  const n = Math.trunc(Number(cents) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return sign + grouped + "," + frac + " \u20AC";
}

function euroWords(cents) {
  const n = Math.abs(Math.trunc(Number(cents) || 0));
  const whole = Math.floor(n / 100);
  const frac = n % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (frac === 0) return grouped + " Euro";
  return grouped + "," + String(frac).padStart(2, "0") + " Euro";
}

function cleanNumber(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  const values = attrs || {};
  Object.keys(values).forEach(function (key) {
    const value = values[key];
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (typeof value === "function" && key.indexOf("on") === 0) {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  });
  const list = Array.isArray(children) ? children : children == null ? [] : [children];
  list.forEach(function (child) {
    if (child == null || child === false) return;
    if (typeof child === "string" || typeof child === "number") {
      node.append(document.createTextNode(String(child)));
    } else node.append(child);
  });
  return node;
}

function encodeCode128B(text) {
  const values = [104];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) throw new Error("Die Kundennummer lässt sich nicht als Barcode zeichnen.");
    values.push(code - 32);
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i += 1) sum += i * values[i];
  values.push(sum % 103);
  let bits = "";
  values.forEach(function (value) { bits += PATTERNS[value]; });
  return bits + STOP;
}

function barcodeSvg(text) {
  const bits = encodeCode128B(text);
  const module = 2;
  const quiet = 10;
  const height = 100;
  const width = (bits.length + quiet * 2) * module;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Barcode der Kundennummer " + text);
  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", "#ffffff");
  svg.append(background);
  let x = quiet * module;
  for (let i = 0; i < bits.length;) {
    if (bits[i] === "1") {
      let run = 1;
      while (i + run < bits.length && bits[i + run] === "1") run += 1;
      const bar = document.createElementNS(SVG_NS, "rect");
      bar.setAttribute("x", String(x));
      bar.setAttribute("y", "0");
      bar.setAttribute("width", String(run * module));
      bar.setAttribute("height", String(height));
      bar.setAttribute("fill", "#1c1915");
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
  const sample = [103, 48, 42, 42, 17, 18, 19, 35];
  let sum = sample[0];
  for (let i = 1; i < sample.length; i += 1) sum += i * sample[i];
  if (sum % 103 !== 54) throw new Error("Barcode-Prüfsumme stimmt nicht.");
  const bits = encodeCode128B("HI");
  if (!bits.startsWith(PATTERNS[104]) || !bits.endsWith(STOP)) {
    throw new Error("Barcode-Rahmen stimmt nicht.");
  }
}

async function api(path, body) {
  const opts = { cache: "no-store", headers: {} };
  if (body !== undefined) {
    opts.method = "POST";
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, opts);
  } catch (error) {
    throw new Error("Der Server antwortet nicht.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  if (!response.ok) {
    const failure = new Error((data && data.error) || "Das hat nicht geklappt.");
    failure.status = response.status;
    throw failure;
  }
  return data || {};
}

function tierSentence(card) {
  if (!card.reachedTierCents) return "Stufe noch nicht erreicht.";
  const tier = card.benefits.find(function (item) { return item.tierCents === card.reachedTierCents; });
  return "Stufe " + (tier ? tier.label : euroWords(card.reachedTierCents)) + " erreicht.";
}

function nextSentence(card) {
  if (card.nextTierCents == null) return "Die höchste Stufe ist erreicht.";
  return "Noch " + euroWords(card.remainingCents) + " bis zur nächsten Stufe.";
}

function benefitNodes(card, onRedeem) {
  const reached = card.benefits.filter(function (item) { return item.reached; });
  if (!reached.length) return [el("p", {}, "Noch kein Vorteil in diesem Jahr.")];
  return reached.map(function (item) {
    const button = onRedeem && !item.redeemed
      ? el("button", { type: "button", class: "quiet" }, item.label + " als eingelöst markieren")
      : null;
    if (button) {
      button.addEventListener("click", function () { onRedeem(item, button); });
    }
    return el("article", { class: item.redeemed ? "benefit redeemed" : "benefit" }, [
      el("p", { class: "tier-label" }, item.label),
      el("p", {}, item.text),
      el("p", {}, item.redeemed ? "Eingelöst." : "Offen."),
      button,
    ]);
  });
}

function cardNodes(card, onRedeem) {
  const box = el("div", { class: "barcode" });
  box.append(barcodeSvg(card.number));
  return [
    el("h3", {}, card.name),
    el("p", { class: "tier-label" }, "Kundennummer"),
    el("p", { class: "number", translate: "no" }, card.number),
    box,
    el("p", { class: "hint" }, "Falls die Kasse nicht scannt, diese Nummer nennen."),
    el("p", { class: "tier-label" }, "Jahresumsatz " + card.year),
    el("p", { class: "figure" }, euro(card.turnoverCents)),
    el("p", {}, tierSentence(card)),
    el("p", {}, nextSentence(card)),
    el("h3", {}, "Vorteil"),
  ].concat(benefitNodes(card, onRedeem));
}

function renderCustomer(card) {
  const head = el("h2", {}, "Kunde");
  kunde.replaceChildren(head);
  cardNodes(card, null).forEach(function (node) { kunde.append(node); });
}

function renderNameForm(message) {
  const nameInput = el("input", {
    id: "customer-name",
    type: "text",
    maxlength: "40",
    autocomplete: "name",
    "aria-label": "Ihr Name",
  });
  const note = el("p", { class: "error", role: "alert" }, message || "");
  const button = el("button", { type: "submit" }, "Kundenkarte anlegen");
  const form = el("form", {
    class: "stack",
    onsubmit: function (event) {
      event.preventDefault();
      button.disabled = true;
      note.textContent = "";
      note.className = "error";
      api("/api/kunde", { name: nameInput.value })
        .then(function (card) {
          saveNumber(card.number);
          renderCustomer(card);
        })
        .catch(function (error) {
          button.disabled = false;
          note.textContent = error.message;
        });
    },
  }, [
    el("label", { for: "customer-name" }, "Ihr Name"),
    nameInput,
    el("p", { class: "hint" }, "Die Kundennummer bleibt auf diesem Gerät."),
    button,
    note,
  ]);
  kunde.replaceChildren(el("h2", {}, "Kunde"), form);
}

function renderKasseCard(card) {
  kasseNumber = card.number;
  const nodes = cardNodes(card, function (item, button) {
    button.disabled = true;
    api("/api/eingeloest", { number: kasseNumber, tierCents: item.tierCents })
      .then(function (updated) {
        showOnKasse(updated);
      })
      .catch(function (error) {
        button.disabled = false;
        kasseNote.className = "error";
        kasseNote.textContent = error.message;
      });
  });
  kasseResult.replaceChildren.apply(kasseResult, nodes);
}

function publishCard(card) {
  if (card.number === loadNumber()) renderCustomer(card);
  if (kasseNumber && card.number === kasseNumber) renderKasseCard(card);
}

function showOnKasse(card) {
  renderKasseCard(card);
  if (card.number === loadNumber()) renderCustomer(card);
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
}

function renderShop(shop) {
  shopLines.replaceChildren(
    el("p", {}, shop.name),
    el("p", {}, shop.street),
    el("p", {}, shop.district),
    el("p", {}, shop.postalCode + " " + shop.city),
    el("p", {}, el("a", { href: shop.phoneHref }, shop.phone)),
    el("p", {}, shop.hours[0]),
    el("p", {}, shop.hours[1])
  );
}

function buildKasse(shop) {
  const numberInput = el("input", {
    id: "kasse-nummer",
    type: "text",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    "aria-label": "Kundennummer",
  });
  numberInput.addEventListener("input", function () {
    const next = cleanNumber(numberInput.value);
    if (next !== numberInput.value) numberInput.value = next;
  });
  const amountInput = el("input", {
    id: "kasse-betrag",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    placeholder: "0,00",
    "aria-label": "Gezahlter Betrag in Euro",
  });
  kasseNote = el("p", { role: "status" });
  const showButton = el("button", { type: "button", class: "quiet" }, "Anzeigen");
  const bookButton = el("button", { type: "submit" }, "Buchen");

  function showCustomer() {
    const number = cleanNumber(numberInput.value);
    numberInput.value = number;
    if (!number) {
      kasseNote.className = "error";
      kasseNote.textContent = "Bitte die Kundennummer eingeben.";
      return;
    }
    showButton.disabled = true;
    api("/api/kunde/" + encodeURIComponent(number))
      .then(function (card) {
        showButton.disabled = false;
        kasseNote.textContent = "";
        showOnKasse(card);
      })
      .catch(function (error) {
        showButton.disabled = false;
        kasseNote.className = "error";
        kasseNote.textContent = error.message;
      });
  }

  showButton.addEventListener("click", showCustomer);
  const form = el("form", {
    class: "stack",
    onsubmit: function (event) {
      event.preventDefault();
      const number = cleanNumber(numberInput.value);
      numberInput.value = number;
      if (!number) {
        kasseNote.className = "error";
        kasseNote.textContent = "Bitte die Kundennummer eingeben.";
        return;
      }
      bookButton.disabled = true;
      kasseNote.textContent = "";
      api("/api/buchung", { number: number, amount: amountInput.value })
        .then(function (result) {
          bookButton.disabled = false;
          amountInput.value = "";
          kasseNote.className = "ok";
          kasseNote.textContent = "Gebucht.";
          showMonth(result.month);
          showOnKasse(result.card);
        })
        .catch(function (error) {
          bookButton.disabled = false;
          kasseNote.className = "error";
          kasseNote.textContent = error.message;
        });
    },
  }, [
    el("label", { for: "kasse-nummer" }, "Kundennummer"),
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
  const monthBox = el("div", { class: "month" }, [
    monthTitleNode,
    monthTurnoverNode,
    el("p", { class: "tier-label" }, "Rechnung, 2 Prozent"),
    monthFeeNode,
    el("p", { class: "hint" }, "Rechnung des Betreibers aus den gebuchten Einkäufen dieses Monats."),
  ]);

  benefitFields = shop.tiers.map(function (tier) {
    const area = el("textarea", { id: "vorteil-" + tier.tierCents, maxlength: "240" });
    area.value = tier.text;
    return { tier: tier, area: area };
  });
  const saveNote = el("p", { role: "status" });
  const saveButton = el("button", { type: "submit" }, "Sätze speichern");
  const benefitForm = el("form", {
    class: "stack",
    onsubmit: function (event) {
      event.preventDefault();
      const texts = {};
      benefitFields.forEach(function (field) {
        texts[String(field.tier.tierCents)] = field.area.value;
      });
      saveButton.disabled = true;
      api("/api/vorteile", { texts: texts })
        .then(function (result) {
          saveButton.disabled = false;
          result.tiers.forEach(function (tier) {
            const field = benefitFields.find(function (item) { return item.tier.tierCents === tier.tierCents; });
            if (field) {
              field.tier.text = tier.text;
              field.area.value = tier.text;
            }
          });
          saveNote.className = "ok";
          saveNote.textContent = "Gespeichert.";
          const jobs = [];
          if (loadNumber()) jobs.push(api("/api/kunde/" + encodeURIComponent(loadNumber())));
          if (kasseNumber && kasseNumber !== loadNumber()) {
            jobs.push(api("/api/kunde/" + encodeURIComponent(kasseNumber)));
          }
          return Promise.all(jobs);
        })
        .then(function (cards) {
          (cards || []).forEach(publishCard);
        })
        .catch(function (error) {
          saveButton.disabled = false;
          saveNote.className = "error";
          saveNote.textContent = error.message;
        });
    },
  }, [saveButton, saveNote]);
  const editor = [el("h3", {}, "Vorteilssätze"), benefitForm];
  benefitFields.forEach(function (field) {
    benefitForm.insertBefore(field.area, saveButton);
    benefitForm.insertBefore(el("label", { for: field.area.id }, field.tier.label), field.area);
  });

  kasse.replaceChildren(
    el("h2", {}, "Kasse"),
    form,
    kasseResult,
    monthBox,
    editor[0],
    editor[1]
  );
  showMonth(shop.month);
}

function applyLogo() {
  const logo = document.querySelector("#logo");
  const wordmark = document.querySelector("#wordmark");
  if (logo.naturalWidth > 0) {
    logo.hidden = false;
    wordmark.hidden = true;
  } else {
    logo.hidden = true;
    wordmark.hidden = false;
  }
}

async function loadLocalCustomer() {
  const number = loadNumber();
  if (!number) {
    renderNameForm();
    return;
  }
  try {
    publishCard(await api("/api/kunde/" + encodeURIComponent(number)));
  } catch (error) {
    if (error.status === 404) {
      localStorage.removeItem(NUMBER_KEY);
      renderNameForm(error.message);
      return;
    }
    kunde.replaceChildren(
      el("h2", {}, "Kunde"),
      el("p", { class: "error", role: "alert" }, error.message)
    );
  }
}

async function start() {
  checkBarcode();
  document.querySelector("#tab-kunde").addEventListener("click", function () {
    setEingang("kunde");
    loadLocalCustomer();
  });
  document.querySelector("#tab-kasse").addEventListener("click", function () {
    setEingang("kasse");
  });
  const logo = document.querySelector("#logo");
  logo.addEventListener("load", applyLogo);
  logo.addEventListener("error", applyLogo);
  applyLogo();
  document.querySelector("#logo-button").addEventListener("click", function () {
    setEingang("kunde");
    loadLocalCustomer();
  });
  try {
    const shop = await api("/api/laden");
    document.title = "Kundenkarte " + shop.wordmark;
    renderShop(shop);
    buildKasse(shop);
    await loadLocalCustomer();
  } catch (error) {
    shopLines.replaceChildren(el("p", { class: "error", role: "alert" }, error.message));
    kunde.replaceChildren(el("h2", {}, "Kunde"), el("p", { class: "error" }, error.message));
  }
}

start();
