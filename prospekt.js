qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

var appUrl = new URL("./", window.location.href).href;
var code = qrcode(0, "H");
code.addData(appUrl);
code.make();
var svg = code.createSvgTag({
  cellSize: 4,
  margin: 4,
  scalable: true,
  title: "Kundenkarte Schmahl",
});
document.querySelector("#mark").innerHTML = svg;
document.querySelector("#url").textContent = appUrl;

var file = new Blob([svg], { type: "image/svg+xml" });
var save = document.querySelector("#save");
save.href = URL.createObjectURL(file);
save.download = "schmahl-prospekt.svg";
