export const MISSION_CSS="\n/* MLS Commerce OS / Mission Control: cosmetic only, keeps existing theme and API contracts. */\n.mission-agent--finance{--mission-accent:#46e5aa;--mission-rgb:70,229,170}\n.mission-agent--ads{--mission-accent:#f9a14e;--mission-rgb:249,161,78}\n.mission-agent--products{--mission-accent:#4b9fff;--mission-rgb:75,159,255}\n.mission-agent--production{--mission-accent:#b28aff;--mission-rgb:178,138,255}\n.mission-agent--returns{--mission-accent:#fa6f99;--mission-rgb:250,111,153}\n.mission-agent--auditor{--mission-accent:#3bd1e8;--mission-rgb:59,209,232}\n.mission-agent--hermes{--mission-accent:#7da5ff;--mission-rgb:125,165,255}\n.mission-hub,.mission-workspace{min-width:0;max-width:1500px;margin:0 auto 30px}\n.mission-hero{position:relative;isolation:isolate;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:28px 30px;border:1px solid var(--line);border-radius:21px;background:linear-gradient(116deg,rgba(var(--mission-rgb),.12),transparent 58%),var(--surface);box-shadow:0 8px 36px rgba(0,0,0,.08)}\n.mission-hero:before{content:\"\";position:absolute;z-index:-1;width:300px;height:300px;right:-95px;top:-180px;border-radius:50%;border:1px solid rgba(var(--mission-rgb),.45);box-shadow:0 0 0 39px rgba(var(--mission-rgb),.04),0 0 0 91px rgba(var(--mission-rgb),.025)}\n.mission-hero:after{content:\"\";position:absolute;z-index:-1;inset:auto 0 0;height:2px;background:linear-gradient(90deg,transparent,rgba(var(--mission-rgb),.85),transparent)}\n.mission-crumb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:18px;color:var(--muted);font-size:11px}\n.mission-crumb a{color:var(--muted);text-decoration:none}.mission-crumb a:hover{color:var(--text)}\n.mission-hero-main{min-width:0;display:flex;align-items:flex-start;gap:18px}\n.mission-orb{display:grid;place-items:center;flex:0 0 76px;width:76px;height:76px;border:1px solid rgba(var(--mission-rgb),.58);border-radius:23px;background:radial-gradient(circle at 30% 22%,rgba(var(--mission-rgb),.36),rgba(var(--mission-rgb),.08) 65%,transparent 100%);box-shadow:inset 0 0 24px rgba(var(--mission-rgb),.12),0 0 34px rgba(var(--mission-rgb),.16);color:var(--mission-accent);font-size:37px;line-height:1}\n.mission-eyebrow{display:block;margin:0 0 7px;color:var(--mission-accent);font-size:10px;letter-spacing:.15em;text-transform:uppercase;font-weight:800}\n.mission-hero h2{font-size:clamp(25px,3vw,34px);letter-spacing:-.9px;line-height:1.13;margin:0 0 9px}\n.mission-hero p{margin:0;color:var(--muted);font-size:12px;line-height:1.7;max-width:680px}\n.mission-status{display:inline-flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid rgba(var(--mission-rgb),.35);border-radius:999px;background:rgba(var(--mission-rgb),.09);color:var(--text);font-size:11px;font-weight:700;white-space:nowrap}\n.mission-status:before{content:\"\";display:block;flex:0 0 7px;width:7px;height:7px;border-radius:100%;background:var(--mission-accent);box-shadow:0 0 10px var(--mission-accent)}\n.mission-status[data-status=ATTENTION],.mission-status[data-status=BLOCKED]{border-color:var(--line);background:var(--surface-raised)}\n.mission-status[data-status=ATTENTION]:before{background:#f3b44b}.mission-status[data-status=BLOCKED]:before{background:#f17691}\n.mission-breadcrumb-pill{font-size:10px;color:var(--muted);padding:7px 10px;background:var(--surface-raised);border:1px solid var(--line);border-radius:100px}\n.mission-hub-hero{--mission-accent:#78a9ff;--mission-rgb:120,169,255}\n.mission-hub-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin:24px 0 14px}\n.mission-hub-bar h3{margin:0;font-size:16px;letter-spacing:-.3px}.mission-hub-bar p{margin:4px 0 0;color:var(--muted);font-size:11px}\n.mission-hub-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}\n.mission-hub-card{display:flex;flex-direction:column;gap:11px;min-width:0;min-height:183px;padding:20px;border:1px solid var(--line);border-radius:18px;text-decoration:none;color:var(--text);background:linear-gradient(140deg,rgba(var(--mission-rgb),.11),transparent 72%),var(--surface);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}\n.mission-hub-card:hover{transform:translateY(-3px);border-color:rgba(var(--mission-rgb),.75);box-shadow:0 13px 30px rgba(0,0,0,.11),inset 0 0 0 1px rgba(var(--mission-rgb),.13);text-decoration:none}\n.mission-hub-card:focus-visible,.mission-action:focus-visible,.mission-return:focus-visible{outline:3px solid var(--mission-accent,#4b9fff);outline-offset:3px}\n.mission-hub-card-top{display:flex;align-items:center;justify-content:space-between;gap:12px}\n.mission-mini-orb{display:grid;place-items:center;width:46px;height:46px;flex:0 0 46px;border-radius:14px;border:1px solid rgba(var(--mission-rgb),.55);background:rgba(var(--mission-rgb),.14);color:var(--mission-accent);font-size:25px;box-shadow:0 0 26px rgba(var(--mission-rgb),.12)}\n.mission-hub-card h4{margin:0;font-size:15px;letter-spacing:-.3px}.mission-hub-card p{margin:0;min-height:30px;color:var(--muted);font-size:11px;line-height:1.55}\n.mission-hub-card-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:7px;border-top:1px solid var(--line)}\n.mission-open{font-size:11px;font-weight:800;color:var(--mission-accent)}\n.mission-future{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.mission-future span{font-size:10px;color:var(--muted);padding:8px 12px;border:1px dashed var(--line);border-radius:8px}\n.mission-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}\n.mission-stat{position:relative;overflow:hidden;min-width:0;padding:20px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(120deg,rgba(var(--mission-rgb),.10),transparent 70%),var(--surface)}\n.mission-stat:before{content:\"\";height:2px;width:44%;position:absolute;inset:0 auto auto 0;background:linear-gradient(90deg,var(--mission-accent),transparent)}\n.mission-stat small{display:block;font-size:11px;color:var(--muted);line-height:1.5;min-height:32px}.mission-stat strong{display:block;margin:9px 0 5px;font-size:clamp(18px,2vw,27px);line-height:1.2;letter-spacing:-.6px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}\n.mission-stat span{display:block;color:var(--muted);font-size:10px;line-height:1.55}\n.mission-panels{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(290px,1fr);gap:14px}\n.mission-module{min-width:0;border:1px solid var(--line);border-radius:17px;padding:21px;background:var(--surface)}\n.mission-module-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}.mission-module-head h3{margin:0;font-size:16px}.mission-module-head small{font-size:10px;color:var(--muted)}\n.mission-tasks{display:grid;gap:9px}.mission-task{display:block;padding:13px 15px;border:1px solid var(--line);border-left:3px solid var(--mission-accent);border-radius:10px;background:var(--surface-raised);color:var(--text);text-decoration:none}.mission-task:hover{border-color:var(--mission-accent);text-decoration:none}\n.mission-task strong{display:block;font-size:12px}.mission-task p{font-size:11px;color:var(--muted);line-height:1.65;margin:5px 0 0}\n.mission-empty{font-size:12px;line-height:1.7;padding:19px;color:var(--muted);border-radius:10px;background:var(--surface-raised)}\n.mission-actions{display:grid;gap:9px}\n.mission-action{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:43px;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:var(--surface-raised);color:var(--text);text-decoration:none;font-size:12px;font-weight:700}\n.mission-action:hover{border-color:var(--mission-accent);text-decoration:none}\n.mission-action span:last-child{color:var(--mission-accent);font-size:18px}\n.mission-footnote{margin:16px 0 0;padding-top:14px;border-top:1px solid var(--line);font-size:11px;line-height:1.7;color:var(--muted)}\n.mission-coverage{margin-top:15px;padding:15px;border:1px solid var(--line);border-radius:13px;background:var(--surface)}\n.mission-coverage header{display:flex;justify-content:space-between;gap:12px;font-size:11px;margin-bottom:9px}.mission-coverage header span{color:var(--muted)}\n.mission-progress{overflow:hidden;height:7px;border-radius:100px;background:var(--surface-raised)}.mission-progress span{display:block;width:0;height:100%;background:var(--mission-accent);border-radius:100px;transition:width .24s ease}\n.mission-last{margin-top:12px;color:var(--muted);font-size:10px}\n.mission-finance-source{margin-top:20px;min-width:0}.mission-finance-source>.mission-hub-bar{margin:0 0 14px}.mission-finance-source .mission-source-note{font-size:11px;color:var(--muted);line-height:1.65;margin-bottom:12px}\n.mission-return{display:inline-flex;align-items:center;gap:7px;min-height:41px;padding:10px 12px;margin-top:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface-raised);text-decoration:none;font-size:11px;font-weight:700;color:var(--text)}\n.mission-return:hover{text-decoration:none;border-color:var(--mission-accent)}\n.command-center .command-center-head{padding:22px 25px;margin-bottom:14px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(115deg,rgba(65,115,226,.11),transparent 62%),var(--surface)}\n.command-center .command-center-head h2{font-size:29px}\n.command-center .command-metric{position:relative;overflow:hidden;border-radius:16px;padding:19px;background:linear-gradient(146deg,rgba(55,135,255,.055),transparent 65%),var(--surface)}\n.command-center .command-metric:after{content:\"\";position:absolute;inset:auto 0 0;height:2px;background:linear-gradient(90deg,transparent,var(--accent,#3ba6d0),transparent);opacity:.5}\n.command-center .agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}\n.command-center .agent-card{position:relative;overflow:hidden;min-height:150px;border-radius:15px;transition:transform .18s ease,border-color .18s ease}\n.command-center .agent-card:hover{transform:translateY(-2px);border-color:var(--accent,#3ba6d0)}\n.command-center .agent-card[data-mission-accent=finance]{border-top:2px solid #46e5aa}\n.command-center .agent-card[data-mission-accent=ads]{border-top:2px solid #f9a14e}\n.command-center .agent-card[data-mission-accent=products]{border-top:2px solid #4b9fff}\n.command-center .agent-card[data-mission-accent=production]{border-top:2px solid #b28aff}\n.command-center .agent-card[data-mission-accent=returns]{border-top:2px solid #fa6f99}\n.command-center .agent-card[data-mission-accent=auditor]{border-top:2px solid #3bd1e8}\n.command-center .agent-card .mission-card-link{display:block;margin-top:auto;padding-top:11px;font-size:11px;font-weight:800;color:var(--accent,#3ba6d0)}\n.command-center .agent-card-expenses,.command-center .agent-card-secondary{display:none}\n.command-center .command-center-grid{grid-template-columns:minmax(0,.9fr) minmax(0,2.1fr);gap:15px}\n.command-center .command-pending-detail{display:none}\n.mission-hero .mission-intro-status{display:flex;flex-direction:column;align-items:flex-end;gap:8px}\n.mission-app-breadcrumb{font-size:11px;color:var(--muted)}\n@media(max-width:1230px){.mission-hub-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mission-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.command-center .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.command-center .command-center-grid{grid-template-columns:1fr}}\n@media(max-width:850px){.mission-hero{padding:22px}.mission-orb{width:56px;height:56px;flex-basis:56px;border-radius:16px;font-size:29px}.mission-hero .mission-intro-status{align-items:flex-start}.mission-hero{align-items:flex-start;flex-direction:column}.mission-panels{grid-template-columns:minmax(0,1fr)}.mission-hub-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.command-center .command-center-head{padding:17px}.command-center .command-center-head h2{font-size:23px}}\n@media(max-width:550px){.mission-hub-grid,.mission-stats{grid-template-columns:1fr}.mission-hub-card{min-height:148px}.mission-hero-main{gap:12px}.mission-stat small{min-height:0}.mission-hub-card p{min-height:0}.command-center .agent-grid{grid-template-columns:1fr}.command-center .command-metric strong{font-size:19px}.mission-module{padding:16px}.mission-crumb{margin-bottom:12px}}\n@media(prefers-reduced-motion:reduce){.mission-hub-card,.command-center .agent-card,.mission-progress span{transition:none}.mission-hub-card:hover,.command-center .agent-card:hover{transform:none}}\n\n/* Keep accent labels readable in the light theme without changing existing theme variables. */\n:root[data-theme=light] .mission-agent--finance{--mission-accent:#067d58;--mission-rgb:6,125,88}\n:root[data-theme=light] .mission-agent--ads{--mission-accent:#a9520e;--mission-rgb:169,82,14}\n:root[data-theme=light] .mission-agent--products{--mission-accent:#185bbb;--mission-rgb:24,91,187}\n:root[data-theme=light] .mission-agent--production{--mission-accent:#7045b5;--mission-rgb:112,69,181}\n:root[data-theme=light] .mission-agent--returns{--mission-accent:#b32959;--mission-rgb:179,41,89}\n:root[data-theme=light] .mission-agent--auditor{--mission-accent:#097f91;--mission-rgb:9,127,145}\n:root[data-theme=light] .mission-agent--hermes{--mission-accent:#315fc1;--mission-rgb:49,95,193}\n.command-center .agent-card h4{font-size:14px}\n.command-center .agent-card p,.command-center .command-priority span{font-size:11px}\n:root[data-active-panel=overview] .workspace>.hero,:root[data-active-panel=agents] .workspace>.hero,:root[data-active-panel^=\"agent-\"] .workspace>.hero{display:none}\n"+String.raw`
/* Mission Control V2 — visual fidelity to the approved sci-fi command cockpit.
   Static art is decorative; bars and labels are hydrated from verified snapshots. */
.mission-dashboard,.mission-hub,.mission-workspace{
 --mc-ink:#f2f8ff;--mc-soft:#b1c6e5;--mc-border:rgba(105,167,255,.23);
 --mc-glass:rgba(7,21,44,.9);--mc-shell:#061329;--mc-blue:#54b4ff;
 color:var(--mc-ink);
}
.mission-dashboard{max-width:1530px;margin:0 auto 30px}
:root[data-theme=dark] .app-shell{background:#060f23}
:root[data-theme=dark] .workspace{background:radial-gradient(ellipse 66% 43% at 84% -9%,rgba(48,83,195,.12),transparent 79%),#060f23}
:root[data-theme=dark] .sidebar{background:linear-gradient(180deg,#071530 0%,#070f21 83%);border-right:1px solid rgba(112,160,248,.17)}
:root[data-theme=dark] .topbar{background:linear-gradient(90deg,#08162e,#07111f);border-bottom:1px solid rgba(112,160,248,.19);box-shadow:0 1px 0 rgba(71,152,255,.08)}
:root[data-theme=dark] .workspace-nav .workspace-nav-link.active{background:linear-gradient(100deg,rgba(28,95,211,.30),rgba(12,65,126,.13));border:1px solid rgba(71,147,255,.54);box-shadow:inset 3px 0 #4da4ff,0 5px 18px rgba(23,103,216,.12);color:#f3f8ff}
:root[data-theme=dark] .workspace-nav .workspace-nav-link:hover{color:#fff;background:rgba(51,119,226,.16)}
:root[data-theme=dark] .workspace-context .brand-mark,
:root[data-theme=dark] .sidebar .brand-mark{background:linear-gradient(140deg,#2d83ff,#79f8f9);box-shadow:0 0 28px rgba(53,152,247,.28);color:#071c34}
.mission-dashboard .command-center-head.mission-command-hero{
 position:relative;isolation:isolate;display:flex;min-height:212px;align-items:center;overflow:hidden;
 padding:26px 34px;gap:18px;border-radius:22px;border:1px solid rgba(103,168,255,.42);
 background:radial-gradient(circle at 80% 48%,rgba(30,141,244,.24),transparent 30%),radial-gradient(circle at 57% 19%,rgba(101,67,243,.19),transparent 36%),linear-gradient(115deg,#0a2454 0%,#081a3f 54%,#07162c 100%);
 box-shadow:inset 0 1px rgba(162,213,255,.2),inset 0 -2px rgba(49,117,236,.1),0 18px 45px rgba(2,12,38,.20);
}
.mission-dashboard .command-center-head.mission-command-hero:before{
 content:"";position:absolute;z-index:-1;inset:0;opacity:.45;
 background-image:linear-gradient(90deg,rgba(81,138,233,.11) 1px,transparent 1px),linear-gradient(rgba(81,138,233,.10) 1px,transparent 1px);
 background-size:38px 38px;mask-image:linear-gradient(90deg,transparent 27%,#000);
}
.mission-dashboard .command-center-head.mission-command-hero:after{
 content:"";position:absolute;inset:auto 0 0;height:2px;
 background:linear-gradient(90deg,transparent 2%,#36c8ff 26%,#825cff 58%,#21f5ba 83%,transparent);
 box-shadow:0 0 17px rgba(59,168,255,.7);
}
.mission-overview-copy{position:relative;z-index:2;max-width:610px}
.mission-dashboard .command-center-head .mission-overview-copy .eyebrow{font-size:10px;color:#74d6ff;font-weight:800;letter-spacing:.24em}
.mission-dashboard .command-center-head .mission-overview-copy h2{margin:9px 0 7px;font-size:clamp(28px,3.2vw,41px);line-height:1.12;letter-spacing:-1.15px;color:#fff;text-shadow:0 5px 28px rgba(0,11,34,.45)}
.mission-dashboard .command-center-head .mission-overview-copy p{font-size:12px;line-height:1.75;max-width:510px;color:#c5d7f5}
.mission-overview-cta{
 display:inline-flex;align-items:center;gap:10px;min-height:40px;margin-top:17px;padding:8px 17px;
 border-radius:12px;border:1px solid rgba(107,218,255,.57);color:#ecfbff!important;
 background:linear-gradient(115deg,rgba(20,117,226,.45),rgba(29,82,171,.55));
 text-decoration:none;font-size:11px;font-weight:800;box-shadow:0 6px 23px rgba(7,112,245,.18)
}
.mission-overview-cta:hover{background:linear-gradient(115deg,#1b74d2,#2760b7);box-shadow:0 4px 25px rgba(39,154,255,.40);text-decoration:none}
.mission-overview-cta:focus-visible{outline:3px solid #8fe6ff;outline-offset:3px}
.mission-command-orbit{position:absolute;z-index:1;right:52px;top:50%;width:258px;height:258px;transform:translateY(-50%);pointer-events:none}
.mission-command-orbit:before,.mission-command-orbit:after{content:"";position:absolute;inset:15px;border:1px solid rgba(118,190,255,.25);border-radius:50%;box-shadow:0 0 38px rgba(34,115,241,.10)}
.mission-command-orbit:after{inset:36px;border-style:dashed;border-color:rgba(145,117,255,.34)}
.mission-orbit-core{position:absolute;left:50%;top:50%;display:block;width:138px;height:138px;transform:translate(-50%,-50%);border-radius:50%;
 border:1px solid rgba(119,204,255,.65);
 background:radial-gradient(ellipse at 32% 25%,rgba(151,235,255,.9),rgba(39,116,239,.64) 18%,rgba(23,39,127,.9) 46%,#071532 72%);
 box-shadow:0 0 0 14px rgba(24,92,194,.08),0 0 45px rgba(60,148,255,.64),inset 0 0 29px rgba(101,193,255,.6)}
.mission-orbit-core:before{content:"";position:absolute;inset:28px 19px 31px;border:2px solid rgba(193,240,255,.74);border-radius:28px;background:linear-gradient(130deg,rgba(14,58,132,.94),rgba(35,60,156,.61));box-shadow:inset 0 0 25px rgba(52,168,255,.56)}
.mission-orbit-core:after{content:"●     ●";position:absolute;left:0;right:0;top:46px;font-size:20px;letter-spacing:1px;text-align:center;color:#94efff;text-shadow:0 0 13px #5bccff}
.mission-satellite{position:absolute;display:grid;place-items:center;width:28px;height:28px;color:#c9f7ff;font-size:16px;font-weight:800;border-radius:50%;border:1px solid rgba(96,210,255,.61);background:#0b2354;box-shadow:0 0 16px rgba(38,135,255,.3)}
.mission-satellite--one{top:17px;left:52px}.mission-satellite--two{top:48px;right:13px;color:#81ffd1;border-color:#3fe2b5}.mission-satellite--three{bottom:22px;right:48px;color:#c2a5ff;border-color:#9a6dff}.mission-satellite--four{bottom:31px;left:14px;color:#ffb982;border-color:#f4a45e}
.mission-dashboard .command-center-head .command-center-mode{position:absolute;z-index:3;right:25px;top:20px;border-color:rgba(78,225,191,.37);background:rgba(5,25,50,.74);color:#d0fdec}
.mission-dashboard .command-center-metrics{gap:13px;margin-bottom:18px}
.mission-dashboard .command-metric{
 --metric-rgb:64,160,255;--metric-accent:#59b1ff;
 position:relative;isolation:isolate;overflow:hidden;min-height:110px;border-radius:17px;padding:17px 18px;
 border:1px solid rgba(var(--metric-rgb),.31);
 background:radial-gradient(circle at 93% 83%,rgba(var(--metric-rgb),.2),transparent 60%),linear-gradient(150deg,rgba(10,31,60,.94),rgba(8,19,38,.97));
 box-shadow:inset 0 1px rgba(158,210,255,.055),0 8px 22px rgba(1,9,27,.12)
}
.mission-dashboard .command-metric:after{inset:auto 0 0;height:2px;opacity:1;background:linear-gradient(90deg,transparent,rgba(var(--metric-rgb),.95),transparent);box-shadow:0 0 16px rgba(var(--metric-rgb),.30)}
.mission-dashboard .command-metric:before{position:absolute;right:13px;top:12px;width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(var(--metric-rgb),.30);border-radius:12px;background:rgba(var(--metric-rgb),.09);color:var(--metric-accent);font-size:17px}
.mission-dashboard .command-metric[data-mission-metric=net]{--metric-rgb:41,235,173;--metric-accent:#42f1bc}
.mission-dashboard .command-metric[data-mission-metric=sales]{--metric-rgb:77,160,255;--metric-accent:#81b6ff}
.mission-dashboard .command-metric[data-mission-metric=ads]{--metric-rgb:255,153,70;--metric-accent:#ffb173}
.mission-dashboard .command-metric[data-mission-metric=margin]{--metric-rgb:177,125,255;--metric-accent:#c1a3ff}
.mission-dashboard .command-metric[data-mission-metric=paid]{--metric-rgb:68,214,240;--metric-accent:#67e3fa}
.mission-dashboard .command-metric[data-mission-metric=alerts]{--metric-rgb:255,105,142;--metric-accent:#ff9ab4}
.mission-dashboard .command-metric[data-mission-metric=net]:before{content:"◆"}
.mission-dashboard .command-metric[data-mission-metric=sales]:before{content:"↗"}
.mission-dashboard .command-metric[data-mission-metric=ads]:before{content:"⌁"}
.mission-dashboard .command-metric[data-mission-metric=margin]:before{content:"◉"}
.mission-dashboard .command-metric[data-mission-metric=paid]:before{content:"▣"}
.mission-dashboard .command-metric[data-mission-metric=alerts]:before{content:"!"}
.mission-dashboard .command-metric small{font-size:11px;color:#bbcee9;max-width:calc(100% - 39px)}
.mission-dashboard .command-metric strong{font-size:clamp(19px,1.8vw,26px);color:#fff;text-shadow:0 0 21px rgba(var(--metric-rgb),.18)}
.mission-dashboard .command-metric span{font-size:10px;color:#93accb;line-height:1.45}
.mission-dashboard .command-center-grid{grid-template-columns:minmax(0,.95fr) minmax(0,2.05fr);gap:15px}
.mission-dashboard .hermes-command{
 position:relative;isolation:isolate;overflow:hidden;padding:23px;border-radius:19px;
 border:1px solid rgba(122,110,255,.42);
 background:radial-gradient(circle at 100% 0%,rgba(82,75,213,.3),transparent 42%),linear-gradient(156deg,#101d44,#08172e 72%);
 box-shadow:0 10px 28px rgba(0,6,25,.14),inset 0 1px rgba(157,164,255,.1)
}
.mission-dashboard .hermes-command:before{content:"✦";display:grid;place-items:center;float:right;width:53px;height:53px;margin:0 0 10px 16px;font-size:29px;color:#d6baff;border-radius:17px;border:1px solid rgba(152,137,255,.55);background:radial-gradient(circle,rgba(151,109,255,.45),rgba(40,33,124,.55));box-shadow:0 0 25px rgba(111,102,246,.26)}
.mission-dashboard .hermes-command h3{font-size:22px;color:#fff;text-shadow:0 0 16px rgba(159,147,255,.14)}
.mission-dashboard .hermes-command .eyebrow{color:#a9a8ff}
.mission-dashboard .hermes-command p,.mission-dashboard .hermes-command-foot{color:#b3c3e0;font-size:11px;line-height:1.75}
.mission-dashboard .hermes-command-summary{border-radius:13px;background:linear-gradient(120deg,rgba(86,68,194,.23),rgba(7,28,53,.7));border:1px solid rgba(138,143,251,.19)}
.mission-dashboard .hermes-command .command-priority{border-left:3px solid #ffb65b;background:rgba(10,24,49,.86);border-top:1px solid rgba(122,165,230,.16);border-right:1px solid rgba(122,165,230,.16);border-bottom:1px solid rgba(122,165,230,.16);border-radius:11px}
.mission-dashboard .hermes-command-foot a{color:#9adfff}
.mission-dashboard .agent-panel-head h3{font-size:19px;color:#f7fbff}
.mission-dashboard .agent-panel-head p{font-size:11px;color:#a7bfd9}
.mission-dashboard .agent-panel-head .mission-fleet-link{display:inline-flex;gap:7px;align-items:center;white-space:nowrap;padding:8px 11px;border:1px solid rgba(108,190,255,.42);border-radius:10px;color:#a7e4ff;text-decoration:none;font-size:10px;font-weight:800;background:rgba(34,94,164,.17)}
.mission-dashboard .agent-grid{gap:15px;grid-template-columns:repeat(3,minmax(0,1fr))}
.mission-dashboard .agent-card{
 --mission-rgb:78,168,255;--mission-accent:#58afff;
 min-height:251px;padding:19px 19px 17px;gap:7px;position:relative;isolation:isolate;overflow:hidden;
 border:1px solid rgba(var(--mission-rgb),.44);border-radius:18px;
 background:radial-gradient(circle at 85% 15%,rgba(var(--mission-rgb),.21),transparent 54%),linear-gradient(145deg,#101d37,#07152c 86%);
 box-shadow:inset 0 1px rgba(var(--mission-rgb),.10),0 12px 25px rgba(0,5,24,.16);color:#ecf5ff;
 transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease
}
.mission-dashboard .agent-card[data-mission-accent=finance]{--mission-rgb:51,227,161;--mission-accent:#41e9ad}
.mission-dashboard .agent-card[data-mission-accent=ads]{--mission-rgb:255,158,69;--mission-accent:#ffb26d}
.mission-dashboard .agent-card[data-mission-accent=products]{--mission-rgb:79,152,255;--mission-accent:#7db8ff}
.mission-dashboard .agent-card[data-mission-accent=production]{--mission-rgb:182,120,255;--mission-accent:#c9a7ff}
.mission-dashboard .agent-card[data-mission-accent=returns]{--mission-rgb:249,94,143;--mission-accent:#ff91b0}
.mission-dashboard .agent-card[data-mission-accent=auditor]{--mission-rgb:35,216,228;--mission-accent:#75eff7}
.mission-dashboard .agent-card:before{
 content:"●   ●";position:relative;display:grid;place-items:center;width:67px;height:67px;flex:0 0 67px;
 border:1px solid rgba(var(--mission-rgb),.78);border-radius:23px;color:#eaffff;font-size:21px;
 letter-spacing:3px;text-shadow:0 0 9px var(--mission-accent);
 background:radial-gradient(circle at 40% 15%,rgba(var(--mission-rgb),.46),rgba(var(--mission-rgb),.11) 52%,#07142f 83%);
 box-shadow:0 0 0 7px rgba(var(--mission-rgb),.08),0 0 31px rgba(var(--mission-rgb),.33),inset 0 0 20px rgba(var(--mission-rgb),.18);
}
.mission-dashboard .agent-card:hover{transform:translateY(-4px);border-color:rgba(var(--mission-rgb),.85);box-shadow:0 13px 30px rgba(0,6,26,.3),0 0 25px rgba(var(--mission-rgb),.19)}
.mission-dashboard .agent-card .agent-card-head{gap:7px;min-width:0;align-items:flex-start}
.mission-dashboard .agent-card h4{font-size:16px;color:#fff}
.mission-dashboard .agent-card small{font-size:10px;color:#b9cbe0}
.mission-dashboard .agent-card p{color:#afc4de;font-size:10.5px;line-height:1.58;margin:3px 0}
.mission-dashboard .agent-card .agent-card-metric{margin-top:auto;font-size:16px;font-weight:800;color:var(--mission-accent)}
.mission-dashboard .agent-card .mission-card-link{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;margin-top:auto;border-radius:10px;border:1px solid rgba(var(--mission-rgb),.45);background:linear-gradient(100deg,rgba(var(--mission-rgb),.18),rgba(var(--mission-rgb),.07));color:#e9f8ff;font-size:11px}
.mission-dashboard .agent-card .mission-card-link:after{content:"↗";color:var(--mission-accent);font-size:16px}
.mission-dashboard .agent-card .agent-status{border:1px solid rgba(var(--mission-rgb),.19);background:rgba(var(--mission-rgb),.11);color:#e0edf9}
.mission-dashboard .agent-card .agent-status[data-status=ATTENTION]{border-color:rgba(255,188,71,.35);background:rgba(255,179,61,.13);color:#ffdc9d}
.mission-dashboard .agent-card .agent-status[data-status=BLOCKED]{border-color:rgba(255,105,142,.4);color:#ffafc0}
.mission-dashboard .agent-card .agent-card-secondary,.mission-dashboard .agent-card .agent-card-expenses{display:none}
.mission-day-intelligence{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:15px;margin-top:20px}
.mission-data-panel{position:relative;min-width:0;border-radius:18px;padding:22px;border:1px solid rgba(99,164,255,.24);background:radial-gradient(circle at 90% 3%,rgba(52,115,241,.16),transparent 48%),linear-gradient(140deg,#0b1d39,#071429);color:#f0f7ff;overflow:hidden}
.mission-data-panel h3{margin:2px 0 3px;font-size:16px;color:#fff}.mission-data-panel p{color:#a1b7d3;font-size:10px;line-height:1.6;margin:0 0 17px}
.mission-panel-eyebrow{font-size:9px;font-weight:900;letter-spacing:.2em;color:#70d7ff}
.mission-comparison-bars{display:grid;gap:17px}.mission-comparison-row{min-width:0}
.mission-comparison-row header{display:flex;justify-content:space-between;gap:12px;align-items:baseline;font-size:11px;margin-bottom:8px}.mission-comparison-row header span{color:#aac2de}.mission-comparison-row header strong{color:#eff9ff;font-size:13px;font-variant-numeric:tabular-nums}
.mission-comparison-track{height:14px;border:1px solid rgba(116,173,255,.12);border-radius:100px;background:rgba(2,13,33,.73);overflow:hidden}
.mission-comparison-track span{display:block;height:100%;width:0;border-radius:100px;background:linear-gradient(90deg,#1f73df,#77c0ff);box-shadow:0 0 16px rgba(87,155,255,.55);transition:width .3s ease}
.mission-comparison-row[data-visual=sales] .mission-comparison-track span{background:linear-gradient(90deg,#2464ee,#64b4ff)}
.mission-comparison-row[data-visual=net] .mission-comparison-track span{background:linear-gradient(90deg,#028c72,#40edb7)}
.mission-comparison-row[data-visual=ads] .mission-comparison-track span{background:linear-gradient(90deg,#a66013,#ffa856)}
.mission-comparison-foot{margin-top:14px!important;font-size:9px!important}
.mission-health-overview{display:flex;align-items:center;gap:23px;margin:12px 0 14px}
.mission-health-ring{display:grid;place-items:center;width:126px;height:126px;flex:0 0 126px;border-radius:50%;border:1px solid rgba(115,205,255,.2);background:conic-gradient(#30e2af var(--mission-health-pct,0%),rgba(42,82,150,.22) 0);box-shadow:0 0 29px rgba(42,171,226,.12)}
.mission-health-ring:before{content:"";grid-area:1/1;width:103px;height:103px;border-radius:50%;background:#081831}
.mission-health-ring strong{grid-area:1/1;z-index:1;font-size:23px;color:#fff}
.mission-health-caption{font-size:12px;line-height:1.7;color:#c5d5ed}
.mission-health-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mission-health-list div{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;padding:11px;border:1px solid rgba(110,167,255,.16);border-radius:11px;background:rgba(17,38,74,.45);font-size:10px;color:#b8cde9}
.mission-health-list strong{font-size:14px;color:#fff}
.mission-health-list div:before{content:"";display:block;width:7px;height:7px;flex:0 0 7px;border-radius:100px;background:var(--mission-dot,#6ba5ff)}
.mission-health-list [data-health=HEALTHY]{--mission-dot:#36e7b0}.mission-health-list [data-health=WORKING]{--mission-dot:#6fb5ff}.mission-health-list [data-health=ATTENTION]{--mission-dot:#ffba57}.mission-health-list [data-health=BLOCKED]{--mission-dot:#ff6e98}
.mission-dashboard .command-center-note{margin-top:14px;color:#8aa4c3;font-size:10px}
.mission-hub,.mission-workspace{--mc-glass:#081b37}
.mission-hub .mission-hero,.mission-workspace .mission-hero{border-color:rgba(var(--mission-rgb),.5);background:radial-gradient(circle at 92% 35%,rgba(var(--mission-rgb),.20),transparent 39%),linear-gradient(112deg,#0d2149,#071831 85%);box-shadow:0 15px 35px rgba(0,5,25,.13)}
.mission-hub .mission-hub-hero{min-height:175px}
.mission-hub .mission-hub-hero .mission-orb{--mission-rgb:120,169,255}
.mission-hub-card{min-height:245px;gap:13px;padding:23px;border:1px solid rgba(var(--mission-rgb),.43);border-radius:21px;background:radial-gradient(circle at 86% 8%,rgba(var(--mission-rgb),.21),transparent 51%),linear-gradient(148deg,#0c2348,#061529 87%);box-shadow:inset 0 1px rgba(var(--mission-rgb),.15),0 10px 25px rgba(0,5,29,.11)}
.mission-hub-card:hover{transform:translateY(-4px);box-shadow:0 15px 36px rgba(0,5,29,.25),0 0 26px rgba(var(--mission-rgb),.20);border-color:rgba(var(--mission-rgb),.85)}
.mission-hub-card h4{font-size:17px;color:#fff}.mission-hub-card p{color:#b4c8df;font-size:11px}
.mission-mini-orb.mission-agent-avatar,.mission-orb.mission-agent-avatar{position:relative;isolation:isolate;display:grid;place-items:center;overflow:visible;width:78px;height:78px;flex:0 0 78px;border-radius:25px;border:1px solid rgba(var(--mission-rgb),.74);font-size:0;background:radial-gradient(circle at 38% 22%,rgba(var(--mission-rgb),.55),rgba(var(--mission-rgb),.10) 60%,#071a37 94%);box-shadow:0 0 0 7px rgba(var(--mission-rgb),.08),0 0 35px rgba(var(--mission-rgb),.29),inset 0 0 27px rgba(var(--mission-rgb),.18)}
.mission-agent-avatar:before{content:"";position:absolute;inset:17px 15px 21px;border:2px solid rgba(var(--mission-rgb),.85);border-radius:14px 14px 16px 16px;background:linear-gradient(145deg,rgba(var(--mission-rgb),.38),rgba(8,25,53,.67));box-shadow:0 0 22px rgba(var(--mission-rgb),.24),inset 0 0 15px rgba(var(--mission-rgb),.2)}
.mission-agent-avatar:after{content:"●  ●";position:absolute;top:28px;left:0;right:0;font-size:15px;letter-spacing:4px;text-align:center;color:#efffff;text-shadow:0 0 10px var(--mission-accent)}
.mission-orb.mission-agent-avatar{width:112px;height:112px;flex-basis:112px;border-radius:34px}
.mission-orb.mission-agent-avatar:before{inset:26px 19px 29px;border-radius:19px}.mission-orb.mission-agent-avatar:after{top:41px;font-size:21px}
.mission-workspace .mission-hero h2{font-size:clamp(28px,3vw,38px);color:#fff}
.mission-workspace .mission-hero p{font-size:12px;color:#bfd1e9}
.mission-workspace .mission-eyebrow{color:var(--mission-accent)}
.mission-workspace .mission-breadcrumb-pill,.mission-hub .mission-breadcrumb-pill{background:rgba(11,28,57,.75);color:#b9cceb;border-color:rgba(120,166,230,.28)}
.mission-workspace .mission-stats{gap:14px;margin:20px 0}
.mission-workspace .mission-stat{min-height:112px;background:radial-gradient(circle at 100% 0%,rgba(var(--mission-rgb),.18),transparent 58%),linear-gradient(145deg,#0a1b37,#071429);border-color:rgba(var(--mission-rgb),.35);box-shadow:inset 0 1px rgba(var(--mission-rgb),.13)}
.mission-workspace .mission-stat:before{width:75%;height:2px;background:linear-gradient(90deg,var(--mission-accent),transparent)}
.mission-workspace .mission-stat small{color:#b6cbe5;font-size:11px}.mission-workspace .mission-stat strong{color:#fff;font-size:clamp(20px,2vw,28px)}.mission-workspace .mission-stat span{color:#a7bbd4}
.mission-workspace .mission-module{background:linear-gradient(140deg,#0a1c39,#07152b);border-color:rgba(var(--mission-rgb),.31);border-radius:19px;padding:24px}
.mission-workspace .mission-module-head h3{font-size:17px;color:#fff}.mission-workspace .mission-module-head small{color:#b3cae8}
.mission-workspace .mission-task{background:rgba(11,29,57,.75);border-color:rgba(var(--mission-rgb),.22);border-left:3px solid var(--mission-accent);color:#e6f3ff}
.mission-workspace .mission-task strong{color:#fff}.mission-workspace .mission-task p,.mission-workspace .mission-footnote{color:#b5cce7}
.mission-workspace .mission-action{background:linear-gradient(105deg,rgba(var(--mission-rgb),.15),rgba(8,20,45,.8));border-color:rgba(var(--mission-rgb),.35);color:#eaf6ff}
.mission-workspace .mission-action:hover{border-color:var(--mission-accent);box-shadow:0 0 17px rgba(var(--mission-rgb),.14)}
.mission-workspace .mission-last,.mission-workspace .mission-return{color:#b0c8e4}
.mission-workspace .mission-empty{background:#0a1a33;color:#b0c6e1}
.mission-workspace .mission-page-tabs{display:flex;flex-wrap:wrap;gap:9px;margin:17px 0}
.mission-page-tabs a{display:inline-flex;align-items:center;min-height:37px;padding:7px 13px;border-radius:10px;border:1px solid rgba(var(--mission-rgb),.35);background:rgba(var(--mission-rgb),.10);color:var(--mission-accent);font-size:11px;text-decoration:none;font-weight:800}
.mission-page-tabs a:hover{border-color:var(--mission-accent);background:rgba(var(--mission-rgb),.20)}
.mission-workspace .mission-finance-source{padding:19px;border-radius:16px;border:1px solid rgba(51,227,161,.25);background:#08182f}
:root[data-theme=light] .mission-dashboard,:root[data-theme=light] .mission-hub,:root[data-theme=light] .mission-workspace{--mc-ink:#17334b;--mc-soft:#52647b;--mc-border:rgba(73,132,207,.24);--mc-glass:#fff;color:var(--mc-ink)}
:root[data-theme=light] .mission-dashboard .command-center-head.mission-command-hero{background:radial-gradient(circle at 83% 45%,rgba(76,164,255,.14),transparent 35%),linear-gradient(118deg,#173d7d,#0c2754);color:#fff}
:root[data-theme=light] .mission-dashboard .command-metric{background:radial-gradient(circle at 92% 73%,rgba(var(--metric-rgb),.17),transparent 55%),#fff;box-shadow:0 7px 22px rgba(37,66,126,.06)}
:root[data-theme=light] .mission-dashboard .command-metric strong{color:#142b46}
:root[data-theme=light] .mission-dashboard .command-metric small{color:#58708a}
:root[data-theme=light] .mission-dashboard .command-metric span{color:#7b8fa7}
:root[data-theme=light] .mission-dashboard .hermes-command{background:linear-gradient(155deg,#f0f4ff,#fff);box-shadow:0 9px 22px rgba(37,66,126,.07)}
:root[data-theme=light] .mission-dashboard .hermes-command h3,:root[data-theme=light] .mission-dashboard .agent-card h4,:root[data-theme=light] .mission-dashboard .agent-panel-head h3{color:#17344e}
:root[data-theme=light] .mission-dashboard .hermes-command p,:root[data-theme=light] .mission-dashboard .hermes-command-foot,:root[data-theme=light] .mission-dashboard .agent-panel-head p{color:#52677d}
:root[data-theme=light] .mission-dashboard .hermes-command-summary{background:#e9effe;color:#233b63}
:root[data-theme=light] .mission-dashboard .hermes-command .command-priority{background:#f8fbff}
:root[data-theme=light] .mission-dashboard .agent-card{background:radial-gradient(circle at 90% 0%,rgba(var(--mission-rgb),.12),transparent 55%),#fff;color:#1d344d;box-shadow:0 9px 26px rgba(31,73,125,.05)}
:root[data-theme=light] .mission-dashboard .agent-card p,:root[data-theme=light] .mission-dashboard .agent-card small{color:#556d82}
:root[data-theme=light] .mission-dashboard .agent-card .agent-card-metric{color:#17344e}
:root[data-theme=light] .mission-dashboard .agent-card .mission-card-link{color:#123f62}
:root[data-theme=light] .mission-dashboard .agent-card .agent-status{background:rgba(var(--mission-rgb),.12);border-color:rgba(var(--mission-rgb),.34);color:#23465c}
:root[data-theme=light] .mission-dashboard .agent-card .agent-status[data-status=HEALTHY]{color:#086c50}
:root[data-theme=light] .mission-dashboard .agent-card .agent-status[data-status=ATTENTION]{background:#fff3da;color:#8c550d;border-color:#dcac61}
:root[data-theme=light] .mission-dashboard .agent-card .agent-status[data-status=BLOCKED]{background:#fff0f4;color:#9a2452;border-color:#de9eb6}
:root[data-theme=light] .mission-dashboard .hermes-command .agent-status{color:#294865;background:#e6edfc}
:root[data-theme=light] .mission-dashboard .hermes-command-foot a{color:#165c99}
:root[data-theme=light] .mission-dashboard .agent-panel-head .mission-fleet-link{color:#195d92;background:#e8f3ff;border-color:#8ab7e1}
:root[data-theme=light] .mission-dashboard .command-center-note{color:#556c85}

:root[data-theme=light] .mission-data-panel{background:linear-gradient(120deg,#f1f6ff,#fff);color:#203b58}
:root[data-theme=light] .mission-data-panel h3,:root[data-theme=light] .mission-comparison-row header strong,:root[data-theme=light] .mission-health-list strong{color:#19344e}
:root[data-theme=light] .mission-data-panel p,:root[data-theme=light] .mission-comparison-row header span,:root[data-theme=light] .mission-health-caption,:root[data-theme=light] .mission-health-list div{color:#506987}
:root[data-theme=light] .mission-health-ring:before{background:#fff}
:root[data-theme=light] .mission-health-ring strong{color:#21425d}
:root[data-theme=light] .mission-health-list div{background:#f5f9ff}
:root[data-theme=light] .mission-hub-card,:root[data-theme=light] .mission-workspace .mission-stat,:root[data-theme=light] .mission-workspace .mission-module{background:radial-gradient(circle at 95% 0%,rgba(var(--mission-rgb),.10),transparent 55%),#fff;box-shadow:0 8px 24px rgba(36,76,135,.06)}
:root[data-theme=light] .mission-hub-card h4,:root[data-theme=light] .mission-workspace .mission-module-head h3,:root[data-theme=light] .mission-workspace .mission-stat strong{color:#1c3851}
:root[data-theme=light] .mission-hub-card p,:root[data-theme=light] .mission-workspace .mission-module-head small,:root[data-theme=light] .mission-workspace .mission-task p,:root[data-theme=light] .mission-workspace .mission-stat small,:root[data-theme=light] .mission-workspace .mission-stat span{color:#546c85}
:root[data-theme=light] .mission-workspace .mission-task,:root[data-theme=light] .mission-workspace .mission-action{background:#f5f9ff;color:#27415d}
:root[data-theme=light] .mission-workspace .mission-task strong{color:#193850}
:root[data-theme=light] .mission-workspace .mission-finance-source{background:#f5faff}
@media(max-width:1300px){.mission-dashboard .command-center-grid{grid-template-columns:minmax(0,.9fr) minmax(0,2fr)}.mission-command-orbit{right:5px;opacity:.75}.mission-dashboard .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mission-dashboard .agent-card{min-height:230px}}
@media(max-width:1050px){.mission-dashboard .command-center-grid{grid-template-columns:minmax(0,1fr)}.mission-dashboard .agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.mission-day-intelligence{grid-template-columns:1fr}.mission-command-orbit{right:10px;opacity:.6}}
@media(max-width:800px){.mission-dashboard .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mission-dashboard .command-center-head.mission-command-hero{padding:24px;min-height:225px}.mission-command-orbit{transform:translateY(-50%) scale(.73);right:-48px;opacity:.45}.mission-dashboard .command-center-head .mission-overview-copy{max-width:72%}.mission-dashboard .command-center-head .command-center-mode{top:12px;right:10px}}
@media(max-width:570px){.mission-dashboard .command-center-head.mission-command-hero{padding:24px 17px;min-height:205px}.mission-dashboard .command-center-head .mission-overview-copy{max-width:100%}.mission-command-orbit{display:none}.mission-dashboard .command-center-head .command-center-mode{position:relative;top:auto;right:auto;margin-top:12px;align-self:flex-start}.mission-dashboard .command-center-head.mission-command-hero{flex-direction:column;align-items:flex-start}.mission-dashboard .command-center-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.mission-dashboard .command-metric{padding:15px 13px;min-height:102px}.mission-dashboard .agent-grid{grid-template-columns:1fr}.mission-dashboard .agent-card{min-height:195px}.mission-dashboard .agent-card:before{width:55px;height:55px;flex-basis:55px}.mission-health-overview{gap:12px}.mission-health-ring{width:101px;height:101px;flex-basis:101px}.mission-health-ring:before{width:80px;height:80px}.mission-health-list{grid-template-columns:1fr}.mission-workspace .mission-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.mission-hub-card{min-height:205px}.mission-orb.mission-agent-avatar{width:70px;height:70px;flex-basis:70px}.mission-orb.mission-agent-avatar:before{inset:16px 12px 18px}.mission-orb.mission-agent-avatar:after{top:25px;font-size:16px}}
@media(prefers-reduced-motion:reduce){.mission-dashboard .agent-card,.mission-comparison-track span,.mission-hub-card{transition:none}.mission-dashboard .agent-card:hover,.mission-hub-card:hover{transform:none}}
/* V3 cockpit layout: information architecture, real sources and existing IDs unchanged */
@media(min-width:1250px){
 .mission-dashboard{display:grid;grid-template-columns:minmax(0,1fr) 280px;column-gap:14px;row-gap:12px;align-items:start}
 .mission-dashboard>.command-center-head{grid-column:1;grid-row:1;margin:0!important;min-height:0!important}
 .mission-dashboard>.command-center-metrics{grid-column:1;grid-row:2;grid-template-columns:repeat(3,minmax(0,1fr));margin:0}
 .mission-dashboard>.command-center-grid{display:contents}
 .mission-dashboard>.command-center-grid>.hermes-command{grid-column:2;grid-row:1 / span 2;align-self:stretch}
 .mission-dashboard>.command-center-grid>.agent-panel{grid-column:1 / -1;grid-row:3}
 .mission-dashboard>.mission-trend-panel{grid-column:1 / -1;grid-row:4;margin:0}
 .mission-dashboard>.mission-day-intelligence{grid-column:1 / -1;grid-row:5}
 .mission-dashboard .agent-panel-head{margin-bottom:12px}
 .mission-dashboard .agent-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
 .mission-dashboard .agent-card{min-height:130px;padding:12px}
 .mission-dashboard .agent-card-head{display:flex;flex-direction:column;align-items:flex-start;gap:9px}
 .mission-dashboard .agent-card h4{font-size:12px}
 .mission-dashboard .agent-card .agent-status{font-size:9px}
 .mission-dashboard .agent-card p{line-height:1.4;font-size:10px}
 .mission-dashboard .agent-card .mission-card-link{font-size:10px}
 .mission-dashboard .hermes-command-summary{margin-top:12px}
 .mission-dashboard .hermes-command-head{gap:8px;flex-wrap:wrap}
 .mission-dashboard .hermes-command h3{font-size:19px}
 .mission-dashboard .hermes-command .command-priority{padding:8px}
 .mission-dashboard .mission-command-orbit{transform:scale(.7);transform-origin:right center}
}
@media(min-width:1250px) and (max-width:1450px){
 .mission-dashboard{grid-template-columns:minmax(0,1fr) 260px}
 .mission-dashboard .agent-card{padding:10px}
 .mission-dashboard .agent-grid{gap:8px}
}
@media(min-width:721px) and (max-width:1249px){
 .mission-dashboard .command-center-grid{grid-template-columns:1fr}
 .mission-dashboard .agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:720px){
 .mission-dashboard .command-center-head{padding:17px!important}
 .mission-dashboard .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .mission-dashboard .agent-card{min-height:125px;padding:12px}
 .mission-dashboard .hermes-command{padding:15px}
}
@media(max-width:390px){
 .mission-dashboard .agent-grid{grid-template-columns:minmax(0,1fr)}
}
.mission-dashboard .agent-card{isolation:isolate;box-shadow:inset 0 1px rgba(255,255,255,.035);border-color:rgba(112,162,225,.22);background:linear-gradient(145deg,rgba(var(--agent-rgb,65,135,245),.16),rgba(5,18,39,.95) 75%);transition:transform .17s ease,border-color .17s ease,box-shadow .17s ease}
.mission-dashboard .agent-card:hover{transform:translateY(-2px);border-color:var(--agent-color,#70bfff);box-shadow:0 0 23px rgba(var(--agent-rgb,65,135,245),.14)}
.mission-dashboard .agent-card[data-mission-accent=finance]{--agent-rgb:34,225,166;--agent-color:#30ebba}
.mission-dashboard .agent-card[data-mission-accent=ads]{--agent-rgb:255,152,36;--agent-color:#ffab53}
.mission-dashboard .agent-card[data-mission-accent=products]{--agent-rgb:52,146,255;--agent-color:#68b2ff}
.mission-dashboard .agent-card[data-mission-accent=production]{--agent-rgb:158,93,255;--agent-color:#c395ff}
.mission-dashboard .agent-card[data-mission-accent=returns]{--agent-rgb:255,65,108;--agent-color:#ff8d9d}
.mission-dashboard .agent-card[data-mission-accent=auditor]{--agent-rgb:16,208,233;--agent-color:#5ff6fd}
.mission-dashboard .agent-card .mission-card-link{color:var(--agent-color,#86c4ff)}
.mission-dashboard .agent-card-head:before{content:"✦";display:grid;place-items:center;width:39px;height:39px;border:1px solid rgba(var(--agent-rgb,65,135,245),.6);border-radius:13px;background:radial-gradient(circle,rgba(var(--agent-rgb,65,135,245),.43),rgba(var(--agent-rgb,65,135,245),.09));color:var(--agent-color,#86c4ff);font-size:21px;box-shadow:0 0 20px rgba(var(--agent-rgb,65,135,245),.2)}
.mission-dashboard .agent-card[data-mission-accent=finance] .agent-card-head:before{content:"▰"}
.mission-dashboard .agent-card[data-mission-accent=ads] .agent-card-head:before{content:"◎"}
.mission-dashboard .agent-card[data-mission-accent=products] .agent-card-head:before{content:"⬡"}
.mission-dashboard .agent-card[data-mission-accent=production] .agent-card-head:before{content:"▣"}
.mission-dashboard .agent-card[data-mission-accent=returns] .agent-card-head:before{content:"⬟"}
.mission-dashboard .agent-card[data-mission-accent=auditor] .agent-card-head:before{content:"◇"}
.mission-dashboard .command-center-metrics .command-metric{border-radius:14px}
.mission-dashboard .command-center-metrics .command-metric strong{font-variant-numeric:tabular-nums}
.mission-workspace .mission-page-tabs a:focus-visible,.mission-dashboard .agent-card:focus-visible{outline:3px solid #74cfff;outline-offset:3px}
:root[data-theme=light] .mission-dashboard .agent-card{background:linear-gradient(145deg,rgba(var(--agent-rgb,65,135,245),.10),rgba(255,255,255,.94) 85%);border-color:rgba(var(--agent-rgb,65,135,245),.27)}
:root[data-theme=light] .mission-dashboard .agent-card .mission-card-link{color:#18558a}


/* V3 density pass 2: approved screenshot refinements, strictly visual and responsive. */
@media(min-width:1250px){
 .mission-dashboard{grid-template-columns:minmax(0,1fr) 250px;row-gap:10px}
 .mission-dashboard>.command-center-head{min-height:0!important;height:auto!important;max-height:190px;padding:16px 20px!important}
 .mission-dashboard .mission-command-orbit{display:none}
 .mission-dashboard .mission-overview-copy{max-width:100%}
 .mission-dashboard .command-center-head h2{font-size:clamp(24px,2vw,30px);margin:5px 0}
 .mission-dashboard .command-center-head p{max-width:670px;line-height:1.35}
 .mission-dashboard .mission-overview-cta{margin-top:8px}
 .mission-dashboard>.command-center-metrics{gap:9px}
 .mission-dashboard .command-metric{min-height:100px;padding:12px}
 .mission-dashboard .command-metric strong{font-size:clamp(18px,1.45vw,23px)}
 .mission-dashboard .agent-grid{grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:8px}
 .mission-dashboard .agent-card{min-height:184px;padding:12px;gap:5px}
 .mission-dashboard .agent-card-head{display:flex;flex-direction:row;align-items:center;gap:7px;flex-wrap:wrap}
 .mission-dashboard .agent-card-head:before{display:none}
 .mission-dashboard .agent-card h4{font-size:12px}
 .mission-dashboard .agent-card p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;max-height:3em}
 .mission-dashboard .agent-card .agent-card-metric{margin-top:auto;font-size:13px}
 .mission-dashboard .agent-card .mission-card-link{padding-top:4px;margin-top:4px}
 .mission-dashboard .hermes-command{padding:14px;overflow:hidden}
 .mission-dashboard .hermes-command .command-priority{padding:7px 9px}
 .mission-dashboard .hermes-command .command-priority span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
}
@media(min-width:1250px) and (max-width:1500px){
 .mission-dashboard{grid-template-columns:minmax(0,1fr) 240px}
 .mission-dashboard .agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
 .mission-dashboard .agent-card{min-height:155px}
}
@media(min-width:1501px) and (max-width:1750px){
 .mission-dashboard .agent-card{min-height:190px;padding:10px}
}
@media(max-width:1249px){
 .mission-dashboard .agent-card-head:before{display:none}
 .mission-dashboard .agent-card{min-height:145px}
}
@media(max-width:720px){
 .mission-dashboard .mission-command-orbit{display:none}
 .mission-dashboard .command-center-head{min-height:0!important}
 .mission-dashboard .agent-card{min-height:135px}
}


/* V3 verified observer charts: categorical snapshots, NOT historical trend. */
.mission-evidence-panel{min-width:0;margin:14px 0 18px;padding:20px;border:1px solid rgba(var(--mission-rgb),.42);border-radius:17px;background:linear-gradient(140deg,rgba(var(--mission-rgb),.11),transparent 68%),var(--surface)}
.mission-evidence-panel>header{display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px}
.mission-evidence-panel h3{margin:4px 0 5px;font-size:17px}
.mission-evidence-panel header p{font-size:11px;color:var(--muted);margin:0 0 15px}
.mission-evidence-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.mission-evidence-row{min-width:0;border:1px solid var(--line);border-radius:12px;background:var(--surface-raised);padding:12px 14px}
.mission-evidence-heading{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:11px}
.mission-evidence-heading span{font-size:11px;color:var(--muted)}
.mission-evidence-heading strong{font-size:16px;font-variant-numeric:tabular-nums;white-space:nowrap}
.mission-evidence-track{height:8px;background:rgba(122,148,179,.15);overflow:hidden;border-radius:50px}
.mission-evidence-fill{display:block;height:100%;width:0;background:var(--mission-accent);border-radius:50px;transition:width .2s}
.mission-evidence-foot{font-size:10px;line-height:1.5;color:var(--muted);margin:12px 0 0}
@media(max-width:640px){.mission-evidence-list{grid-template-columns:1fr}.mission-evidence-panel{padding:14px}}
@media(prefers-reduced-motion:reduce){.mission-evidence-fill{transition:none}}


.mission-hub-search{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:0 0 15px}
.mission-hub-search label{font-size:11px;font-weight:700;color:var(--muted)}
.mission-hub-search input{min-width:220px;max-width:400px;flex:1;padding:10px 13px;border-radius:10px;border:1px solid var(--line);color:var(--text);background:var(--surface)}
.mission-hub-search input:focus-visible{outline:3px solid var(--mission-accent,#78a9ff);outline-offset:2px}
.mission-hub-search span{font-size:10px;color:var(--muted)}


/* Fix: Hermes content must never set the height of the executive KPI grid rows. */
@media(min-width:1250px){
 .mission-dashboard{grid-template-rows:auto auto auto auto auto;align-items:start}
 .mission-dashboard>.command-center-grid>.hermes-command{
  grid-column:2;grid-row:1 / span 2;align-self:start;min-height:0;
  max-height:360px;overflow:hidden;display:flex;flex-direction:column
 }
 .mission-dashboard .hermes-command .command-priorities{
  overflow:auto;min-height:0;max-height:195px;overscroll-behavior:contain;
  scrollbar-width:thin
 }
 .mission-dashboard .hermes-command .hermes-command-foot{flex-shrink:0;margin-top:auto}
 .mission-dashboard>.command-center-head{align-self:start}
 .mission-dashboard>.command-center-metrics{align-self:start}
 .mission-dashboard>.command-center-grid>.agent-panel{align-self:start}
}


/* Specialist evidence panels: comparable source labels, denominators and safe empty states. */
.mission-evidence-list{align-items:stretch}
.mission-evidence-row{display:flex;flex-direction:column;justify-content:center}
.mission-evidence-row strong{font-variant-numeric:tabular-nums}
.mission-evidence-ratio{display:block;margin-top:7px;font-size:10px;line-height:1.35;color:var(--muted)}
.mission-evidence-empty{grid-column:1/-1;margin:0;padding:12px;border-radius:10px;background:rgba(110,151,206,.09);color:var(--muted);font-size:11px}
.mission-evidence-panel .mission-evidence-foot{overflow-wrap:anywhere}
.mission-evidence-list[data-evidence-source=DTF_QUEUE] .mission-evidence-row{border-color:rgba(157,106,255,.28)}
.mission-evidence-list[data-evidence-source=CATALOG] .mission-evidence-row{border-color:rgba(94,168,253,.28)}
@media(min-width:1240px){.mission-evidence-list[data-evidence-source=DTF_QUEUE]{grid-template-columns:repeat(3,minmax(0,1fr))}}


/* V3.5 provenance belongs to the agent header, not buried under action lists. */
.mission-workspace .mission-source-provenance{display:block;margin:9px 0 0;font-size:10px;line-height:1.55;color:var(--mission-accent);max-width:720px}
.mission-workspace .mission-page-tabs{gap:7px;margin:10px 0 13px}
.mission-workspace .mission-page-tabs a{min-height:31px;padding:6px 10px;font-size:10px;white-space:normal}
.mission-workspace .mission-hero-main{align-items:center}
.mission-workspace .mission-module-head{margin-bottom:11px}
.mission-workspace .mission-module-head small{font-size:10px;line-height:1.35}
@media(max-width:550px){.mission-workspace .mission-page-tabs{flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain;padding-bottom:4px}.mission-workspace .mission-page-tabs a{flex:0 0 auto}.mission-workspace .mission-source-provenance{font-size:10px}}

`;

