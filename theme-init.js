/* Early appearance initialization. Kept external so production CSP needs no inline-script exception. */
(function(){
  var root=document.documentElement,meta=null,settings=null,appearance=null,appleStatus=null;
  try{meta=document.querySelector('meta[name="theme-color"]');}catch(_){}
  try{appleStatus=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');}catch(_){}
  try{var raw=localStorage.getItem('pocketwise-state-v1');if(raw){var saved=JSON.parse(raw);settings=saved&&saved.settings&&typeof saved.settings==='object'?saved.settings:null;}}catch(_){}
  try{var rawAppearance=localStorage.getItem('pocketwise-appearance-v1');if(rawAppearance)appearance=JSON.parse(rawAppearance);}catch(_){}
  var validTheme=function(v){return v==='light'||v==='dark'||v==='system'||v==='gradient';};
  var validPreset=function(v){return v==='coral-wave'||v==='green-screen'||v==='retro-magic'||v==='on-fire';};
  var preference=appearance&&validTheme(appearance.theme)?appearance.theme:(settings&&validTheme(settings.theme)?settings.theme:'light');
  var presetCandidate=appearance&&appearance.gradientPreset||settings&&settings.gradientPreset;
  var preset=validPreset(presetCandidate)?presetCandidate:'coral-wave';
  var liquidGlass=appearance&&typeof appearance.liquidGlass==='boolean'?appearance.liquidGlass:!!(settings&&settings.liquidGlass===true);
  var smartUI=appearance&&typeof appearance.smartUI==='boolean'?appearance.smartUI:!!(settings&&settings.smartUI===true);
  var systemDark=false;
  try{systemDark=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);}catch(_){}
  var actual=preference==='system'?(systemDark?'dark':'light'):preference;
  var themeColors={'coral-wave':'#FBECE9','green-screen':'#EDF5E9','retro-magic':'#F2ECF8','on-fire':'#FBEFE4'};
  var canvas=actual==='dark'?'#000000':actual==='gradient'?themeColors[preset]:'#f6f8f5';
  var scheme=actual==='dark'?'dark':'light';
  root.dataset.theme=actual;
  root.dataset.gradient=preset;
  root.dataset.liquidGlass=(actual==='gradient'||liquidGlass)?'on':'off';
  root.dataset.smartUi=smartUI?'on':'off';
  root.style.backgroundColor=canvas;
  root.style.colorScheme=scheme;
  if(meta)meta.content=canvas;
  if(actual==='gradient'&&meta)meta.content=themeColors[preset];
  if(appleStatus)appleStatus.content=actual==='dark'?'black':'default';
})();
