import {installLegalLinks} from './legal-links.mjs';
import {AccountSession} from './account-session.mjs';
import {NativeAccountAuth} from './native-auth.mjs';

const TERMS_VERSION='2026-09-20';
const ACCOUNT_PATTERN=/^[a-z0-9][a-z0-9_]{5,23}$/;
const returnToCamp=new URLSearchParams(location.search).get('return')==='camp';
const $=id=>document.getElementById(id);
const form=$('auth-form'),dialog=$('preview-dialog');
let storage=null;
try{storage=window.localStorage;}catch{}
const accountSession=new AccountSession(storage),nativeAuth=new NativeAccountAuth(window);
const views={
  login:{title:'歡迎回到營地',eyebrow:'YOUR JOURNEY CONTINUES',copy:'使用你的正式帳號繼續旅程。',action:'安全登入'},
  register:{title:'寫下你的獵人之名',eyebrow:'EVERY LEGEND HAS A BEGINNING',copy:'建立帳號，讓身份與付款安全綁定。',action:'建立獵人帳號'},
  recover:{title:'找回歸途的路',eyebrow:'FIND YOUR WAY HOME',copy:'輸入遊戲帳號並提交安全找回申請。',action:'提交找回申請'}
};
let mode='login',busy=false;

function renderSession(){
  const session=accountSession.reload();
  $('session-banner').hidden=!session;$('session-name').textContent=session?.label||'';
}
function clearError(){
  $('form-error').hidden=true;$('form-error').textContent='';
  form.querySelectorAll('[aria-invalid]').forEach(control=>control.removeAttribute('aria-invalid'));
}
function showError(message,field){
  $('form-error').textContent=message;$('form-error').hidden=false;
  if(field){$(field).setAttribute('aria-invalid','true');$(field).focus();}
}
function setBusy(next,label=''){
  busy=next;form.toggleAttribute('aria-busy',next);$('form-fields').disabled=next;
  document.querySelectorAll('.auth-tabs button,.back-to-login').forEach(button=>{button.disabled=next;});
  $('guest-entry').disabled=next;$('logout-session').disabled=next;
  $('submit-label').textContent=label||views[mode].action;
}
function setView(next,focus=false){
  if(!views[next]||busy)return;
  const previous=mode;mode=next;
  if(previous!==mode){$('account').value='';$('nickname').value='';}
  document.documentElement.dataset.view=mode;
  const view=views[mode];$('form-title').textContent=view.title;$('form-eyebrow').textContent=view.eyebrow;
  $('form-description').textContent=view.copy;$('submit-label').textContent=view.action;
  for(const group of document.querySelectorAll('[data-field]')){
    const name=group.dataset.field,visible=name==='account'||name==='password'&&mode!=='recover'||['nickname','confirm'].includes(name)&&mode==='register';
    group.hidden=!visible;group.querySelectorAll('input,button').forEach(control=>{control.disabled=!visible;});
  }
  for(const control of document.querySelectorAll('.auth-tabs button')){
    const active=control.dataset.view===mode;control.setAttribute('aria-selected',String(active));control.tabIndex=active?0:-1;
  }
  document.querySelector('.auth-tabs').hidden=mode==='recover';document.querySelector('.back-to-login').hidden=mode!=='recover';
  document.querySelector('.login-options').hidden=mode!=='login';document.querySelector('.consent-row').hidden=mode==='recover';
  $('consent').disabled=mode==='recover';document.querySelector('.recovery-note').hidden=mode!=='recover';
  document.querySelector('.guest-section').hidden=mode==='recover'||returnToCamp;$('account-label').textContent='帳號';
  $('account-hint').textContent='ACCOUNT ID';$('account').type='text';
  $('account').placeholder=mode==='register'?'設定 6–24 位英數帳號':'輸入遊戲帳號';
  $('account').autocomplete='username';
  $('password').placeholder=mode==='register'?'設定密碼（至少 8 字元）':'輸入密碼';
  $('password').autocomplete=mode==='register'?'new-password':'current-password';
  $('password').value='';$('confirm').value='';$('password').type='password';
  $('password-toggle').setAttribute('aria-pressed','false');$('password-toggle').setAttribute('aria-label','顯示密碼');
  $('auth-panel').setAttribute('aria-labelledby',mode==='recover'?'form-title':`tab-${mode}`);clearError();
  if(focus)$(mode==='register'?'nickname':'account').focus();
}
function showDialog(title,copy,allowGame=false,destination='index.html'){
  $('dialog-title').textContent=title;$('dialog-copy').textContent=copy;$('dialog-game').hidden=!allowGame;
  $('dialog-game').href=destination;$('dialog-game').textContent=destination.includes('enter=camp')?'進入營地 ↗':'前往本機遊戲 ↗';
  if(!dialog.open)dialog.showModal();
}
const info={help:['原始文明：聖獸覺醒帳號','帳號、註冊、找回與退出均由 iOS 原生安全通道連接 HTTPS 帳號服務。密碼不會寫入遊戲存檔、localStorage 或日誌；登入令牌只保存在 iOS Keychain。訪客可試玩，但不能發起真實付款。']};
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
document.querySelectorAll('[data-info]').forEach(button=>button.addEventListener('click',()=>showDialog(...info[button.dataset.info])));
document.querySelector('.auth-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||busy)return;event.preventDefault();
  const next=event.key==='Home'?'login':event.key==='End'?'register':mode==='login'?'register':'login';setView(next);$(`tab-${next}`).focus();
});
$('password-toggle').addEventListener('click',()=>{
  const visible=$('password').type==='password';$('password').type=visible?'text':'password';
  $('password-toggle').setAttribute('aria-pressed',String(visible));$('password-toggle').setAttribute('aria-label',visible?'隱藏密碼':'顯示密碼');
});
form.addEventListener('input',clearError);
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;clearError();
  if(mode==='register'&&!$('nickname').value.trim())return showError('先為你的獵人取個名字。','nickname');
  if(!$('account').value.trim())return showError('請輸入遊戲帳號。','account');
  if(!ACCOUNT_PATTERN.test($('account').value.trim().toLowerCase()))return showError('帳號須為 6–24 位英文字母、數字或底線。','account');
  if(mode!=='recover'&&!$('password').value)return showError('請輸入密碼。','password');
  if(mode==='register'&&$('password').value.length<8)return showError('密碼至少需要 8 個字元。','password');
  if(mode==='register'&&$('password').value!==$('confirm').value)return showError('兩次輸入的密碼不一致。','confirm');
  if(mode!=='recover'&&!$('consent').checked)return showError('請先閱讀並同意用戶協議與隱私政策。','consent');
  const submittedMode=mode,account=$('account').value.trim().toLowerCase(),password=$('password').value,nickname=$('nickname').value.trim();
  setBusy(true,submittedMode==='recover'?'正在送出…':'正在安全驗證…');
  try{
    if(submittedMode==='recover'){
      await nativeAuth.recover(account);showDialog('找回申請已提交','如果此帳號存在且符合找回條件，系統會提供下一步安全驗證說明。為保護帳號，我們不會在此確認帳號是否存在。');
    }else{
      const result=submittedMode==='register'
        ?await nativeAuth.register(account,password,nickname,TERMS_VERSION)
        :await nativeAuth.login(account,password);
      const session=accountSession.accept(result);renderSession();
      showDialog(submittedMode==='register'?'帳號已建立':'已登入遊戲',`${session.label}，安全登入已完成。令牌保存在 iOS Keychain，密碼未寫入遊戲存檔。`,true,returnToCamp?'index.html?enter=camp':'index.html');
      $('account').value='';$('nickname').value='';
    }
  }catch(error){showError(error?.message||'帳號服務未能完成請求。');}
  finally{$('password').value='';$('confirm').value='';setBusy(false);}
});
$('logout-session').addEventListener('click',async()=>{
  if(busy)return;clearError();setBusy(true,'正在退出…');
  try{await nativeAuth.logout();accountSession.clear();renderSession();showDialog('已安全退出','本機登入令牌已清除；遊戲存檔、營地、伙伴與設定完整保留。');}
  catch(error){showError(error?.message||'暫時無法退出帳號。');}
  finally{setBusy(false);}
});
$('guest-entry').addEventListener('click',()=>showDialog('以訪客身分出發','訪客可以遊玩並保留本機進度，但不能發起真實付款。登入後才會把新訂單綁定至正式玩家 ID。',true));
$('close-dialog').addEventListener('click',()=>dialog.close());$('dismiss-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});

async function refreshNativeSession(){
  if(!nativeAuth.available())return;
  try{
    const status=await nativeAuth.status();
    if(status.authenticated){
      const session=accountSession.accept(status);renderSession();
      if(returnToCamp)showDialog('帳號已登入',`${session.label}，安全登入仍有效，可以直接進入營地。`,true,'index.html?enter=camp');
    }else{accountSession.clear();renderSession();}
  }
  catch(error){if(error?.code==='AUTH_NOT_CONFIGURED')$('demo-note').innerHTML='<span>等待後端設定</span> 帳號 API 尚未部署，暫不可登入或付款';}
}
const requestedView=new URLSearchParams(location.search).get('view');
installLegalLinks(document,window);setView(views[requestedView]?requestedView:'login');renderSession();$('form-fields').disabled=false;
window.emberwildBoot?.ready();
refreshNativeSession();