export const MISSION_AGENTS=Object.freeze([
 {id:'finance',name:'MLS Finance',area:'Financeiro',symbol:'◆',summary:'Repasses, Pending, despesas e conciliação por pedido.',tag:'Conciliação e resultado',actions:[['Resumo diário e mensal','#businessMonth'],['Pending atual por pedido','#commandPendingIncomeDetails'],['Despesas e vencimentos','#businessMonthExpensesDetails']]},
 {id:'ads',name:'MLS Ads',area:'Anúncios',symbol:'↗',summary:'Investimento, desempenho e oportunidades, sem executar campanhas.',tag:'Investimento e desempenho',actions:[['Abrir Anúncios','/dashboard'],['Ver campanhas','/campaigns'],['Ver oportunidades','/optimization']]},
 {id:'products',name:'MLS Products',area:'Produtos',symbol:'⬡',summary:'Catálogo, custos conhecidos e cobertura das unidades vendidas.',tag:'Produtos e margens',actions:[['Abrir catálogo','/admin?tab=products'],['Custos e regras','/admin?tab=margins'],['Curva ABC e cenário de preço · M3','/admin?tab=agent-finance#businessMonthPricingObserver'],['Produção DTF','/admin?tab=production']]},
 {id:'production',name:'MLS Production',area:'Produção',symbol:'▣',summary:'Pedidos, artes, montagem DTF e referência de custos.',tag:'Pedidos e produção',actions:[['Abrir Produção DTF','/admin?tab=production'],['Ver produtos','/admin?tab=products'],['Custos de produção','/admin?tab=margins']]},
 {id:'returns',name:'MLS Returns',area:'Devoluções',symbol:'↺',summary:'Devoluções, reembolsos e ajustes com validação.',tag:'Pós-venda e ajustes',actions:[['Conciliação de devoluções','/admin?tab=agent-finance#businessReconciliation'],['Liberações por pedido','/admin?tab=agent-finance#businessEscrowReleases'],['Resumo financeiro','/admin?tab=agent-finance#businessMonth']]},
 {id:'auditor',name:'MLS Auditor',area:'Auditoria',symbol:'◇',summary:'Divergências e confiabilidade antes de executar decisões.',tag:'Evidências e segurança',actions:[['Conferir liberações','/admin?tab=agent-finance#businessEscrowReleases'],['Histórico e versões','/admin?tab=history'],['Diagnóstico seguro','/admin/diagnostics']]},
 {id:'hermes',name:'MLS Hermes',area:'Supervisor',symbol:'✦',summary:'Prioriza tarefas, supervisiona agentes e mantém os limites de ação.',tag:'Supervisão operacional',actions:[['Console do Hermes','/admin?tab=hermes'],['Equipe de agentes','/admin?tab=agents'],['Histórico e auditoria','/admin?tab=history']]}
].map(value=>Object.freeze({...value,actions:Object.freeze(value.actions.map(action=>Object.freeze(action)))})));

