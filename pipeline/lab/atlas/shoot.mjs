// Screenshot / interaction driver for the Atlas page (needs node >= 22 and Google Chrome; no packages).
//   node shoot.mjs --url "http://127.0.0.1:8781/lab/atlas/?e=kumamoto-quake" --size 390x844 --dsf 2 --out out.jpg
//        [--full] [--actions steps.json] [--eval "js"] [--wait ms] [--touch] [--perf]
// steps.json: [{"drag":[x1,y1,x2,y2]}, {"pinch":[cx,cy,d0,d1]}, {"click":[x,y]}, {"clickSel":"css selector"}, {"eval":"js"}, {"wait":ms}, {"scroll":y}, {"shot":"file.jpg","full":true}]
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2), args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { const nxt = argv[i + 1]; if (nxt === undefined || nxt.startsWith("--")) args[argv[i].slice(2)] = true; else { args[argv[i].slice(2)] = nxt; i++; } }
const [W, H] = (args.size || "390x844").split("x").map(Number), dsf = Number(args.dsf || 1);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--no-proxy-server", "--hide-scrollbars", `--user-data-dir=${mkdtempSync(join(tmpdir(), "atlas-cdp-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), logs = [];
const send = (method, params = {}) => new Promise((ok, no) => { const i = ++id; pending.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (js) => { const r = await send("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails)); return r.result.value; };
async function main() {
  let tabs;
  for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (tabs.length) break; } catch {} await sleep(250); }
  ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.no(new Error(JSON.stringify(d.error))) : p.ok(d.result); }
    else if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) logs.push(`console.${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    else if (d.method === "Runtime.exceptionThrown") logs.push(`exception: ${d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text}`);
    else if (d.method === "Log.entryAdded" && d.params.entry.level === "error") logs.push(`log.error: ${d.params.entry.text} ${d.params.entry.url ?? ""}`);
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  const mobile = W < 700;
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dsf, mobile });
  if (args.touch || mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: args.url });
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) { try { if (await ev("document.body && document.body.dataset.ready === '1'")) break; } catch {} await sleep(250); }
  if (/[?&]cut=/.test(args.url)) { for (let i = 0; i < 40; i++) { if (await ev("document.body.dataset.cut === '1'")) break; await sleep(250); } }
  await sleep(Number(args.wait || 1200));
  const shot = async (out, full) => {
    if (full) { const h = await ev("Math.ceil(document.documentElement.scrollHeight)"); await send("Emulation.setDeviceMetricsOverride", { width: W, height: h, deviceScaleFactor: dsf, mobile }); await sleep(900); }
    const jpg = /\.jpe?g$/.test(out);
    const r = await send("Page.captureScreenshot", { format: jpg ? "jpeg" : "png", quality: 80 });
    writeFileSync(out, Buffer.from(r.data, "base64"));
    if (full) { await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dsf, mobile }); await sleep(300); }
    console.log("wrote", out);
  };
  const touchMode = !!(args.touch || mobile), tp = (type, pts) => send("Input.dispatchTouchEvent", { type, touchPoints: pts }), mp = (type, x, y, b) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: b, clickCount: 1 });
  async function drag([x1, y1, x2, y2], steps = 14) {
    if (touchMode) { await tp("touchStart", [{ x: x1, y: y1 }]); for (let i = 1; i <= steps; i++) { await tp("touchMove", [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }]); await sleep(16); } await tp("touchEnd", []); }
    else { await mp("mousePressed", x1, y1, 1); for (let i = 1; i <= steps; i++) { await mp("mouseMoved", x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, 1); await sleep(16); } await mp("mouseReleased", x2, y2, 0); }
  }
  async function pinch([cx, cy, d0, d1], steps = 12) { // two fingers on a horizontal line, d0 -> d1 apart
    const pts = (d) => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
    await tp("touchStart", pts(d0));
    for (let i = 1; i <= steps; i++) { await tp("touchMove", pts(d0 + ((d1 - d0) * i) / steps)); await sleep(16); }
    await tp("touchEnd", []);
  }
  async function click([x, y]) { if (touchMode) { await tp("touchStart", [{ x, y }]); await tp("touchEnd", []); } else { await mp("mousePressed", x, y, 1); await mp("mouseReleased", x, y, 0); } }
  if (args.eval) console.log("eval:", JSON.stringify(await ev(args.eval)));
  if (args.actions) for (const st of JSON.parse(readFileSync(args.actions, "utf8"))) {
    if (st.drag) await drag(st.drag); else if (st.pinch) await pinch(st.pinch); else if (st.click) await click(st.click); else if (st.clickSel) { const [x, y] = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(st.clickSel)}); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()`); await sleep(500); const [x2, y2] = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(st.clickSel)}).getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()`); await click([x2, y2]); } else if (st.wait) await sleep(st.wait);
    else if (st.eval) console.log("eval:", JSON.stringify(await ev(st.eval))); else if (st.scroll != null) { await ev(`window.scrollTo(0, ${st.scroll})`); await sleep(400); }
    else if (st.shot) await shot(st.shot, st.full);
    await sleep(st.after ?? 350);
  }
  if (args.out) await shot(args.out, !!args.full);
  if (args.perf) console.log("perf:", await ev(`JSON.stringify({payload: document.body.dataset.payload, res: performance.getEntriesByType('resource').map(r => [r.name.split('/lab/').pop().split('/events/').pop(), r.encodedBodySize, Math.round(r.responseEnd)])})`));
  console.log(logs.length ? "LOGS:\n" + logs.join("\n") : "no console errors");
}
main().catch((e) => { console.error("FAILED", e); process.exitCode = 1; }).finally(() => { chrome.kill(); setTimeout(() => process.exit(), 200); });
