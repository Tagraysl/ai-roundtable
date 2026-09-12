(()=>{const details=document.getElementById('local-agent-details'),model=document.getElementById('member-model').closest('[data-kind]');model.before(details);document.getElementById('preferences-open').before(document.getElementById('sidebar-network'));
 const ids=['home-nav','workflow-nav','discussion-nav'];
 for(const id of ids){const e=document.getElementById(id);e.classList.remove('text-btn');e.classList.add('new-room','primary-nav');}
 const create=document.getElementById('new-room');create.classList.remove('new-room');create.classList.add('discussion-create');
 const views=[document.getElementById('home-view'),document.getElementById('workflow'),document.querySelector('main')];
 const sync=()=>{ids.forEach((id,i)=>{const e=document.getElementById(id),active=!views[i].hidden;e.classList.toggle('nav-current',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});};
 const observer=new MutationObserver(sync);views.forEach(v=>observer.observe(v,{attributes:true,attributeFilter:['hidden']}));sync();
})();