function missionSourceLink(href,tab){
 if(typeof href!=='string')return '/admin?tab=agents';
 if(href.startsWith('#'))return '/admin?tab='+tab+href;
 return href;
}
function missionCard(item){
 return '<a class="mission-hub-card mission-agent--'+item.id+'" href="/admin?tab=agent-'+item.id+'" data-mission-open="agent-'+item.id+'">'+
  '<div class="mission-hub-card-top"><span class="mission-mini-orb mission-agent-avatar" aria-hidden="true">'+item.symbol+'</span><span class="mission-status" data-mission-status="'+item.id+'">Aguardando dados</span></div>'+
  '<h4>'+item.name+'</h4><p>'+item.summary+'</p><div class="mission-hub-card-bottom"><span class="mission-breadcrumb-pill">Observador</span><span class="mission-open">Abrir painel →</span></div></a>';
}
function missionWorkspace(item,financeHtml){
 const id=item.id,tab='agent-'+id,missionMetrics=[0,1,2,3].map(index=>
  '<article class="mission-stat"><small id="mission-'+id+'-label-'+index+'">Indicador em preparação</small>'+
  '<strong id="mission-'+id+'-metric-'+index+'">—</strong><span id="mission-'+id+'-hint-'+index+'">Aguardando fonte validada.</span></article>').join('');
 const seenShortcuts=new Set();
 const shortcuts=item.actions.filter(([,href])=>{const target=missionSourceLink(href,tab);if(seenShortcuts.has(target))return false;seenShortcuts.add(target);return true;}).map(([label,href])=>'<a class="mission-action" href="'+missionSourceLink(href,tab)+'"><span>'+label+'</span><span aria-hidden="true">›</span></a>').join('');
 const coverage=['products','production'].includes(id)?
  '<section class="mission-coverage" id="mission-'+id+'-coverage" hidden>'+
  '<header><strong>Cobertura de custo das unidades vendidas</strong><span id="mission-'+id+'-coverage-label">—</span></header>'+
  '<div class="mission-progress"><span id="mission-'+id+'-coverage-bar"></span></div></section>':'';
 const body=id==='finance'?'<div class="mission-finance-source"><div class="mission-hub-bar"><div><h3>Financeiro detalhado</h3><p>Recortes diários, mensais, Pending e conciliação em uma área exclusiva do Finance.</p></div></div>'+
   '<p class="mission-source-note">Os valores e os controles abaixo são os mesmos do sistema anterior, sem duplicação de cálculos.</p>'+financeHtml+'</div>':'';
 const hermes=id==='hermes'?'<div id="missionHermesTools"></div>':'';
 return '<section class="mission-workspace mission-agent--'+id+'" id="'+tab+'" data-mission-page="'+id+'" hidden>'+
  '<header class="mission-hero"><div><nav class="mission-crumb" aria-label="Localização"><a href="/admin?tab=overview" data-mission-open="overview">Visão Geral</a><span>›</span><a href="/admin?tab=agents" data-mission-open="agents">Agentes</a><span>›</span><strong>'+item.name+'</strong></nav>'+
  '<div class="mission-hero-main"><span class="mission-orb mission-agent-avatar" aria-hidden="true">'+item.symbol+'</span><div><span class="mission-eyebrow">'+item.tag+'</span><h2>'+item.name+'</h2><p>'+item.summary+'</p><p class="mission-last mission-source-provenance" id="mission-'+id+'-checked">Aguardando fonte do agente.</p></div></div></div>'+
  '<div class="mission-intro-status"><span class="mission-status" data-mission-status="'+id+'">Aguardando dados</span><span class="mission-breadcrumb-pill">Modo Observador · sem escrita comercial</span></div></header>'+
  '<nav class="mission-page-tabs" aria-label="Seções de '+item.name+'"><a href="#mission-'+id+'-tasks">Prioridades</a><a href="#mission-'+id+'-tools">Ferramentas</a>'+(id==='finance'?'<a href="#businessMonth">Financeiro detalhado</a>':'')+'</nav>'+ 
  '<div class="mission-stats" aria-label="Indicadores de '+item.name+'">'+missionMetrics+'</div>'+
  (id==='finance'||id==='ads'?missionTrendPanelBody(id):'')+
  (['products','production','returns','auditor'].includes(id)?'<section class="mission-evidence-panel" aria-label="Indicadores observados de '+item.name+'"><header><div><span class="mission-eyebrow">SNAPSHOT VERIFICADO</span><h3>Indicadores disponíveis</h3><p>Comparação de contagens observadas. Não representa evolução histórica.</p></div><span class="mission-breadcrumb-pill">Sem projeções</span></header><div class="mission-evidence-list" id="mission-'+id+'-evidence"><p class="mission-empty">Aguardando fonte validada.</p></div><p class="mission-evidence-foot" id="mission-'+id+'-evidence-note">Dados desconhecidos permanecem indisponíveis.</p></section>':'')+
  '<div class="mission-panels"><section class="mission-module"><div class="mission-module-head"><h3>Prioridades e alertas</h3><small>Somente evidências verificáveis</small></div><div id="mission-'+id+'-tasks" class="mission-tasks"><p class="mission-empty">Aguardando indicadores do agente.</p></div>'+coverage+
  '</section>'+
  '<aside class="mission-module" id="mission-'+id+'-tools"><div class="mission-module-head"><h3>Ferramentas e detalhes</h3><small>Acessos existentes</small></div><div class="mission-actions">'+shortcuts+'</div>'+
  '<p class="mission-footnote" id="mission-'+id+'-message">Nenhuma decisão automática é executada nesta fase. Dados ausentes continuam indisponíveis.</p></aside></div>'+
  hermes+body+'</section>';
}
export function missionWorkspacesBody(financeHtml=''){
 const hub='<section class="mission-hub" id="agents" hidden><div class="mission-hero mission-hub-hero"><div>'+
  '<nav class="mission-crumb" aria-label="Localização"><a href="/admin?tab=overview" data-mission-open="overview">Visão Geral</a><span>›</span><strong>Equipe digital</strong></nav>'+
  '<div class="mission-hero-main"><span class="mission-orb mission-agent-avatar" aria-hidden="true">✦</span><div><span class="mission-eyebrow">MLS MISSION CONTROL</span><h2>Equipe de agentes</h2>'+
  '<p>Cada especialista tem um painel independente. Todos compartilham as mesmas fontes validadas e seguem os limites do MLS Hermes.</p></div></div></div>'+
  '<div class="mission-intro-status"><span class="mission-status" id="missionFleetStatus">Monitorando</span><span class="mission-breadcrumb-pill">Automação comercial bloqueada</span></div></div>'+
  '<div class="mission-hub-bar"><div><h3>Especialistas da operação</h3><p>Escolha um agente para abrir seu espaço completo.</p></div>'+
  '<span class="mission-breadcrumb-pill">7 painéis · Observador</span></div>'+
  '<div class="mission-hub-search"><label for="missionAgentSearch">Buscar especialista</label><input id="missionAgentSearch" type="search" autocomplete="off" placeholder="Buscar por nome ou área..." aria-controls="missionHubGrid"><span id="missionAgentSearchCount" aria-live="polite">7 especialistas</span></div>'+ 
  '<div class="mission-hub-grid" id="missionHubGrid">'+MISSION_AGENTS.map(missionCard).join('')+'</div>'+
  '<div class="mission-hub-bar"><div><h3>Expansão planejada</h3><p>Estes agentes só serão habilitados nas fases previstas do roadmap.</p></div></div>'+
  '<div class="mission-future"><span>MLS Pricing · M3</span><span>MLS Creative · M8</span><span>MLS Inventory · fase futura</span><span>MLS Marketplace · M8</span></div></section>';
 return hub+MISSION_AGENTS.map(item=>missionWorkspace(item,financeHtml)).join('');
}

