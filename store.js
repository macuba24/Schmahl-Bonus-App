var Schmahl = (function () {
  var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var TIERS = [100000, 300000, 500000, 1000000];
  var MONTHS = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];
  var KEY = "schmahl-karte";
  var SHOP = {
    name: "Schmahl GmbH",
    wordmark: "Schmahl",
    street: "Carl-Spaeter-Straße 13",
    district: "Industriegebiet Rheinhafen",
    postalCode: "56070",
    city: "Koblenz",
    phone: "0261 / 30488-0",
    phoneHref: "tel:+49261304880",
    hours: ["Mo.–Fr. 7.30–17.00 Uhr", "Samstags geschlossen"],
  };
  var RATES = { 100000: 1, 300000: 2, 500000: 3, 1000000: 5 };
  var DEFAULT_BENEFITS = {
    100000: "1 Prozent auf den Einkauf",
    300000: "2 Prozent auf den Einkauf",
    500000: "3 Prozent auf den Einkauf",
    1000000: "5 Prozent auf den Einkauf und eine Arbeitshose",
  };

  function StoreError(message) {
    this.name = "StoreError";
    this.message = message;
  }
  StoreError.prototype = Object.create(Error.prototype);

  function fail(message) {
    throw new StoreError(message);
  }

  function hasControl(text) {
    var i;
    for (i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code <= 31 || (code >= 127 && code <= 159)) return true;
    }
    return false;
  }

  function squash(value) {
    return String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
  }

  function euroLabel(cents) {
    var euros = Math.trunc(Number(cents) / 100);
    return String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " Euro";
  }

  function percentCents(amountCents, percent) {
    var n = Math.trunc(Number(amountCents));
    var rate = Math.trunc(Number(percent));
    if (n <= 0 || rate <= 0) return 0;
    return Math.floor((n * rate + 50) / 100);
  }

  function twoPercentCents(amountCents) {
    return percentCents(amountCents, 2);
  }

  function bonusOf(turnover) {
    var percent = 0;
    TIERS.forEach(function (tier) {
      if (turnover >= tier) percent = RATES[tier];
    });
    return { percent: percent, cents: percentCents(turnover, percent) };
  }

  function berlinNow(date) {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    var bag = {};
    fmt.formatToParts(date || new Date()).forEach(function (part) {
      bag[part.type] = part.value;
    });
    var hour = bag.hour === "24" ? "00" : bag.hour;
    return {
      year: Number(bag.year),
      month: Number(bag.month),
      iso: bag.year + "-" + bag.month + "-" + bag.day + "T" + hour + ":" + bag.minute + ":" + bag.second,
    };
  }

  function cleanName(value) {
    var text = squash(value);
    if (!text) fail("Bitte den Namen eingeben.");
    if (text.length > 40) fail("Der Name ist zu lang. Höchstens 40 Zeichen.");
    if (hasControl(text)) fail("Der Name enthält ein Zeichen, das nicht geht.");
    return text;
  }

  function cleanAddress(value) {
    var text = squash(value);
    if (!text) fail("Bitte die Adresse eingeben.");
    if (text.length > 120) fail("Die Adresse ist zu lang. Höchstens 120 Zeichen.");
    if (hasControl(text)) fail("Die Adresse enthält ein Zeichen, das nicht geht.");
    return text;
  }

  function cleanKundennummer(value) {
    var text = String(value || "").replace(/\s+/g, "").toUpperCase();
    if (!text) fail("Bitte die Kundennummer eingeben.");
    if (text.length > 32) fail("Die Kundennummer ist zu lang.");
    if (hasControl(text)) fail("Die Kundennummer enthält ein Zeichen, das nicht geht.");
    return text;
  }

  function normalizeNumber(value) {
    var text = String(value || "").replace(/\s+/g, "").toUpperCase();
    if (hasControl(text) || text.length > 32) fail("Diese Kundennummer gibt es nicht.");
    return text;
  }

  function parseCents(value) {
    if (typeof value === "boolean" || value == null) fail("Bitte den gezahlten Betrag in Euro.");
    var text = String(value).trim().replace(/€/g, "").replace(/\u00a0/g, "").replace(/ /g, "");
    if (!text) fail("Bitte den gezahlten Betrag in Euro.");
    if (text.indexOf(",") >= 0 && text.indexOf(".") >= 0) {
      if (text.lastIndexOf(",") > text.lastIndexOf(".")) text = text.replace(/\./g, "").replace(",", ".");
      else text = text.replace(/,/g, "");
    } else if (text.indexOf(",") >= 0) {
      text = text.replace(",", ".");
    }
    if (!/^\d+(\.\d+)?$/.test(text)) fail("Der Betrag ist so nicht lesbar. Zum Beispiel 400,00.");
    var amount = Number(text);
    if (!isFinite(amount)) fail("Der Betrag ist so nicht lesbar. Zum Beispiel 400,00.");
    if (amount <= 0) fail("Der Betrag ist größer als null.");
    if (amount > 1000000) fail("Der Betrag ist zu hoch für diese Fassung.");
    var cents = Math.round(amount * 100);
    if (cents <= 0) fail("Der Betrag ist größer als null.");
    return cents;
  }

  function cleanBenefit(value) {
    var text = squash(value);
    if (!text) fail("Ein Vorteilssatz ist leer.");
    if (text.length > 240) fail("Ein Vorteilssatz ist zu lang. Höchstens 240 Zeichen.");
    return text;
  }

  function cleanMessage(value) {
    var text = String(value || "").normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var lines = text.split("\n").map(function (line) { return line.replace(/\s+/g, " ").trim(); });
    text = lines.filter(function (line) { return line; }).join("\n");
    if (!text) fail("Bitte eine Nachricht schreiben.");
    if (text.length > 1000) fail("Die Nachricht ist zu lang. Höchstens 1000 Zeichen.");
    if (hasControl(text)) fail("Die Nachricht enthält ein Zeichen, das nicht geht.");
    return text;
  }

  function cleanSender(value) {
    var sender = String(value || "").trim().toLowerCase();
    if (sender !== "kunde" && sender !== "firma") fail("Der Absender stimmt nicht.");
    return sender;
  }

  function parseTier(value) {
    var tier = Number(String(value).trim());
    if (TIERS.indexOf(tier) < 0) fail("Diese Stufe gibt es nicht.");
    return tier;
  }

  function cleanJpeg(payload) {
    if (typeof payload !== "string" || !payload.trim()) fail("Die Rechnung fehlt.");
    var text = payload.trim();
    var marker = text.indexOf(",");
    if (marker < 0 || text.slice(0, marker).toLowerCase().indexOf("image/jpeg") < 0) {
      fail("Bitte die Rechnung als Foto aufnehmen.");
    }
    var encoded = text.slice(marker + 1).replace(/\s/g, "");
    var bytes = Math.floor(encoded.length * 3 / 4);
    if (bytes < 200 || bytes > 1200000) fail("Die Rechnung ist zu groß oder leer.");
    if (encoded.indexOf("/9j/") !== 0) fail("Bitte die Rechnung als Foto aufnehmen.");
    return "data:image/jpeg;base64," + encoded;
  }

  function createStore(storage, clock) {
    function moment() {
      return clock ? clock() : berlinNow();
    }

    function read() {
      var raw;
      try {
        raw = storage.getItem(KEY);
      } catch (error) {
        fail("Dieses Handy speichert die Karte nicht.");
      }
      var data = null;
      if (raw) {
        try { data = JSON.parse(raw); } catch (error) { data = null; }
      }
      if (!data || typeof data !== "object") data = {};
      if (!Array.isArray(data.customers)) data.customers = [];
      var benefits = {};
      TIERS.forEach(function (tier) {
        var saved = data.benefits && data.benefits[String(tier)];
        benefits[String(tier)] = typeof saved === "string" && saved.trim() ? saved : DEFAULT_BENEFITS[tier];
      });
      data.benefits = benefits;
      if (typeof data.deviceKode !== "string") data.deviceKode = "";
      return data;
    }

    function write(state) {
      try {
        storage.setItem(KEY, JSON.stringify(state));
      } catch (error) {
        fail("Auf diesem Handy ist kein Platz mehr.");
      }
    }

    function find(state, raw) {
      var number = normalizeNumber(raw);
      if (!number) fail("Bitte die Kundennummer eingeben.");
      var i;
      for (i = 0; i < state.customers.length; i += 1) {
        if (state.customers[i].number === number) return state.customers[i];
      }
      for (i = 0; i < state.customers.length; i += 1) {
        if (state.customers[i].kundennummer && state.customers[i].kundennummer === number) {
          return state.customers[i];
        }
      }
      fail("Diesen Kode oder diese Kundennummer gibt es nicht.");
    }

    function yearTurnover(customer, year) {
      return customer.purchases.reduce(function (sum, purchase) {
        return purchase.year === year ? sum + purchase.amountCents : sum;
      }, 0);
    }

    function benefitRows(state) {
      return TIERS.map(function (tier) {
        return {
          tierCents: tier,
          label: euroLabel(tier),
          percent: RATES[tier],
          text: state.benefits[String(tier)],
        };
      });
    }

    function card(state, customer, when) {
      var turnover = yearTurnover(customer, when.year);
      var bonus = bonusOf(turnover);
      var reached = null;
      var next = null;
      TIERS.forEach(function (tier) {
        if (turnover >= tier) reached = tier;
        else if (next == null) next = tier;
      });
      var redeemed = {};
      customer.redemptions.forEach(function (item) {
        if (item.year === when.year) redeemed[item.tierCents] = true;
      });
      return {
        number: customer.number,
        kode: customer.number,
        name: customer.name,
        address: customer.address || "",
        kundennummer: customer.kundennummer || "",
        year: when.year,
        turnoverCents: turnover,
        reachedTierCents: reached,
        nextTierCents: next,
        remainingCents: next == null ? null : next - turnover,
        bonusPercent: bonus.percent,
        bonusCents: bonus.cents,
        benefits: benefitRows(state).map(function (item) {
          return {
            tierCents: item.tierCents,
            label: item.label,
            text: item.text,
            reached: turnover >= item.tierCents,
            redeemed: !!redeemed[item.tierCents],
          };
        }),
        receipt: customer.receipt ? { storedAt: customer.receipt.storedAt, jpeg: customer.receipt.jpeg } : null,
        messages: customer.messages.map(function (item) {
          return { id: item.id, sender: item.sender, text: item.text, at: item.at };
        }),
      };
    }

    function monthJson(state, when) {
      var total = 0;
      state.customers.forEach(function (customer) {
        customer.purchases.forEach(function (purchase) {
          if (purchase.year === when.year && purchase.month === when.month) total += purchase.amountCents;
        });
      });
      return {
        year: when.year,
        month: when.month,
        monthName: MONTHS[when.month - 1],
        turnoverCents: total,
        feeCents: twoPercentCents(total),
      };
    }

    function mint(state) {
      var taken = {};
      state.customers.forEach(function (customer) { taken[customer.number] = true; });
      var attempt;
      var cryptoApi = globalThis.crypto;
      for (attempt = 0; attempt < 40; attempt += 1) {
        var bytes = new Uint8Array(8);
        if (cryptoApi && cryptoApi.getRandomValues) cryptoApi.getRandomValues(bytes);
        else {
          var n;
          for (n = 0; n < 8; n += 1) bytes[n] = Math.floor(Math.random() * 256);
        }
        var kode = "";
        var i;
        for (i = 0; i < 8; i += 1) kode += ALPHABET[bytes[i] % ALPHABET.length];
        if (!taken[kode]) return kode;
      }
      fail("Gerade lässt sich kein Kunden-Code erzeugen. Bitte noch einmal.");
    }

    return {
      shop: function () {
        var state = read();
        var when = moment();
        return {
          name: SHOP.name,
          wordmark: SHOP.wordmark,
          street: SHOP.street,
          district: SHOP.district,
          postalCode: SHOP.postalCode,
          city: SHOP.city,
          phone: SHOP.phone,
          phoneHref: SHOP.phoneHref,
          hours: SHOP.hours.slice(),
          tiers: benefitRows(state),
          month: monthJson(state, when),
        };
      },
      deviceCard: function () {
        var state = read();
        if (!state.deviceKode) return null;
        var customer = null;
        state.customers.forEach(function (item) {
          if (item.number === state.deviceKode) customer = item;
        });
        return customer ? card(state, customer, moment()) : null;
      },
      createCustomer: function (input) {
        var state = read();
        var name = cleanName(input && input.name);
        var address = cleanAddress(input && input.address);
        var kundennummer = cleanKundennummer(input && input.kundennummer);
        state.customers.forEach(function (customer) {
          if (customer.kundennummer === kundennummer) fail("Diese Kundennummer gibt es schon.");
        });
        var when = moment();
        var customer = {
          number: mint(state),
          name: name,
          address: address,
          kundennummer: kundennummer,
          createdAt: when.iso,
          purchases: [],
          redemptions: [],
          messages: [],
          receipt: null,
        };
        state.customers.push(customer);
        state.deviceKode = customer.number;
        write(state);
        return card(state, customer, when);
      },
      lookup: function (raw) {
        var state = read();
        return card(state, find(state, raw), moment());
      },
      book: function (raw, amount) {
        var state = read();
        var customer = find(state, raw);
        var cents = parseCents(amount);
        var when = moment();
        customer.purchases.push({
          amountCents: cents,
          bookedAt: when.iso,
          year: when.year,
          month: when.month,
        });
        write(state);
        return { card: card(state, customer, when), month: monthJson(state, when) };
      },
      redeem: function (raw, tierValue) {
        var state = read();
        var customer = find(state, raw);
        var tier = parseTier(tierValue);
        var when = moment();
        if (yearTurnover(customer, when.year) < tier) fail("Diese Stufe ist noch nicht erreicht.");
        customer.redemptions.forEach(function (item) {
          if (item.year === when.year && item.tierCents === tier) fail("Dieser Vorteil ist schon eingelöst.");
        });
        customer.redemptions.push({ year: when.year, tierCents: tier, redeemedAt: when.iso });
        write(state);
        return card(state, customer, when);
      },
      updateBenefits: function (texts) {
        if (!texts || typeof texts !== "object") fail("Die Vorteilssätze fehlen.");
        var state = read();
        var cleaned = {};
        TIERS.forEach(function (tier) {
          var raw = texts[String(tier)];
          if (raw == null) raw = texts[tier];
          if (raw == null) fail("Es braucht alle vier Vorteilssätze.");
          cleaned[String(tier)] = cleanBenefit(raw);
        });
        state.benefits = cleaned;
        write(state);
        return benefitRows(state);
      },
      postMessage: function (raw, text, sender) {
        var state = read();
        var customer = find(state, raw);
        var body = cleanMessage(text);
        var who = cleanSender(sender);
        var when = moment();
        var nextId = customer.messages.reduce(function (max, item) {
          return item.id > max ? item.id : max;
        }, 0) + 1;
        customer.messages.push({ id: nextId, sender: who, text: body, at: when.iso });
        if (customer.messages.length > 40) {
          customer.messages = customer.messages.slice(customer.messages.length - 40);
        }
        write(state);
        return card(state, customer, when);
      },
      saveReceipt: function (raw, jpeg) {
        var state = read();
        var customer = find(state, raw);
        var when = moment();
        customer.receipt = { storedAt: when.iso, jpeg: cleanJpeg(jpeg) };
        write(state);
        return card(state, customer, when);
      },
    };
  }

  return {
    createStore: createStore,
    twoPercentCents: twoPercentCents,
    percentCents: percentCents,
    parseCents: parseCents,
    SHOP: SHOP,
    DEFAULT_BENEFITS: DEFAULT_BENEFITS,
    TIERS: TIERS,
  };
}());

if (typeof module !== "undefined" && module.exports) module.exports = Schmahl;
