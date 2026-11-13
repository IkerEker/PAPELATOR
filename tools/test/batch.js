// node batch.js jobs.json  -> renderiza muchas configuraciones en un solo proceso (reutiliza la caché)
const fs = require('fs');
const { png, assets, E } = require('./run2.js');
(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const arts = {};
  for (const cfg of jobs) {
    const w = cfg.w || 1240, h = cfg.h || 1754, ppm = cfg.ppm || w / 210;
    let art = null;
    if (cfg.art) { const k = cfg.art; if (!arts[k]) arts[k] = new Uint8Array(fs.readFileSync(k)); art = arts[k]; }
    const t = Date.now();
    const res = cfg.final ? await E.renderFinal({ w, h, ppm, state: cfg.state, assets, art, artComponents: 4, backArt: art ? { data: art, channels: 4 } : null })
      : await E.renderPaper({ w, h, ppm, state: cfg.state, assets, backArt: art ? { data: art, channels: 4 } : null });
    png(cfg.out, w, h, res.rgba);
    console.log(cfg.out, Date.now() - t, 'ms');
  }
})().catch(e => { console.error(e); process.exit(1); });