export const MISSION_CLIENT="\n(()=>{\n const byId=id=>document.getElementById(id);\n const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);\n const money=value=>{\n  if(!safe(value))return '—';\n  const cents=BigInt(value),negative=cents<0n,absolute=negative?-cents:cents;\n  const fraction=String(absolute%100n).padStart(2,'0');\n  const parts=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n);\n  return (negative?'-':'')+parts.map(part=>part.type==='fraction'?fraction:part.value).join('');\n };\n const count=value=>safe(value)&&value>=0?new Intl.NumberFormat('pt-BR').format(value):'—';\n const labels={HEALTHY:'Saudável',WORKING:'Em acompanhamento',ATTENTION:'Atenção',BLOCKED:'Bloqueado'};\n const onlyStatus=value=>typeof value==='string'&&Object.hasOwn(labels,value)?labels[value]:'Aguardando dados';\n const display=(value,type)=>{\n  if(type==='money')return money(value);\n  if(type==='count')return count(value);\n  if(type==='month')return typeof value==='string'&&/^[0-9]{4}-(?:0[1-9]|1[0-2])$/.test(value)?value.slice(5)+'/'+value.slice(0,4):'—';\n  if(type==='date')return typeof value==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7):'—';\n  if(type==='status')return onlyStatus(value);\n  return '—';\n };\n const sourceHref=href=>typeof href==='string'&&href.startsWith('#')&&(/^#business/.test(href)||href==='#commandPendingIncomeDetails')?'/admin?tab=agent-finance'+href:href;\n const metric=(title,value,type,help)=>({title,value,type,help});\n function readings(id,registry,agent,byAgent){\n  const day=registry.day||{},month=registry.month||{},settlement=registry.settlement||{},expenses=registry.expenses||{};\n  const taskCount=registry.priorities?.filter(row=>row.agent_id===id).length??0;\n  const finance=byAgent.finance||{},products=byAgent.products||{},production=byAgent.production||{};\n  if(id==='finance')return [\n   metric('Resultado mensal estimado',month.balance_cents,'money','Não é valor depositado no banco'),\n   metric('Pending atual na Shopee',registry.income?.current_pending_cents,'money','Snapshot atual, separado do mês'),\n   metric('Liberações verificadas',settlement.releases_verified,'count','Identidades conferidas, não liquidação'),\n   metric('Contas em aberto',expenses.open_count,'count','Somente despesas declaradas')\n  ];\n  if(id==='ads')return [\n   metric('Investimento hoje',day.ads_spend_cents,'money','Dados da mesma data do resumo diário'),\n   metric('Data da leitura diária',day.date,'date','Investimento sem atribuição por SKU'),\n   metric('Alertas do MLS Ads',taskCount,'count','Pendências classificadas para Ads'),\n   metric('Estado do agente',agent.status,'status','Somente leitura; campanhas bloqueadas')\n  ];\n\n  const catalog=registry?.sources?.catalog;\n  if(id==='products'&&catalog)return [\n   metric('Produtos registrados',catalog.total,'count','Catálogo salvo, não unidades vendidas nem estoque'),\n   metric('Produtos indexados',catalog.indexed,'count','Fonte: índice local validado'),\n   metric('Cadastros pendentes',catalog.pending_catalog,'count','Classificações ainda em atualização'),\n   metric('Unidades vendidas no mês',products.metric,'count','Base financeira mensal separada do catálogo')\n  ];\n  if(id==='products')return [\n   metric('Unidades vendidas no mês',products.metric,'count','Não equivale ao catálogo ativo'),\n   metric('Unidades com custo conhecido',production.metric,'count','Cobertura observada do mês'),\n   metric('Alertas de produtos',taskCount,'count','Custos e atribuições pendentes'),\n   metric('Referência mensal',month.month,'month','Mesmo período do Finance')\n  ];\n\n  const dtf=registry?.sources?.dtf_queue,period=registry?.sources?.production_period;\n  if(id==='production'&&dtf)return [\n   metric('Linhas DTF pendentes',dtf.pending_lines,'count','Linhas da fila salva, não quantidade de peças'),\n   metric('Linhas reservadas',dtf.reserved_lines,'count','Reservadas em lote'),\n   metric('Linhas produzidas',dtf.produced_lines,'count','Estado registrado da fila DTF'),\n   metric('Linhas bloqueadas',dtf.blocked_lines,'count','Situação exige conferência')\n  ];\n  if(id==='production'&&period)return [\n   metric('Pedidos elegíveis no período',period.eligible_orders,'count','Pedidos pagos do período '+(period.month||'selecionado')),\n   metric('Unidades com custo conhecido',period.known_units,'count','Não indica ordens finalizadas'),\n   metric('Unidades totais verificadas',period.total_units,'count','Cobertura de custos do período'),\n   metric('Custo de produção conhecido',period.state==='COMPLETE'?period.cost_cents:period.known_cost_cents,'money',period.state==='COMPLETE'?'Total calculado dos custos salvos':'Subtotal parcial de custos conhecidos')\n  ];\n  if(id==='production')return [\n   metric('Unidades com custo conhecido',production.metric,'count','Não indica ordens finalizadas'),\n   metric('Unidades vendidas no mês',products.metric,'count','Base financeira observada'),\n   metric('Alertas de produção',taskCount,'count','Cobertura de custo pendente'),\n   metric('Referência mensal',month.month,'month','Não substitui a fila DTF')\n  ];\n  if(id==='returns')return [\n   metric('Ocorrências para acompanhar',agent.metric,'count','Inclui devoluções e estados em revisão'),\n   metric('Alertas de devoluções',taskCount,'count','Não confirma reembolso bancário'),\n   metric('Período',month.month,'month','Pedidos da referência mensal'),\n   metric('Situação do agente',agent.status,'status','Acompanhamento sem ações externas')\n  ];\n  if(id==='auditor')return [\n   metric('Prioridades operacionais',registry.priorities?.length,'count','Alertas de toda a operação'),\n   metric('Conflitos de evidência',settlement.evidence_conflicts,'count','Diferenças de repasse após ajuste'),\n   metric('Valores não verificados',settlement.release_value_unverified,'count','Liberações sem valor compatibilizado'),\n   metric('Situação do auditor',agent.status,'status','Bloqueio quando há fonte insegura')\n  ];\n  return [\n   metric('Prioridades identificadas',registry.priorities?.length,'count','Filas de trabalho para a equipe'),\n   metric('Agentes em observação',registry.agents?.length,'count','Não executam mudanças comerciais'),\n   metric('Saúde operacional',registry.health,'status','Estado agregado validado'),\n   metric('Período de referência',month.month,'month','Mesma base compartilhada')\n  ];\n }\n\n\n function renderEvidence(id,registry,byAgent){\n  const host=byId('mission-'+id+'-evidence'),note=byId('mission-'+id+'-evidence-note');\n  if(!host)return;\n  const source=registry.sources||{},rows=[];\n  const numeric=value=>safe(value)&&value>=0?value:null;\n  const add=(label,value,base=null)=>rows.push({label,value:numeric(value),base:numeric(base)});\n  let description='',kind='';\n  if(id==='products'){\n   const catalog=source.catalog;\n   if(catalog&&numeric(catalog.total)!==null){\n    kind='CATALOG';\n    add('Produtos registrados',catalog.total,catalog.total);\n    add('Produtos indexados',catalog.indexed,catalog.total);\n    add('Cadastros pendentes',catalog.pending_catalog,catalog.total);\n    description='Fonte: catálogo salvo. Contagem de anúncios/produtos, não unidades em estoque nem vendas.';\n    if(numeric(catalog.indexed)!==null&&catalog.indexed>catalog.total||numeric(catalog.pending_catalog)!==null&&catalog.pending_catalog>catalog.total)\n     description+=' Contagens incompatíveis com o total: confira o cadastro.';\n    if(numeric(catalog.checked_at)!==null&&catalog.checked_at>0)\n     description+=' Última conferência: '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(catalog.checked_at*1000))+'.';\n   }else{\n    kind='COST_COVERAGE';\n    const total=byAgent.products?.metric,known=byAgent.production?.metric;\n    if(numeric(total)!==null&&numeric(known)!==null&&known<=total){\n     add('Unidades com custo conhecido',known,total);\n     add('Unidades sem custo confirmado',total-known,total);\n    }else{\n     add('Unidades vendidas no mês',total);\n     add('Unidades com custo conhecido',known);\n    }\n    description='Aguardando catálogo salvo. Estes números são cobertura de custo das vendas do mês, não estoque.';\n   }\n  }else if(id==='production'){\n   const dtf=source.dtf_queue,period=source.production_period;\n   if(dtf&&numeric(dtf.line_count)!==null){\n    kind='DTF_QUEUE';\n    const statuses=['pending_lines','reserved_lines','produced_lines','blocked_lines'];\n    const classified=statuses.every(key=>numeric(dtf[key])!==null);\n    const sum=classified?statuses.reduce((n,key)=>n+dtf[key],0):null;\n    const base=sum!==null&&sum<=dtf.line_count?dtf.line_count:null;\n    add('Linhas pendentes',dtf.pending_lines,base);\n    add('Linhas reservadas',dtf.reserved_lines,base);\n    add('Linhas produzidas',dtf.produced_lines,base);\n    add('Linhas bloqueadas',dtf.blocked_lines,base);\n    if(sum!==null&&sum<dtf.line_count)add('Sem estado classificado',dtf.line_count-sum,dtf.line_count);\n    description='Fonte: fila DTF salva. Total: '+count(dtf.line_count)+' linha(s). Linhas não equivalem a camisetas ou pedidos.';\n    if(sum!==null&&sum>dtf.line_count)description+=' Estados excedem o total; proporções ocultadas até conferência.';\n   }else if(period&&numeric(period.total_units)!==null){\n    kind='PERIOD_COST';\n    const base=numeric(period.known_units)!==null&&period.known_units<=period.total_units?period.total_units:null;\n    add('Unidades com custo conhecido',period.known_units,base);\n    add('Unidades pendentes de custo',period.pending_units,base);\n    description='Fonte: custos do período '+(period.month||'selecionado')+'. Não representa fila DTF ou ordens concluídas.';\n   }else{\n    kind='COST_COVERAGE';\n    const total=byAgent.products?.metric,known=byAgent.production?.metric;\n    if(numeric(total)!==null&&numeric(known)!==null&&known<=total){\n     add('Unidades com custo conhecido',known,total);\n     add('Unidades sem custo confirmado',total-known,total);\n    }else{\n     add('Unidades vendidas no mês',total);\n     add('Unidades com custo conhecido',known);\n    }\n    description='Fila DTF e custos detalhados ainda não carregados. Mostrando somente cobertura financeira do mês.';\n   }\n  }else if(id==='returns'){\n   const returns=registry.returns||{};\n   kind='RETURNS';\n   add('Pedidos pagos com devolução',returns.paid_returns);\n   add('Devoluções sem confirmação',returns.paid_returns_unknown);\n   add('Pedidos em revisão de status',returns.status_reviews);\n   description=returns.month?'Fonte: estados dos pedidos de '+returns.month.slice(5)+'/'+returns.month.slice(0,4)+'. Contagens distintas; não confirmam reembolso ou crédito bancário.':'Aguardando estados mensais validados de devoluções; nenhuma ausência é tratada como zero.';\n  }else if(id==='auditor'){\n   kind='AUDIT';\n   add('Conflitos de evidência',registry.settlement?.evidence_conflicts);\n   add('Liberações sem valor verificado',registry.settlement?.release_value_unverified);\n   add('Liberações ambíguas',registry.settlement?.release_ambiguous);\n   add('Prioridades do auditor',Array.isArray(registry.priorities)?registry.priorities.filter(item=>item.agent_id===id).length:null);\n   description='Fontes: auditoria e liberações do mês. Categorias independentes; não representam prejuízo ou pagamentos não recebidos.';\n  }else return;\n  host.dataset.evidenceSource=kind;\n  host.replaceChildren();\n  const valid=rows.filter(item=>item.value!==null),maximum=Math.max(1,...valid.map(item=>item.value));\n  for(const row of rows){\n   const wrapper=document.createElement('div');wrapper.className='mission-evidence-row';\n   const heading=document.createElement('div');heading.className='mission-evidence-heading';\n   const title=document.createElement('span');title.textContent=row.label;\n   const value=document.createElement('strong');value.textContent=row.value===null?'—':count(row.value);\n   heading.append(title,value);\n   const track=document.createElement('div');track.className='mission-evidence-track';\n   const fill=document.createElement('span');fill.className='mission-evidence-fill';\n   const hasBase=row.base!==null&&row.value!==null&&row.base>=row.value&&row.base>0;\n   const share=hasBase?row.value/row.base:row.value===null?0:row.value/maximum;\n   fill.style.width=Math.min(100,Math.max(0,share*100))+'%';\n   track.append(fill);wrapper.append(heading,track);\n   if(hasBase){\n    const ratio=document.createElement('small');ratio.className='mission-evidence-ratio';\n    ratio.textContent=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(row.value/row.base*100)+'% do total validado';\n    wrapper.append(ratio);\n   }\n   host.append(wrapper);\n  }\n  if(!valid.length){\n   const empty=document.createElement('p');empty.className='mission-evidence-empty';\n   empty.textContent='Nenhuma contagem validada nesta fonte. Os indicadores permanecem indisponíveis, não zerados.';\n   host.append(empty);\n  }\n  if(note)note.textContent=description+(kind==='AUDIT'||kind==='RETURNS'?' Barras em escala relativa ao maior valor observado; não são percentuais de um total.':'');\n }\n function refresh(registry){\n  if(!registry||registry.schema!=='mls_agent_registry_v1')return;\n  const byAgent={};for(const agent of registry.agents||[])byAgent[agent.id]=agent;\n  byAgent.hermes=registry.hermes||{};\n  const fleet=byId('missionFleetStatus');\n  if(fleet){fleet.textContent=onlyStatus(registry.health);fleet.dataset.status=registry.health;}\n  for(const id of ['finance','ads','products','production','returns','auditor','hermes']){\n   const agent=byAgent[id];if(!agent)continue;\n   for(const element of document.querySelectorAll('[data-mission-status=\"'+id+'\"]')){\n    element.textContent=onlyStatus(agent.status);\n    element.dataset.status=agent.status;\n   }\n   const summary=byId('mission-'+id+'-message');\n   if(summary)summary.textContent=agent.message||'Aguardando resumo validado. Nenhuma ação comercial é executada automaticamente.';\n   const rows=readings(id,registry,agent,byAgent);\n   rows.forEach((row,index)=>{\n    const title=byId('mission-'+id+'-label-'+index),value=byId('mission-'+id+'-metric-'+index),help=byId('mission-'+id+'-hint-'+index);\n    if(title)title.textContent=row.title;\n    if(value)value.textContent=display(row.value,row.type);\n    if(help)help.textContent=row.help;\n   });\n   const tasks=byId('mission-'+id+'-tasks');\n   if(tasks){\n    tasks.replaceChildren();\n    const list=(registry.priorities||[]).filter(item=>item.agent_id===id).slice(0,8);\n    if(!list.length){const empty=document.createElement('p');empty.className='mission-empty';empty.textContent='Sem prioridades verificáveis para este agente nesta leitura.';tasks.append(empty);}\n    for(const item of list){\n     const a=document.createElement('a');a.className='mission-task';a.href=sourceHref(item.href);\n     a.dataset.severity=item.severity;\n     const heading=document.createElement('strong'),description=document.createElement('p');\n     heading.textContent=item.title;description.textContent=item.detail;a.append(heading,description);tasks.append(a);\n    }\n   }\n   const stamp=byId('mission-'+id+'-checked');\n   if(stamp){\n    const date=value=>safe(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):null;\n    const catalog=registry.sources?.catalog,period=registry.sources?.production_period,dtf=registry.sources?.dtf_queue;\n    let label=null;\n    if(id==='products'&&catalog)label='Catálogo salvo'+(date(catalog.checked_at)?' · atualizado '+date(catalog.checked_at):' · horário não informado')+' · estoque não confirmado';\n    else if(id==='production'&&dtf)label='Fila DTF salva · sem horário individual na projeção';\n    else if(id==='production'&&period)label='Custos do período '+(period.month||'observado')+(date(period.checked_at)?' · '+date(period.checked_at):'');\n    else if(date(agent.last_checked_at))label='Referência financeira mensal · '+date(agent.last_checked_at);\n    else label='Última leitura deste agente ainda não validada';\n    stamp.textContent=label;\n   }\n  }\n  for(const id of ['products','production','returns','auditor'])renderEvidence(id,registry,byAgent);\n  const known=byAgent.production?.metric,total=byAgent.products?.metric;\n  for(const id of ['products','production']){\n   const block=byId('mission-'+id+'-coverage'),bar=byId('mission-'+id+'-coverage-bar'),label=byId('mission-'+id+'-coverage-label');\n   if(!block||!bar||!label)continue;\n   const kind=byId('mission-'+id+'-evidence')?.dataset?.evidenceSource;\n   if(id==='production'&&kind!=='DTF_QUEUE'){block.hidden=true;bar.style.width='0%';label.textContent='—';continue;}\n   if(safe(total)&&total>0&&safe(known)&&known>=0&&known<=total){\n    const percent=Math.min(100,Math.max(0,Math.round(known/total*100)));\n    block.hidden=false;bar.style.width=percent+'%';label.textContent=percent+'% · '+count(known)+' / '+count(total)+' unidade(s)';\n   }else{block.hidden=true;bar.style.width='0%';label.textContent='—';}\n  }\n }\n\n const searchInput=byId('missionAgentSearch');\n if(searchInput&&typeof searchInput.addEventListener==='function')searchInput.addEventListener('input',()=>{\n  const query=searchInput.value.trim().toLocaleLowerCase('pt-BR');\n  let matches=0;\n  for(const card of document.querySelectorAll('.mission-hub-card')){\n   const fits=!query||card.textContent.toLocaleLowerCase('pt-BR').includes(query);\n   card.hidden=!fits;if(fits)matches++;\n  }\n  const label=byId('missionAgentSearchCount');if(label)label.textContent=matches+' especialista(s)';\n });\n globalThis.mlsMission=Object.freeze({refresh});\n try{refresh(globalThis.mlsAgentRegistry?.getSnapshot?.());}catch{}\n})();\n";


