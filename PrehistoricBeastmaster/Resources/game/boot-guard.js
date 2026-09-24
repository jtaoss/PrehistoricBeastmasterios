// Independent classic-script guard: never unlock a form whose handlers failed.
(function(){
  var timer=setTimeout(failed,15000);
  function failed(){
    if(document.getElementById('boot-error'))return;
    var panel=document.createElement('section');panel.id='boot-error';panel.setAttribute('role','alert');
    panel.style.cssText='position:fixed;z-index:99999;inset:20% 5% auto;background:#15382e;color:#fff0cd;padding:24px;border:2px solid #eccc83;border-radius:16px;font:18px system-ui;box-shadow:0 0 0 100vmax #061610dd';
    var title=document.createElement('h2');title.textContent='頁面未能啟動';
    var message=document.createElement('p');message.textContent='請重新載入再試。此操作不會清除存檔，也不會提交帳號或付款。';
    var retry=document.createElement('button');retry.textContent='重新載入';retry.style.cssText='padding:14px 24px;font:inherit;background:#eccc83;color:#15382e;border:0;border-radius:8px';
    retry.addEventListener('click',function(){location.reload();});panel.append(title,message,retry);document.body.append(panel);
  }
  window.emberwildBoot={ready:function(){clearTimeout(timer);document.documentElement.dataset.bootReady='true';},failed:function(){clearTimeout(timer);failed();}};
})();
