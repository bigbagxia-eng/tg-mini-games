/* ========= Config ========= */
const BACKEND = (localStorage.getItem("BACKEND") || "http://localhost:8000").replace(/\/$/,'');
const GAMES = ["snake","runner","match3"];

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.enableClosingConfirmation();
  tg.setHeaderColor?.("secondary_bg_color");
}

/* ========= DOM ========= */
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

const subtitle = document.getElementById("subtitle");
const chipLeft = document.getElementById("chipLeft");
const chipCenter = document.getElementById("chipCenter");
const chipRight = document.getElementById("chipRight");

const overlay = document.getElementById("overlay");
const panelTitle = document.getElementById("panelTitle");
const panelText = document.getElementById("panelText");
const btnPlay = document.getElementById("btnPlay");
const btnLeaderboard = document.getElementById("btnLeaderboard");
const lb = document.getElementById("lb");

const touch = document.getElementById("touch");

/* ========= Helpers ========= */
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function lerp(a,b,t){ return a + (b-a)*t; }
function now(){ return performance.now(); }
function dpr(){ return Math.min(2, window.devicePixelRatio || 1); }

function resize(){
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.floor(r.width * dpr());
  canvas.height = Math.floor(r.height * dpr());
}
new ResizeObserver(resize).observe(canvas);
resize();

function clearBg(){
  const w=canvas.width, h=canvas.height;
  // современный “неон” фон
  const g = ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0, "#0b0f17");
  g.addColorStop(1, "#071225");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // мягкие пятна
  ctx.globalAlpha = 0.18;
  blob(w*0.30,h*0.25, w*0.25, "#7c5cff");
  blob(w*0.85,h*0.18, w*0.20, "#00d4ff");
  blob(w*0.70,h*0.85, w*0.22, "#7c5cff");
  ctx.globalAlpha = 1;
}

