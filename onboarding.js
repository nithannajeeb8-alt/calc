(()=>{
  'use strict';
  const KEY='pocketwise-onboarding-complete-v1';
  const steps=[
    {target:null,title:'Welcome to Aruvi',body:'A calmer way to understand your money. This quick tour shows you the essentials. Your financial records are stored in this browser on this device.',icon:'welcome'},
    {target:'.money-card .radial-area',title:'Your money at a glance',body:'This ring compares income and expenses, with your available balance in the centre. Your monthly totals are shown below. Use the privacy control to hide amounts.',icon:'balance'},
    {target:['#mobile-add','#top-add'],title:'The + button does the work',body:'Choose Quick entry, Detailed entry, or Import payment. Import a UPI screenshot from your gallery or paste a bank SMS, then review the extracted details before saving.',icon:'plus'},
    {target:['[data-page="activity"].nav-item','[data-page="activity"].mobile-tab'],title:'Find any transaction',body:'Activity keeps your transaction history searchable. Filter spending, inspect records and export a CSV when you need it.',icon:'activity'},
    {target:['[data-page="insights"].nav-item','[data-page="insights"].mobile-tab'],title:'Understand your patterns',body:'Insights turns your records into trends so you can spot where money goes and track goals over time.',icon:'insights'},
    {target:['[data-page="settings"].nav-item','[data-page="settings"].mobile-tab'],title:'Make it yours and keep it safe',body:'Settings contains appearance, reminders, accounts, categories, privacy controls and backup/restore. Export backups regularly because local browser data can be lost.',icon:'settings'}
  ];
  let index=0,overlay=null,spotlight=null,activeTarget=null,shown=false;
  const art={
    welcome:{src:'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=900&q=80',alt:'Hand holding a smartphone'},
    balance:{src:'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80',alt:'Personal finance planning'},
    plus:{src:'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80',alt:'Making a digital payment'},
    activity:{src:'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=900&q=80',alt:'Secure online payment'},
    insights:{src:'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80',alt:'Spending insights'},
    settings:{src:'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',alt:'Using a mobile app'}
  };
  function ensure(){
    if(overlay)return;
    spotlight=document.createElement('div');spotlight.className='pw-tour-spotlight';spotlight.hidden=true;document.body.appendChild(spotlight);
    overlay=document.createElement('div');overlay.className='pw-tour-overlay';overlay.hidden=true;
    overlay.innerHTML='<section class="pw-tour-card" role="dialog" aria-modal="true" aria-labelledby="pw-tour-title" tabindex="-1"><div class="pw-tour-content"><div class="pw-tour-visual"><img alt="" decoding="async" fetchpriority="low"></div><span class="pw-tour-kicker" id="pw-tour-kicker"></span><h2 id="pw-tour-title"></h2><p id="pw-tour-body"></p><div class="pw-tour-progress" aria-hidden="true"></div></div><div class="pw-tour-actions"><button type="button" class="pw-tour-skip" id="pw-tour-skip">Skip tour</button><button type="button" class="primary-button pw-tour-next" id="pw-tour-next">Next</button></div></section>';
    document.body.appendChild(overlay);
    // One delegated handler keeps the actions reliable even when the card is repositioned or rerendered.
    overlay.addEventListener('click',e=>{
      const target=e.target instanceof Element?e.target:null;
      if(target?.closest('#pw-tour-next')){e.preventDefault();if(shown)next();return;}
      if(target?.closest('#pw-tour-skip')){e.preventDefault();finish();return;}
      if(e.target===overlay)e.preventDefault();
    });
    document.addEventListener('keydown',e=>{
      if(!shown)return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish();return;}
      if(e.key==='ArrowRight'&&!e.altKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();next();}
    });
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    window.visualViewport?.addEventListener('resize',reposition);
    window.visualViewport?.addEventListener('scroll',reposition);
  }
  function clearTarget(){if(activeTarget){activeTarget.classList.remove('pw-tour-target');activeTarget=null;}if(spotlight)spotlight.hidden=true;}
  function findVisibleTarget(target){
    const selectors=Array.isArray(target)?target:(target?[target]:[]);
    for(const selector of selectors){
      let matches=[];
      try{matches=Array.from(document.querySelectorAll(selector));}catch{continue;}
      for(const el of matches){
        const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
        if(rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse')return el;
      }
    }
    return null;
  }
  function positionSpotlight(){
    if(!shown||!spotlight)return;
    if(!activeTarget){spotlight.hidden=true;return;}
    const r=activeTarget.getBoundingClientRect();
    if(!r.width||!r.height){spotlight.hidden=true;return;}
    const pad=6;
    spotlight.hidden=false;
    spotlight.style.left=Math.max(4,r.left-pad)+'px';
    spotlight.style.top=Math.max(4,r.top-pad)+'px';
    spotlight.style.width=Math.min(window.innerWidth-8,r.width+pad*2)+'px';
    spotlight.style.height=Math.min(window.innerHeight-8,r.height+pad*2)+'px';
  }
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function positionCard(){
    if(!shown||!overlay)return;
    const card=overlay.querySelector('.pw-tour-card');
    // Android browser chrome and the on-screen keyboard can change the visual
    // viewport without changing the layout viewport. Keep the action row inside
    // the area the user can actually see.
    const vv=window.visualViewport;
    const vh=Math.max(1,vv?.height||window.innerHeight),vw=Math.max(1,vv?.width||window.innerWidth);
    const vx=vv?.offsetLeft||0,vy=vv?.offsetTop||0,margin=vw>=980?20:12,gap=16;
    const r=activeTarget?.getBoundingClientRect();
    const hasTarget=!!(r&&r.width>0&&r.height>0);
    const width=Math.max(0,Math.min(vw-margin*2,vw>=980?440:420));
    card.style.position='fixed';
    card.style.width=width+'px';
    card.style.maxHeight=Math.max(120,vh-margin*2)+'px';
    card.style.left=(vx+margin)+'px';card.style.right='auto';card.style.top=(vy+margin)+'px';card.style.bottom='auto';
    const cardHeight=card.getBoundingClientRect().height;
    const minTop=vy+margin,maxTop=Math.max(minTop,vy+vh-cardHeight-margin);
    let left=vx+margin,top=minTop;
    if(vw>=980){
      if(hasTarget){
        if(vw-r.right>=width+gap+margin)left=r.right+gap;
        else if(r.left>=width+gap+margin)left=r.left-width-gap;
        else left=clamp(r.left+r.width/2-width/2,vx+margin,Math.max(vx+margin,vx+vw-width-margin));
        top=clamp(vy+r.top+(r.height-cardHeight)/2,minTop,maxTop);
      }else{
        left=vx+vw-width-margin;
        top=clamp(vy+100,minTop,maxTop);
      }
    }else if(hasTarget){
      const above=Math.max(0,r.top-margin-gap),below=Math.max(0,vh-r.bottom-margin-gap);
      const preferBelow=below>=Math.min(cardHeight,280)||below>=above;
      top=preferBelow?vy+r.bottom+gap:vy+r.top-cardHeight-gap;
      top=clamp(top,minTop,maxTop);
    }else{
      top=clamp(vy+(vh-cardHeight)/2,minTop,maxTop);
    }
    card.style.left=clamp(left,vx+margin,Math.max(vx+margin,vx+vw-width-margin))+'px';
    card.style.top=top+'px';
  }
  function reposition(){positionSpotlight();positionCard();}
  function render(){
    ensure();clearTarget();
    const step=steps[index];
    activeTarget=findVisibleTarget(step.target);
    if(activeTarget){
      activeTarget.classList.add('pw-tour-target');
      const rect=activeTarget.getBoundingClientRect();
      const visualHeight=window.visualViewport?.height||window.innerHeight;
      if(rect.top<0||rect.bottom>visualHeight){
        try{activeTarget.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest',inline:'nearest'});}catch{}
      }
    }
    const illustration=art[step.icon]||art.welcome;
    const img=overlay.querySelector('.pw-tour-visual img');
    img.style.display='block';img.alt=illustration.alt;img.onerror=()=>{img.style.display='none';overlay.querySelector('.pw-tour-visual').classList.add('image-unavailable');requestAnimationFrame(reposition);};
    img.onload=()=>{img.style.display='block';overlay.querySelector('.pw-tour-visual').classList.remove('image-unavailable');requestAnimationFrame(reposition);};
    overlay.querySelector('#pw-tour-kicker').textContent=`ARUVI GUIDE · ${index+1} OF ${steps.length}`;
    overlay.querySelector('#pw-tour-title').textContent=step.title;
    overlay.querySelector('#pw-tour-body').textContent=step.body;
    overlay.querySelector('.pw-tour-progress').innerHTML=steps.map((_,i)=>`<span class="${i<=index?'active':''}"></span>`).join('');
    overlay.querySelector('#pw-tour-next').textContent=index===steps.length-1?'Finish tour':'Next';
    requestAnimationFrame(reposition);
  }
  function start(force=false){
    if(shown)return;
    if(document.documentElement.dataset.firstRun==='on')return;
    if(!force){try{if(localStorage.getItem(KEY)==='1')return;}catch{}}
    const modal=document.querySelector('#app-modal');
    if(modal?.open){modal.addEventListener('close',()=>setTimeout(()=>start(force),180),{once:true});return;}
    ensure();shown=true;index=0;overlay.hidden=false;document.body.style.overflow='hidden';render();
    requestAnimationFrame(()=>{reposition();overlay.querySelector('#pw-tour-next').focus({preventScroll:true});});
  }
  function next(){if(!shown)return;if(index<steps.length-1){index++;render();}else finish();}
  function finish(){
    if(!shown)return;
    shown=false;clearTarget();overlay.hidden=true;spotlight.hidden=true;document.body.style.overflow='';
    try{localStorage.setItem(KEY,'1');}catch{}
    document.querySelector('#replay-app-tour')?.focus({preventScroll:true});
  }
  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;
    if(target?.closest('#replay-app-tour')){e.preventDefault();start(true);}
  });
  if(document.readyState==='complete')setTimeout(()=>start(false),900);else window.addEventListener('load',()=>setTimeout(()=>start(false),900),{once:true});
})();