/**
 * Compare only consecutive, complete, already-validated days.
 * Today's partial result is never compared directly with a full prior day.
 */
export function buildMissionTrendComparison(trend,key){
 const keys={net:'net_cents',sales:'sales_cents',ads:'ads_spend_cents',paid:'paid_orders',margin:'margin_bps'};
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
 if(trend?.schema!=='mls_mission_daily_trend_v1'||!Object.hasOwn(keys,key)||!Array.isArray(trend.points))return null;
 function metric(row){
  if(key!=='margin')return safe(row?.[keys[key]])?row[keys[key]]:null;
  if(!safe(row?.net_cents)||!safe(row?.sales_cents)||row.sales_cents<=0||row.net_basis!=='ESTIMATE')return null;
  const result=BigInt(row.net_cents)*10000n/BigInt(row.sales_cents);
  return result>=BigInt(Number.MIN_SAFE_INTEGER)&&result<=BigInt(Number.MAX_SAFE_INTEGER)?Number(result):null;
 }
 for(let i=trend.points.length-1;i>0;i--){
  const current=trend.points[i],prior=trend.points[i-1];
  if(!current?.comparable||!prior?.comparable||!date(current.date)||!date(prior.date))continue;
  if(Date.parse(current.date+'T00:00:00Z')-Date.parse(prior.date+'T00:00:00Z')!==86400000)continue;
  const newer=metric(current),older=metric(prior);
  if(newer===null||older===null)continue;
  const diff=BigInt(newer)-BigInt(older);
  if(diff<BigInt(Number.MIN_SAFE_INTEGER)||diff>BigInt(Number.MAX_SAFE_INTEGER))continue;
  const base=older<0?-BigInt(older):BigInt(older);
  const pct=base>0n?diff*10000n/base:null;
  return Object.freeze({key,current_date:current.date,previous_date:prior.date,current:newer,previous:older,delta:Number(diff),percent_bps:pct!==null&&pct>=BigInt(Number.MIN_SAFE_INTEGER)&&pct<=BigInt(Number.MAX_SAFE_INTEGER)?Number(pct):null,direction:diff>0n?'UP':diff<0n?'DOWN':'FLAT',basis:'TWO_CONSECUTIVE_COMPLETE_DAYS_ESTIMATED_NOT_BANK_SETTLED'});
 }
 return null;
}

