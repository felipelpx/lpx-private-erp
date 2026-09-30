import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewportSize: { width: 1560, height: 900 }, deviceScaleFactor: 2 });
await p.goto("file:///tmp/grafico.html");
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/grafico.png", fullPage: true });
await b.close();
console.log("ok");
