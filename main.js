'use strict';
// Dependency-free, turn-based Latifundia. Terrain and buildings use canvas artwork.
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d');
const SIZE = 12, SAVE_KEY = 'latifundia-city-v2';
const TYPES = {
 road:{name:'Estrada',icon:'⋯',cost:2,size:1,detail:'Liga a aldeia',hint:'Ligue casas e serviços à praça inicial com estradas contíguas (pelos lados).'},
 market:{name:'Mercado',icon:'▤',cost:40,size:1,detail:'Abastece casas próximas',hint:'Ligado à praça, abastece casas num raio de 4 terrenos (distância pela grelha).'},
 house:{name:'Casa alentejana',icon:'⌂',cost:30,size:1,detail:'+4 lugares',hint:'Uma casa acolhe 4 habitantes. Construa em terreno livre.'},
 farm:{name:'Seara',icon:'♒',cost:25,size:1,detail:'+8 alimentos / estação',hint:'Searas mantêm a aldeia alimentada. Cada uma produz 8 alimentos.'},
 mill:{name:'Moinho',icon:'✣',cost:60,size:1,detail:'+8 moedas / estação',hint:'Um moinho gera 8 moedas por estação, além dos impostos.'},
 church:{name:'Igreja',icon:'♧',cost:120,size:2,detail:'Objetivo · ocupa 2 × 2',hint:'A igreja ocupa este terreno e os três terrenos a norte. Reserve 120 moedas.'},
 demolish:{name:'Demolir',icon:'×',cost:0,size:1,detail:'Devolve 50% do custo',hint:'Toque num edifício para demolir. Casas demolidas podem expulsar habitantes.'}
};
let state, selected='house', hover=null, view={w:0,h:0,scale:1,ox:0,oy:0};
function fresh(){
 const terrain=Array.from({length:SIZE},(_,r)=>Array.from({length:SIZE},(_,c)=>{
  const river=9+Math.sin(r*.7)*1.1;
  return Math.abs(c-river)<.65?'water':((r*17+c*31)%9<3?'wheat':'grass');
 }));
 return {version:2,turn:1,coins:140,food:30,pop:4,hunger:0,status:'playing',terrain,buildings:[{type:'house',r:5,c:4},{type:'farm',r:5,c:5},{type:'market',r:5,c:3},...[3,4,5,6].map(c=>({type:'road',r:6,c}))]};
}
function cells(type,r,c){return Array.from({length:TYPES[type].size**2},(_,i)=>({r:r-Math.floor(i/TYPES[type].size),c:c-i%TYPES[type].size}));}
function inside(r,c){return r>=0&&c>=0&&r<SIZE&&c<SIZE;}
function at(r,c){return state.buildings.find(b=>cells(b.type,b.r,b.c).some(t=>t.r===r&&t.c===c));}
function count(type){return state.buildings.filter(b=>b.type===type).length;}
function capacity(){return count('house')*4;}
function roadNetwork(){
 const roads=new Set(state.buildings.filter(b=>b.type==='road').map(b=>b.r+','+b.c));
 const reached=new Set(['6,4']),queue=[[6,4]];
 for(let i=0;i<queue.length;i++){const [r,c]=queue[i];for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const key=(r+dr)+','+(c+dc);if(roads.has(key)&&!reached.has(key)){reached.add(key);queue.push([r+dr,c+dc]);}}}return reached;
}
function connected(b,network=roadNetwork()){return cells(b.type,b.r,b.c).some(t=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc])=>network.has((t.r+dr)+','+(t.c+dc))));}
function active(type){const network=roadNetwork();return state.buildings.filter(b=>b.type===type&&connected(b,network));}
function servicedCapacity(){const markets=active('market');return active('house').filter(h=>markets.some(m=>Math.abs(m.r-h.r)+Math.abs(m.c-h.c)<=4)).length*4;}
function production(){return active('farm').length*8;}
function consumption(){return Math.ceil(state.pop/2);}
function income(){return state.pop+active('mill').length*8;}

