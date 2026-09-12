(()=>{
 const system=matchMedia('(prefers-color-scheme: dark)'),key='roundtable-appearance';let choice='system';try{const saved=localStorage.getItem(key);if(['light','dark','system'].includes(saved))choice=saved;}catch{}
 const label=document.createElement('label');label.className='theme-picker';label.textContent='外观';const select=document.createElement('select');select.id='appearance';select.setAttribute('aria-label','外观模式');for(const [value,text]of [['system','跟随系统'],['light','浅色'],['dark','深色']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}label.append(select);document.querySelector('.sidebar-footer').before(label);select.value=choice;
 function apply(){document.documentElement.dataset.theme=choice==='system'?(system.matches?'dark':'light'):choice;document.documentElement.style.colorScheme=document.documentElement.dataset.theme;}
 select.onchange=()=>{choice=select.value;try{localStorage.setItem(key,choice);}catch{}apply();};system.addEventListener('change',()=>{if(choice==='system')apply();});apply();
})();
