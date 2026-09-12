(()=>{
 const button=document.createElement('button');button.id='delete-all-rooms';button.className='text-btn';button.textContent='清空聊天记录';document.getElementById('rooms').after(button);button.onclick=async()=>{try{state=await call('deleteRoom',{all:true});render();}catch(e){notify(e.message);}};
})();