function validSave(s){
 if(!s||s.version!==2||!['playing','won','lost'].includes(s.status))return false;
 if(!['turn','coins','food','pop','hunger'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||s.turn<1)return false;
 if(!Array.isArray(s.terrain)||s.terrain.length!==SIZE||!s.terrain.every(row=>Array.isArray(row)&&row.length===SIZE&&row.every(t=>['water','grass','wheat'].includes(t))))return false;
 if(!Array.isArray(s.buildings)||s.buildings.length>SIZE*SIZE)return false;
 const occupied=new Set();
 for(const b of s.buildings){if(!b||!Object.hasOwn(TYPES,b.type)||b.type==='demolish'||!Number.isInteger(b.r)||!Number.isInteger(b.c))return false;
 for(const t of cells(b.type,b.r,b.c)){const key=t.r+','+t.c;if(!inside(t.r,t.c)||s.terrain[t.r][t.c]==='water'||occupied.has(key))return false;occupied.add(key);}}
 if(!s.buildings.some(b=>b.type==='road'&&b.r===6&&b.c===4))return false;
 return s.pop<=s.buildings.filter(b=>b.type==='house').length*4;
}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));$('save-status').textContent='Progresso guardado neste navegador';}catch{$('save-status').textContent='Gravação indisponível · mantenha a página aberta';}}
function load(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY));if(validSave(s))return s;}catch{}return fresh();}
function message(text){$('info').textContent=text;}
function problem(type,r,c){
 if(state.status!=='playing')return 'O desafio terminou. Comece uma nova aldeia para voltar a construir.';
 if(type==='demolish')return r===6&&c===4?'A praça inicial não pode ser demolida.':at(r,c)?'':'Não há edifício neste terreno.';
 if(state.coins<TYPES[type].cost)return 'Moedas insuficientes. Avance uma estação para cobrar impostos.';
 for(const t of cells(type,r,c)){
  if(!inside(t.r,t.c))return 'O edifício tem de caber dentro do mapa.';
  if(state.terrain[t.r][t.c]==='water')return 'Não pode construir sobre água.';
  if(at(t.r,t.c))return 'Terreno ocupado. Escolha terreno livre ou use Demolir.';
 }return '';
}
function build(r,c){const error=problem(selected,r,c);if(error){message(error);return;}
 if(selected==='demolish'){const b=at(r,c);state.buildings.splice(state.buildings.indexOf(b),1);const refund=Math.floor(TYPES[b.type].cost/2);state.coins+=refund;const displaced=Math.max(0,state.pop-capacity());state.pop=Math.min(state.pop,capacity());message(`Edifício demolido. +${refund} moedas.${displaced?' '+displaced+' habitantes partiram.':''}`);}
 else{state.coins-=TYPES[selected].cost;state.buildings.push({type:selected,r,c});message(TYPES[selected].name+' construída.');}
 checkWin();save();render();
}
function finish(won,text){state.status=won?'won':'lost';$('result-title').textContent=won?'Uma vila para ficar.':'Uma aldeia por recomeçar.';$('result-text').textContent=text;if(!$('result').open)$('result').showModal();}
function checkWin(){if(!state.milestone&&state.pop>=24&&active('church').length>=1&&state.food>=20){state.milestone=true;message('Marco alcançado: a aldeia tornou-se vila! Continue a expandir e a abastecer os seus habitantes.');}}
function advance(){if(state.status!=='playing')return;
 const earned=income(),harvest=production(),need=consumption();state.coins+=earned;state.food+=harvest;
 let arrived=0,departed=0;
 if(state.food<need){state.food=0;state.hunger++;departed=Math.min(2,state.pop);state.pop-=departed;}
 else{state.food-=need;state.hunger=0;if(state.food>=2){arrived=Math.max(0,Math.min(2,servicedCapacity()-state.pop));state.pop+=arrived;}}
 message(`Colheita: +${harvest} alimentos; consumo: −${need}; receitas: +${earned} moedas. ${arrived?arrived+' novos habitantes.':departed?departed+' habitantes partiram por falta de comida.':'Para crescer, ligue casas a estradas e a um mercado próximo.'}${state.hunger?' Fome: '+state.hunger+' estações.':''}`);
 const unserved=Math.max(0,state.pop-servicedCapacity());if(unserved){state.pop-=Math.min(2,unserved);message($('info').textContent+' Casas sem estrada ou mercado perdem habitantes.');}
 checkWin();
 if(state.status==='playing')state.turn++;
 save();render();
}
function render(){
 $('season').textContent=String(state.turn).padStart(2,'0');$('coins').textContent=state.coins+' moedas';$('food').textContent=state.food+' alimentos';$('population').textContent=state.pop+' / '+capacity();
 const goals=[state.pop>=24,active('church').length>=1,state.food>=20];$('progress').value=goals.filter(Boolean).length;
 $('goal-status').textContent=`${Math.min(state.pop,24)}/24 habitantes · ${active('church').length?'✓':'0/1'} igreja ligada · ${Math.min(state.food,20)}/20 alimentos · ${servicedCapacity()} lugares abastecidos`;
 $('forecast').textContent=state.status==='playing'?`Próxima estação: +${income()} moedas · ${production()-consumption()>=0?'+':''}${production()-consumption()} alimentos (saldo)`:(state.status==='won'?'Objetivo alcançado — a sua vila prosperou.':'Desafio terminado — tente uma nova aldeia.');
 $('next-turn').disabled=state.status!=='playing';
 document.querySelectorAll('.tool').forEach(button=>{button.classList.toggle('selected',button.dataset.type===selected);button.setAttribute('aria-pressed',String(button.dataset.type===selected));});
 $('tool-hint').textContent=TYPES[selected].hint;draw();
}
// Original PNGs remain unchanged. Source rectangles ignore transparent padding.
const artwork = {};
const artSources = {house:'assets/casa.png',church:'assets/catedral.png',ground:'assets/terreno_base.png',wheat:'assets/terreno_ceara.png'};
function loadArtwork(){
 let loaded=0;const failed=[];
 function report(){const status=document.getElementById('asset-status');if(status)status.textContent=failed.length?'Falha ao carregar: '+failed.join(', ')+'.':'Ativos originais: '+loaded+'/4 carregados'+(loaded===4?' — casa, igreja e terrenos.':'…');}
 for(const [key,src] of Object.entries(artSources)){const img=new Image();img.onload=()=>{artwork[key]=img;loaded++;report();draw();};img.onerror=()=>{failed.push(key);report();};img.src=src;}
}
function drawOriginalBuilding(type){const img=artwork[type];if(!img)return false;
 const crop=type==='house'?[381,1381,543,445]:[0,0,2048,1829];
 const width=type==='house'?50:104,height=width*crop[3]/crop[2];
 ctx.drawImage(img,...crop,-width/2,14-height,width,height);return true;
}
// The same diamond geometry drives rendering, pointer picking and keyboard selection.
function project(c,r){return{x:view.ox+(c-r)*28*view.scale,y:view.oy+(c+r)*14*view.scale};}
function pick(x,y){const a=(x-view.ox)/(28*view.scale),b=(y-view.oy)/(14*view.scale);const c=Math.round((a+b)/2),r=Math.round((b-a)/2);return inside(r,c)?{r,c}:null;}
function polygon(points,color,stroke){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.7;ctx.stroke();}}
function diamond(x,y,color){polygon([[x,y-14],[x+28,y],[x,y+14],[x-28,y]],color,'#65744f25');}
function line(x,y,xx,yy,color,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function house(x,y,church=false){
 const w=church?25:17,h=church?31:20;
 polygon([[x-w,y-8],[x,y],[x,y-h],[x-w,y-h-8]],'#d9d5bd');
 polygon([[x,y],[x+w,y-8],[x+w,y-h-8],[x,y-h]],'#fff9e5');
 polygon([[x-w-3,y-h-8],[x,y-h-20],[x+w+3,y-h-8],[x,y-h+2]],'#b46542');
 polygon([[x-w-3,y-h-8],[x,y-h+2],[x,y-h-9]],'#944d35');
 line(x,y-2,x+w,y-10,'#70839a',3);
 ctx.fillStyle='#505b57';ctx.fillRect(x+6,y-15,5,10);ctx.fillStyle='#70839a';ctx.fillRect(x-12,y-19,5,5);
 if(church){polygon([[x+10,y-16],[x+23,y-22],[x+23,y-57],[x+10,y-51]],'#fcf6df');polygon([[x+4,y-20],[x+10,y-16],[x+10,y-51],[x+4,y-55]],'#d0ceb8');polygon([[x+3,y-55],[x+13,y-65],[x+24,y-57],[x+10,y-51]],'#b46542');line(x+13,y-64,x+13,y-76,'#59614b',2);line(x+9,y-71,x+17,y-71,'#59614b',2);ctx.fillStyle='#59614b';ctx.fillRect(x+14,y-46,4,7);}
}
function building(b){const p=project(b.c,b.r);ctx.save();ctx.translate(p.x,p.y);ctx.scale(view.scale,view.scale);
 if(b.type==='road'){diamond(0,0,b.r===6&&b.c===4?'#e7c684':'#ded6b9');for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]])if(inside(b.r+dr,b.c+dc)&&at(b.r+dr,b.c+dc)?.type==='road')line(0,0,(dc-dr)*14,(dc+dr)*7,'#f0e7ce',7);}
 if(b.type==='market'){polygon([[-19,5],[0,14],[20,4],[0,-5]],'#a69b6e');for(const x of [-15,15])line(x,3,x,-20,'#7b6646',2);polygon([[-22,-18],[0,-29],[23,-18],[0,-7]],'#bd724b');for(let i=-1;i<=1;i++){ctx.fillStyle=i===0?'#cfc478':'#829259';ctx.fillRect(i*10-4,-3,8,6);}}
 if(b.type==='house'&&!drawOriginalBuilding('house'))house(0,5);
 if(b.type==='church'&&!drawOriginalBuilding('church'))house(0,-3,true);
 if(b.type==='farm'&&!artwork.wheat){diamond(0,0,'#b69a4d');for(let i=-2;i<=2;i++)for(let j=-1;j<=1;j++){const x=i*6+j*4,y=j*4-i*2;line(x,y,x,y-8,'#efd38a',1.7);line(x,y-4,x+3,y-7,'#f1d58c');}}
 if(b.type==='mill'){polygon([[-10,4],[10,0],[7,-30],[-7,-30]],'#faf3d9');polygon([[-10,-30],[0,-42],[11,-32]],'#99563f');for(let i=0;i<4;i++){ctx.save();ctx.translate(0,-26);ctx.rotate(Math.PI/4+i*Math.PI/2);line(0,0,0,-25,'#665d46',2);polygon([[2,-7],[8,-11],[8,-25],[2,-25]],'#e9e5c7','#8a866b');ctx.restore();}ctx.fillStyle='#756b54';ctx.fillRect(-2,-5,4,8);}
 if(b.type!=='road'&&!connected(b)){ctx.fillStyle='#a8533b';ctx.beginPath();ctx.arc(16,-32,5,0,Math.PI*2);ctx.fill();}
 ctx.restore();}
