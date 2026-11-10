const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 300, height: 560 } });
  await p.goto('file:///home/claude/papelator-repo/plugin/index.html');
  await p.addStyleTag({ content: 'body{background:#323232} sp-slider{display:block;height:16px;background:#555} sp-button{display:block;padding:6px;background:#2680eb;color:#fff;text-align:center;border-radius:12px} sp-checkbox{display:inline-block}' });
  await p.evaluate(() => {
    document.getElementById('pro').style.display = 'none';
    const r = document.getElementById('simple'); r.style.height = window.innerHeight + 'px';
    for (const id of ['s-groups','s-colors','s-estado','s-pliegue','s-calco','s-impresion','s-luz','s-calidad']) for (let i = 0; i < 9; i++) { const c = document.createElement('div'); c.className = 'chip'; c.textContent = 'Opción ' + i; document.getElementById(id).appendChild(c); }
    for (let i = 0; i < 12; i++) { const d = document.createElement('div'); d.className = 'sw'; d.innerHTML = '<div class="img" style="background:#ddd"></div><div class="lbl">Papel</div>'; document.getElementById('s-swatches').appendChild(d); }
  });
  await p.screenshot({ path: 'lay1.png' });
  await p.evaluate(() => { document.querySelector('#simple .scroll').scrollTop = 99999; });
  await p.screenshot({ path: 'lay2.png' });
  await b.close();
})();
