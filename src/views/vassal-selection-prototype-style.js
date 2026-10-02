// Scoped to the opt-in throwaway route; normal game chrome is unchanged.
export const prototypeStyle = `
#vassal-selection-prototype { --ink:#e6dbc2; --muted:#b7bbaa; --gold:#c3a46b; --line:#5b6252; --night:#141e1c; --red:#d99a80; --purple:#b9b1d1; position:fixed; inset:0; overflow:auto; background:#17231f; color:var(--ink); font:14px/1.45 Arial,sans-serif; color-scheme:dark; }
#vassal-selection-prototype * { box-sizing:border-box; }
#vassal-selection-prototype h1, #vassal-selection-prototype h2, #vassal-selection-prototype h3, #vassal-selection-prototype p { margin:0; text-decoration:none; }
#vassal-selection-prototype h1, #vassal-selection-prototype h2, #vassal-selection-prototype h3 { font-family:Georgia,serif; font-weight:normal; }
#vassal-selection-prototype h1 { font-size:clamp(25px,3vw,38px); line-height:1.1; }
#vassal-selection-prototype h2 { font-size:26px; }
#vassal-selection-prototype h3 { font-size:21px; }
#vassal-selection-prototype button, #vassal-selection-prototype select { font:inherit; color:var(--ink); background:#25322b; border:1px solid var(--line); border-radius:3px; padding:8px 13px; min-height:40px; cursor:pointer; }
#vassal-selection-prototype button:hover { background:#354135; border-color:var(--gold); }
#vassal-selection-prototype :focus-visible { outline:2px solid #ebd49b; outline-offset:3px; }
#vassal-selection-prototype button[aria-pressed=true] { color:#f3e5bd; background:#4a4933; border-color:var(--gold); }
#vassal-selection-prototype button:disabled { cursor:default; opacity:.5; }
#vassal-selection-prototype .vp-primary { background:#c0a16a; color:#17211a; border-color:#debd7e; font-weight:bold; }
#vassal-selection-prototype .vp-primary:hover { background:#dfc18b; }
#vassal-selection-prototype .vp-kicker { font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--gold); }
#vassal-selection-prototype .vp-muted { color:var(--muted); }
#vassal-selection-prototype .vp-mark { width:24px; height:24px; flex-shrink:0; vertical-align:middle; }
#vassal-selection-prototype .vp-header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:16px 28px; border-bottom:1px solid var(--line); background:#111b18; }
#vassal-selection-prototype .vp-brand { font:18px Georgia,serif; letter-spacing:.1em; }
#vassal-selection-prototype .vp-header-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
#vassal-selection-prototype .vp-header-tools button { font-size:12px; }
#vassal-selection-prototype .vp-resources { position:sticky; top:0; z-index:12; display:flex; gap:24px; align-items:center; justify-content:center; flex-wrap:wrap; padding:11px 20px; background:#1f2a23; border-bottom:1px solid var(--line); }
#vassal-selection-prototype .vp-resource { display:flex; gap:8px; align-items:baseline; font-size:12px; color:var(--muted); }
#vassal-selection-prototype .vp-resource b { font:19px Georgia,serif; color:var(--ink); }
#vassal-selection-prototype .vp-resource.vp-warning b { color:var(--red); }
#vassal-selection-prototype .vp-scene { position:relative; min-height:calc(100dvh - 125px); padding:24px 30px 112px; isolation:isolate; }
#vassal-selection-prototype .vp-map-backdrop { position:absolute; z-index:-1; inset:0; overflow:hidden; opacity:.28; }
#vassal-selection-prototype .vp-map-backdrop .vp-world { width:100%; height:100%; object-fit:cover; }
#vassal-selection-prototype .vp-intro { text-align:center; margin-bottom:20px; }
#vassal-selection-prototype .vp-intro h1 { margin:5px 0 8px; }
#vassal-selection-prototype .vp-intro p { color:var(--muted); max-width:630px; margin:auto; }
#vassal-selection-prototype .vp-panel { background:linear-gradient(135deg,#26322bec,#17221ef5); border:1px solid #6f6e54; box-shadow:0 12px 35px #050c0840; }
#vassal-selection-prototype .vp-tag { display:inline-flex; align-items:center; gap:5px; font-size:11px; padding:3px 8px; border:1px solid #68664e; border-radius:2px; color:#cfbd91; }
#vassal-selection-prototype .vp-tag.vp-lock { color:#c1bccc; border-color:#7a7289; }
#vassal-selection-prototype .vp-class { display:flex; align-items:center; gap:8px; color:var(--gold); font-size:12px; letter-spacing:.07em; text-transform:uppercase; }
#vassal-selection-prototype .vp-warrior .vp-class { color:var(--red); }
#vassal-selection-prototype .vp-scholar .vp-class { color:var(--purple); }
#vassal-selection-prototype .vp-portrait { display:block; width:100%; max-height:260px; }
#vassal-selection-prototype .vp-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; max-width:960px; margin:0 auto; }
#vassal-selection-prototype .vp-cards.vp-successors { grid-template-columns:repeat(3,minmax(0,1fr)); max-width:1140px; gap:16px; }
#vassal-selection-prototype .vp-card { padding:16px 21px; position:relative; border-top:3px solid #927753; }
#vassal-selection-prototype .vp-card.vp-scholar { border-top-color:#9185a9; }
#vassal-selection-prototype .vp-card.vp-selected { outline:2px solid var(--gold); outline-offset:3px; }
#vassal-selection-prototype .vp-card-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
#vassal-selection-prototype .vp-card-body { display:grid; grid-template-columns:45% 1fr; gap:16px; margin:13px 0 12px; align-items:center; }
#vassal-selection-prototype .vp-card h2 { font-size:25px; }
#vassal-selection-prototype .vp-card h3 { margin:5px 0 10px; color:#dcc9a0; font-size:17px; }
#vassal-selection-prototype .vp-card p { color:var(--muted); font-size:13px; }
#vassal-selection-prototype .vp-card .vp-inspect { width:100%; margin-top:13px; }
#vassal-selection-prototype .vp-card .vp-impact { font-size:12px; padding-top:10px; margin-top:10px; border-top:1px solid var(--line); color:#dfd1b4; }
#vassal-selection-prototype .vp-card.vp-locked .vp-portrait { opacity:.62; }
#vassal-selection-prototype .vp-successors .vp-card-body { grid-template-columns:1fr; gap:3px; text-align:center; }
#vassal-selection-prototype .vp-successors .vp-portrait { height:158px; }
#vassal-selection-prototype .vp-successors h2 { font-size:23px; }
#vassal-selection-prototype .vp-detail { padding:17px 20px; }
#vassal-selection-prototype .vp-detail h2 { margin:5px 0; }
#vassal-selection-prototype .vp-detail p { color:var(--muted); }
#vassal-selection-prototype .vp-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin:16px 0; }
#vassal-selection-prototype .vp-detail-grid h3 { font:11px Arial,sans-serif; text-transform:uppercase; letter-spacing:.12em; color:var(--gold); margin-bottom:5px; }
#vassal-selection-prototype .vp-detail-grid p { font-size:13px; }
#vassal-selection-prototype .vp-effect { border-left:2px solid var(--gold); padding:7px 10px; background:#35433460; color:var(--ink)!important; font-size:13px; }
#vassal-selection-prototype .vp-stats { display:flex; flex-wrap:wrap; gap:16px; font-size:12px; margin:12px 0; color:var(--muted); }
#vassal-selection-prototype .vp-stats b { color:var(--ink); margin-left:4px; }
#vassal-selection-prototype .vp-confirm { display:flex; justify-content:space-between; align-items:center; gap:15px; border-top:1px solid var(--line); padding-top:14px; margin-top:14px; }
#vassal-selection-prototype .vp-confirm small { color:var(--muted); max-width:280px; }
#vassal-selection-prototype .vp-ceremony-detail { max-width:960px; margin:20px auto 0; }
#vassal-selection-prototype .vp-inline-actions { display:flex; gap:9px; justify-content:center; align-items:center; margin:14px 0 0; flex-wrap:wrap; }
#vassal-selection-prototype .vp-inline-actions button { font-size:12px; }
#vassal-selection-prototype .vp-split { display:grid; grid-template-columns:minmax(300px,.9fr) minmax(420px,1.15fr); gap:22px; max-width:1220px; margin:auto; }
#vassal-selection-prototype .vp-civilization { padding:19px; }
#vassal-selection-prototype .vp-civilization h2 { margin-top:6px; }
#vassal-selection-prototype .vp-world { width:100%; display:block; }
#vassal-selection-prototype .vp-civilization .vp-world { max-height:278px; margin:8px 0; }
#vassal-selection-prototype .vp-region-buttons { display:flex; gap:8px; }
#vassal-selection-prototype .vp-region-buttons button { flex:1; font-size:12px; }
#vassal-selection-prototype .vp-region-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:14px 0; }
#vassal-selection-prototype .vp-region-summary p { font-size:11px; color:var(--muted); }
#vassal-selection-prototype .vp-region-summary b { display:block; font:22px Georgia,serif; color:var(--ink); }
#vassal-selection-prototype .vp-need { padding:11px; background:#9f69421c; border-left:2px solid #bd9272; font-size:13px; color:#d9c6a5; }
#vassal-selection-prototype .vp-dossier { padding:19px; }
#vassal-selection-prototype .vp-dossier-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; }
#vassal-selection-prototype .vp-dossier-hero { display:grid; grid-template-columns:160px 1fr; gap:20px; align-items:center; }
#vassal-selection-prototype .vp-dossier-hero h2 { font-size:31px; margin:6px 0; }
#vassal-selection-prototype .vp-dossier-hero p { color:var(--muted); }
#vassal-selection-prototype .vp-rows { display:flex; flex-direction:column; gap:7px; margin-top:12px; }
#vassal-selection-prototype .vp-row { display:flex; align-items:center; gap:12px; text-align:left; width:100%; }
#vassal-selection-prototype .vp-row .vp-portrait { width:50px; height:53px; }
#vassal-selection-prototype .vp-row-info { flex:1; }
#vassal-selection-prototype .vp-row-info strong { display:block; font:17px Georgia,serif; }
#vassal-selection-prototype .vp-row-info small { color:var(--muted); font-size:11px; }
#vassal-selection-prototype .vp-drawer-world { display:grid; grid-template-columns:1fr 280px; gap:22px; max-width:1180px; margin:auto; }
#vassal-selection-prototype .vp-drawer-world .vp-world { height:290px; }
#vassal-selection-prototype .vp-drawer-world .vp-civilization .vp-world { display:none; }
#vassal-selection-prototype .vp-drawer { max-width:1180px; margin:0 auto; padding:18px 22px; border-top:3px solid var(--gold); }
#vassal-selection-prototype .vp-drawer-title { display:flex; justify-content:space-between; align-items:center; gap:16px; }
#vassal-selection-prototype .vp-drawer-columns { display:grid; grid-template-columns:280px 1fr; gap:24px; margin-top:14px; }
#vassal-selection-prototype .vp-drawer-columns .vp-rows { margin:0; }
#vassal-selection-prototype .vp-drawer .vp-dossier-hero { grid-template-columns:135px 1fr; }
#vassal-selection-prototype .vp-drawer .vp-portrait { max-height:170px; }
#vassal-selection-prototype .vp-drawer .vp-detail { padding:0; }
#vassal-selection-prototype .vp-drawer:not(.vp-expanded) .vp-drawer-columns { display:block; }
#vassal-selection-prototype .vp-drawer:not(.vp-expanded) .vp-rows { flex-direction:row; }
#vassal-selection-prototype .vp-switcher { position:fixed; z-index:30; bottom:max(13px,env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); display:flex; gap:8px; align-items:center; border:1px solid #bbc0aa; border-radius:30px; background:#e8e5d4; padding:7px; color:#1d3028; box-shadow:0 5px 26px #0009; white-space:nowrap; }
#vassal-selection-prototype .vp-switcher button { background:transparent; color:#1d3028; border:0; min-width:40px; min-height:40px; padding:6px 10px; }
#vassal-selection-prototype .vp-switcher button:hover { background:#ced2bf; }
#vassal-selection-prototype .vp-switch-label { min-width:150px; text-align:center; font-size:12px; }
#vassal-selection-prototype .vp-switch-label small { display:block; font-size:9px; letter-spacing:.13em; text-transform:uppercase; color:#526055; }
#vassal-selection-prototype .vp-state { max-width:1120px; margin:17px auto 0; color:#acb4a4; font-size:10px; text-align:center; }
#vassal-selection-prototype .vp-state details { margin-top:7px; }
#vassal-selection-prototype .vp-state pre { white-space:pre-wrap; text-align:left; background:#111d18; padding:12px; margin:auto; max-width:650px; }
#vassal-selection-prototype .vp-overlay { position:fixed; z-index:40; inset:0; padding:25px; display:grid; place-items:center; background:#07110be8; overflow:auto; }
#vassal-selection-prototype .vp-overlay-panel { width:min(940px,100%); padding:25px; max-height:calc(100dvh - 50px); overflow:auto; }
#vassal-selection-prototype .vp-overlay-header { display:flex; gap:18px; align-items:center; justify-content:space-between; margin-bottom:16px; }
#vassal-selection-prototype .vp-art-controls { display:flex; gap:15px; flex-wrap:wrap; margin:15px 0; }
#vassal-selection-prototype .vp-art-controls label { font-size:12px; color:var(--muted); display:flex; flex-direction:column; gap:5px; }
#vassal-selection-prototype .vp-art-gallery { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
#vassal-selection-prototype .vp-art-gallery figure { margin:0; text-align:center; }
#vassal-selection-prototype .vp-art-gallery figcaption { color:var(--muted); font-size:12px; margin-top:10px; }
#vassal-selection-prototype .vp-art-gallery .vp-portrait { height:230px; }
#vassal-selection-prototype .vp-success { text-align:center; max-width:530px; }
#vassal-selection-prototype .vp-success .vp-portrait { height:220px; }
#vassal-selection-prototype .vp-success p { color:var(--muted); margin:13px 0 20px; }
@media(min-width:1400px) { #vassal-selection-prototype .vp-scene { padding-top:34px; } #vassal-selection-prototype .vp-cards { margin-top:28px; } }
@media(max-width:950px) {
  #vassal-selection-prototype .vp-header { padding:10px 16px; }
  #vassal-selection-prototype .vp-brand { font-size:14px; }
  #vassal-selection-prototype .vp-header-tools { gap:5px; }
  #vassal-selection-prototype .vp-header-tools button { padding:7px 9px; }
  #vassal-selection-prototype .vp-resources { gap:14px; padding:8px; }
  #vassal-selection-prototype .vp-scene { padding:16px 18px 108px; }
  #vassal-selection-prototype .vp-split { grid-template-columns:minmax(220px,.8fr) minmax(350px,1.2fr); gap:12px; }
  #vassal-selection-prototype .vp-card { padding:12px; }
  #vassal-selection-prototype .vp-card-body { gap:8px; }
  #vassal-selection-prototype .vp-dossier { padding:14px; }
  #vassal-selection-prototype .vp-dossier-hero { grid-template-columns:115px 1fr; gap:12px; }
  #vassal-selection-prototype .vp-drawer-columns { grid-template-columns:230px 1fr; gap:15px; }
}
@media(max-width:650px) {
  #vassal-selection-prototype { font-size:13px; }
  #vassal-selection-prototype .vp-header { align-items:flex-start; padding:12px; gap:10px; }
  #vassal-selection-prototype .vp-brand { max-width:115px; }
  #vassal-selection-prototype .vp-header-tools { justify-content:flex-end; }
  #vassal-selection-prototype .vp-header-tools button { font-size:10px; min-height:36px; }
  #vassal-selection-prototype .vp-resources { gap:6px 14px; }
  #vassal-selection-prototype .vp-resource { font-size:10px; }
  #vassal-selection-prototype .vp-resource b { font-size:17px; }
  #vassal-selection-prototype .vp-scene { padding:20px 13px 115px; }
  #vassal-selection-prototype .vp-intro { margin-bottom:18px; }
  #vassal-selection-prototype .vp-intro p { font-size:12px; }
  #vassal-selection-prototype .vp-cards, #vassal-selection-prototype .vp-cards.vp-successors { grid-template-columns:1fr; gap:18px; }
  #vassal-selection-prototype .vp-card-body, #vassal-selection-prototype .vp-successors .vp-card-body { grid-template-columns:120px 1fr; text-align:left; gap:12px; }
  #vassal-selection-prototype .vp-card h2 { font-size:25px; }
  #vassal-selection-prototype .vp-card .vp-portrait { height:155px; }
  #vassal-selection-prototype .vp-detail-grid { gap:12px; }
  #vassal-selection-prototype .vp-confirm { align-items:stretch; flex-direction:column; }
  #vassal-selection-prototype .vp-confirm small { max-width:none; }
  #vassal-selection-prototype .vp-split { display:flex; flex-direction:column; }
  #vassal-selection-prototype .vp-civilization .vp-world { max-height:170px; }
  #vassal-selection-prototype .vp-drawer-world { grid-template-columns:1fr; gap:0; }
  #vassal-selection-prototype .vp-drawer-world>.vp-world { height:180px; }
  #vassal-selection-prototype .vp-drawer-world .vp-civilization { padding:12px; margin-bottom:18px; }
  #vassal-selection-prototype .vp-drawer-world .vp-region-summary { margin:9px 0; }
  #vassal-selection-prototype .vp-drawer { padding:15px; }
  #vassal-selection-prototype .vp-drawer-columns { display:block; }
  #vassal-selection-prototype .vp-drawer-columns .vp-detail { margin-top:20px; }
  #vassal-selection-prototype .vp-drawer:not(.vp-expanded) .vp-rows { flex-direction:column; }
  #vassal-selection-prototype .vp-drawer-title h2 { font-size:22px; }
  #vassal-selection-prototype .vp-switcher { gap:1px; padding:5px; max-width:calc(100vw - 18px); }
  #vassal-selection-prototype .vp-switch-label { min-width:140px; }
  #vassal-selection-prototype .vp-switcher button { padding:6px 9px; }
  #vassal-selection-prototype .vp-overlay { padding:12px; }
  #vassal-selection-prototype .vp-overlay-panel { padding:17px; max-height:calc(100dvh - 24px); }
  #vassal-selection-prototype .vp-art-gallery { gap:5px; }
  #vassal-selection-prototype .vp-art-gallery .vp-portrait { height:auto; }
  #vassal-selection-prototype .vp-art-controls { gap:10px; }
}
@media(max-height:500px) and (min-width:651px) {
  #vassal-selection-prototype .vp-header { padding:7px 16px; }
  #vassal-selection-prototype .vp-scene { padding-top:13px; }
  #vassal-selection-prototype .vp-intro h1 { font-size:27px; }
  #vassal-selection-prototype .vp-intro { margin-bottom:15px; }
  #vassal-selection-prototype .vp-card .vp-portrait { max-height:170px; }
  #vassal-selection-prototype .vp-switcher { bottom:8px; }
}
`;