function blob(x,y,r,color){
  const g = ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ========= Telegram auth header ========= */
function initDataHeader(){
  // Telegram передаёт initData в tg.initData
  const initData = tg?.initData || "";
  return { "X-Init-Data": initData };
}

async function apiGet(path){
  const res = await fetch(BACKEND + path, { headers: initDataHeader() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPost(path, body){
  const res = await fetch(BACKEND + path, {
    method:"POST",
    headers: { "Content-Type":"application/json", ...initDataHeader() },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

let me = null;
(async()=>{
  try{
    me = await apiGet("/api/me");
    const u = me.user;
    subtitle.textContent = `@${u.username || (u.first_name||"Player")}`;
  }catch(e){
    // если запускаешь не в Telegram — покажем “Demo mode”
    subtitle.textContent = "Demo mode (не Telegram)";
  }
})();

/* ========= Input ========= */
const input = {
  left:false,right:false,up:false,down:false,action:false,
  justLeft:false,justRight:false,justUp:false,justDown:false,justAction:false
};
function pulse(key){
  input["just"+key[0].toUpperCase()+key.slice(1)] = true;
  input[key] = true;
  setTimeout(()=>{ input[key]=false; }, 60);
}
window.addEventListener("keydown",(e)=>{
  const k = e.key.toLowerCase();
  if (["arrowleft","a"].includes(k)) pulse("left");
  if (["arrowright","d"].includes(k)) pulse("right");
  if (["arrowup","w"].includes(k)) pulse("up");
  if (["arrowdown","s"].includes(k)) pulse("down");
  if (k===" " || k==="enter") pulse("action");
});
window.addEventListener("pointerdown",(e)=>{
  // клик/тап на сцене = action (в зависимости от игры)
  pulse("action");
});

/* Touch buttons (показываем на телефонах) */
const isTouch = matchMedia("(pointer:coarse)").matches;
touch.hidden = !isTouch;
touch.addEventListener("pointerdown",(e)=>{
  const b = e.target.closest(".tbtn"); if(!b) return;
  e.preventDefault();
  const act = b.dataset.act;
  if (act==="left") pulse("left");
  if (act==="right") pulse("right");
  if (act==="up") pulse("up");
  if (act==="down") pulse("down");
  if (act==="action") pulse("action");
},{passive:false});

/* ========= UI tabs ========= */
let currentGame = "snake";
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentGame = btn.dataset.game;
    setGame(currentGame);
    showMenu();
  });
});

/* ========= Particles ========= */
const particles = [];
function spawnParticle(x,y, vx,vy, life, size){
  particles.push({x,y,vx,vy,life,ttl:life,size});
}
function updateParticles(dt){
  for (let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.life -= dt;
    p.x += p.vx*dt;
    p.y += p.vy*dt;
    p.vx *= Math.pow(0.92, dt*60);
    p.vy *= Math.pow(0.92, dt*60);
    if(p.life<=0) particles.splice(i,1);
  }
}
function drawParticles(){
  for(const p of particles){
    const a = clamp(p.life/p.ttl,0,1);
    ctx.globalAlpha = 0.65*a;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.size*a,0,Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ========= Leaderboard ========= */
let bestByGame = { snake:0, runner:0, match3:0 };

async function refreshTop(game){
  try{
    const data = await apiGet(`/api/leaderboard?game=${game}&limit=5`);
    const top = data.rows?.[0]?.score ?? 0;
    chipRight.textContent = `Top: ${top}`;
  }catch{
    chipRight.textContent = `Top: —`;
  }
}
async function showLeaderboard(game){
  lb.hidden = false;
  lb.innerHTML = `<div style="color:rgba(234,240,255,.65);padding:6px 4px;">Загрузка…</div>`;
  try{
    const data = await apiGet(`/api/leaderboard?game=${game}&limit=30`);
    const rows = data.rows || [];
    lb.innerHTML = rows.map((r,i)=>{
      const name = r.username ? "@"+r.username : [r.first_name, r.last_name].filter(Boolean).join(" ") || ("ID "+r.tg_id);
      return `<div class="lbRow">
        <div class="lbPos">${i+1}</div>
        <div class="lbName">${escapeHtml(name)}</div>
        <div class="lbScore">${r.score}</div>
      </div>`;
    }).join("") || `<div style="color:rgba(234,240,255,.65);padding:6px 4px;">Пока пусто</div>`;
  }catch(e){
    lb.innerHTML = `<div style="color:rgba(255,255,255,.7);padding:6px 4px;">Не удалось загрузить рейтинг</div>`;
  }
}
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
async function submitScore(game, score){
  try{
    const data = await apiPost("/api/score", { game, score });
    bestByGame[game] = data.best ?? bestByGame[game];
    chipCenter.textContent = `Best: ${bestByGame[game]}`;
    refreshTop(game);
  }catch{
    // demo mode: локально без backend
    bestByGame[game] = Math.max(bestByGame[game], score);
    chipCenter.textContent = `Best: ${bestByGame[game]}`;
  }
}

/* ========= Overlay menu ========= */
function showMenu(){
  overlay.style.display = "flex";
  lb.hidden = true;
  panelTitle.textContent =
    currentGame==="snake" ? "Змейка" :
    currentGame==="runner" ? "Runner" : "3-в-ряд";
  panelText.textContent = "Нажми “Играть”";
}
function hideMenu(){
  overlay.style.display = "none";
}
btnPlay.addEventListener("click", ()=>{
  hideMenu();
  game.reset();
  game.running = true;
});
btnLeaderboard.addEventListener("click", ()=>{
  showLeaderboard(currentGame);
});

showMenu();

/* ========= Game base ========= */
let game = null;

function setGame(name){
  if(name==="snake") game = makeSnake();
  if(name==="runner") game = makeRunner();
  if(name==="match3") game = makeMatch3();
  chipLeft.textContent = "Score: 0";
  chipCenter.textContent = `Best: ${bestByGame[name]||0}`;
  refreshTop(name);
}
setGame(currentGame);

/* ========= Snake (modern) ========= */
function makeSnake(){
  const state = {
    running:false,
    score:0,
    t:0,
    grid: 18,
    cols: 0, rows: 0,
    cell: 0,
    dir: {x:1,y:0},
    nextDir:{x:1,y:0},
    snake: [],
    food: null,
    speed: 7.5, // шагов в секунду
    stepAcc: 0,
    alive:true,
  };

  function layout(){
    const w=canvas.width, h=canvas.height;
    const pad = Math.floor(Math.min(w,h)*0.10);
    const size = Math.floor(Math.min(w,h) - pad*2);
    state.cell = Math.floor(size / state.grid);
    state.cols = state.grid;
    state.rows = state.grid;
    state.board = {
      x: Math.floor((w - state.cell*state.cols)/2),
      y: Math.floor((h - state.cell*state.rows)/2),
      w: state.cell*state.cols,
      h: state.cell*state.rows,
      r: Math.floor(state.cell*0.35)
    };
  }

  function spawnFood(){
    const occupied = new Set(state.snake.map(s=>`${s.x},${s.y}`));
    let x,y;
    do{
      x = (Math.random()*state.cols)|0;
      y = (Math.random()*state.rows)|0;
    }while(occupied.has(`${x},${y}`));
    state.food = {x,y, pulse:0};
  }

  function reset(){
    layout();
    state.running=false;
    state.score=0;
    state.t=0;
    state.stepAcc=0;
    state.alive=true;
    state.dir = {x:1,y:0};
    state.nextDir = {x:1,y:0};
    const mid = (state.grid/2)|0;
    state.snake = [{x:mid-1,y:mid},{x:mid,y:mid},{x:mid+1,y:mid}];
    spawnFood();
    chipLeft.textContent = `Score: 0`;
  }

  function step(){
    // применяем поворот (без разворота на 180)
    const d = state.nextDir;
    if (!(d.x === -state.dir.x && d.y === -state.dir.y)){
      state.dir = d;
    }
    const head = state.snake[state.snake.length-1];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    // стенки
    if (nx<0||ny<0||nx>=state.cols||ny>=state.rows){
      die();
      return;
    }

    // хвост уходит, поэтому проверяем столкновение аккуратно
    const tail = state.snake[0];
    const willEat = (nx===state.food.x && ny===state.food.y);

    for (let i=0;i<state.snake.length;i++){
      const s=state.snake[i];
      const isTail = (i===0);
      if (s.x===nx && s.y===ny && !(isTail && !willEat && tail.x===nx && tail.y===ny)){
        die();
        return;
      }
    }

    state.snake.push({x:nx,y:ny});
    if (willEat){
      state.score += 10;
      state.speed = Math.min(14, state.speed + 0.25);
      for (let i=0;i<18;i++){
        const bx = state.board.x + (nx+0.5)*state.cell + (Math.random()-0.5)*state.cell*0.9;
        const by = state.board.y + (ny+0.5)*state.cell + (Math.random()-0.5)*state.cell*0.9;
        spawnParticle(bx,by, (Math.random()-0.5)*220, (Math.random()-0.5)*220, 0.35+Math.random()*0.25, 3+Math.random()*3);
      }
      spawnFood();
    } else {
      state.snake.shift();
    }
    chipLeft.textContent = `Score: ${state.score}`;
  }

  function die(){
    state.alive=false;
    state.running=false;
    submitScore("snake", state.score);
    panelText.textContent = `Счёт: ${state.score}`;
    showMenu();
  }

  function update(dt){
    layout();
    if (!state.running) return;

    // управление
    if (input.justLeft) state.nextDir = {x:-1,y:0};
    if (input.justRight) state.nextDir = {x: 1,y:0};
    if (input.justUp) state.nextDir = {x:0,y:-1};
    if (input.justDown) state.nextDir = {x:0,y: 1};

    state.stepAcc += dt * state.speed;
    while(state.stepAcc >= 1){
      state.stepAcc -= 1;
      step();
      if(!state.running) break;
    }
    state.food.pulse += dt*6;
  }

  function draw(){
    clearBg();
    const b = state.board;
    // рамка
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,.06)";
    roundRect(b.x, b.y, b.w, b.h, Math.max(14, b.r));
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = Math.max(2, Math.floor(2*dpr()));
    ctx.stroke();

    // клетки (легкая сетка)
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    for(let i=1;i<state.cols;i++){
      const x = b.x + i*state.cell;
      ctx.beginPath(); ctx.moveTo(x,b.y); ctx.lineTo(x,b.y+b.h); ctx.stroke();
    }
    for(let j=1;j<state.rows;j++){
      const y = b.y + j*state.cell;
      ctx.beginPath(); ctx.moveTo(b.x,y); ctx.lineTo(b.x+b.w,y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // еда
    const fx = b.x + (state.food.x+0.5)*state.cell;
    const fy = b.y + (state.food.y+0.5)*state.cell;
    const pr = (0.32 + 0.06*Math.sin(state.food.pulse))*state.cell;
    const fg = ctx.createRadialGradient(fx,fy,0,fx,fy,pr*2.2);
    fg.addColorStop(0,"rgba(0,212,255,.90)");
    fg.addColorStop(1,"rgba(124,92,255,0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(fx,fy,pr*2.2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(234,240,255,.95)";
    ctx.beginPath(); ctx.arc(fx,fy,pr,0,Math.PI*2); ctx.fill();

    // змейка (градиент + глянец)
    for(let i=0;i<state.snake.length;i++){
      const s = state.snake[i];
      const x = b.x + s.x*state.cell;
      const y = b.y + s.y*state.cell;

      const t = i/(state.snake.length-1 || 1);
      const gx = ctx.createLinearGradient(x,y,x+state.cell,y+state.cell);
      gx.addColorStop(0, `rgba(124,92,255,${0.45+0.45*t})`);
      gx.addColorStop(1, `rgba(0,212,255,${0.35+0.40*t})`);
      ctx.fillStyle = gx;
      roundRect(x+2, y+2, state.cell-4, state.cell-4, Math.max(8, state.cell*0.28));
      ctx.fill();

      // блик
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "white";
      roundRect(x+state.cell*0.20, y+state.cell*0.18, state.cell*0.45, state.cell*0.18, state.cell*0.12);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawParticles();

    // если игра не запущена — легкая подсказка на фоне (без “инструкций”)
    if(!state.running){
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "white";
      ctx.font = `${Math.floor(18*dpr())}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(" ", canvas.width/2, canvas.height/2);
      ctx.globalAlpha = 1;
    }
  }

  return { reset, update, draw, running:false };
}

/* ========= Runner (2D endless, lanes, jump/slide) ========= */
function makeRunner(){
  const st = {
    running:false,
    score:0,
    best:0,
    t:0,
    speed: 620, // world px/s
    lane:1, // 0..2
    y:0,
    vy:0,
    onGround:true,
    slide:0,
    obstacles:[],
    coins:[],
    spawnAcc:0,
    coinAcc:0,
    inv:0,
  };

  function reset(){
    st.running=false;
    st.score=0;
    st.t=0;
    st.speed=620;
    st.lane=1;
    st.y=0;
    st.vy=0;
    st.onGround=true;
    st.slide=0;
    st.obstacles=[];
    st.coins=[];
    st.spawnAcc=0;
    st.coinAcc=0;
    st.inv=0;
    chipLeft.textContent = `Score: 0`;
  }

  function world(){
    const w=canvas.width, h=canvas.height;
    const padX = w*0.10;
    const roadW = w - padX*2;
    const laneW = roadW/3;
    const roadY = h*0.62;
    return {w,h,padX,roadW,laneW,roadY};
  }

  function laneX(l){
    const W = world();
    return W.padX + (l+0.5)*W.laneW;
  }

  function spawnObstacle(){
    const l = (Math.random()*3)|0;
    const type = Math.random()<0.5 ? "barrier" : "block";
    const W = world();
    const x = W.w + W.laneW;
    const y = W.roadY;
    const h = type==="barrier" ? W.h*0.18 : W.h*0.26;
    const w = W.laneW*0.52;
    st.obstacles.push({lane:l, x, y, w, h, type});
  }

  function spawnCoinLine(){
    const l = (Math.random()*3)|0;
    const W = world();
    const x0 = W.w + W.laneW;
    const y0 = W.roadY - W.h*0.20;
    const n = 6 + ((Math.random()*4)|0);
    for(let i=0;i<n;i++){
      st.coins.push({lane:l, x:x0 + i*W.laneW*0.45, y:y0, r:Math.max(10, W.w*0.008), taken:false, spin:Math.random()*10});
    }
  }

  function die(){
    st.running=false;
    submitScore("runner", st.score);
    panelText.textContent = `Счёт: ${st.score}`;
    showMenu();
  }

  function update(dt){
    const W = world();
    if(!st.running) return;

    st.t += dt;
    st.speed = Math.min(1100, st.speed + dt*22);

    // controls: left/right change lane
    if(input.justLeft) st.lane = clamp(st.lane-1,0,2);
    if(input.justRight) st.lane = clamp(st.lane+1,0,2);

    // jump
    if((input.justUp || input.justAction) && st.onGround){
      st.vy = -W.h*1.25;
      st.onGround = false;
      for(let i=0;i<14;i++){
        spawnParticle(laneX(st.lane), W.roadY-10, (Math.random()-0.5)*260, -Math.random()*260, 0.25+Math.random()*0.2, 2.5+Math.random()*3.5);
      }
    }
    // slide
    if(input.justDown && st.onGround){
      st.slide = 0.55;
    }
    st.slide = Math.max(0, st.slide - dt);

    // physics
    const g = W.h*2.8;
    st.vy += g*dt;
    st.y += st.vy*dt;
    if(st.y>0){ st.y=0; st.vy=0; st.onGround=true; }

    // spawn
    st.spawnAcc += dt;
    if(st.spawnAcc > lerp(0.95, 0.55, clamp((st.speed-620)/500,0,1))){
      st.spawnAcc = 0;
      spawnObstacle();
    }
    st.coinAcc += dt;
    if(st.coinAcc > 1.35){
      st.coinAcc = 0;
      if(Math.random()<0.8) spawnCoinLine();
    }

    // move obstacles/coins
    const dx = st.speed * dt;
    for(const o of st.obstacles){ o.x -= dx; }
    for(const c of st.coins){ c.x -= dx; c.spin += dt*10; }

    st.obstacles = st.obstacles.filter(o=>o.x > -W.laneW);
    st.coins = st.coins.filter(c=>c.x > -W.laneW && !c.taken);

    // scoring over time
    st.score += Math.floor(dt*40);
    chipLeft.textContent = `Score: ${st.score}`;

    // collisions
    if(st.inv>0) st.inv -= dt;
    const px = laneX(st.lane);
    const py = W.roadY + st.y;
    const pW = W.laneW*0.32;
    const pH = (st.slide>0 ? W.h*0.16 : W.h*0.24);

    // coins
    for(const c of st.coins){
      if(c.taken) continue;
      if(c.lane!==st.lane) continue;
      const cx = c.x;
      const cy = c.y + st.y*0.2;
      const dist2 = (cx-px)*(cx-px) + (cy-(py-pH*0.6))*(cy-(py-pH*0.6));
      if(dist2 < (c.r*2.0)*(c.r*2.0)){
        c.taken = true;
        st.score += 25;
        for(let i=0;i<10;i++){
          spawnParticle(cx,cy, (Math.random()-0.5)*240, (Math.random()-0.5)*240, 0.22+Math.random()*0.2, 2+Math.random()*3);
        }
      }
    }

    // obstacles
    for(const o of st.obstacles){
      if(o.lane!==st.lane) continue;
      const ox = o.x;
      const ow = o.w;
      const oh = o.h;
      const oy = W.roadY;

      const pLeft = px - pW/2, pRight = px + pW/2;
      const oLeft = ox - ow/2, oRight = ox + ow/2;

      if(pRight > oLeft && pLeft < oRight){
        // vertical check
        const pTop = py - pH;
        const oTop = (o.type==="barrier") ? (oy - oh*0.65) : (oy - oh);
        const oBottom = oy;

        if(pTop < oBottom && (py) > oTop){
          if(st.inv<=0) die();
          break;
        }
      }
    }
  }

  function draw(){
    clearBg();
    const W=world();

    // road
    ctx.globalAlpha = 1;
    const roadG = ctx.createLinearGradient(0,W.roadY-W.h*0.55,0,W.roadY+W.h*0.25);
    roadG.addColorStop(0,"rgba(255,255,255,.05)");
    roadG.addColorStop(1,"rgba(255,255,255,.02)");
    ctx.fillStyle = roadG;
    roundRect(W.padX, W.roadY-W.h*0.45, W.roadW, W.h*0.62, 22*dpr());
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 2*dpr();
    ctx.stroke();

    // lane lines
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "white";
    ctx.setLineDash([18*dpr(), 14*dpr()]);
    for(let i=1;i<3;i++){
      const x = W.padX + i*W.laneW;
      ctx.beginPath();
      ctx.moveTo(x, W.roadY-W.h*0.40);
      ctx.lineTo(x, W.roadY+W.h*0.17);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // coins
    for(const c of st.coins){
      const x=c.x;
      const y=c.y + st.y*0.2;
      const rr = c.r;
      const glow = ctx.createRadialGradient(x,y,0,x,y,rr*2.8);
      glow.addColorStop(0,"rgba(0,212,255,.55)");
      glow.addColorStop(1,"rgba(124,92,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x,y,rr*2.8,0,Math.PI*2); ctx.fill();

      ctx.fillStyle = "rgba(234,240,255,.95)";
      ctx.beginPath(); ctx.arc(x,y,rr,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "white";
      ctx.beginPath(); ctx.arc(x-rr*0.25,y-rr*0.25,rr*0.35,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // obstacles
    for(const o of st.obstacles){
      const x = o.x;
      const y = W.roadY;
      const w = o.w;
      const h = o.h;

      // neon-ish
      const g = ctx.createLinearGradient(x-w/2, y-h, x+w/2, y);
      g.addColorStop(0, "rgba(255,77,109,.55)");
      g.addColorStop(1, "rgba(124,92,255,.45)");
      ctx.fillStyle = g;

      if(o.type==="barrier"){
        roundRect(x-w/2, y-h*0.65, w, h*0.65, 14*dpr());
      }else{
        roundRect(x-w/2, y-h, w, h, 16*dpr());
      }
      ctx.fill();

      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2*dpr();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // player
    const px = laneX(st.lane);
    const py = W.roadY + st.y;
    const pW = W.laneW*0.30;
    const pH = (st.slide>0 ? W.h*0.14 : W.h*0.22);

    const bodyG = ctx.createLinearGradient(px-pW/2, py-pH, px+pW/2, py);
    bodyG.addColorStop(0, "rgba(124,92,255,.75)");
    bodyG.addColorStop(1, "rgba(0,212,255,.55)");
    ctx.fillStyle = bodyG;
    roundRect(px-pW/2, py-pH, pW, pH, 18*dpr());
    ctx.fill();

    // highlight
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "white";
    roundRect(px-pW*0.20, py-pH*0.86, pW*0.45, pH*0.14, 10*dpr());
    ctx.fill();
    ctx.globalAlpha = 1;

    // shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(px, W.roadY+8*dpr(), pW*0.55, pW*0.20, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    updateParticles(0); // no-op, particles updated in loop
    drawParticles();
  }

  return { reset, update, draw, running:false };
}

/* ========= Match-3 (swap, match, cascade, score) ========= */
function makeMatch3(){
  const st = {
    running:false,
    score:0,
    grid:8,
    board:null,
    cell:0,
    ox:0, oy:0,
    selected:null,
    anim:[],
    settle:0,
    moves:0,
    time:0
  };

  const COLORS = [
    ["#7c5cff","#00d4ff"],
    ["#00d4ff","#2cff95"],
    ["#ff4d6d","#7c5cff"],
    ["#2cff95","#00d4ff"],
    ["#ffd166","#ff4d6d"],
    ["#a78bfa","#00d4ff"]
  ];

  function layout(){
    const w=canvas.width, h=canvas.height;
    const size = Math.floor(Math.min(w,h)*0.76);
    st.cell = Math.floor(size / st.grid);
    st.ox = Math.floor((w - st.cell*st.grid)/2);
    st.oy = Math.floor((h - st.cell*st.grid)/2);
  }

  function rndGem(){ return (Math.random()*COLORS.length)|0; }

  function makeBoard(){
    const b = Array.from({length:st.grid}, ()=>Array.from({length:st.grid}, ()=>rndGem()));
    // убрать стартовые совпадения
    for(let y=0;y<st.grid;y++){
      for(let x=0;x<st.grid;x++){
        while(hasMatchAt(b,x,y)){
          b[y][x]=rndGem();
        }
      }
    }
    return b;
  }

  function hasMatchAt(b,x,y){
    const v=b[y][x];
    // horizontal
    let c=1;
    for(let i=x-1;i>=0 && b[y][i]===v;i--) c++;
    for(let i=x+1;i<st.grid && b[y][i]===v;i++) c++;
    if(c>=3) return true;
    // vertical
    c=1;
    for(let j=y-1;j>=0 && b[j][x]===v;j--) c++;
    for(let j=y+1;j<st.grid && b[j][x]===v;j++) c++;
    return c>=3;
  }

  function reset(){
    layout();
    st.running=false;
    st.score=0;
    st.moves=0;
    st.time=0;
    st.selected=null;
    st.anim=[];
    st.settle=0;
    st.board = makeBoard();
    chipLeft.textContent = `Score: 0`;
  }

  function screenToCell(px,py){
    const x = Math.floor((px - st.ox)/st.cell);
    const y = Math.floor((py - st.oy)/st.cell);
    if(x<0||y<0||x>=st.grid||y>=st.grid) return null;
    return {x,y};
  }

  function swap(a,b){
    const t = st.board[a.y][a.x];
    st.board[a.y][a.x]=st.board[b.y][b.x];
    st.board[b.y][b.x]=t;
  }

  function findMatches(){
    const marks = Array.from({length:st.grid}, ()=>Array(st.grid).fill(false));
    // horizontal
    for(let y=0;y<st.grid;y++){
      let x=0;
      while(x<st.grid){
        const v=st.board[y][x];
        let x2=x+1;
        while(x2<st.grid && st.board[y][x2]===v) x2++;
        const len=x2-x;
        if(len>=3) for(let i=x;i<x2;i++) marks[y][i]=true;
        x=x2;
      }
    }
    // vertical
    for(let x=0;x<st.grid;x++){
      let y=0;
      while(y<st.grid){
        const v=st.board[y][x];
        let y2=y+1;
        while(y2<st.grid && st.board[y2][x]===v) y2++;
        const len=y2-y;
        if(len>=3) for(let j=y;j<y2;j++) marks[j][x]=true;
        y=y2;
      }
    }
    return marks;
  }

  function anyMarked(m){
    for(let y=0;y<st.grid;y++) for(let x=0;x<st.grid;x++) if(m[y][x]) return true;
    return false;
  }

  function collapse(marks){
    // remove
    let removed=0;
    for(let y=0;y<st.grid;y++){
      for(let x=0;x<st.grid;x++){
        if(marks[y][x]){
          removed++;
          const cx = st.ox + (x+0.5)*st.cell;
          const cy = st.oy + (y+0.5)*st.cell;
          for(let i=0;i<10;i++){
            spawnParticle(cx,cy, (Math.random()-0.5)*240, (Math.random()-0.5)*240, 0.18+Math.random()*0.2, 2+Math.random()*3);
          }
          st.board[y][x]=null;
        }
      }
    }
    if(removed>0){
      st.score += removed*12;
      chipLeft.textContent = `Score: ${st.score}`;
    }

    // gravity
    for(let x=0;x<st.grid;x++){
      let write = st.grid-1;
      for(let y=st.grid-1;y>=0;y--){
        const v = st.board[y][x];
        if(v!==null){
          st.board[write][x]=v;
          if(write!==y) st.board[y][x]=null;
          write--;
        }
      }
      for(let y=write;y>=0;y--){
        st.board[y][x]=rndGem();
      }
    }
  }

  function tryResolve(){
    let chain=0;
    while(true){
      const m = findMatches();
      if(!anyMarked(m)) break;
      collapse(m);
      chain++;
      if(chain>10) break;
    }
  }

  // pointer selection for match3 (swap by tap)
  canvas.addEventListener("pointerdown",(e)=>{
    if(currentGame!=="match3" || !st.running) return;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX-rect.left)*dpr();
    const py = (e.clientY-rect.top)*dpr();
    const c = screenToCell(px,py);
    if(!c) return;

    if(!st.selected){
      st.selected=c;
    }else{
      const a=st.selected, b=c;
      const man = Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
      if(man===1){
        swap(a,b);
        // если нет совпадений — откат
        const m = findMatches();
        if(!anyMarked(m)){
          swap(a,b);
          st.selected=null;
          return;
        }
        st.moves++;
        tryResolve();
        st.selected=null;
      }else{
        st.selected=c;
      }
    }
  });

  function update(dt){
    layout();
    if(!st.running) return;
    st.time += dt;
    updateParticles(dt);

    // (клава) стрелки выбирают + action подтверждает вторую клетку
    // чтобы не перегружать — оставим тач/клик как основной
  }

  function draw(){
    clearBg();
    // board panel
    const x=st.ox, y=st.oy, w=st.cell*st.grid, h=st.cell*st.grid;
    ctx.fillStyle = "rgba(255,255,255,.06)";
    roundRect(x-8*dpr(), y-8*dpr(), w+16*dpr(), h+16*dpr(), 22*dpr());
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 2*dpr();
    ctx.stroke();

    // cells
    for(let j=0;j<st.grid;j++){
      for(let i=0;i<st.grid;i++){
        const v = st.board?.[j]?.[i];
        const cx = x + i*st.cell;
        const cy = y + j*st.cell;

        ctx.globalAlpha = 0.14;
        ctx.fillStyle = "white";
        roundRect(cx+2, cy+2, st.cell-4, st.cell-4, 14*dpr());
        ctx.fill();
        ctx.globalAlpha = 1;

        if(v===null || v===undefined) continue;

        const c1 = COLORS[v][0], c2 = COLORS[v][1];
        const g = ctx.createLinearGradient(cx,cy,cx+st.cell,cy+st.cell);
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        ctx.fillStyle = g;

        roundRect(cx+6, cy+6, st.cell-12, st.cell-12, 16*dpr());
        ctx.fill();

        // sparkle
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "white";
        roundRect(cx+st.cell*0.22, cy+st.cell*0.20, st.cell*0.38, st.cell*0.14, 10*dpr());
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // selection
    if(st.selected){
      const cx = x + st.selected.x*st.cell;
      const cy = y + st.selected.y*st.cell;
      ctx.strokeStyle = "rgba(0,212,255,.75)";
      ctx.lineWidth = 3*dpr();
      ctx.globalAlpha = 0.9;
      roundRect(cx+4, cy+4, st.cell-8, st.cell-8, 16*dpr());
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawParticles();
  }

  function die(){
    st.running=false;
    submitScore("match3", st.score);
    panelText.textContent = `Счёт: ${st.score}`;
    showMenu();
  }

  return { reset, update, draw, running:false };
}

/* ========= Main loop ========= */
let last = now();
function loop(){
  const t = now();
  const dt = clamp((t-last)/1000, 0, 1/20);
  last = t;

  // reset “just”
  input.justLeft=input.justRight=input.justUp=input.justDown=input.justAction=false;

  // update/draw
  updateParticles(dt);
  game.update(dt);
  game.draw();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ========= Start states ========= */
showMenu();
