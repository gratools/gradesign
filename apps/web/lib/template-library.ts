import type { DesignJSON } from './canvas-types';
const themes = [
  {name:'Creative studio',tag:'MAKE SOMETHING MATTER',title:'Ideas into impact',accent:'#304bff',bg:'#f4f2ec',ink:'#152521',items:['Discover the opportunity','Build with intention','Launch with confidence'],metric:'32%',offer:'Design your next chapter',date:'24 OCTOBER',quote:'Good design makes room for better ideas.'},
  {name:'Coffee house',tag:'ROASTED WITH CARE',title:'A better daily ritual',accent:'#b85835',bg:'#f4e6d4',ink:'#34241d',items:['Ethically sourced beans','Small batch roasting','Made for slow mornings'],metric:'100%',offer:'Your next cup is on us',date:'SATURDAY · 9 AM',quote:'Take a moment. Make it a good one.'},
  {name:'Wellness club',tag:'MOVE · BREATHE · RESET',title:'Feel more like you',accent:'#517859',bg:'#eaf0df',ink:'#233c2a',items:['Move at your own pace','Build a daily practice','Rest without guilt'],metric:'30',offer:'A fresh start awaits',date:'MONDAY · 7 AM',quote:'Progress begins with showing up for yourself.'},
  {name:'Future tech',tag:'BUILT FOR WHAT IS NEXT',title:'Tomorrow starts here',accent:'#a9f05c',bg:'#14242a',ink:'#f0f6ed',items:['Connect your workflow','Find actionable insights','Scale your best ideas'],metric:'2.4×',offer:'Meet your new advantage',date:'12 NOVEMBER',quote:'The next breakthrough starts with a better question.'},
  {name:'Culture festival',tag:'A CITY FULL OF STORIES',title:'Come for the unexpected',accent:'#ef6c87',bg:'#fcebdc',ink:'#382444',items:['Live music after dark','Art around every corner','Food worth sharing'],metric:'24',offer:'Your weekend starts here',date:'18–20 JULY',quote:'The best moments happen when we come together.'},
  {name:'Learning lab',tag:'STAY CURIOUS',title:'Learn something new',accent:'#ffc845',bg:'#ecf0f8',ink:'#1e3459',items:['Explore a new skill','Practice with purpose','Share what you know'],metric:'12',offer:'Make time for discovery',date:'THURSDAY · 6 PM',quote:'Small questions can lead to extraordinary discoveries.'},
];
const layouts = ['Cover','Agenda','Statistics','Comparison','Roadmap','Quote','Promotion','Event','Editorial','Checklist','Menu','Team','Pricing','Contact','Weekly planner'] as const;
const categories = ['Presentation','Presentation','Presentation','Presentation','Presentation','Editorial','Social','Events','Editorial','Editorial','Social','Presentation','Presentation','Social','Editorial'];
export const libraryTemplates = themes.flatMap((theme,t)=>layouts.map((layout,l)=>({id:`library-${t}-${l}`,name:`${theme.name} · ${layout}`,category:categories[l],color:theme.accent,background:theme.bg})));
export function libraryScene(id:string):DesignJSON|null {
  const match=/^library-(\d+)-(\d+)$/.exec(id);if(!match)return null;
  const t=themes[Number(match[1])],layout=Number(match[2]);if(!t||layout>=layouts.length)return null;
  const objects:Record<string,unknown>[]=[];
  const add=(type:string,name:string,p:Record<string,unknown>)=>objects.push({type,version:'6.9.0',id:`${id}-${objects.length}`,name,originX:'left',originY:'top',strokeWidth:0,...p});
  const box=(x:number,y:number,w:number,h:number,fill=t.accent)=>add('Rect','Panel',{left:x,top:y,width:w,height:h,fill,rx:12,ry:12});
  const text=(value:string,x:number,y:number,w:number,size=24,fill=t.ink,weight=400)=>add('Textbox',value.slice(0,32),{text:value,left:x,top:y,width:w,fontSize:size,fontFamily:'Arial',fill,fontWeight:weight,lineHeight:1.12});
  const circle=(x:number,y:number,r:number,fill=t.accent)=>add('Circle','Accent circle',{left:x,top:y,radius:r,fill});
  text(t.tag,48,30,760,13,t.ink,700);box(48,60,864,2,t.ink);
  text(t.name.toUpperCase(),48,595,700,12);text(String(layout+1).padStart(2,'0'),860,593,50,14);
  if(layout===0){box(618,100,294,452);circle(670,152,96,t.bg);box(654,386,224,10,t.bg);text(t.title,48,152,535,70,t.ink,700);text('A thoughtful introduction to what comes next.',52,423,460,25);text('YOUR NAME / YOUR ORGANIZATION',52,522,500,13);}
  if(layout===1){text('Today’s agenda',48,95,750,52,t.ink,700);t.items.forEach((v,i)=>{box(48,191+i*118,72,72);text(`0${i+1}`,62,208+i*118,65,30,t.bg,700);text(v,150,198+i*118,700,30,t.ink,700);text('Key ideas, useful examples and a clear next step.',150,243+i*118,680,17);});}
  if(layout===2){text('The bigger picture',48,98,850,52,t.ink,700);text(t.metric,48,204,450,130,t.accent,700);text('One meaningful measure.\nA real reason to keep going.',55,395,420,25);[.35,.58,.8,1].forEach((v,i)=>{box(536+i*91,470-v*240,64,v*240);text(`Q${i+1}`,547+i*91,493,70,16);});text('Illustrative data · replace with your figures',530,541,385,12);}
  if(layout===3){text('Choose your next step',48,96,864,48,t.ink,700);box(48,193,408,355);box(480,193,432,355,t.ink);text('START HERE',77,221,345,27,t.bg,700);text('GO FURTHER',509,221,355,27,t.bg,700);text(t.items.slice(0,2).join('\n\n'),77,289,336,26,t.bg);text(t.items.slice(1).join('\n\n'),509,289,348,26,t.bg);text('A simple foundation',77,490,330,18,t.bg);text('Room for more possibility',509,490,348,18,t.bg);}
  if(layout===4){text('From idea to action',48,98,864,52,t.ink,700);box(98,271,762,5,t.accent);t.items.forEach((v,i)=>{circle(62+i*302,235,36);text(String(i+1),83+i*302,250,50,28,t.bg,700);text(v,48+i*302,342,265,28,t.ink,700);text(['Explore what matters.','Put the plan into practice.','Measure, learn and improve.'][i],48+i*302,443,260,20);});}
  if(layout===5){text('“',45,83,150,155,t.accent,700);text(t.quote,152,168,710,57,t.ink,700);box(154,471,95,5);text('YOUR NAME · YOUR ROLE',154,507,700,16);}
  if(layout===6){box(560,95,352,464);circle(608,160,124,t.bg);text('NEW',640,242,220,57,t.accent,700);text(t.offer,48,122,470,63,t.ink,700);text('Something worth making time for.\nDiscover the details today.',50,371,454,24);box(48,489,345,60);text('EXPLORE MORE →',70,506,308,21,t.bg,700);}
  if(layout===7){box(48,100,262,456);text(t.date,70,131,216,42,t.bg,700);text('SAVE\nTHE\nDATE',71,345,218,37,t.bg,700);text(t.title,351,127,560,59,t.ink,700);text(t.items.join('\n\n'),352,324,530,23);text('YOUR VENUE · BOOK YOUR PLACE',352,535,550,15,t.ink,700);}
  if(layout===8){text(t.title,48,96,830,53,t.ink,700);text('A fresh perspective',48,187,380,25,t.accent,700);text(t.quote+'\n\n'+t.items[0]+'. A little intention can change the way we experience every day.',48,243,390,23);box(496,194,416,340);circle(548,226,135,t.bg);text('01',610,315,215,86,t.accent,700);text('NOTES FOR A BETTER TOMORROW',498,553,420,13);}
  if(layout===9){
    text('Make it happen',48,97,780,54,t.ink,700);text('A little structure for your next big step.',50,168,790,21);
    [...t.items,'Review what worked','Celebrate the progress'].forEach((v,i)=>{const y=226+i*62;box(48,y,32,32,t.ink);box(52,y+4,24,24,t.bg);text(v,101,y+2,650,23);box(101,y+43,811,1,t.ink);});
    text('YOUR CHECKLIST · YOUR PACE',48,560,770,13,t.accent,700);
  }
  if(layout===10){
    const menus=[['Brand discovery','Visual identity','Launch toolkit'],['House espresso','Seasonal latte','Weekend brunch'],['Morning flow','Strength session','Guided reset'],['Workflow review','Insight dashboard','Automation setup'],['Day pass','Evening show','Weekend experience'],['Creative workshop','Skill masterclass','Personal mentoring']];
    const descriptions=[['Find the story at your core.','Create a look that feels like you.','Bring your next chapter to life.'],['Rich, balanced and freshly pulled.','A little seasonal inspiration.','Fresh plates for a slower start.'],['Gentle movement to begin your day.','Build confidence, one step at a time.','Make a little room to breathe.'],['Find a simpler way to work.','Bring your important numbers together.','Give repetitive tasks a better home.'],['Explore a full day of discovery.','An unforgettable night of live music.','Make time for everything you love.'],['Try a new idea with hands-on practice.','Go deeper with an expert guide.','A learning plan built around you.']];
    text('On the menu',48,96,780,54,t.ink,700);text('Discover your next favorite.',50,169,800,21);
    menus[Number(match[1])].forEach((v,i)=>{const y=231+i*105;text(v,48,y,570,29,t.ink,700);text(descriptions[Number(match[1])][i],50,y+44,685,18);text('€—',794,y+9,110,31,t.accent,700);box(48,y+86,864,1,t.ink);});
    text('ADD YOUR PRICES · DETAILS · AVAILABILITY',48,563,860,12);
  }
  if(layout===11){
    text('Meet the people',48,98,864,53,t.ink,700);text('Different strengths. One shared purpose.',50,168,850,22);
    ['YOUR NAME','YOUR NAME','YOUR NAME'].forEach((v,i)=>{const x=48+i*302;box(x,225,260,206,t.accent);circle(x+91,246,39,t.bg);box(x+49,332,162,76,t.bg);text(v,x,457,260,25,t.ink,700);text(['Founder / Lead','Creative / Specialist','Community / Support'][i],x,495,270,17);text('Add a short introduction.',x,531,260,16);});
  }
  if(layout===12){
    text('Find your fit',48,96,864,53,t.ink,700);text('Three ways to get started. Replace with your offers.',50,167,864,21);
    ['ESSENTIAL','PLUS','COMPLETE'].forEach((v,i)=>{const x=48+i*302,fill=i===1?t.accent:t.ink;box(x,222,260,338,fill);text(v,x+22,246,220,18,t.bg,700);text(['€19','€39','€79'][i],x+22,293,220,58,t.bg,700);text('per month · example price',x+22,363,218,14,t.bg);text(['A strong foundation\nThe core essentials','More room to grow\nExtended resources','Your complete toolkit\nPersonal support'][i],x+22,408,218,20,t.bg);box(x+22,504,216,34,t.bg);text('CHOOSE PLAN',x+48,513,186,13,fill,700);});
  }
  if(layout===13){
    box(48,102,328,457,t.accent);text('LET’S\nMAKE\nIT REAL.',72,136,279,53,t.bg,700);text(t.name,73,457,278,25,t.bg,700);
    text('Start a conversation',415,111,496,45,t.ink,700);text('Have a question or an idea?\nWe would love to hear from you.',416,234,478,24);
    [['EMAIL','hello@example.com'],['WEBSITE','www.example.com'],['FIND US','Your city · Your address']].forEach(([label,value],i)=>{const y=341+i*72;text(label,416,y,480,12,t.accent,700);text(value,416,y+23,480,23);});
  }
  if(layout===14){
    text('A week with intention',48,97,864,48,t.ink,700);text('WEEK OF __________________',50,167,864,14);
    ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','WEEKEND'].forEach((v,i)=>{const x=48+(i%3)*302,y=222+Math.floor(i/3)*170;box(x,y,260,145,t.ink);text(v,x+18,y+17,230,15,t.bg,700);text(['Set your focus','Make space to create','Check your progress','Move an idea forward','Reflect and celebrate','Rest and recharge'][i],x+18,y+51,223,19,t.bg);box(x+18,y+108,224,1,t.bg);box(x+18,y+128,224,1,t.bg);});
  }
  return {version:'6.9.0',width:960,height:640,background:t.bg,objects};
}
