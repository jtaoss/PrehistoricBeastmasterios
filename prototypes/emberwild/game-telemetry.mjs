// Gameplay reports use the same injected payment/measurement SDK as the main
// game. Purchase revenue is emitted only by the verified native payment flow.
export class MiniGameTelemetry {
  constructor(host=globalThis,{disabled=false,now=()=>Date.now()}={}){
    this.host=host;this.disabled=disabled;this.now=now;this.opened=false;this.runs=new Map();this.active=null;
  }
  track(name,fields={}){
    if(this.disabled)return false;
    try{return this.host.pbmGameSDK?.track(name,fields)===true;}catch{return false;}
  }
  open(){
    if(this.opened)return;this.opened=true;
    this.track('mini_game_open',{screen:'landing'});
    this.track('Loading_completed',{screen:'landing'});
  }
  start(run,account=null,tutorial=false){
    if(!run?.runId||/^(qa-|practice-)/.test(run.runId))return;
    let record=this.runs.get(run.runId);
    if(!record){
      record={started:this.now(),finished:false,left:false,tutorialFinished:false,fields:{
        run_id:run.runId,uid:account?.playerId||'guest',
        role_id:`emberwild:${account?.playerId||run.runId}`,server_id:'emberwild',
        role_name:account?.label||'荒境獵人'
      }};
      this.runs.set(run.runId,record);
      this.track('mini_game_start',{...record.fields,wave:run.wave||0});
      this.track('view_content',record.fields);
      if(tutorial)this.track('NewRole_Tutorial',record.fields);
    }
    this.active=record;
  }
  tutorialComplete(run){
    const record=this.runs.get(run?.runId);
    if(!record||record.tutorialFinished)return;record.tutorialFinished=true;
    this.track('Tutorial_Completed',{...record.fields,time_spent:this.elapsed(record)});
  }
  complete(run,won){
    const record=this.runs.get(run?.runId);
    if(!record||record.finished)return;record.finished=true;
    this.track('mini_game_complete',{...record.fields,result:won?'win':'lose',wave:run.wave||0,
      kills:run.stats?.kills||0,elapsed:this.elapsed(record)});
  }
  leave(){
    const record=this.active;
    if(!record||record.finished||record.left)return;record.left=true;
    this.track('mini_game_leave',{...record.fields,elapsed:this.elapsed(record)});
  }
  registration(result){
    if(result?.authenticated&&result.playerId)this.track('complete_registration',{
      method:'account',account_id:result.playerId,uid:result.playerId
    });
  }
  elapsed(record){return Math.max(0,Math.floor((this.now()-record.started)/1000));}
}
