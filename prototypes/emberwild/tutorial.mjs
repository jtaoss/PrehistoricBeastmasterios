export const TUTORIAL_STEPS=Object.freeze(['move','attack','skill','build','reward']);
export const TUTORIAL_BUILD_RADIUS=72;
export const freshTutorial=({mandatory=false}={})=>({version:2,mandatory,step:'move',status:'active',started:false,awaiting:false,skillCast:false,attackHits:0,moveTarget:{x:455,y:475},buildSpot:null,slot:0,moved:0,elapsed:0,reward:null});
export const tutorialActive=g=>g.tutorial?.status==='active'&&g.wave<=1;
export const mandatoryTutorial=g=>!!g&&tutorialActive(g)&&g.tutorial.mandatory===true;
export const onboardingRequired=state=>state.run?.tutorial?.mandatory===true&&state.run.tutorial.status==='active'||state.profile.tutorialDone===false||state.profile.tutorialDone===undefined&&state.profile.runs===0;
export const tutorialProtected=g=>tutorialActive(g)&&g.tutorial.step!=='reward';
export const tutorialWaiting=g=>tutorialActive(g)&&g.tutorial.version===2&&(!g.tutorial.started||g.tutorial.awaiting||mandatoryTutorial(g)&&!!g.tutorial.reward);
export function validateTutorial(t){
  if(t===null||t===undefined)return true;
  return typeof t==='object'&&TUTORIAL_STEPS.includes(t.step)&&['active','done','skipped'].includes(t.status)
    &&Number.isFinite(t.moved)&&t.moved>=0&&t.moved<=64&&Number.isFinite(t.elapsed)&&t.elapsed>=0&&t.elapsed<=1e8
    &&(t.reward===null||(t.status==='active'&&t.step==='reward'&&['wood','bone','amber'].every(k=>Number.isInteger(t.reward?.[k])&&t.reward[k]>=0&&t.reward[k]<=1000)))
    &&(t.version===undefined||(t.version===2&&typeof t.started==='boolean'&&typeof t.awaiting==='boolean'
      &&(t.mandatory===undefined||typeof t.mandatory==='boolean')&&(!t.mandatory||t.status!=='skipped')
      &&(t.skillCast===undefined||typeof t.skillCast==='boolean')
      &&Number.isInteger(t.attackHits)&&t.attackHits>=0&&t.attackHits<=2&&Number.isInteger(t.slot)&&t.slot>=0&&t.slot<=3
      &&point(t.moveTarget)&&(t.buildSpot===null||point(t.buildSpot))&&(!t.awaiting||t.started&&t.step!=='reward')
      &&(t.status!=='active'||(t.step!=='build'||t.buildSpot!==null)&&(t.started||t.step==='move'))));
}
function point(p){return !!p&&Number.isFinite(p.x)&&p.x>=55&&p.x<=665&&Number.isFinite(p.y)&&p.y>=85&&p.y<=735;}