/**
 * Explain why a real daily series cannot produce a comparison. This never
 * infers yesterday's values, interpolates missing days, or treats partial
 * evidence as a complete close.
 */
export function explainMissionTrendGap(trend,key){
 const fields={net:'net_cents',sales:'sales_cents',ads:'ads_spend_cents',paid:'paid_orders',margin:'margin_bps'};
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
 if(!Object.hasOwn(fields,key))return Object.freeze({label:'Sem comparação',detail:'Métrica desconhecida.',coverage:'Métrica indisponível'});
 const rows=trend?.schema==='mls_mission_daily_trend_v1'&&Array.isArray(trend.points)?trend.points:[];
 if(!rows.length)return Object.freeze({label:'Histórico ainda não salvo',detail:'A coleta do dia pode estar disponível, mas a série diária validada ainda não contém leituras.',coverage:'0 dias com série validada'});
 const metric=row=>key==='margin'?safe(row?.net_cents)&&safe(row?.sales_cents)&&row.sales_cents>0&&row.net_basis==='ESTIMATE':
  safe(row?.[fields[key]]);
 const observed=rows.filter(row=>validDate(row?.date)&&metric(row));
 const eligible=observed.filter(row=>row.comparable===true&&row.partial!==true);
 const latest=observed.length?observed.at(-1).date:null;
 const short=value=>validDate(value)?value.slice(8)+'/'+value.slice(5,7):'—';
 const coverage=observed.length+' de '+rows.length+' dia(s) com leitura'+(latest?' · última: '+short(latest):'');
 if(observed.length===0)return Object.freeze({label:'Sem dias validados',detail:'O histórico do período ainda não tem valor confirmado para esta métrica.',coverage});
 if(observed.length===1)return Object.freeze({label:'Somente 1 dia observado',detail:'A leitura de '+short(latest)+' existe, mas a comparação exige dois dias consecutivos completos.',coverage});
 if(eligible.length<2)return Object.freeze({label:'Dias ainda não comparáveis',detail:'Há '+observed.length+' leituras, mas faltam dois fechamentos completos e válidos para a métrica.',coverage});
 let adjacent=false;
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i];
  if(!validDate(a?.date)||!validDate(b?.date)||!metric(a)||!metric(b)||a.comparable!==true||b.comparable!==true||a.partial===true||b.partial===true)continue;
  if(Date.parse(b.date+'T00:00:00Z')-Date.parse(a.date+'T00:00:00Z')===86400000){adjacent=true;break;}
 }
 return Object.freeze({label:adjacent?'Comparação em validação':'Sem dias consecutivos',detail:adjacent?'Os dados do período não produziram uma variação aritmeticamente segura.':'Existem leituras completas, mas não em dois dias consecutivos para esta métrica.',coverage});
}

