// Interfaz REAL en el navegador: main.js con módulos y UXP/Photoshop simulados (sin Photoshop).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../plugin');
const mods = {};
for (const f of ['src/engine.js', 'src/presets.js', 'src/png.js']) mods['./' + f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const jsons = {};
for (const f of ['papers.json', 'imperf.json', 'calco.json', 'folds.json', 'overlays.json']) jsons[f] = fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8');
const boot = `
(() => {
  const SRC = ${JSON.stringify(mods)}, JS = ${JSON.stringify(jsons)}, cache = {};
  const entry = p => ({ async getEntry(n) { return entry(p ? p + '/' + n : n); }, async read() { const k = p.replace(/^assets\\//, ''); if (JS[k]) return JS[k]; throw new Error('no ' + p); } });
  const uxp = { entrypoints: { setup(o) { window.__panels = o.panels; } }, storage: { formats: { utf8: 'utf8', binary: 'binary' }, localFileSystem: { async getPluginFolder() { return entry(''); } } } };
  const ps = { app: { activeDocument: null }, constants: {}, core: { async executeAsModal() {} }, imaging: {}, action: { addNotificationListener() {}, async batchPlay() {} } };
  function req(name, base) {
    if (name === 'uxp') return uxp; if (name === 'photoshop') return ps;
    let key = name.startsWith('./') && base ? './' + (base.replace(/[^/]*$/, '') + name.slice(2)).replace(/^\\.\\//, '') : name;
    key = key.replace('./src/./', './src/');
    if (cache[key]) return cache[key].exports;
    const m = { exports: {} }; cache[key] = m;
    new Function('require', 'module', 'exports', SRC[key])(n => req(n, key.slice(2)), m, m.exports);
    return m.exports;
  }
  window.require = n => req(n, '');
  window.module = {};
})();`;
(async () => {
  const b = await chromium.launch();
  const out = [];
  for (const [W, H, theme, setup, tag] of [
    [330, 900, 'dark', s => s, 'papel'],
    [330, 1500, 'dark', s => Object.assign(s, { paper: 'caja', borde: 'rasgado' }), 'caja_borde'],
    [330, 900, 'dark', s => Object.assign(s, { paper: 'kraft', color: '#3a6ea5' }), 'kraft'],
    [330, 900, 'dark', s => Object.assign(s, { paper: 'pantalla_lcd', sobre: 'acanalado' }), 'pantalla'],
    [330, 900, 'dark', s => Object.assign(s, { paper: 'osb' }), 'madera'],
    [330, 1100, 'dark', s => Object.assign(s, { paper: 'ladrillo_2' }), 'ladrillo'],
    [330, 1100, 'light', s => Object.assign(s, { paper: 'gotele_1' }), 'gotele'],
    [270, 700, 'light', s => s, 'estrecho']]) {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: theme });
    await p.addInitScript(boot);
    await p.addInitScript(`localStorage.setItem('papelator3.state', JSON.stringify((${setup.toString()})({})));`);
    p.on('pageerror', e => console.log('ERROR', tag, e.message));
    await p.goto('file://' + ROOT + '/index.html');
    const vars = theme === 'dark' ? '--uxp-host-background-color:#323232;--uxp-host-text-color:#d6d6d6;' : '--uxp-host-background-color:#e8e8e8;--uxp-host-text-color:#222;';
    await p.addStyleTag({ content: `:root{${vars}} body{font-family:"Segoe UI",Arial,sans-serif}
      sp-slider{display:block;height:24px;position:relative} sp-slider::before{content:"";position:absolute;left:0;right:0;top:11px;height:2px;background:#888}
      sp-slider::after{content:"";position:absolute;left:40%;top:5px;width:12px;height:12px;border-radius:7px;border:2px solid #aaa}
      sp-checkbox{display:inline-block;font-size:12px} sp-checkbox::before{content:"☑ "}` });
    await p.evaluate(() => window.__panels.papelator.show({ node: document.body }));
    await p.waitForTimeout(700);
    // con estado guardado de pantalla/madera: el arranque limpia efectos pero respeta el papel
    await p.screenshot({ path: `ui_${tag}.png` });
    out.push(`ui_${tag}.png`);
    await p.close();
  }
  await b.close();
  console.log(out.join(' '));
})();
