import {installLegalLinks} from './legal-links.mjs';
import {AccountSession} from './account-session.mjs';

// Local front-end session only: no authentication or credential requests. The
// session stores a display name, never the submitted account or password.
const $ = id => document.getElementById(id);
const form = $('auth-form'), dialog = $('preview-dialog');
let storage=null;
try{storage=window.localStorage;}catch{}
const accountSession=new AccountSession(storage);
const views = {
  login: { title: '歡迎回到荒境', eyebrow: 'YOUR JOURNEY CONTINUES', copy: '收拾行囊，準備下一次遠征。', action: '登入荒境' },
  register: { title: '寫下你的獵人之名', eyebrow: 'EVERY LEGEND HAS A BEGINNING', copy: '新的伙伴，新的營地，新的故事。', action: '建立獵人帳號' },
  recover: { title: '找回歸途的路', eyebrow: 'FIND YOUR WAY HOME', copy: '別擔心，你的下一段旅程仍在等你。', action: '預覽找回流程' }
};
let mode = 'login', busy = false;

function renderSession(){
  const session=accountSession.reload();
  $('session-banner').hidden=!session;
  $('session-name').textContent=session?.label||'';
}

function clearError() {
  $('form-error').hidden = true;
  $('form-error').textContent = '';
  form.querySelectorAll('[aria-invalid]').forEach(control => control.removeAttribute('aria-invalid'));
}
function showError(message, field) {
  $('form-error').textContent = message;
  $('form-error').hidden = false;
  if (field) { $(field).setAttribute('aria-invalid', 'true'); $(field).focus(); }
}
function setView(next, focus = false) {
  if (!views[next] || busy) return;
  const previous = mode;
  mode = next;
  if (previous !== mode) {
    $('account').value = '';
    $('nickname').value = '';
  }
  document.documentElement.dataset.view = mode;
  const view = views[mode];
  $('form-title').textContent = view.title;
  $('form-eyebrow').textContent = view.eyebrow;
  $('form-description').textContent = view.copy;
  $('submit-label').textContent = view.action;
  for (const group of document.querySelectorAll('[data-field]')) {
    const name = group.dataset.field;
    const visible = name === 'account' || name === 'password' && mode !== 'recover' || ['nickname', 'confirm'].includes(name) && mode === 'register';
    group.hidden = !visible;
    group.querySelectorAll('input,button').forEach(control => { control.disabled = !visible; });
  }
  for (const control of document.querySelectorAll('.auth-tabs button')) {
    const active = control.dataset.view === mode;
    control.setAttribute('aria-selected', String(active));
    control.tabIndex = active ? 0 : -1;
  }
  document.querySelector('.auth-tabs').hidden = mode === 'recover';
  document.querySelector('.back-to-login').hidden = mode !== 'recover';
  document.querySelector('.login-options').hidden = mode !== 'login';
  document.querySelector('.consent-row').hidden = mode === 'recover';
  $('consent').disabled = mode === 'recover';
  document.querySelector('.recovery-note').hidden = mode !== 'recover';
  document.querySelector('.guest-section').hidden = mode === 'recover';
  $('account-label').textContent = mode === 'login' ? '帳號' : '電子郵件';
  $('account-hint').textContent = mode === 'login' ? 'ACCOUNT' : 'EMAIL ADDRESS';
  $('account').type = mode === 'login' ? 'text' : 'email';
  $('account').placeholder = mode === 'login' ? '輸入帳號或電子郵件' : 'hunter@example.com';
  $('password').placeholder = mode === 'register' ? '設定演示密碼（至少 6 字元）' : '輸入演示密碼';
  $('password').value = '';
  $('confirm').value = '';
  $('password').type = 'password';
  $('password-toggle').setAttribute('aria-pressed', 'false');
  $('password-toggle').setAttribute('aria-label', '顯示密碼');
  $('auth-panel').setAttribute('aria-labelledby', mode === 'recover' ? 'form-title' : `tab-${mode}`);
  clearError();
  if (focus) $(mode === 'register' ? 'nickname' : 'account').focus();
}
function showDialog(title, copy, allowGame = false) {
  $('dialog-title').textContent = title;
  $('dialog-copy').textContent = copy;
  $('dialog-game').hidden = !allowGame;
  if (!dialog.open) dialog.showModal();
}
const info = {
  help: ['先看見荒境，再開始旅程', '目前使用本機前端登入狀態，沒有接入雲端帳號服務。帳號與密碼不會上傳，密碼不會保存；只保存畫面上顯示的獵人名稱。退出帳號不會刪除本機遊戲存檔。用戶協議、隱私政策及帳號資料管理可從頁面下方開啟。']
};
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-info]').forEach(button => button.addEventListener('click', () => showDialog(...info[button.dataset.info])));
document.querySelector('.auth-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || busy) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : mode === 'login' ? 'register' : 'login';
  setView(next); $(`tab-${next}`).focus();
});
$('password-toggle').addEventListener('click', () => {
  const visible = $('password').type === 'password';
  $('password').type = visible ? 'text' : 'password';
  $('password-toggle').setAttribute('aria-pressed', String(visible));
  $('password-toggle').setAttribute('aria-label', visible ? '隱藏密碼' : '顯示密碼');
});
form.addEventListener('input', clearError);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  clearError();
  if (mode === 'register' && !$('nickname').value.trim()) return showError('先為你的獵人取個名字。', 'nickname');
  if (!$('account').value.trim()) return showError(mode === 'login' ? '請輸入演示帳號。' : '請輸入電子郵件。', 'account');
  if (mode !== 'login' && !$('account').validity.valid) return showError('請輸入完整的電子郵件格式，例如 hunter@example.com。', 'account');
  if (mode !== 'recover' && !$('password').value) return showError('請輸入演示密碼，不要使用真實密碼。', 'password');
  if (mode === 'register' && $('password').value.length < 6) return showError('演示密碼至少需要 6 個字元。', 'password');
  if (mode === 'register' && $('password').value !== $('confirm').value) return showError('兩次輸入的演示密碼不一致。', 'confirm');
  if (mode !== 'recover' && !$('consent').checked) return showError('請先勾選條款閱讀選項，再預覽下一步。', 'consent');
  const identity={account:$('account').value,nickname:$('nickname').value};
  busy = true;
  form.setAttribute('aria-busy', 'true');
  $('form-fields').disabled = true;
  document.querySelectorAll('.auth-tabs button,.back-to-login').forEach(button => { button.disabled = true; });
  $('guest-entry').disabled = true;
  $('submit-label').textContent = '正在預覽…';
  window.setTimeout(() => {
    busy = false;
    form.removeAttribute('aria-busy');
    $('form-fields').disabled = false;
    document.querySelectorAll('.auth-tabs button,.back-to-login').forEach(button => { button.disabled = false; });
    $('guest-entry').disabled = false;
    const was = mode;
    setView(mode);
    if(was==='recover')showDialog('找回介面演示完成','這是找回密碼的畫面演示，沒有寄出郵件，也沒有修改任何密碼。正式驗證與寄信服務將在後續接入。');
    else try{
      const session=accountSession.signIn(identity);renderSession();
      showDialog(was==='register'?'本機帳號已建立':'已登入荒境',`${session.label}，本機登入狀態已生效。帳號與密碼沒有上傳，密碼也沒有保存；原有遊戲存檔保持不變。`,true);
    }catch(error){showError(error.message);}
  }, 650);
});
$('logout-session').addEventListener('click',()=>{
  try{accountSession.signOut();renderSession();showDialog('已退出帳號','本機登入狀態已清除；遊戲存檔、營地、伙伴和設定完整保留。');}
  catch(error){showError(error.message);}
});
$('guest-entry').addEventListener('click', () => showDialog('以訪客身分出發', '繼續會返回現有的本機遊戲，不會建立帳號或重置存檔。新玩家仍需完成遊戲原有的新手訓練。', true));
$('close-dialog').addEventListener('click', () => dialog.close());
$('dismiss-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
// Unlock inputs only after submit prevention is installed. A missing/blocked module
// leaves the form disabled, so the static page cannot post entered credentials.
const requestedView = new URLSearchParams(location.search).get('view');
installLegalLinks(document,window);
setView(views[requestedView] ? requestedView : 'login');
renderSession();
$('form-fields').disabled = false;
