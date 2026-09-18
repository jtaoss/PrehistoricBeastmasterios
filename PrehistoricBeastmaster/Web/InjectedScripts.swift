import Foundation

enum InjectedScripts {
    /// The hosted game loads its large JavaScript bundles sequentially, but its
    /// loader has no error callback. A single transient CDN failure therefore
    /// leaves the stock "loading" screen visible forever. Install this at
    /// document start so failed dynamic scripts can be retried before the page
    /// creates them.
    static let loadingRecovery = """
    (function(){if(window.__pbmLoadingRecoveryInstalled){return;}
    var pageHost=String(window.location.hostname||'').toLowerCase();
    if(pageHost!=='saftcdn.antieh.com'&&pageHost!=='xundaocdn.xmw520.com'){return;}
    window.__pbmLoadingRecoveryInstalled=true;
    var failures=0,lastActivity=Date.now(),reloadScheduled=false;
    var retryLimit=3,reloadKey='pbm_loader_reload_at';
    function progress(message){
    var label=document.getElementById('loadProgress');
    if(label){label.textContent=message;}}
    function retryButton(){
    if(document.getElementById('__pbmRetryLoading')){return;}
    var host=document.getElementById('loadingUi')||document.body;
    if(!host){return;}
    var button=document.createElement('button');
    button.id='__pbmRetryLoading';button.type='button';button.textContent='重新載入';
    button.style.cssText='display:block;margin:18px auto 0;padding:10px 22px;border:0;border-radius:999px;background:#7df1c9;color:#07342d;font:700 15px sans-serif;';
    button.addEventListener('click',function(){window.location.reload();});
    host.appendChild(button);}
    function reloadOnce(){
    if(reloadScheduled){return;}reloadScheduled=true;
    var previous=0;try{previous=Number(sessionStorage.getItem(reloadKey)||0);}catch(ignore){}
    if(Date.now()-previous>120000){
    try{sessionStorage.setItem(reloadKey,String(Date.now()));}catch(ignore){}
    progress('網路異常，正在重新載入…');setTimeout(function(){window.location.reload();},1200);
    }else{progress('遊戲資源載入失敗，請重新載入');retryButton();}}
    function recoveryURL(source,attempt){
    var mark='pbm_retry='+Date.now()+'_'+attempt;
    return source+(source.indexOf('?')>=0?'&':'?')+mark;}
    function recover(original){
    if(!original||original.__pbmRecoveryStarted){return;}
    original.__pbmRecoveryStarted=true;var source=original.src,attempt=0;
    function tryAgain(){
    attempt+=1;failures+=1;lastActivity=Date.now();
    progress('網路不穩，正在重試遊戲資源（'+attempt+'/'+retryLimit+'）');
    console.warn('[PBM-SHELL] Retrying failed script '+source+' attempt '+attempt);
    var replacement=document.createElement('script');
    replacement.async=false;replacement.__pbmRecoveryReplacement=true;
    replacement.src=recoveryURL(source,attempt);
    replacement.addEventListener('load',function(){
    lastActivity=Date.now();
    if(replacement.parentNode){replacement.parentNode.removeChild(replacement);}
    try{original.dispatchEvent(new Event('load'));}catch(error){reloadOnce();}});
    replacement.addEventListener('error',function(){
    if(replacement.parentNode){replacement.parentNode.removeChild(replacement);}
    if(attempt<retryLimit){setTimeout(tryAgain,Math.min(1000*attempt,3000));}
    else{console.error('[PBM-SHELL] Script retry exhausted '+source);reloadOnce();}});
    (document.body||document.documentElement).appendChild(replacement);}
    setTimeout(tryAgain,700);}
    function watchScript(script){
    if(!script||!script.src||script.__pbmWatched||script.__pbmRecoveryReplacement){return;}
    script.__pbmWatched=true;
    script.addEventListener('load',function(){lastActivity=Date.now();});
    script.addEventListener('error',function(){recover(script);});}
    var nativeAppend=Node.prototype.appendChild;
    Node.prototype.appendChild=function(child){
    if(child&&String(child.tagName).toUpperCase()==='SCRIPT'){watchScript(child);}
    return nativeAppend.call(this,child);};
    window.addEventListener('error',function(event){
    if(event&&event.target&&String(event.target.tagName).toUpperCase()==='SCRIPT'){
    if(event.target.__pbmRecoveryReplacement){return;}
    watchScript(event.target);recover(event.target);return;}
    if(event&&event.message){
    failures+=1;console.error('[PBM-SHELL] JavaScript error '+event.message);
    if(failures>=3&&document.getElementById('loadingUi')){reloadOnce();}}},true);
    window.addEventListener('unhandledrejection',function(event){
    failures+=1;console.error('[PBM-SHELL] Unhandled promise rejection '+String(event&&event.reason||''));
    if(failures>=3&&document.getElementById('loadingUi')){reloadOnce();}});
    setInterval(function(){
    if(!document.getElementById('loadingUi')){return;}
    if(Date.now()-lastActivity>45000){progress('遊戲資源較大，請保持網路連線…');}
    },5000);})();
    """

