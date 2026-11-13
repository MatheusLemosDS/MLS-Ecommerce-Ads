import {BRAZA_THEME_HEAD,BRAZA_THEME_CSS} from './theme.mjs';
import {COMMERCIAL_ACCOUNT_CLIENT} from './commercial-account-client.mjs';

const accountPageEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const COMMERCIAL_ACCOUNT_CSS=String.raw`
*{box-sizing:border-box}body{margin:0;font:15px/1.65 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--accent);text-underline-offset:3px}button,input,select,textarea{font:inherit;max-width:100%}button,a,input,select,textarea,summary{touch-action:manipulation}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}button,.ca-button{display:inline-flex;justify-content:center;align-items:center;gap:8px;min-height:44px;padding:10px 16px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);text-decoration:none;font-weight:600}button.primary,.ca-button.primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}button.danger{color:var(--negative)}h1,h2,h3,p{margin:0}h1{font-size:30px;line-height:1.25;letter-spacing:-.7px}h2{font-size:21px;line-height:1.4}h3{font-size:17px}p+p{margin-top:12px}small{font-size:13px;color:var(--muted)}.ca-header{min-height:76px;padding:16px 28px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:20px;background:var(--surface)}.ca-brand{display:flex;gap:12px;align-items:center;color:var(--text);text-decoration:none;font-weight:750}.ca-brand span{display:grid;place-items:center;background:var(--accent);color:var(--on-accent);width:38px;height:38px;border-radius:9px;font-size:12px}.ca-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ca-skip{position:absolute;top:-100px;left:16px;padding:12px;background:var(--surface);z-index:99}.ca-skip:focus{top:8px}.ca-layout{display:grid;grid-template-columns:228px minmax(0,1fr);max-width:1600px;margin:auto;min-height:calc(100vh - 76px)}.ca-nav{padding:26px 16px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:7px;background:var(--surface)}.ca-nav a{min-height:44px;padding:10px 12px;border-radius:8px;color:var(--muted);text-decoration:none}.ca-nav a[aria-current]{background:var(--accent-soft);color:var(--accent);font-weight:650}.ca-nav strong{font-size:12px;color:var(--muted);letter-spacing:.08em;margin:16px 12px 4px;text-transform:uppercase}.ca-main{min-width:0;width:100%;padding:32px;max-width:1200px}.ca-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:24px}.ca-heading p{color:var(--muted);margin-top:9px;max-width:760px}.ca-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}.ca-card{border:1px solid var(--line);border-radius:12px;padding:24px;background:var(--surface);min-width:0;margin-bottom:20px;overflow-wrap:anywhere}.ca-card h2,.ca-card h3{margin-bottom:12px}.ca-card p{color:var(--muted)}.ca-form{display:grid;gap:18px;margin-top:20px}.ca-field{display:grid;gap:7px;min-width:0}.ca-field label{font-size:14px;font-weight:600}.ca-field input,.ca-field select,.ca-field textarea{width:100%;min-width:0;min-height:44px;padding:10px 12px;border:1px solid #778ca2;border-radius:8px;background:var(--surface-raised);color:var(--text)}html[data-theme=dark] .ca-field :is(input,select,textarea){border-color:#637f9b}.ca-field textarea{min-height:100px;resize:vertical}.ca-field input::placeholder{color:var(--muted)}.ca-check{min-height:44px;display:flex;align-items:flex-start;gap:10px;font-size:14px}.ca-check input{width:20px;height:20px;margin:3px 0 0;flex:0 0 20px}.ca-capabilities{min-width:0;margin:0;padding:16px;border:1px solid var(--line);border-radius:8px}.ca-capabilities legend{font-size:14px;font-weight:600;padding:0 6px}.ca-capabilities p{font-size:14px;margin-bottom:14px}.ca-capabilities [data-capability-options]{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:6px 14px}.ca-password{display:flex;align-items:stretch;gap:6px}.ca-password input{flex:1;min-width:0}.ca-password button{font-size:13px;padding:8px 10px;flex-shrink:0}.ca-row{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid var(--line)}.ca-row:last-child{border-bottom:0}.ca-row>div{min-width:0}.ca-row strong,.ca-row small{display:block}.ca-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ca-notice{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:9px;padding:14px 16px;background:var(--surface-raised);margin:16px 0;overflow-wrap:anywhere}.ca-notice[data-error=true]{border-left-color:var(--negative);color:var(--negative)}.ca-badge{display:inline-block;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface-raised);font-size:13px;line-height:1.5}.ca-public .ca-layout{display:block;max-width:1340px}.ca-public .ca-nav{display:none}.ca-public .ca-main{max-width:1340px;margin:auto;padding:28px 40px}.ca-auth{display:grid;grid-template-columns:1.05fr 1fr;border:1px solid var(--line);border-radius:16px;overflow:hidden;min-height:630px;background:var(--surface)}.ca-story{padding:44px;background:var(--surface-raised);border-right:1px solid var(--line);display:flex;flex-direction:column;justify-content:space-between;gap:36px}.ca-story h2{font-size:36px;line-height:1.2;letter-spacing:-1px;max-width:450px}.ca-story p{color:var(--muted);margin-top:20px}.ca-story ul{padding-left:20px;color:var(--muted);display:grid;gap:16px}.ca-auth-form{padding:38px 42px;align-self:center;min-width:0}.ca-auth-form .ca-heading{display:block}.ca-auth-form .ca-heading h1{font-size:27px}.ca-auth-form .ca-card{border:0;padding:0;margin:0}.ca-auth-form .ca-actions{margin-top:20px}.ca-auth-form .ca-form>button{width:100%}.ca-table{max-width:100%;overflow:auto}.ca-table table{border-collapse:collapse;width:100%;min-width:440px;font-size:14px}.ca-table th,.ca-table td{text-align:left;padding:12px;border-bottom:1px solid var(--line);vertical-align:top}.ca-table th{background:var(--surface-raised)}.ca-code{font:15px/1.8 ui-monospace,monospace;padding:16px;border:1px solid var(--line);border-radius:8px;overflow-wrap:anywhere;background:var(--surface-raised);white-space:pre-wrap}.ca-footer{padding:20px 0;font-size:13px;color:var(--muted)}.ca-status:empty{display:none}.ca-context{margin-bottom:18px;font-size:14px;color:var(--muted)}.ca-error-field{color:var(--negative);font-size:14px}summary{cursor:pointer;min-height:44px;padding:12px 0}.ca-steps{display:grid;gap:12px;padding:0;list-style:none}.ca-steps li{padding:14px;border:1px solid var(--line);border-radius:8px}.ca-steps a{display:block;min-height:44px;padding-top:8px}.ca-empty{padding:24px 0;color:var(--muted)}[aria-busy=true]{cursor:progress}.ca-secret strong{color:var(--text)}@media(max-width:1000px){.ca-grid{grid-template-columns:minmax(0,1fr)}.ca-story{padding:30px}.ca-auth-form{padding:32px}.ca-main{padding:24px}}@media(max-width:850px){.ca-layout{display:block}.ca-nav{display:flex;flex-direction:row;overflow:auto;border-right:0;border-bottom:1px solid var(--line);padding:8px 12px;gap:4px}.ca-nav a{flex:0 0 auto;white-space:nowrap}.ca-nav strong{display:none}.ca-auth{display:block;max-width:580px;margin:auto;min-height:0}.ca-story{display:none}.ca-public .ca-main{padding:20px}.ca-heading{flex-wrap:wrap}.ca-main{padding:24px 16px}.ca-header{padding:12px 16px;gap:12px}.ca-tools .ca-legacy{display:none}}@media(max-width:500px){h1{font-size:26px}.ca-main,.ca-public .ca-main{padding:18px 12px}.ca-auth-form{padding:26px 20px}.ca-card{padding:20px}.ca-header{flex-wrap:wrap}.ca-brand{font-size:14px}.ca-heading{gap:12px}.ca-form .ca-actions button{flex:1}.ca-password{flex-wrap:wrap}.ca-password button{min-width:80px}.ca-tools{gap:6px}.ca-tools button{padding:8px 10px}.ca-code{font-size:14px}}
/* Account surfaces map the supplied HTML's ac4 design onto the real ca forms. */
:root{--ca-brand:#73a9e8;--ca-on-brand:#081a30;--ca-story:#101e30;--ca-inset:#0b1829;--ca-radius:12px}
html[data-theme=light]{--ca-brand:#245f9e;--ca-on-brand:#fff;--ca-story:#edf2f8;--ca-inset:#f7f9fc}
body{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
button,.ca-button{min-height:44px;padding:10px 15px;border-radius:8px;font-size:12px;font-weight:600;line-height:1.4}
button.primary,.ca-button.primary{background:var(--ca-brand);color:var(--ca-on-brand);border-color:var(--ca-brand)}
button:hover,.ca-button:hover{background:var(--surface-raised);border-color:var(--muted)}
button.primary:hover,.ca-button.primary:hover{background:var(--ca-brand);border-color:var(--ca-brand);filter:brightness(1.05)}
button:focus-visible,.ca-button:focus-visible,.ca-nav a:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--ca-brand);outline-offset:3px}
button:disabled{filter:none}
.ca-header{gap:18px;min-height:72px;padding:14px 28px}
.ca-brand{gap:12px;font-size:17px;letter-spacing:-.45px}
.ca-brand span{background:var(--ca-brand);color:var(--ca-on-brand);border-radius:9px;font-weight:800;letter-spacing:-.3px}
.ca-tools{gap:11px}
.ca-layout{min-height:calc(100vh - 72px)}
.ca-nav{padding:23px 14px 16px;gap:3px}
.ca-nav a{font-size:13px;line-height:1.5;border:1px solid transparent}
.ca-nav a[aria-current]{background:var(--accent-soft);color:var(--ca-brand);border-color:color-mix(in srgb,var(--ca-brand) 25%,transparent);font-weight:650}
.ca-nav strong{font-size:10px;letter-spacing:1.2px;margin:17px 12px 6px}
.ca-main{padding:27px 28px 38px}
.ca-heading{align-items:center;margin-bottom:24px}
.ca-heading h1{font-size:29px;letter-spacing:-.8px;line-height:1.25;font-weight:680}
.ca-heading p{font-size:13px;line-height:1.75;margin-top:7px}
.ca-context{font-size:12px;line-height:1.7;margin-bottom:18px}
.ca-grid{grid-template-columns:minmax(0,1.6fr) minmax(250px,1fr);gap:20px}
.ca-card{padding:24px;border-radius:var(--ca-radius);margin-bottom:20px;box-shadow:none}
.ca-card h2{font-size:16px;line-height:1.4;letter-spacing:-.3px;margin-bottom:18px;font-weight:650}
.ca-card h3{font-size:15px;line-height:1.5;letter-spacing:-.2px}
.ca-card p{font-size:12px;line-height:1.75}
.ca-form{gap:19px;margin-top:22px}
.ca-field{gap:7px}
.ca-field label{font-size:12px;font-weight:550;line-height:1.5}
.ca-field :is(input,select,textarea){min-height:44px;border-radius:7px;background:var(--ca-inset);padding:10px 12px;font-size:13px;line-height:1.5}
html[data-theme] .ca-field :is(input,select,textarea){border-color:var(--line)}
.ca-field :is(input,select,textarea):focus{border-color:var(--ca-brand)}
.ca-field input::placeholder{opacity:.85}
.ca-field small{font-size:11px;line-height:1.6}
.ca-form>p,.ca-capabilities p{font-size:12px;line-height:1.7}
.ca-capabilities{padding:16px;border-radius:8px;background:var(--ca-inset)}
.ca-capabilities legend{font-size:12px;font-weight:600}
.ca-password{gap:0;border:1px solid var(--line);border-radius:7px;background:var(--ca-inset);min-width:0}
.ca-password:focus-within{border-color:var(--ca-brand)}
html[data-theme] .ca-password input{border:0;background:transparent;border-radius:7px 0 0 7px;min-width:0}
.ca-password button{flex-shrink:0;min-width:44px;max-width:110px;padding:8px 10px;border:0;border-left:1px solid var(--line);border-radius:0 7px 7px 0;background:transparent;color:var(--muted);font-size:11px;white-space:normal}
.ca-password button:hover{color:var(--text)}
.ca-check{font-size:12px;line-height:1.7;min-height:44px}
.ca-check input{accent-color:var(--ca-brand);flex-basis:20px;width:20px;height:20px}
.ca-row{gap:14px;padding:18px 0;font-size:12px;line-height:1.6}
.ca-row strong{font-size:12px;font-weight:600}
.ca-row small{font-size:11px;line-height:1.6;margin-top:3px}
.ca-row>details[open]{flex:1 1 100%;width:100%;padding:0 16px 16px;border:1px solid var(--line);border-radius:8px;background:var(--ca-inset)}
.ca-row>details[open]>summary{font-size:12px}
.ca-actions{gap:9px}
.ca-notice{gap:9px;padding:13px 14px;border:1px solid var(--line);border-left:3px solid var(--ca-brand);border-radius:8px;background:var(--ca-inset);font-size:12px;line-height:1.7;margin:20px 0}
.ca-notice[data-error=true]{border-left-color:var(--negative);color:var(--negative)}
.ca-form .ca-notice{margin-top:0}
.ca-badge{min-height:25px;padding:4px 8px;border-radius:5px;font-size:11px;line-height:1.35;font-weight:600}
.ca-table table{font-size:13px}
.ca-table th,.ca-table td{padding:13px 14px;line-height:1.6}
.ca-table th{font-size:11px;font-weight:550;background:var(--ca-inset);color:var(--muted)}
.ca-code{font-size:14px;line-height:1.8;background:var(--ca-inset)}
.ca-steps{gap:12px}
.ca-steps li{padding:16px;border-radius:9px;font-size:12px;line-height:1.7}
.ca-steps li strong{font-size:13px}
.ca-empty{font-size:12px;line-height:1.75}
.ca-error-field{font-size:12px;line-height:1.6}
.ca-footer{max-width:1340px;margin:auto;font-size:11px;line-height:1.7}
.ca-public .ca-header{position:relative;justify-content:space-between;min-height:80px;max-width:1340px;margin:auto;padding:18px 40px;background:var(--app-bg);border-bottom:0}
.ca-public .ca-main{max-width:1340px;padding:22px 40px 24px}
.ca-auth{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);min-height:660px;border-radius:18px}
.ca-story{padding:42px 42px 34px;background:var(--ca-story);gap:36px}
.ca-story h2{font-size:37px;line-height:1.16;letter-spacing:-1.1px;max-width:450px;font-weight:680}
.ca-story p{font-size:14px;line-height:1.8;max-width:410px;margin-top:19px}
.ca-story>ul{list-style:none;padding:0;gap:0;margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface)}
.ca-story>ul>li{position:relative;display:flex;align-items:center;padding:17px 38px 17px 20px;border-bottom:1px solid var(--line);font-size:12px;line-height:1.6}
.ca-story>ul>li:last-child{border-bottom:0}
.ca-story>ul>li:after{content:"";position:absolute;right:20px;top:calc(50% - 5px);width:5px;height:9px;border:solid var(--positive);border-width:0 1.5px 1.5px 0;transform:rotate(45deg)}
.ca-story>small{display:flex;align-items:center;gap:13px;font-size:10px;line-height:1.8}
.ca-story>small:before{content:"MLS";display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--muted);font-size:11px;font-weight:800}
.ca-story-badge{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--ca-brand);font-size:10px;line-height:1.35;font-weight:600;letter-spacing:1.2px}
.ca-story-badge+h2{margin-top:22px}
.ca-story-panel{border:1px solid var(--line);background:var(--surface);border-radius:12px;overflow:hidden}
.ca-story-panel-head{display:flex;gap:11px;align-items:center;padding:19px 20px;background:var(--ca-inset);border-bottom:1px solid var(--line)}
.ca-story-panel-head strong{display:block;font-size:13px;font-weight:650}
.ca-story-panel-head small{display:block;font-size:10px;color:var(--muted);margin-top:3px;line-height:1.6}
.ca-store-mark{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;background:var(--accent-soft);color:var(--ca-brand);border:1px solid var(--line);border-radius:8px}
.ca-story-item{display:grid;grid-template-columns:20px minmax(0,1fr) 16px;align-items:center;gap:12px;padding:17px 20px;border-bottom:1px solid var(--line)}
.ca-story-item:last-child{border-bottom:0}
.ca-story-item>svg{color:var(--muted);width:18px;height:18px}
.ca-story-item>svg:last-child{color:var(--positive);width:15px;height:15px}
.ca-story-item strong{display:block;font-size:12px;font-weight:600}
.ca-story-item span{display:block;font-size:10px;color:var(--muted);margin-top:4px;line-height:1.6}
.ca-story-footer{display:flex;gap:13px;align-items:center}
.ca-story-footer .ca-solid-square{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--muted);font-size:11px;font-weight:800}
.ca-story-footer p{margin:0;font-size:10px;line-height:1.8}
.ca-story-footer strong{color:var(--text);font-weight:500}
.ca-auth-form{display:flex;flex-direction:column;justify-content:center;padding:38px 44px 28px;align-self:stretch;min-width:0}
.ca-auth-form>*{width:100%;max-width:405px;margin-left:auto;margin-right:auto}
.ca-auth-form .ca-heading{margin-bottom:0}
.ca-auth-form .ca-heading h1{font-size:27px;letter-spacing:-.65px;line-height:1.25;font-weight:670}
.ca-auth-form .ca-heading p{font-size:13px;line-height:1.8;margin-top:10px}
.ca-auth-form .ca-form{margin-top:25px}
.ca-auth-form>.ca-actions{justify-content:space-between;gap:12px;margin-top:18px;font-size:12px}
.ca-auth-form>.ca-actions .ca-button{background:transparent;border-color:transparent;padding:8px 0;color:var(--ca-brand)}
.ca-auth-form>.ca-notice{margin-top:22px}
.ca-auth-form>.ca-notice .ca-button{background:transparent;border-color:transparent;color:var(--ca-brand);padding:8px 0}
/* The profile uses its actual editable identity and e-mail workflow in the
   reference's wide/narrow columns. Security and company permissions retain
   their existing source, forms and independently guarded actions. */
@media(min-width:1001px){
 #accountMain:has(form[data-form=profile] [name=name]){display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);gap:20px;align-items:start;align-content:start}
 #accountMain:has(form[data-form=profile] [name=name])>.ca-heading,
 #accountMain:has(form[data-form=profile] [name=name])>#accountStatus{grid-column:1/-1;margin-bottom:0}
 #accountMain:has(form[data-form=profile] [name=name])>.ca-card{min-width:0;margin:0}
 #accountMain:has(form[data-form=profile] [name=name])>.ca-card:has(form[data-form=profile]){grid-column:1}
 #accountMain:has(form[data-form=profile] [name=name])>.ca-card:has(form[data-form=email]),
 #accountMain:has(form[data-form=profile] [name=name])>.ca-button{grid-column:2}
 #accountMain:has(form[data-form=profile] [name=name])>.ca-card:has(form[data-form=profile])>h2{font-size:20px;line-height:1.4}
 #accountMain form[data-form=profile]:has([name=name]){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 16px}
 #accountMain form[data-form=profile]:has([name=name])>.ca-field:has([name=name]),
 #accountMain form[data-form=profile]:has([name=name])>:is(p,[data-feedback],.ca-actions){grid-column:1/-1}
 #accountMain form[data-form=profile]:has([name=name])>.ca-field{min-width:0;margin:0}
}
@media(max-width:1180px){.ca-grid{grid-template-columns:minmax(0,1.4fr) minmax(240px,1fr);gap:16px}.ca-card{padding:21px}}
@media(max-width:1000px){.ca-main{padding:23px}.ca-grid{grid-template-columns:minmax(0,1fr)}.ca-auth-form{padding:36px 36px 26px}.ca-story{padding:34px 30px}.ca-story h2{font-size:33px}}
@media(max-width:850px){.ca-layout{display:block}.ca-header{min-height:64px;padding:10px 16px;gap:12px}.ca-nav{padding:8px 16px;gap:14px}.ca-nav a{padding:9px 2px 12px;border:0;border-radius:0;border-bottom:2px solid transparent;font-size:12px}.ca-nav a[aria-current]{border-color:var(--ca-brand);background:none}.ca-main{padding:20px 16px 90px}.ca-public .ca-header{min-height:72px;padding:15px 24px}.ca-public .ca-main{padding:15px 24px 24px}.ca-auth{display:grid;grid-template-columns:minmax(0,1fr);max-width:580px;margin:auto;min-height:0}.ca-story{display:none}.ca-auth-form{padding:36px 36px 26px}.ca-auth-form>*{max-width:420px}.ca-heading{align-items:flex-start;flex-wrap:wrap}.ca-row{gap:12px}}
@media(max-width:500px){.ca-header{flex-wrap:wrap}.ca-brand{font-size:14px}.ca-brand span{width:32px;height:32px;flex-basis:32px;border-radius:7px;font-size:10px}.ca-public .ca-header{min-height:72px;padding:15px 16px;gap:12px}.ca-tools{gap:8px}.ca-tools button,.ca-tools .ca-button{font-size:11px;padding:8px 11px;min-height:44px}.ca-main{padding:20px 16px 90px}.ca-public .ca-main{padding:5px 16px 20px}.ca-auth{border-radius:12px}.ca-auth-form{padding:27px 20px 21px}.ca-auth-form .ca-heading h1{font-size:24px}.ca-auth-form .ca-heading p{font-size:12px}.ca-heading{gap:14px;margin-bottom:19px}.ca-heading h1{font-size:25px}.ca-heading p{font-size:12px}.ca-card{padding:18px}.ca-card h2{font-size:15px}.ca-form{gap:18px}.ca-actions{flex-wrap:wrap}.ca-actions .ca-button,.ca-actions button{max-width:100%}.ca-password{flex-wrap:nowrap}.ca-password button{min-width:68px;font-size:10px;padding:8px}.ca-row{padding:20px 0}.ca-row>details[open]{padding:0 12px 12px}.ca-notice{font-size:11px;padding:13px 14px}.ca-check{font-size:11px}.ca-code{font-size:13px}.ca-footer{font-size:10px}}
@media(prefers-reduced-motion:reduce){button,.ca-button{transition:none}.ca-button:hover,button:hover{transform:none}}
`;