function draw(){if(!state||!view.w)return;ctx.setTransform(window.devicePixelRatio||1,0,0,window.devicePixelRatio||1,0,0);ctx.clearRect(0,0,view.w,view.h);
 const highlighted=hover?cells(selected,hover.r,hover.c):[];const invalid=hover&&problem(selected,hover.r,hover.c);
 for(let d=0;d<=22;d++)for(let r=0;r<SIZE;r++){const c=d-r;if(!inside(r,c))continue;const p=project(c,r);ctx.save();ctx.translate(p.x,p.y);ctx.scale(view.scale,view.scale);
 const t=state.terrain[r][c];if(r===11||c===11){polygon([[-28,0],[0,14],[28,0],[28,8],[0,22],[-28,8]],'#a6aa86');}
 diamond(0,0,t==='water'?'#82afac':t==='wheat'?'#cdc28a':((r+c)%2?'#b7c498':'#bfcc9f'));
 const occupant=at(r,c);const terrainArt=occupant?.type==='farm'?artwork.wheat:artwork.ground;
 if(t!=='water'&&terrainArt)ctx.drawImage(terrainArt,-28,-14,56,32.93);
 if(t==='water'){line(-10,0,0,-5,'#c4dcd0');line(3,5,12,1,'#c4dcd0');}
 else if(!artwork.ground&&!at(r,c)&&t==='wheat'){for(let i=-1;i<=1;i++)line(i*8,-2,i*8+4,-4,'#b3a46b');}
 if(highlighted.some(t=>t.r===r&&t.c===c)){diamond(0,0,invalid?'#c75d556e':'#fff8bf9c');}
 ctx.restore();}
 state.buildings.filter(b=>b.type==='road').forEach(building);
 state.buildings.filter(b=>b.type!=='road').sort((a,b)=>(a.r+a.c)-(b.r+b.c)).forEach(building);
 if(hover){const p=project(hover.c,hover.r);ctx.save();ctx.translate(p.x,p.y);ctx.scale(view.scale,view.scale);ctx.strokeStyle=invalid?'#a94d3b':'#fffcef';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(28,0);ctx.lineTo(0,14);ctx.lineTo(-28,0);ctx.closePath();ctx.stroke();ctx.restore();}
}
function resize(){const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;view.w=rect.width;view.h=rect.height;canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);view.scale=Math.min((rect.width-24)/(SIZE*56),(rect.height-65)/(SIZE*28));view.ox=rect.width/2;view.oy=(rect.height-SIZE*28*view.scale)/2+25;draw();}
for(const [type,m] of Object.entries(TYPES)){const button=document.createElement('button');button.className='tool';button.dataset.type=type;button.innerHTML=`<span class="icon" aria-hidden="true">${m.icon}</span><span><b>${m.name}</b><small>${m.detail}</small></span><span class="cost">${m.cost?m.cost+' ◇':'½ ◇'}</span>`;button.addEventListener('click',()=>{selected=type;render();});$('tools').appendChild(button);}
canvas.addEventListener('pointermove',event=>{const rect=canvas.getBoundingClientRect();hover=pick(event.clientX-rect.left,event.clientY-rect.top);draw();});
canvas.addEventListener('pointerleave',()=>{hover=null;draw();});
canvas.addEventListener('click',event=>{const rect=canvas.getBoundingClientRect();hover=pick(event.clientX-rect.left,event.clientY-rect.top);if(hover)build(hover.r,hover.c);});
canvas.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(event.key))return;event.preventDefault();hover=hover||{r:5,c:5};if(event.key==='Enter'||event.key===' ')build(hover.r,hover.c);else{const delta={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[event.key];hover={r:Math.max(0,Math.min(11,hover.r+delta[0])),c:Math.max(0,Math.min(11,hover.c+delta[1]))};draw();}});
function restart(){state=fresh();hover=null;selected='house';$('result').close();$('confirm-new').close();message('Bem-vindo! Expanda as estradas a partir da praça dourada. Casas precisam de estrada e mercado para crescer.');save();render();}
$('next-turn').addEventListener('click',advance);$('new-game').addEventListener('click',()=>$('confirm-new').showModal());$('cancel-restart').addEventListener('click',()=>$('confirm-new').close());$('confirm-restart').addEventListener('click',restart);$('restart').addEventListener('click',restart);$('inspect').addEventListener('click',()=>$('result').close());
state=load();message(state.status==='playing'?'Ligue edifícios à praça dourada por estradas. Mercados abastecem casas próximas; pontos vermelhos indicam falta de ligação.':'Desafio terminado. Explore a aldeia ou comece de novo.');if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(canvas);window.addEventListener('resize',resize);resize();render();

loadArtwork();