    static let paymentBridge = """
    (function(){if(window.__shellAppStorePaymentGuard){
    window.__shellAppStorePaymentGuard.install();return;}
    var attempt=0;function wkPay(){try{return window.webkit&&
    window.webkit.messageHandlers&&window.webkit.messageHandlers.pay;}catch(ignore){return null;}}
    function debug(message){try{if(window.android&&typeof window.android.sendToNative==='function'){
    window.android.sendToNative('[PBM-SHELL] '+message);return;}
    var handler=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.android;
    if(handler){handler.postMessage({method:'sendToNative',payload:'[PBM-SHELL] '+message});}}
    catch(ignore){}}
    var nativePay=function(amount,cpOrder,channel,serverId,serverName,
    goodsID,goodsName,roleID,roleName,roleLevel,payTypeId){
    var text=function(value){return value==null?'':String(value);};
    var session=window.loginJson&&typeof window.loginJson==='object'
    ?window.loginJson:{};
    var account=text(window.__shellSdkUsername||session.user_name||
    session.username||session.userName||window.xmw_zhanghao_name||
    window.user_name||window.username);
    var request={price:text(amount),cpOrder:text(cpOrder),channel:text(channel),
    serverId:text(serverId),sercerId:text(serverId),serverName:text(serverName),
    goodsId:text(goodsID),goodsName:text(goodsName),roleID:text(roleID),
    roleName:text(roleName),roleLevel:text(roleLevel),
    productId:text(payTypeId||goodsID),payType_id:text(payTypeId),
    uid:text(window.uid||session.uid),username:account,user_name:account};
    try{var game=window.GameData&&typeof window.GameData.getInstance==='function'
    ?window.GameData.getInstance():null;var record=game&&game.open7DaysRecord
    ?game.open7DaysRecord:null;if(record){var roleDay=Number(record.days);
    var roleTotal=Number(record.totalMoney);if(Number.isFinite(roleDay)){
    request.roleDay=Math.max(0,Math.round(roleDay));}
    if(Number.isFinite(roleTotal)&&roleTotal>=0){
    request.roleTotalAmount=roleTotal;}}}catch(ignore){}
    try{if(window.android&&typeof window.android.pay==='function'){
    debug('payment-dispatch path=android');window.android.pay(JSON.stringify(request));}
    else{var handler=wkPay();if(!handler){throw new Error('WK pay handler unavailable');}
    debug('payment-dispatch path=webkit');handler.postMessage(request);}}
    catch(error){debug('payment-dispatch failed');console.error('[PBM-SHELL] Native billing bridge failed');}
    };nativePay.__shellGooglePlayBridge=true;nativePay.__shellAppStoreBridge=true;
    // Historical Google/Android names are H5 protocol aliases only. All of
    // these aliases dispatch to this app's StoreKit handler, never web billing.
    function protectSdk(sdk){if(!sdk||(typeof sdk!=='object'&&typeof sdk!=='function')){return false;}
    try{var descriptor=Object.getOwnPropertyDescriptor(sdk,'dopay');
    if(descriptor&&descriptor.get&&descriptor.get.__shellAppStoreProtected){return true;}
    if(descriptor&&!descriptor.configurable){
    if(descriptor.writable){sdk.dopay=nativePay;}return sdk.dopay===nativePay;}
    var getter=function(){return nativePay;};getter.__shellAppStoreProtected=true;
    Object.defineProperty(sdk,'dopay',{enumerable:true,configurable:false,
    get:getter,set:function(){/* Ignore vendor reassignment to web recharge. */}});
    return true;}catch(ignore){debug('payment-bridge-protection-failed');return false;}}
    // Protect assignment BEFORE the asynchronously loaded vendor SDK defines
    // dopay. A polling-only replacement leaves a race where web billing opens.
    var currentSdk=window.xmwsdk;
    try{var globalDescriptor=Object.getOwnPropertyDescriptor(window,'xmwsdk');
    if(!globalDescriptor||globalDescriptor.configurable){
    Object.defineProperty(window,'xmwsdk',{enumerable:true,configurable:false,
    get:function(){return currentSdk;},set:function(value){currentSdk=value;protectSdk(value);}});
    }}catch(ignore){debug('payment-sdk-assignment-protection-failed');}
    function installSdkBridge(){if(!protectSdk(window.xmwsdk)){return false;}
    window.__googlePlayPaymentBridgeInstalled=true;
    window.__appStorePaymentBridgeInstalled=true;
    return true;}
    window.__shellAppStorePaymentGuard={install:installSdkBridge};
    function install(){if(installSdkBridge()){return;}attempt+=1;
    if(attempt===1||attempt===20||attempt===120||attempt===600){
    debug('payment-bridge-wait attempt='+attempt+' sdk='+(!!(window.xmwsdk&&
    typeof window.xmwsdk.dopay==='function'))+' android='+(!!(window.android&&
    typeof window.android.pay==='function'))+' webkit='+(!!wkPay()));}
    if(attempt<2400){setTimeout(install,250);}}
    if(!window.__shellGooglePlayBridgeMonitor){
    window.__shellGooglePlayBridgeMonitor=setInterval(
    installSdkBridge,500);}install();})();
    """

