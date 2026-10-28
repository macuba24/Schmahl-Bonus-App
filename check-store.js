var Schmahl = require("./store.js");

function memory() {
  var map = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null; },
    setItem: function (key, value) { map[key] = String(value); },
  };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

var year = 2026;
var store = Schmahl.createStore(memory(), function () {
  return { year: year, month: 10, iso: year + "-10-28T12:00:00" };
});

assert(Schmahl.twoPercentCents(40000) === 800, "2 Prozent von 400");
assert(Schmahl.twoPercentCents(110000) === 2200, "2 Prozent von 1100");
assert(Schmahl.twoPercentCents(25) === 1, "halber Cent auf");
assert(Schmahl.twoPercentCents(24) === 0, "unter einem halben Cent");
assert(Schmahl.twoPercentCents(75) === 2, "anderthalb Cent");
assert(Schmahl.parseCents("400") === 40000, "400");
assert(Schmahl.parseCents("400,00") === 40000, "400,00");
assert(Schmahl.parseCents("1.100,00") === 110000, "1.100,00");
assert(Schmahl.SHOP.name === "Schmahl GmbH", "Ladenname");
assert(Schmahl.SHOP.street === "Carl-Spaeter-Straße 13", "Straße");

var card = store.createCustomer({
  name: "Ada Berger",
  address: "Rheinstraße 1, Koblenz",
  kundennummer: "k-12",
});
assert(card.number.length === 8, "Kode-Länge");
assert(card.kundennummer === "K-12", "Kundennummer");
assert(card.turnoverCents === 0, "Startumsatz");
assert(card.remainingCents === 100000, "erste Stufe");
assert(store.deviceCard().number === card.number, "Gerät merkt den Kode");

var failed = false;
try { store.book("", "400"); } catch (error) { failed = /Kundennummer/.test(error.message); }
assert(failed, "ohne Nummer");
failed = false;
try { store.book("ZZZZZZZZ", "400"); } catch (error) { failed = /nicht/.test(error.message); }
assert(failed, "fremde Nummer");

var first = store.book(card.number.toLowerCase(), "400");
assert(first.card.turnoverCents === 40000, "400 Euro");
assert(first.card.reachedTierCents == null, "Stufe offen");
assert(first.month.feeCents === 800, "8 Euro Gebühr");

var second = store.book("K-12", "700");
assert(second.card.turnoverCents === 110000, "Buchung über die Kundennummer");
assert(second.card.reachedTierCents === 100000, "Stufe 1000");
assert(second.card.benefits[0].reached === true, "Vorteil erreicht");
assert(second.card.benefits[0].text.indexOf("Sichtprüfung") === 0, "Satz");
assert(second.month.turnoverCents === 110000, "Monat");
assert(second.month.feeCents === 2200, "22 Euro");

failed = false;
try { store.redeem(card.number, 300000); } catch (error) { failed = /noch nicht/.test(error.message); }
assert(failed, "höhere Stufe");
var marked = store.redeem(card.number, "100000");
assert(marked.benefits[0].redeemed === true, "eingelöst");
failed = false;
try { store.redeem(card.number, 100000); } catch (error) { failed = /schon/.test(error.message); }
assert(failed, "doppelt");

store.updateBenefits({
  100000: "Sichtprüfung am Tresen",
  300000: Schmahl.DEFAULT_BENEFITS[300000],
  500000: Schmahl.DEFAULT_BENEFITS[500000],
  1000000: Schmahl.DEFAULT_BENEFITS[1000000],
});
assert(store.lookup(card.number).benefits[0].text === "Sichtprüfung am Tresen", "Satz geändert");

year = 2025;
store.book(card.number, "500");
year = 2026;
assert(store.lookup(card.number).turnoverCents === 110000, "Vorjahr zählt nicht");
assert(store.shop().month.feeCents === 2200, "Monatsgebühr bleibt");

var wrote = store.postMessage(card.number, "Wann ist die Säge fertig?", "kunde");
assert(wrote.messages[wrote.messages.length - 1].sender === "kunde", "Absender");
assert(wrote.messages[wrote.messages.length - 1].text === "Wann ist die Säge fertig?", "Text");
var reply = store.postMessage(card.number, "Morgen ab 8 Uhr.", "firma");
assert(reply.messages[reply.messages.length - 1].sender === "firma", "Antwort");

var jpeg = "data:image/jpeg;base64," + "/9j/" + "A".repeat(400);
var shot = store.saveReceipt(card.number, jpeg);
assert(shot.receipt.jpeg.indexOf("data:image/jpeg") === 0, "Foto");

failed = false;
try {
  store.createCustomer({ name: "Bea", address: "Markt 2", kundennummer: "k-12" });
} catch (error) {
  failed = /schon/.test(error.message);
}
assert(failed, "Kundennummer doppelt");

console.log("Prüfung in Ordnung.");