export const MISSION_TRENDS_CLIENT=String.raw`
(()=>{
 const buildMissionTrendComparison=${buildMissionTrendComparison.toString()};
 const explainMissionTrendGap=${explainMissionTrendGap.toString()};
 const ns='http://www.w3.org/2000/svg',byId=id=>document.getElementById(id);
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const names={net:'Resultado diário estimado',sales:'Vendas dos pedidos pagos',ads:'Gastos com Ads'};
 const fields={net:'net_cents',sales:'sales_cents',ads:'ads_spend_cents'};
 const colors={net:'#39e8af',sales:'#6caaff',ads:'#ffb365'};
 const choice={overview:'net',finance:'net',ads:'ads'};
 let timeline=null;
 function money(value){
  if(!safe(value))return '—';
  const amount=BigInt(value),abs=amount<0n?-amount:amount;
  const frac=String(abs%100n).padStart(2,'0');
  const text=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(abs/100n).map(part=>part.type==='fraction'?frac:part.value).join('');
  return (amount<0n?'-':'')+text;
 }
 const signedMoney=value=>safe(value)?(value>0?'+':'')+money(value):'—';
 const count=value=>safe(value)?new Intl.NumberFormat('pt-BR').format(value):'—';
 const percentage=value=>safe(value)?(value>0?'+':'')+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(value/100)+'%':null;
 const briefDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7):'—';
 function el(tag,attributes={},content){
  const node=document.createElementNS(ns,tag);
  for(const [name,value] of Object.entries(attributes))node.setAttribute(name,String(value));
  if(content!==undefined)node.textContent=content;
  return node;
 }
 function renderGraph(panel){
  const suffix=panel[0].toUpperCase()+panel.slice(1);
  const target=byId('missionTrendGraph'+suffix),note=byId('missionTrendNote'+suffix);
  if(!target||!note)return;
  target.replaceChildren();
  const field=fields[choice[panel]],key=choice[panel],title=byId('missionTrendTitle'+suffix);if(title)title.textContent=names[key]+' · últimos dias';
  const rows=timeline?.schema==='mls_mission_daily_trend_v1'&&Array.isArray(timeline.points)?timeline.points:[];
  const known=rows.map((r,index)=>({index,row:r,value:safe(r?.[field])?r[field]:null})).filter(r=>r.value!==null);
  if(known.length<2){
   const info=explainMissionTrendGap(timeline,key);
   const empty=document.createElement('p');empty.className='mission-trend-empty';empty.textContent=info.label+'. '+info.detail;
   target.append(empty);note.textContent=info.coverage+'. Não foram criados zeros nem pontos artificiais.';return;
  }
  const w=740,h=250,left=54,right=726,top=16,bottom=211;
  const max=Math.max(0,...known.map(r=>r.value)),min=Math.min(0,...known.map(r=>r.value)),span=max-min||1;
  const X=i=>left+i*(right-left)/Math.max(1,rows.length-1);
  const Y=v=>top+(max-v)/span*(bottom-top);
  const zero=Y(0),tint=v=>key==='net'&&v<0?'#ff7899':colors[key];
  const graph=el('svg',{class:'mission-trend-svg',viewBox:'0 0 '+w+' '+h,preserveAspectRatio:'none',role:'img','aria-label':names[key]+': '+count(known.length)+' dias observados'});
  graph.append(el('title',{},names[key]+': pontos reais do histórico, sem interpolar valores ausentes'));
  graph.append(el('text',{x:8,y:13,fill:'#a7c3e2','font-size':11},'R$'));
  for(let line=0;line<=4;line++){
   const yy=top+line*(bottom-top)/4;
   graph.append(el('line',{x1:left,y1:yy,x2:right,y2:yy,stroke:'rgba(123,167,230,.22)','stroke-width':1,'stroke-dasharray':'3 5'}));
   const amount=max-line*span/4;
   graph.append(el('text',{x:left-8,y:yy+3,'text-anchor':'end',fill:'#9eb9d7','font-size':11},new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(amount/100)));
  }
  if(min<0&&max>0)graph.append(el('line',{x1:left,y1:zero,x2:right,y2:zero,stroke:'rgba(206,229,255,.6)','stroke-width':1.2}));
  for(let i=1;i<rows.length;i++){
   const previous=rows[i-1]?.[field],current=rows[i]?.[field];
   if(!safe(previous)||!safe(current))continue;
   const a=X(i-1),b=X(i),c=tint(current);
   graph.append(el('polygon',{points:a+','+Y(previous)+' '+b+','+Y(current)+' '+b+','+zero+' '+a+','+zero,fill:c,'fill-opacity':.10}));
   graph.append(el('line',{x1:a,y1:Y(previous),x2:b,y2:Y(current),stroke:c,'stroke-width':3.2,'stroke-linecap':'round'}));
  }
  for(let i=0;i<rows.length;i++){
   const row=rows[i],v=row?.[field];
   if(i===0||i===rows.length-1||i%3===0)graph.append(el('text',{x:X(i),y:h-14,'text-anchor':'middle',fill:'#a3bcda','font-size':11},briefDate(row?.date)));
   if(!safe(v))continue;
   const dot=el('circle',{cx:X(i),cy:Y(v),r:row.partial?3.5:4,fill:row.partial?'#f7c57f':tint(v),stroke:'#081a35','stroke-width':1.6});
   dot.append(el('title',{},briefDate(row.date)+' · '+money(v)+(row.partial?' · dia parcial':'')+(row.net_basis==='KNOWN_COSTS'&&key==='net'?' · subtotal com custos conhecidos':'')));
   graph.append(dot);
  }
  target.append(graph);
  note.textContent=count(known.length)+' de '+count(rows.length)+' dia(s) com valores · '+briefDate(rows[0].date)+' a '+briefDate(rows.at(-1).date)+'. '+(known.some(item=>item.row.partial)?'Pontos âmbar = dia parcial. ':'')+'Resultado estimado, não recebimento bancário.';
 }

 function renderSparklines(){
  for(const [suffix,key] of Object.entries({Net:'net',Sales:'sales',Ads:'ads'})){
   const host=byId('missionSpark'+suffix);
   if(!host)continue;
   host.replaceChildren();
   const rows=timeline?.schema==='mls_mission_daily_trend_v1'&&Array.isArray(timeline.points)?timeline.points:[];
   const field=fields[key];
   const valid=rows.map((row,i)=>({row,i,v:row?.[field]})).filter(x=>safe(x.v));
   if(valid.length<2){host.setAttribute('aria-label','Histórico insuficiente para tendência');continue;}
   const vals=valid.map(x=>x.v),min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;
   const svg=el('svg',{viewBox:'0 0 200 38',preserveAspectRatio:'none','aria-hidden':'true'});
   const x=i=>5+i*190/Math.max(1,rows.length-1),y=v=>34-(v-min)/span*30;
   for(let i=1;i<rows.length;i++){
    const a=rows[i-1]?.[field],b=rows[i]?.[field];
    if(!safe(a)||!safe(b))continue;
    svg.append(el('line',{x1:x(i-1),y1:y(a),x2:x(i),y2:y(b),stroke:key==='net'&&b<0?'#ff7899':colors[key],'stroke-width':2.5,'stroke-linecap':'round'}));
   }
   for(const item of valid)svg.append(el('circle',{cx:x(item.i),cy:y(item.v),r:1.7,fill:item.row?.partial?'#f7c57f':key==='net'&&item.v<0?'#ff7899':colors[key]}));
   host.append(svg);
   host.setAttribute('aria-label',valid.length+' leituras diárias reais; lacunas não conectadas');
  }
 }

 function paintIndicators(registry){
  const day=registry?.day||{},net=day.net_cents,month=registry?.month?.balance_cents;
  const netCard=byId('commandCenterNet')?.closest?.('.command-metric');
  const netTone=!safe(net)?'unknown':net<0?'loss':net>0?'profit':'flat';
  if(netCard)netCard.dataset.resultTone=netTone;
  const netState=byId('missionProfitState');
  if(netState){netState.dataset.tone=netTone;netState.textContent=!safe(net)?'Resultado em apuração':day.net_basis==='KNOWN_COSTS'?net<0?'▼ Saldo parcial negativo':net>0?'▲ Saldo após custos conhecidos':'● Saldo parcial em equilíbrio':net<0?'▼ Prejuízo estimado':net>0?'▲ Resultado estimado positivo':'● Resultado estimado em equilíbrio';}
  const financeMonthly=byId('mission-finance-metric-0');
  if(financeMonthly)financeMonthly.dataset.resultTone=!safe(month)?'unknown':month<0?'loss':month>0?'profit':'flat';
  for(const [suffix,key] of Object.entries({Net:'net',Sales:'sales',Ads:'ads',Margin:'margin',Paid:'paid'})){
   const badge=byId('missionKpiDelta'+suffix);if(!badge)continue;
   const details=byId('missionKpiDeltaDate'+suffix),result=buildMissionTrendComparison(timeline,key);
   badge.dataset.direction=result?.direction||'UNAVAILABLE';badge.dataset.metric=key;
   if(!result){const info=explainMissionTrendGap(timeline,key);badge.textContent='↔ '+info.label;badge.title=info.detail;if(details)details.textContent=info.coverage;continue;}
   const arrow=result.direction==='UP'?'▲':result.direction==='DOWN'?'▼':'●';
   const diff=key==='margin'?(result.delta>0?'+':'')+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(result.delta/100)+' p.p.':key==='paid'?(result.delta>0?'+':'')+count(result.delta):signedMoney(result.delta);
   badge.textContent=arrow+' '+diff+((key==='margin'||result.percent_bps===null)?'':' · '+percentage(result.percent_bps));
   badge.title='Variação real: '+briefDate(result.current_date)+' versus '+briefDate(result.previous_date)+'.';
   if(details)details.textContent=briefDate(result.current_date)+' vs '+briefDate(result.previous_date)+' · dias completos';
  }
 }
 function refresh(){
  let trend=null,registry=null;
  try{trend=globalThis.brazaDayDashboard?.getTrend?.()??null;}catch{}
  try{registry=globalThis.mlsAgentRegistry?.getSnapshot?.()??null;}catch{}
  timeline=trend?.schema==='mls_mission_daily_trend_v1'?trend:null;
  for(const id of Object.keys(choice))renderGraph(id);
  paintIndicators(registry);
  renderSparklines();
  const period=byId('missionTrendScopeOverview');
  if(period){const info=explainMissionTrendGap(timeline,'net');period.textContent=timeline?'Histórico '+timeline.month.slice(5)+'/'+timeline.month.slice(0,4)+' · '+info.coverage:'Histórico ainda não salvo · resultado do dia permanece independente';}
 }
 for(const button of document.querySelectorAll('[data-mission-chart][data-mission-series]')){
  button.onclick=()=>{
   const id=button.dataset.missionChart,key=button.dataset.missionSeries;
   if(!Object.hasOwn(choice,id)||!Object.hasOwn(fields,key))return;
   choice[id]=key;
   for(const peer of document.querySelectorAll('[data-mission-chart="'+id+'"]'))peer.setAttribute('aria-pressed',String(peer===button));
   renderGraph(id);
  };
 }
 globalThis.mlsMissionTrends=Object.freeze({refresh});
 refresh();
})();
`;


export function missionTrendPanelBody(id='overview'){
 if(!['overview','finance','ads'].includes(id))return '';
 const suffix=id[0].toUpperCase()+id.slice(1),defaultSeries=id==='ads'?'ads':'net';
 const control=key=>'<button type="button" data-mission-chart="'+id+'" data-mission-series="'+key+'" aria-pressed="'+String(key===defaultSeries)+'">'+
  (key==='net'?'Resultado':key==='sales'?'Vendas':'Ads')+'</button>';
 const title=id==='ads'?'Evolução dos gastos com anúncios':id==='finance'?'Evolução do resultado financeiro':'Evolução financeira real';
 return '<section class="mission-trend-panel" id="missionTrends'+suffix+'" aria-label="'+title+'">'+
  '<header class="mission-trend-heading"><div><span class="mission-panel-eyebrow">SÉRIE DIÁRIA VALIDADA</span><h3 id="missionTrendTitle'+suffix+'">'+title+'</h3>'+
  '<p id="missionTrendScope'+suffix+'">'+(id==='overview'?'Últimos até 14 dias do período observado':'Histórico diário do período selecionado')+'</p></div>'+
  '<div class="mission-trend-controls" role="group" aria-label="Métrica do gráfico">'+['net','sales','ads'].map(control).join('')+'</div></header>'+
  '<div class="mission-trend-graph" id="missionTrendGraph'+suffix+'"><p class="mission-trend-empty">Aguardando o histórico diário validado.</p></div>'+
  '<p class="mission-trend-note" id="missionTrendNote'+suffix+'">As leituras parciais são sinalizadas. Sem série inventada.</p>'+
  '</section>';
}

