(() => {
  const widget=document.getElementById('aiWidget');
  const launcher=document.getElementById('aiWidgetLauncher');
  const panel=document.getElementById('aiWidgetPanel');
  const close=document.getElementById('aiWidgetClose');
  const header=document.getElementById('aiWidgetHeader');
  const messagesEl=document.getElementById('aiWidgetMessages');
  const form=document.getElementById('aiWidgetForm');
  const input=document.getElementById('aiWidgetInput');
  const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let accountKey='devorbit-floating-chat-guest';
  let messages=[];
  let activePointer=null;
  let dragStart=null;
  let dragged=false;
  let suppressClick=false;

  function renderMessages(){
    messagesEl.innerHTML=messages.map(message=>`<div class="ai-widget-message ${message.role==='user'?'user':'assistant'}">${escapeHtml(message.text).replace(/\n/g,'<br>')}</div>`).join('');
    messagesEl.scrollTop=messagesEl.scrollHeight;
  }
  function saveMessages(){localStorage.setItem(accountKey,JSON.stringify(messages.slice(-30)))}
  function welcome(){return {role:'assistant',text:'Hi! I can help with your target role, skill gaps, learning plan, or interview preparation.'}}
  function setPosition(left,top,save=false){
    const bounds=widget.getBoundingClientRect();
    left=Math.max(8,Math.min(left,window.innerWidth-bounds.width-8));
    top=Math.max(8,Math.min(top,window.innerHeight-64));
    widget.style.left=`${left}px`;widget.style.top=`${top}px`;widget.style.right='auto';widget.style.bottom='auto';
    widget.dataset.side=left+180>window.innerWidth/2?'right':'left';
    widget.dataset.vertical=top>window.innerHeight/2?'above':'below';
    if(save)localStorage.setItem('devorbit-ai-widget-position',JSON.stringify({left,top}));
  }
  function restorePosition(){try{const pos=JSON.parse(localStorage.getItem('devorbit-ai-widget-position')||'null');if(pos&&Number.isFinite(pos.left)&&Number.isFinite(pos.top))setPosition(pos.left,pos.top)}catch{}}
  function setOpen(open){panel.hidden=!open;launcher.setAttribute('aria-expanded',String(open));if(open){requestAnimationFrame(()=>{renderMessages();input.focus()})}}
  function startDrag(event){
    if(event.button!==undefined&&event.button!==0)return;
    if(event.currentTarget===header&&event.target.closest('button'))return;
    activePointer=event.pointerId;dragged=false;
    const rect=widget.getBoundingClientRect();dragStart={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    event.preventDefault();
  }
  function moveDrag(event){
    if(activePointer!==event.pointerId||!dragStart)return;
    const dx=event.clientX-dragStart.x,dy=event.clientY-dragStart.y;
    if(Math.abs(dx)>4||Math.abs(dy)>4)dragged=true;
    if(dragged){setPosition(dragStart.left+dx,dragStart.top+dy);event.preventDefault()}
  }
  function endDrag(event){
    if(activePointer!==event.pointerId)return;
    if(dragged){const rect=widget.getBoundingClientRect();setPosition(rect.left,rect.top,true);suppressClick=true;setTimeout(()=>{suppressClick=false},150)}
    activePointer=null;dragStart=null;
  }
  launcher.addEventListener('pointerdown',startDrag);
  header.addEventListener('pointerdown',startDrag);
  window.addEventListener('pointermove',moveDrag);
  window.addEventListener('pointerup',endDrag);
  window.addEventListener('pointercancel',endDrag);
  launcher.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return}setOpen(panel.hidden)});
  close.addEventListener('click',()=>setOpen(false));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)setOpen(false)});
  window.addEventListener('resize',()=>{if(widget.style.left){const rect=widget.getBoundingClientRect();setPosition(rect.left,rect.top,true)}});
  window.addEventListener('devorbit:authenticated',event=>{
    const email=event.detail?.profile?.email||'account';accountKey=`devorbit-floating-chat-${email.toLowerCase()}`;
    try{messages=JSON.parse(localStorage.getItem(accountKey)||'[]');if(!Array.isArray(messages))messages=[]}catch{messages=[]}
    if(!messages.length)messages=[welcome()];renderMessages();widget.hidden=false;restorePosition();
  });
  window.addEventListener('devorbit:logout',()=>{setOpen(false);widget.hidden=true;messages=[]});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const text=input.value.trim();if(!text)return;
    messages.push({role:'user',text});input.value='';renderMessages();saveMessages();
    const pending={role:'assistant',text:'Thinking…'};messages.push(pending);renderMessages();
    const sendButton=form.querySelector('button');sendButton.disabled=true;
    try{
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${window.DevOrbitAuth?.token?.()||''}`},body:JSON.stringify({message:text})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'The AI assistant could not reply.');pending.text=data.reply||'The AI assistant returned an empty reply.';
    }catch(error){pending.text=error.message||'Could not reach the AI assistant. Check the server and AI provider settings.'}
    sendButton.disabled=false;renderMessages();saveMessages();input.focus();
  });
})();
