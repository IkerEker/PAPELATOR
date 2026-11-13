// Capturas de la interfaz con contenido real (presets y muestras), a varios anchos y en tema oscuro/claro.
const { chromium } = require('playwright');
const P = require('../../plugin/src/presets.js');
(async () => {
  const b = await chromium.launch();
  const shots = [[260, 640, 'dark'], [330, 760, 'dark'], [460, 760, 'dark'], [330, 760, 'light']];
  for (const [W, H, theme] of shots) {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: theme });
    await p.goto('file:///home/claude/papelator-repo/plugin/index.html');
    const vars = theme === 'dark' ? '--uxp-host-background-color:#323232;--uxp-host-text-color:#d6d6d6;' : '--uxp-host-background-color:#e8e8e8;--uxp-host-text-color:#222;';
    await p.addStyleTag({ content: `:root{${vars}} body{font-family:"Segoe UI",Arial,sans-serif}
      sp-slider{display:block;height:24px;position:relative} sp-slider::before{content:"";position:absolute;left:0;right:0;top:11px;height:2px;background:#888}
      sp-slider::after{content:"";position:absolute;left:40%;top:5px;width:12px;height:12px;border-radius:7px;border:2px solid #aaa;background:inherit}
      sp-checkbox{display:inline-block;font-size:12px} sp-checkbox::before{content:"☑ "}` });
    await p.evaluate(({ P, theme }) => {
      const mk = (id, list, on, dot) => { const el = document.getElementById(id); list.forEach((it, i) => { const c = document.createElement('div'); c.className = 'chip' + (i === on ? ' on' : '');
        if (dot && it.hex !== undefined) { const d = document.createElement('span'); d.className = 'dot'; d.style.backgroundColor = it.hex || 'transparent'; c.appendChild(d); }
        const s = document.createElement('span'); s.textContent = it.name || it; c.appendChild(s); el.appendChild(c); }); };
      mk('s-groups', ['Oficina y escuela', 'Bellas artes', 'Rústicos', 'Maderas y cartones', 'Translúcidos'], 3);
      mk('s-colors', P.COLORS, 0, true); mk('s-estado', P.ESTADO_FAMILIAS, 1); mk('s-pliegue', P.PLIEGUES, 2);
      mk('s-calco', P.CALCO_FAMILIAS, 0); mk('s-sobre', P.SOBRES, 1); mk('s-luz', P.LUZ_FAMILIAS, 4); mk('s-calidad', P.CALIDAD_FAMILIAS, 2);
      const sw = document.getElementById('s-swatches');
      P.PAPER_TYPES.filter(t => t.group === 'Maderas y cartones').forEach((t, i) => { const d = document.createElement('div'); d.className = 'sw' + (i === 1 ? ' on' : '');
        d.innerHTML = '<img class="img" src="assets/swatches/' + t.papers[0] + '.png"><div class="lbl">' + t.name + (i === 1 ? ' · 3/7' : '') + '</div>'; sw.appendChild(d); });
      [['s-scaleval', '100%'], ['s-edadval', '8%'], ['s-plamtval', '110%'], ['s-plwearval', '100%'], ['s-calcoval', '100%'], ['s-sobredistval', '10 mm'], ['s-sobretransval', '100%'], ['s-expval', '+5']]
        .forEach(([id, v]) => { document.getElementById(id).textContent = v; });
      document.getElementById('s-status').textContent = 'Papel listo (2.1 s). Trabaja encima y pulsa «Aplicar» al terminar.';
      document.getElementById('pro').style.display = 'none';
    }, { P, theme });
    await p.screenshot({ path: `lay_${W}_${theme}_a.png` });
    await p.evaluate(() => { document.querySelector('#simple .scroll').scrollTop = 99999; });
    await p.screenshot({ path: `lay_${W}_${theme}_b.png` });
    await p.close();
  }
  await b.close();
})();