    static let networkRestored = """
    (function(){try{window.dispatchEvent(new Event('online'));}catch(error){}})();
    """

    static let unblockLoadingOverlay = """
    (function(){if(window.__shellLoadingOverlayWatcher){return;}
    window.__shellLoadingOverlayWatcher=true;
    window.fbq=window.fbq||function(){};
    function dismiss(){
    var ui=document.getElementById('loadingUi');
    if(!ui){return false;}
    var home=document.getElementById('home');
    if(home){home.style.display='none';}
    document.body.style.backgroundColor='#000000';
    if(ui.parentNode){ui.parentNode.removeChild(ui);}
    console.info('[PBM-SHELL] Main game loading overlay dismissed');
    return true;}
    function shouldDismiss(){
    return !!(document.querySelector('.xmw-wrap,.xmw-com-box,.xmw-loginhtml-box,.egret-player canvas')
    ||(window.egret&&window.Main));} 
    function tick(){
    if(shouldDismiss()){dismiss();}}
    tick();
    if(document.documentElement){
    new MutationObserver(tick).observe(document.documentElement,{childList:true,subtree:true});}
    setInterval(tick,1000);})();
    """

    static let hideWebDebugUI = """
    (function(){var selector='#__vconsole,.vc-switch,.vc-mask,.vc-panel,.eruda-container,.eruda-entry-btn,.eruda-dev-tools';
    if(!document.getElementById('__shellHideDebugUi')){
    var style=document.createElement('style');style.id='__shellHideDebugUi';
    style.textContent=selector+'{display:none!important;visibility:hidden!important;pointer-events:none!important;}';
    (document.head||document.documentElement).appendChild(style);}
    function hide(){var nodes=document.querySelectorAll(selector);
    for(var i=0;i<nodes.length;i++){
    nodes[i].style.setProperty('display','none','important');
    nodes[i].style.setProperty('visibility','hidden','important');
    nodes[i].style.setProperty('pointer-events','none','important');}}
    hide();if(!window.__shellDebugUiObserver&&document.documentElement){
    window.__shellDebugUiObserver=new MutationObserver(hide);
    window.__shellDebugUiObserver.observe(document.documentElement,{childList:true,subtree:true});}})();
    """

