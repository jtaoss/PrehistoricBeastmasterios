export const LEGAL_URLS=Object.freeze({
  terms:'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html',
  privacy:'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html',
  deletion:'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html'
});

const allowed=new Set(Object.values(LEGAL_URLS));

export function openLegalURL(url,host=globalThis.window){
  if(!allowed.has(url)||!host)return false;
  const bridge=host.android;
  if(bridge&&typeof bridge.sdkToBrowser==='function')bridge.sdkToBrowser(url);
  else if(typeof host.open==='function')host.open(url,'_blank','noopener,noreferrer');
  else return false;
  return true;
}

export function installLegalLinks(root=globalThis.document,host=globalThis.window){
  if(!root?.addEventListener)return()=>{};
  const onClick=event=>{
    const link=event.target?.closest?.('[data-legal-url]');
    if(!link||!root.contains(link))return;
    event.preventDefault();
    openLegalURL(link.dataset.legalUrl,host);
  };
  root.addEventListener('click',onClick);
  return()=>root.removeEventListener('click',onClick);
}