export function commercialAccountRoute(path){
 const aliases={'/register':'register','/account/register':'register','/account/login':'login','/verify-email':'verify','/forgot-password':'forgot','/reset-password':'reset','/invitations/accept':'invitation','/companies':'companies','/companies/new':'new-company','/onboarding':'onboarding','/account/profile':'profile','/account/security':'security','/account/security/events':'events','/account/sessions':'sessions','/account/preferences':'preferences','/account/notifications':'notifications','/account/help':'help','/account/data':'data'};
 if(Object.hasOwn(aliases,path))return {page:aliases[path],company:null};
 const match=/^\/companies\/([-a-zA-Z0-9_]{1,128})\/(settings|team|stores|billing|audit|onboarding)$/.exec(path);return match?{page:match[2],company:match[1]}:null;
}
export function renderCommercialAccountPage(request,{release={}}={}){
 const url=new URL(request.url),route=commercialAccountRoute(url.pathname);if(!route)return null;
 if(request.method!=='GET')return new Response('Método não permitido',{status:405,headers:{allow:'GET','cache-control':'no-store'}});
 const publicPage=['login','register','verify','forgot','reset','invitation'].includes(route.page),config=JSON.stringify(route).replace(/</g,'\\u003c'),version=accountPageEscape(release.label||release.id||'MLS Commerce OS');
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Conta e empresa · MLS Commerce OS</title>'+BRAZA_THEME_HEAD+'<style>'+BRAZA_THEME_CSS+COMMERCIAL_ACCOUNT_CSS+'</style></head><body class="'+(publicPage?'ca-public':'')+'"><a class="ca-skip" href="#accountMain">Pular para o conteúdo</a><header class="ca-header"><a class="ca-brand" href="/companies"><span>MLS</span>Commerce OS</a><div class="ca-tools"><a class="ca-legacy" href="/login">Acesso atual da loja</a><button type="button" data-braza-theme-toggle>Tema</button><a class="ca-button" href="/account/help">Ajuda</a></div></header><div class="ca-layout"><nav id="accountNavigation" class="ca-nav" aria-label="Conta e empresa"></nav><main id="accountMain" class="ca-main" tabindex="-1"><p class="ca-notice" role="status">Carregando o acesso à conta…</p><noscript><p>Ative o JavaScript para consultar os formulários e as ações da conta. O acesso atual da loja permanece disponível em <a href="/login">Entrar na loja</a>.</p></noscript></main></div><script>globalThis.__mlsAccountPage='+config+';</script><script>'+COMMERCIAL_ACCOUNT_CLIENT+'</script><footer class="ca-footer" style="padding:16px 28px">'+version+'</footer></body></html>';
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
}
