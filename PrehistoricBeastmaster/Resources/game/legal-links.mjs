const ENCODED=Object.freeze({
  terms:'aHR0cHM6Ly9kMXVkaG00Yzl2anpwaC5jbG91ZGZyb250Lm5ldC9pb3MtbGVnYWwvdGVybXMtb2Ytc2VydmljZS5odG1s',
  privacy:'aHR0cHM6Ly9kMXVkaG00Yzl2anpwaC5jbG91ZGZyb250Lm5ldC9pb3MtbGVnYWwvcHJpdmFjeS1wb2xpY3kuaHRtbA==',
  deletion:'aHR0cHM6Ly9kMXVkaG00Yzl2anpwaC5jbG91ZGZyb250Lm5ldC9pb3MtbGVnYWwvYWNjb3VudC1kZWxldGlvbi5odG1s'
});

const decode=key=>{
  const encoded=ENCODED[key];
  if(!encoded)return'';
  try{return decodeURIComponent(Array.from(atob(encoded),character=>
    `%${character.charCodeAt(0).toString(16).padStart(2,'0')}`).join(''));}
  catch{return'';}
};

export const LEGAL_KEYS=Object.freeze(Object.keys(ENCODED));

export function openLegalURL(key,host=globalThis.window){
  if(!LEGAL_KEYS.includes(key)||!host)return false;
  const bridge=host.pbmNative;
  if(bridge&&typeof bridge.sdkToBrowser==='function')bridge.sdkToBrowser(`pbm-legal:${key}`);
  else if(typeof host.open==='function')host.open(decode(key),'_blank','noopener,noreferrer');
  else return false;
  return true;
}

export function installLegalLinks(root=globalThis.document,host=globalThis.window){
  if(!root?.addEventListener)return()=>{};
  const onClick=event=>{
    const link=event.target?.closest?.('[data-legal]');
    if(!link||!root.contains(link))return;
    event.preventDefault();
    openLegalURL(link.dataset.legal,host);
  };
  root.addEventListener('click',onClick);
  return()=>root.removeEventListener('click',onClick);
}