export const MISSION_TRENDS_CSS=String.raw`

.mission-kpi-sparkline{height:30px;min-height:30px;margin-top:6px;overflow:hidden;opacity:.9}
.mission-kpi-sparkline svg{width:100%;height:100%;display:block}
@media(max-width:720px){.mission-kpi-sparkline{height:25px;min-height:25px}}

/* Mission Control financial charts: strictly scoped; values projected from the existing monthly cache. */
.mission-dashboard .mission-trend-panel,.mission-workspace .mission-trend-panel{
 --trend-bg:#091b38;position:relative;min-width:0;overflow:hidden;margin:17px 0 22px;
 padding:22px 24px 17px;border:1px solid rgba(99,167,250,.33);border-radius:20px;
 background:radial-gradient(ellipse at 75% -30%,rgba(92,91,227,.21),transparent 55%),linear-gradient(125deg,#0d2548,#07142b 88%);
 box-shadow:inset 0 1px rgba(161,201,255,.11),0 12px 36px rgba(0,11,35,.17);color:#e9f6ff
}
.mission-trend-panel:before{content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#28e3b4,#4c9efb,#b67cff,transparent 93%);opacity:.8}
.mission-trend-heading{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;margin:0 0 14px}
.mission-trend-heading h3{font-size:20px;letter-spacing:-.5px;margin:6px 0;color:#f6faff}
.mission-trend-heading p{font-size:11px;color:#a9c1df;margin:3px 0;line-height:1.6}
.mission-trend-controls{display:flex;gap:5px;padding:4px;border:1px solid rgba(113,157,230,.2);background:rgba(4,17,41,.66);border-radius:12px}
.mission-trend-controls button{min-height:36px;padding:8px 13px;border-radius:9px;border:1px solid transparent;font-size:11px;cursor:pointer;font-weight:700;color:#a9c9e7;background:transparent}
.mission-trend-controls button:hover{color:#fff;background:rgba(66,119,226,.25)}
.mission-trend-controls button[aria-pressed=true]{color:#e9faff;background:linear-gradient(110deg,#2055ba,#276bba);border-color:rgba(121,189,255,.62);box-shadow:0 3px 13px rgba(14,90,229,.22)}
.mission-trend-controls button:focus-visible{outline:3px solid #78d8ff;outline-offset:2px}
.mission-trend-graph{position:relative;min-width:0;height:277px;border-radius:12px;border:1px solid rgba(123,169,230,.12);background:repeating-linear-gradient(0deg,rgba(107,155,231,.03) 0 1px,transparent 1px 40px),rgba(5,18,43,.37)}
.mission-trend-svg{display:block;width:100%;height:100%;overflow:visible}
.mission-trend-empty{display:grid;place-items:center;min-height:240px;padding:20px;text-align:center;font-size:12px;line-height:1.7;color:#b9cae3}
.mission-trend-note{min-height:17px;margin:12px 0 0;font-size:10px;line-height:1.6;color:#92b3d4}
.mission-workspace .mission-trend-panel{border-color:rgba(var(--mission-rgb),.47);background:radial-gradient(ellipse at 100% -35%,rgba(var(--mission-rgb),.22),transparent 57%),linear-gradient(120deg,#0b213f,#06162c 91%)}
.mission-workspace .mission-trend-panel:before{background:linear-gradient(90deg,var(--mission-accent),transparent)}
.mission-workspace .mission-trend-heading .mission-panel-eyebrow{color:var(--mission-accent)}
.mission-dashboard .command-center-metrics .command-metric{min-height:178px;display:flex;flex-direction:column;gap:3px}
.mission-dashboard .command-center-metrics .command-metric small{display:block}
.mission-dashboard .command-metric .mission-kpi-delta{
 display:inline-flex;align-items:center;min-height:22px;max-width:100%;margin-top:auto;padding:4px 0 1px;
 line-height:1.45;font-size:10px;font-weight:800;letter-spacing:-.05px;color:#a7bdde
}
.mission-dashboard .command-metric .mission-kpi-delta[data-direction=UP]{color:#37e4ad}
.mission-dashboard .command-metric .mission-kpi-delta[data-direction=DOWN]{color:#ff819c}
.mission-dashboard .command-metric .mission-kpi-delta[data-direction=FLAT]{color:#95b2db}
.mission-dashboard .command-metric .mission-kpi-delta[data-direction=UNAVAILABLE]{color:#89a8cd;font-weight:600;font-size:9px}
.mission-dashboard .command-metric .mission-kpi-delta[data-metric=ads][data-direction=UP]{color:#ffb26a}
.mission-dashboard .command-metric .mission-kpi-delta[data-metric=ads][data-direction=DOWN]{color:#88dcff}
.mission-dashboard .command-metric .mission-kpi-comparison-date{display:block;font-size:9px;font-weight:450;line-height:1.5;color:#8da5c8;min-height:28px}
.mission-dashboard .command-metric .mission-profit-state{display:block;font-size:9px;font-weight:800;min-height:18px;color:#a0b7d8}
.mission-dashboard .command-metric .mission-profit-state[data-tone=profit]{color:#41efb2}
.mission-dashboard .command-metric .mission-profit-state[data-tone=loss]{color:#ff829c}
.mission-dashboard .command-metric[data-mission-metric=net][data-result-tone=loss] strong{color:#ff899f}
.mission-dashboard .command-metric[data-mission-metric=net][data-result-tone=profit] strong{color:#4ff2bc}
.mission-dashboard .command-metric[data-mission-metric=net][data-result-tone=loss]{border-color:rgba(250,99,151,.62);background:radial-gradient(circle at 90% 60%,rgba(255,82,123,.19),transparent 60%),linear-gradient(140deg,#1c1837,#101627)}
.mission-dashboard .command-metric[data-mission-metric=alerts][data-result-tone=alert] strong{color:#ffb85e}
.mission-dashboard .command-metric[data-mission-metric=alerts][data-result-tone=healthy] strong{color:#55e9b3}
.mission-workspace .mission-stat strong[data-result-tone=profit]{color:#48eeb9}
.mission-workspace .mission-stat strong[data-result-tone=loss]{color:#ff849e}
:root[data-theme=light] .mission-dashboard .mission-trend-panel,:root[data-theme=light] .mission-workspace .mission-trend-panel{background:radial-gradient(ellipse at 95% 0%,rgba(107,165,250,.13),transparent 55%),linear-gradient(125deg,#f8fbff,#ecf4ff);color:#19354b;border-color:rgba(61,128,221,.24)}
:root[data-theme=light] .mission-trend-heading h3{color:#153956}
:root[data-theme=light] .mission-trend-heading p,:root[data-theme=light] .mission-trend-note{color:#547291}
:root[data-theme=light] .mission-trend-graph{background:linear-gradient(rgba(73,134,204,.055) 1px,transparent 1px) 0 0/100% 40px,#f7faff;border-color:rgba(85,151,225,.15)}
:root[data-theme=light] .mission-trend-controls{background:#eaf1fe;border-color:#b6ccee}
:root[data-theme=light] .mission-trend-controls button{color:#416688}
:root[data-theme=light] .mission-trend-controls button[aria-pressed=true]{color:#fff}
:root[data-theme=light] .mission-trend-empty{color:#496b89}
:root[data-theme=light] .mission-dashboard .command-metric .mission-kpi-delta[data-direction=UP]{color:#076c4d}
:root[data-theme=light] .mission-dashboard .command-metric .mission-kpi-delta[data-direction=DOWN]{color:#b92c52}
:root[data-theme=light] .mission-dashboard .command-metric .mission-kpi-delta[data-metric=ads][data-direction=UP]{color:#955313}
:root[data-theme=light] .mission-dashboard .command-metric .mission-kpi-delta[data-metric=ads][data-direction=DOWN]{color:#125f9b}
:root[data-theme=light] .mission-dashboard .command-metric .mission-kpi-comparison-date,:root[data-theme=light] .mission-dashboard .command-metric .mission-kpi-delta[data-direction=UNAVAILABLE]{color:#576f8a}
:root[data-theme=light] .mission-dashboard .command-metric .mission-profit-state[data-tone=profit]{color:#137553}
:root[data-theme=light] .mission-dashboard .command-metric .mission-profit-state[data-tone=loss]{color:#b82e53}
:root[data-theme=light] .mission-dashboard .command-metric[data-mission-metric=net][data-result-tone=loss] strong{color:#ba3159}
:root[data-theme=light] .mission-dashboard .command-metric[data-mission-metric=net][data-result-tone=profit] strong{color:#167653}
:root[data-theme=light] .mission-dashboard .command-metric[data-mission-metric=net][data-result-tone=loss]{background:#fff1f4}
:root[data-theme=light] .mission-workspace .mission-stat strong[data-result-tone=profit]{color:#137653}
:root[data-theme=light] .mission-workspace .mission-stat strong[data-result-tone=loss]{color:#bd3959}
@media(max-width:1150px){.mission-dashboard .command-center-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:720px){.mission-dashboard .command-center-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.mission-trend-panel{padding:17px!important}.mission-trend-heading{gap:10px}.mission-trend-controls{width:100%;justify-content:space-between}.mission-trend-controls button{flex:1}.mission-dashboard .command-center-metrics .command-metric{min-height:152px}.mission-trend-graph{height:233px}}
@media(max-width:420px){.mission-dashboard .command-center-metrics{grid-template-columns:minmax(0,1fr)}.mission-dashboard .command-center-metrics .command-metric{min-height:141px}.mission-trend-heading h3{font-size:17px}}
@media(prefers-reduced-motion:reduce){.mission-trend-controls button,.mission-trend-svg *{transition:none!important}}


/* V3 / compact authenticated agent workspaces — CSS-only, zero financial mutations. */
.mission-workspace .mission-crumb{margin-bottom:9px}
.mission-workspace .mission-hero{padding:17px 20px;gap:14px}
.mission-workspace .mission-hero h2{font-size:clamp(22px,2.4vw,29px)}
.mission-workspace .mission-orb{flex-basis:60px;width:60px;height:60px;font-size:29px;border-radius:18px}
.mission-workspace .mission-stats{gap:10px;margin:12px 0}
.mission-workspace .mission-stat{padding:15px;min-height:0}
.mission-workspace .mission-stat small{min-height:0}
.mission-workspace .mission-module{padding:17px}
.mission-dashboard .command-center-head{padding:18px 22px!important;margin-bottom:12px!important}
.mission-dashboard .command-center-head h2{font-size:clamp(25px,2.5vw,32px)}
.mission-dashboard .command-center-metrics{gap:10px;margin-bottom:12px}
.mission-dashboard .command-metric{padding:13px 15px;min-height:110px}
.mission-dashboard .agent-grid{gap:10px}
.mission-dashboard .agent-card{min-height:127px;padding:13px}
.mission-dashboard .agent-card p{margin:7px 0}
.mission-dashboard .hermes-command{padding:16px}
.mission-dashboard .hermes-command-summary{margin:9px 0;padding:10px}
.mission-dashboard .command-priorities{margin:10px 0}
.mission-dashboard .command-priority{padding:8px 10px}
.mission-dashboard .agent-card:focus-visible{outline:3px solid #70c7ff;outline-offset:3px}
@media(min-width:1181px){
 .mission-dashboard .command-center-metrics{grid-template-columns:repeat(6,minmax(0,1fr))}
 .mission-dashboard .command-center-grid{grid-template-columns:minmax(0,1fr) minmax(0,3fr)}
 .mission-dashboard .agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:720px){
 .mission-workspace .mission-hero{padding:16px;flex-wrap:wrap}
 .mission-workspace .mission-hero-main{gap:12px}
 .mission-workspace .mission-orb{flex-basis:48px;width:48px;height:48px;font-size:24px}
 .mission-workspace .mission-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
 .mission-workspace .mission-stat{padding:13px}
}




/* Mobile owner cockpit V3: keep real labels, remove redundant empty comparison text. */
@media(max-width:570px){
 .mission-dashboard .command-center-head.mission-command-hero{min-height:0!important;max-height:none!important;height:auto!important;padding:15px!important;gap:8px}
 .mission-dashboard .command-center-head h2{font-size:clamp(22px,6vw,27px)!important;line-height:1.12}
 .mission-dashboard .command-center-head p{font-size:11px;line-height:1.45}
 .mission-dashboard .command-center-head .command-center-mode{margin-top:8px;max-width:100%;white-space:normal}
 .mission-dashboard .command-center-metrics{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important;margin:10px 0 14px!important}
 .mission-dashboard .command-center-metrics .command-metric{display:flex;flex-direction:column;align-items:stretch;gap:5px;min-width:0;min-height:0!important;height:auto!important;padding:12px 11px!important;border-radius:14px}
 .mission-dashboard .command-metric:before{width:28px;height:28px;right:8px;top:8px;font-size:14px}
 .mission-dashboard .command-metric>small:first-child{font-size:11px;line-height:1.3;min-height:28px;max-width:calc(100% - 32px)}
 .mission-dashboard .command-metric strong{font-size:clamp(17px,4.7vw,24px);line-height:1.15;letter-spacing:-.35px;margin:2px 0 0;overflow-wrap:anywhere}
 .mission-dashboard .command-metric .mission-profit-state{font-size:9px;line-height:1.3}
 .mission-dashboard .command-metric .mission-kpi-delta{font-size:9px;line-height:1.3}
 .mission-dashboard .command-metric .mission-kpi-delta[data-direction=UNAVAILABLE]{display:none}
 .mission-dashboard .command-metric .mission-kpi-comparison-date{display:none}
 .mission-dashboard .command-metric>span:not(.mission-kpi-delta):not(.mission-profit-state){display:none}
 .mission-dashboard .command-metric .mission-kpi-sparkline:empty{display:none}
 .mission-dashboard .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px}
 .mission-dashboard .agent-card{min-width:0;min-height:0!important;padding:11px!important;gap:5px}
 .mission-dashboard .agent-card p{font-size:10px;line-height:1.45}
 .mission-dashboard .agent-card .agent-card-metric{font-size:12px;overflow-wrap:anywhere}
 .mission-dashboard .agent-panel-head{gap:8px;align-items:center}
 .mission-dashboard .agent-panel-head h3{font-size:17px}
 .mission-dashboard .hermes-command{min-height:0;padding:13px}
 .mission-dashboard .hermes-command .command-priorities{max-height:190px;overflow:auto;overscroll-behavior:contain}
 .mission-trend-graph{height:195px}
}
@media(max-width:350px){
 .mission-dashboard .command-center-metrics{gap:7px!important}
 .mission-dashboard .command-center-metrics .command-metric{padding:10px 9px!important}
 .mission-dashboard .command-metric strong{font-size:17px}
 .mission-dashboard .agent-card{padding:9px!important}
}

`;