    static let returnToGameCenter = returnOverlay(label: "返回小遊戲")

    private static func returnOverlay(label: String) -> String {
        """
        (function(){if(window.__shellReturnToCenterInstalled){return;}
        if(!window.android||typeof window.android.returnToGameCenter!=='function'){return;}
        var button=document.createElement('button');
        button.type='button';button.textContent=\(jsString(label));
        button.setAttribute('aria-label',\(jsString(label)));
        button.style.cssText='position:fixed;top:max(10px,env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));z-index:2147483646;min-height:36px;padding:6px 12px;border:0;border-radius:999px;color:#07342d;background:rgba(125,241,201,.92);font:700 13px/1.2 sans-serif;box-shadow:0 6px 16px rgba(0,0,0,.28);';
        button.addEventListener('click',function(){try{window.android.returnToGameCenter();}catch(error){}});
        (document.body||document.documentElement).appendChild(button);
        window.__shellReturnToCenterInstalled=true;})();
        """
    }

    static func webSdkLogin(appId: String, channel: String) -> String {
        """
        (function(){var attempt=0;function openLogin(){
        if(window.xmwsdk&&typeof window.xmwsdk.init==='function'
        &&typeof window.xmwsdk.logincallback==='function'
        &&typeof window.xmwsdk.dologin==='function'
        &&(typeof layer!=='undefined'||attempt>20)){
        if(!window.__shellWebSdkLoginInitialized){
        window.xmwsdk.init({appid:\(Self.jsNumber(appId)),channel:\(Self.jsNumber(channel))});
        window.xmwsdk.logincallback(function(data){
        var result={};if(typeof data==='string'){try{data=JSON.parse(data);}catch(e){}}
        if(data&&typeof data==='object'){
        for(var key in data){if(Object.prototype.hasOwnProperty.call(data,key)){
        result[key]=data[key];}}}var session=window.loginJson&&
        typeof window.loginJson==='object'?window.loginJson:{};
        window.__shellSdkUsername=String(result.user_name||result.username||
        result.userName||session.user_name||session.username||session.userName||
        window.xmw_zhanghao_name||'');
        if(window.__shellSdkUsername&&window.android&&
        typeof window.android.account==='function'){try{window.android.account(
        JSON.stringify({user_name:window.__shellSdkUsername,
        uid:String(result.uid||session.uid||window.uid||'')}));}catch(e){}}
        if(result.uid&&window.egret&&egret.localStorage){
        egret.localStorage.setItem('uid',String(result.uid));}result.func='loginSuccess';
        if(typeof window.javaCallBack==='function'){window.javaCallBack(result);}});
        window.__shellWebSdkLoginInitialized=true;}
        window.xmwsdk.dologin();return;}
        attempt+=1;if(attempt<120){setTimeout(openLogin,250);}
        else{console.error('[PBM-SHELL] Web SDK login is unavailable');}}openLogin();})();
        """
    }

    static func contentMode(_ mode: String) -> String {
        "if(window.setShellContentMode){window.setShellContentMode(\(Self.jsString(mode)));}"
    }

    static func rememberUsername(_ username: String) -> String {
        "window.__shellSdkUsername=\(jsString(username));"
    }

    static func sdkStatus(_ json: String) -> String {
        "window.__shellSdkStatus=\(jsString(json));"
    }

    static func javaCallBack(_ json: String) -> String {
        "window.javaCallBack(\(json));"
    }

    static func orderEndpoint(_ url: String) -> String {
        "window.__shellGameOrderEndpoint=\(jsString(url));"
    }

    static func jsNumber(_ value: String) -> String {
        Int(value.trimmingCharacters(in: .whitespacesAndNewlines)).map(String.init) ?? "0"
    }

    static func jsString(_ value: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [value])
        let wrapped = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        if wrapped.count >= 2 {
            let start = wrapped.index(after: wrapped.startIndex)
            let end = wrapped.index(before: wrapped.endIndex)
            return String(wrapped[start..<end])
        }
        return "\"\""
    }
}
