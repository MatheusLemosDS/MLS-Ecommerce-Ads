// A human code-release identifier, not a Cloudflare deployment UUID or hash.
// Keep it independent of build time, credentials and financial availability.
export const APP_RELEASE=Object.freeze({
 id:'2026-11-09.1',
 label:'Resultado diário e devoluções às claras',
 date:'09/11/2026',
});

export function releaseInfo(){
 return {schema:'app_release_v1',id:APP_RELEASE.id,label:APP_RELEASE.label,date:APP_RELEASE.date};
}
