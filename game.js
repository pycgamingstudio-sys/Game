(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ui = {
    splash:$('splash-screen'), menu:$('main-menu'), hud:$('hud-overlay'),
    over:$('game-over-screen'), pause:$('pause-screen'),
    progress:$('loading-progress'), loading:$('loading-label'),
    start:$('start-button'), garage:$('garage-button'), garageNote:$('garage-note'),
    distance:$('distance-value'), score:$('score-value'), speed:$('speed-value'),
    speedFill:$('speed-line-fill'), nitro:$('nitro-fill'), nitroPct:$('nitro-percent'),
    pauseBtn:$('pause-button'), resume:$('resume-button'), quit:$('quit-button'),
    again:$('play-again-button'), menuBtn:$('menu-button'),
    finalDistance:$('final-distance'), finalScore:$('final-score'), toast:$('toast')
  };
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rand = (a,b) => a + Math.random() * (b-a);
  const choose = (a) => a[Math.floor(Math.random()*a.length)];
  const isMobile = () => matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  let scene, camera, renderer, composer, bloomPass, clock, player, roadGroup, worldGroup, trafficGroup;
  let roadSegments=[], buildings=[], pillars=[], traffic=[], particles=[];
  let state='loading', elapsed=0, distance=0, score=0, speed=0, nitro=100;
  let targetLane=0, laneX=0, boosting=false, braking=false, pausedFrom='playing';
  let baseSpeed=42, spawnDistance=0, nextSpawn=100, lastDifficulty=0;
  let audioCtx=null, toastTimer=null, menuAngle=0, garageVariant=0;
  const lanePositions=[-6,0,6];
  const mats={};
  const tmpV=new THREE.Vector3();
  const setScreen=(screen,on)=>{screen.classList.toggle('active',on);screen.classList.toggle('hidden',!on)};
  function notify(message){
    ui.toast.textContent=message;ui.toast.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1800);
  }
  function sound(freq=440,duration=.07,type='sine',volume=.025){
    try{
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended') audioCtx.resume();
      const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
      osc.type=type;osc.frequency.setValueAtTime(freq,audioCtx.currentTime);
      gain.gain.setValueAtTime(volume,audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);
      osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration);
    }catch(_){}
  }
  function mat(color,roughness=.35,metalness=.65,emissive=null,intensity=0){
    const key=[color,roughness,metalness,emissive,intensity].join('|');
    if(!mats[key]) mats[key]=new THREE.MeshStandardMaterial({color,roughness,metalness,emissive:emissive||0x000000,emissiveIntensity:intensity});
    return mats[key];
  }
  function box(w,h,d,material,x=0,y=0,z=0,parent=scene){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function glowLine(parent,x1,y1,z1,x2,y2,z2,color=0x27eaff,r=.045){
    const a=new THREE.Vector3(x1,y1,z1),b=new THREE.Vector3(x2,y2,z2),dir=new THREE.Vector3().subVectors(b,a);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,dir.length(),6),new THREE.MeshBasicMaterial({color}));
    mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());parent.add(mesh);return mesh;
  }
  function makeCar(color=0x090d16,withLights=true){
    const group=new THREE.Group();
    const bodyMat=new THREE.MeshPhysicalMaterial({color,metalness:.92,roughness:.16,clearcoat:1,clearcoatRoughness:.08,reflectivity:.9});
    const glassMat=new THREE.MeshPhysicalMaterial({color:0x07111c,metalness:.72,roughness:.08,clearcoat:1,clearcoatRoughness:.04,transparent:true,opacity:.92});
    const rubber=mat(0x050608,.82,.12),rim=mat(0x111d28,.3,.85,0x00dfff,.18);
    const orange=new THREE.MeshBasicMaterial({color:0xff7628});
    const red=new THREE.MeshBasicMaterial({color:0xff173d});
    const white=new THREE.MeshBasicMaterial({color:0xbdfaff});
    // Wide wedge-shaped lower chassis and sharply sloped cabin.
    box(3.55,.48,6.6,bodyMat,0,.62,0,group);
    const hood=new THREE.Mesh(new THREE.BoxGeometry(3.3,.25,2.3),bodyMat);hood.position.set(0,.92,-2.0);hood.rotation.x=-.08;group.add(hood);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(2.35,.72,2.45),glassMat);cabin.position.set(0,1.18,.15);cabin.rotation.x=-.12;group.add(cabin);
    const roof=box(2.15,.12,1.7,bodyMat,0,1.57,.1,group);
    // angular nose and rear aero deck
    const nose=new THREE.Mesh(new THREE.ConeGeometry(1.65,.9,4),bodyMat);nose.rotation.x=-Math.PI/2;nose.rotation.z=Math.PI/4;nose.scale.set(1,.5,1.45);nose.position.set(0,.68,-3.12);group.add(nose);
    box(3.35,.16,.65,bodyMat,0,.72,3.05,group);
    // Rear diffuser, aero wing and sculpted side intakes.
    box(3.15,.12,.42,mat(0x05080d,.22,.92),0,.28,3.35,group);
    box(2.85,.10,.22,mat(0x202a35,.3,.8),0,1.34,3.08,group);
    for(const s of [-1,1]){
      box(.12,.48,.14,mat(0x111821,.3,.8),s*1.3,1.12,3.0,group);
      const intake=box(.08,.3,.65,mat(0x030609,.3,.65),s*1.68,.66,.75,group);
      intake.rotation.z=s*.12;
    }
    box(3.7,.12,.22,mat(0x11151c,.25,.8),0,.38,3.15,group);
    // Side skirts and door seams.
    for(const s of [-1,1]){
      box(.16,.22,4.8,mat(0x080b10,.28,.8),s*1.78,.42,.15,group);
      glowLine(group,s*1.79,.87,-1.15,s*1.79,1.24,.92,0x182b38,.012);
      // Wheels
      for(const z of [-2.05,2.05]){
        const wheel=new THREE.Group();wheel.position.set(s*1.78,.48,z);group.add(wheel);
        const tire=new THREE.Mesh(new THREE.CylinderGeometry(.57,.57,.36,16),rubber);tire.rotation.z=Math.PI/2;wheel.add(tire);
        const rimMesh=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.38,12),rim);rimMesh.rotation.z=Math.PI/2;wheel.add(rimMesh);
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.4,10),orange);hub.rotation.z=Math.PI/2;wheel.add(hub);
        for(let k=0;k<8;k++){const spoke=box(.035,.06,.57,rim,0,0,0,wheel);spoke.rotation.x=k*Math.PI/4;}
        group.userData.wheels ||= [];group.userData.wheels.push(wheel);
      }
    }
    if(withLights){
      box(1.1,.08,.12,white,-1.05,.83,-2.85,group);box(1.1,.08,.12,white,1.05,.83,-2.85,group);
      box(2.8,.09,.1,red,0,.85,3.32,group);
      box(2.6,.07,.09,orange,0,.18,.1,group);
      const under=new THREE.PointLight(0xff6b22,1.7,9);under.position.set(0,.12,.1);group.add(under);
      const front=new THREE.PointLight(0x9deeff,1.2,24);front.position.set(0,.7,-3.1);group.add(front);
      const rear=new THREE.PointLight(0xff153d,.8,8);rear.position.set(0,.9,3.3);group.add(rear);
    } else {
      box(1.0,.07,.1,red,-.85,.8,3.28,group);box(1.0,.07,.1,red,.85,.8,3.28,group);
    }
    group.userData.bodyMaterial=bodyMat;
    return group;
  }
  function makeAsphaltTexture(){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#171a22';ctx.fillRect(0,0,512,512);
    const pixels=ctx.createImageData(512,512);
    for(let i=0;i<pixels.data.length;i+=4){
      const n= Math.floor(20+Math.random()*24);
      pixels.data[i]=n;pixels.data[i+1]=n+1;pixels.data[i+2]=n+5;pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    for(let i=0;i<850;i++){
      ctx.fillStyle=Math.random()>.5?'rgba(190,205,220,.055)':'rgba(0,0,0,.12)';
      ctx.fillRect(Math.random()*512,Math.random()*512,Math.random()*3+.4,Math.random()*2+.4);
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,12);
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    texture.encoding=THREE.sRGBEncoding;
    return texture;
  }
  let asphaltTexture=null;
  function makeRoadSegment(z){
    const g=new THREE.Group();g.position.z=z;
    if(!asphaltTexture)asphaltTexture=makeAsphaltTexture();
    const roadMaterial=new THREE.MeshPhysicalMaterial({color:0x777b86,map:asphaltTexture,roughness:.34,metalness:.24,clearcoat:.72,clearcoatRoughness:.22});
    const road=new THREE.Mesh(new THREE.BoxGeometry(18,.22,100),roadMaterial);
    road.position.set(0,-.14,0);road.receiveShadow=true;g.add(road);
    // Shoulder strips and side barriers.
    for(const s of [-1,1]){
      box(.22,.5,100,mat(0x181522,.25,.7),s*9.2,.1,0,g);
      const rail=box(.12,.24,100,new THREE.MeshBasicMaterial({color:0xff278f}),s*9.05,.55,0,g);
      rail.material.transparent=true;rail.material.opacity=.82;
      glowLine(g,s*9.05,.62,-50,s*9.05,.62,50,0xff2a9d,.035);
    }
    // Dashed cyan lane separators.
    for(let z0=-48;z0<50;z0+=10){
      for(const x of [-3,3]) box(.075,.035,4.5,new THREE.MeshBasicMaterial({color:0x37eaff}),x,.015,z0,g);
    }
    // subtle edge reflectors
    for(let z0=-45;z0<50;z0+=15) for(const s of [-1,1]){
      const p=box(.12,.08,.65,new THREE.MeshBasicMaterial({color:0xff3da8}),s*8.65,.06,z0,g);p.material.transparent=true;p.material.opacity=.75;
    }
    roadGroup.add(g);roadSegments.push(g);
  }
  function makeBuilding(side,z){
    const h=rand(42,116),w=rand(9,17),d=rand(10,19),g=new THREE.Group();
    g.position.set(side*rand(17,25),0,z);
    const baseMat=choose([0x111722,0x171622,0x101b24,0x1b1826]);
    box(w,h,d,mat(baseMat,.72,.55),0,h/2,0,g);
    const accent=choose([0x19dcff,0xff3da8,0x9aff4c]);
    for(const x of [-w/2+.3,w/2-.3]){
      const strip=box(.12,h-.8,.14,new THREE.MeshBasicMaterial({color:accent}),x,h/2,-d/2-.08,g);
      strip.material.transparent=true;strip.material.opacity=.75;
    }
    // Small, low-cost emissive window panels on the front facade.
    const winMats=[new THREE.MeshBasicMaterial({color:0x1bcce8}),new THREE.MeshBasicMaterial({color:0xffb45b}),new THREE.MeshBasicMaterial({color:0x142a3c})];
    const rows=Math.min(13,Math.floor(h/7)),cols=Math.min(5,Math.floor(w/2.5));
    const winGeo=new THREE.PlaneGeometry(.72,.95);
    for(let row=0;row<rows;row++) for(let col=0;col<cols;col++){
      if(Math.random()<.24)continue;
      const win=new THREE.Mesh(winGeo,choose(winMats));
      win.position.set((col-(cols-1)/2)*1.7,h*.18+row*(h*.66/Math.max(1,rows-1)),-d/2-.09);g.add(win);
    }
    box(w*.45,.16,d*.45,mat(0x202735,.6,.7),0,h+.08,0,g);
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.18,6,6),new THREE.MeshBasicMaterial({color:0xff254c}));beacon.position.set(0,h+.35,0);g.add(beacon);
    worldGroup.add(g);buildings.push(g);
  }
  function makePillar(side,z){
    const g=new THREE.Group();g.position.set(side*10.5,0,z);g.userData.baseZ=z;
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.12,.2,3.6,7),mat(0x182b35,.35,.85));stem.position.y=1.8;g.add(stem);
    const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(1.0,0),new THREE.MeshBasicMaterial({color:0x37ffd0,wireframe:true}));crystal.position.y=4.0;g.add(crystal);
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.48,0),new THREE.MeshBasicMaterial({color:0x20eaff}));core.position.y=4;g.add(core);
    const light=new THREE.PointLight(0x18ffd1,.65,9);light.position.y=4;g.add(light);
    worldGroup.add(g);pillars.push(g);
  }
  function makeGantry(z){
    const g=new THREE.Group();g.position.z=z;g.userData.baseZ=z;
    const metal=mat(0x202636,.4,.8);
    box(.28,7,.3,metal,-8.5,3.5,0,g);box(.28,7,.3,metal,8.5,3.5,0,g);box(17,.28,.3,metal,0,7,0,g);
    for(const x of [-6,0,6]){
      const lamp=new THREE.PointLight(0x9deaff,1.1,20);lamp.position.set(x,6.5,1);g.add(lamp);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,6,6),new THREE.MeshBasicMaterial({color:0xc9faff}));bulb.position.set(x,6.5,0);g.add(bulb);
    }
    worldGroup.add(g);pillars.push(g);return g;
  }
  function spawnTraffic(z){
    const lane=Math.floor(Math.random()*3);
    const color=choose([0x17202c,0x20202a,0x172936,0x29232d]);
    const car=makeCar(color,false);car.scale.set(.86,.82,.86);car.position.set(lanePositions[lane],0,z);
    car.userData={lane,speed:rand(13,23),passed:false};
    trafficGroup.add(car);traffic.push(car);
  }
  function initWorld(){
    roadGroup=new THREE.Group();worldGroup=new THREE.Group();trafficGroup=new THREE.Group();
    scene.add(roadGroup,worldGroup,trafficGroup);
    for(let z=-100;z<=400;z+=100)makeRoadSegment(z);
    for(let z=-100;z<500;z+=30){makeBuilding(-1,z);makeBuilding(1,z+15);}
    for(let z=-90;z<480;z+=15){makePillar(z%30===0?-1:1,z);}
    for(let z=-50;z<500;z+=100){const gantry=makeGantry(z);gantry.userData.gantry=true;}
  }
  function initScene(){
    scene=new THREE.Scene();scene.background=new THREE.Color(0x05040d);scene.fog=new THREE.FogExp2(0x100b22,.0065);
    camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,650);
    camera.position.set(0,5.5,11);camera.lookAt(0,1,-8);
    renderer=new THREE.WebGLRenderer({antialias:!isMobile(),alpha:false,powerPreference:'high-performance'});
    const maxRatio=isMobile()?1.5:2;
    renderer.setPixelRatio(Math.min(devicePixelRatio,maxRatio));
    renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.physicallyCorrectLights=true;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
    if(THREE.EffectComposer&&THREE.UnrealBloomPass){
      composer=new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene,camera));
      bloomPass=new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),isMobile()?.55:.82,.58,.76);
      composer.addPass(bloomPass);
    }
    $('canvas-container').appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0x7862a8,0x080812,1.25));
    const cityFill=new THREE.PointLight(0x3b2bff,1.1,95);cityFill.position.set(-18,12,-38);scene.add(cityFill);
    const neonFill=new THREE.PointLight(0xff258d,1.35,85);neonFill.position.set(20,9,-58);scene.add(neonFill);
    const moon=new THREE.DirectionalLight(0xa9c5ff,1.15);moon.position.set(-25,40,-35);moon.castShadow=!isMobile();
    moon.shadow.mapSize.set(isMobile()?1024:2048,isMobile()?1024:2048);moon.shadow.camera.left=-28;moon.shadow.camera.right=28;moon.shadow.camera.top=35;moon.shadow.camera.bottom=-20;moon.shadow.bias=-.00025;scene.add(moon);
    const sun=new THREE.Mesh(new THREE.CircleGeometry(22,48),new THREE.MeshBasicMaterial({color:0x6a1ca8,transparent:true,opacity:.45}));sun.position.set(0,32,-230);scene.add(sun);
    // Procedural star field.
    const starGeo=new THREE.BufferGeometry(),starPos=[];
    for(let i=0;i<550;i++)starPos.push(rand(-260,260),rand(15,150),rand(-380,70));
    starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));
    scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0x9ecaff,size:.7,transparent:true,opacity:.8})));
    initWorld();
    player=makeCar(0x080c15,true);player.position.set(0,0,4);scene.add(player);
    clock=new THREE.Clock();
    addEventListener('resize',onResize,{passive:true});
  }
  function onResize(){
    if(!camera||!renderer)return;
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio,isMobile()?1.5:2));renderer.setSize(innerWidth,innerHeight);if(composer)composer.setSize(innerWidth,innerHeight);
  }
  function clearTraffic(){
    traffic.forEach(c=>trafficGroup.remove(c));traffic.length=0;
  }
  function resetRun(){
    distance=0;score=0;speed=0;nitro=100;targetLane=0;laneX=0;boosting=false;braking=false;
    spawnDistance=0;nextSpawn=100;lastDifficulty=0;baseSpeed=42;
    clearTraffic();player.position.set(0,0,4);player.rotation.set(0,0,0);
    roadSegments.forEach((r,i)=>r.position.z=-100+i*100);
    buildings.forEach((b,i)=>b.position.z=-100+Math.floor(i/2)*30+(i%2?15:0));
    pillars.forEach(p=>{p.position.z=p.userData.baseZ;});
    ui.nitro.style.width='100%';ui.nitroPct.textContent='100%';
  }
  function startGame(){
    resetRun();state='playing';setScreen(ui.menu,false);setScreen(ui.over,false);setScreen(ui.pause,false);
    ui.hud.classList.remove('hidden');sound(620,.12,'triangle',.045);notify('ENGINE ONLINE // GOOD LUCK');
  }
  function gameOver(){
    if(state!=='playing')return;
    state='over';ui.hud.classList.add('hidden');
    ui.finalDistance.innerHTML=String(Math.floor(distance)).padStart(6,'0')+'<span>m</span>';
    ui.finalScore.textContent=String(score).padStart(6,'0');
    setScreen(ui.over,true);sound(130,.35,'sawtooth',.05);
  }
  function pauseGame(){
    if(state!=='playing')return;
    state='paused';setScreen(ui.pause,true);sound(330,.08,'sine');
  }
  function resumeGame(){if(state!=='paused')return;state='playing';setScreen(ui.pause,false);clock.getDelta();sound(520,.08,'sine');}
  function goMenu(){
    state='menu';ui.hud.classList.add('hidden');setScreen(ui.pause,false);setScreen(ui.over,false);setScreen(ui.menu,true);camera.position.set(0,5.5,11);
  }
  function shiftLane(dir){
    if(state!=='playing')return;
    targetLane=clamp(targetLane+dir,-1,1);sound(250+targetLane*50,.045,'triangle',.018);
  }
  function setBoost(value){boosting=value&&state==='playing';}
  const keys={};
  addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();
    if(e.repeat)return;keys[e.code]=true;
    if(e.code==='ArrowLeft'||e.code==='KeyA')shiftLane(-1);
    if(e.code==='ArrowRight'||e.code==='KeyD')shiftLane(1);
    if(e.code==='Space'||e.code==='ShiftLeft'||e.code==='ShiftRight')setBoost(true);
    if(e.code==='Escape'){if(state==='playing')pauseGame();else if(state==='paused')resumeGame();}
  });
  addEventListener('keyup',e=>{keys[e.code]=false;if(['Space','ShiftLeft','ShiftRight'].includes(e.code))setBoost(false);});
  let touchStart=null;
  const canvas=$('canvas-container');
  canvas.addEventListener('touchstart',e=>{
    const t=e.changedTouches[0];touchStart={x:t.clientX,y:t.clientY,time:performance.now()};
    if(t.clientX>innerWidth*.58)setBoost(true);else braking=true;
  },{passive:true});
  canvas.addEventListener('touchend',e=>{
    if(!touchStart)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.x;
    if(Math.abs(dx)>28)shiftLane(dx>0?1:-1);
    touchStart=null;setBoost(false);braking=false;
  },{passive:true});
  canvas.addEventListener('touchcancel',()=>{touchStart=null;setBoost(false);braking=false;},{passive:true});
  let mouseX=null;
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')mouseX=e.clientX;});
  canvas.addEventListener('pointerup',e=>{
    if(e.pointerType==='mouse'&&mouseX!==null){const dx=e.clientX-mouseX;if(Math.abs(dx)>35)shiftLane(dx>0?1:-1);mouseX=null;}
  });
  function updateWorld(dt,move){
    roadSegments.forEach(r=>{r.position.z+=move;if(r.position.z>150)r.position.z-=500;});
    buildings.forEach(b=>{b.position.z+=move;if(b.position.z>90){b.position.z-=600;b.position.x=(b.position.x<0?-1:1)*rand(17,25);}});
    pillars.forEach(p=>{p.position.z+=move;if(p.position.z>80)p.position.z-=570;});
    traffic.forEach((car,i)=>{
      car.position.z+=move*(1-car.userData.speed/Math.max(1,speed));
      car.rotation.y=Math.sin(elapsed*1.7+i)*.012;
      if(!car.userData.passed&&car.position.z>player.position.z+4){
        car.userData.passed=true;score+=250;nitro=clamp(nitro+9,0,100);notify('NEAR MISS +250');
      }
      if(Math.abs(car.position.x-player.position.x)<2.35&&Math.abs(car.position.z-player.position.z)<4.0){gameOver();}
    });
    for(let i=traffic.length-1;i>=0;i--){if(traffic[i].position.z>28){trafficGroup.remove(traffic[i]);traffic.splice(i,1);}}
    spawnDistance+=move;
    if(spawnDistance>=nextSpawn){spawnTraffic(-230);nextSpawn=spawnDistance+rand(90,145);}
    if(spawnDistance-lastDifficulty>=500){
      lastDifficulty=spawnDistance;baseSpeed*=1.1;
      scene.fog.color.setHex(lastDifficulty%1000===0?0x26091d:0x1c0b2b);
      notify('SECTOR SHIFT // SPEED INCREASED');sound(780,.15,'sawtooth',.035);
    }
  }
  function updateHUD(){
    ui.distance.innerHTML=String(Math.floor(distance)).padStart(6,'0')+'<span>m</span>';
    ui.score.textContent='SCORE '+String(score).padStart(6,'0');
    ui.speed.textContent=String(Math.round(speed*3.6)).padStart(3,'0');
    ui.speedFill.style.width=clamp(speed/95*100,0,100)+'%';
    ui.nitro.style.width=nitro+'%';ui.nitroPct.textContent=Math.round(nitro)+'%';
  }
  function updatePlayer(dt){
    const desired=lanePositions[targetLane+1];
    laneX+=(desired-laneX)*(1-Math.exp(-dt*8.5));
    player.position.x=laneX;
    player.rotation.z=clamp((desired-laneX)*-.045,-.14,.14);
    player.rotation.y=clamp((desired-laneX)*-.025,-.08,.08);
    if(player.userData.wheels)player.userData.wheels.forEach(w=>{w.rotation.x-=speed*dt*1.5;});
    const boostingNow=boosting&&nitro>0&&!braking;
    if(boostingNow)nitro=clamp(nitro-dt*26,0,100);else nitro=clamp(nitro+dt*7,0,100);
    const target=braking?Math.max(24,baseSpeed*.62):baseSpeed*(boostingNow?1.42:1);
    speed+=(target-speed)*(1-Math.exp(-dt*(braking?3.8:1.65)));
    const targetFov=boostingNow?72:60;camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-dt*4));camera.updateProjectionMatrix();
    camera.position.x+=(player.position.x*.32-camera.position.x)*(1-Math.exp(-dt*3.5));
    camera.position.y+=(5.4-camera.position.y)*(1-Math.exp(-dt*2));
    camera.position.z+=(11.7-camera.position.z)*(1-Math.exp(-dt*2));
    camera.lookAt(player.position.x*.42,1.0,-9);
    if(boostingNow&&Math.random()<.55)spawnBoostParticle();
    return speed*dt;
  }
  function spawnBoostParticle(){
    const geometry=new THREE.SphereGeometry(rand(.035,.09),5,5);
    const material=new THREE.MeshBasicMaterial({color:choose([0x26eaff,0xff7a28,0xff3da8]),transparent:true,opacity:.9});
    const p=new THREE.Mesh(geometry,material);p.position.set(player.position.x+rand(-.7,.7),rand(.2,.8),player.position.z+3.5);p.userData.life=rand(.25,.55);p.userData.vz=rand(35,65);scene.add(p);particles.push(p);
  }
  function updateParticles(dt){
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.position.z+=p.userData.vz*dt;p.userData.life-=dt;p.material.opacity=clamp(p.userData.life*2,0,1);if(p.userData.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();particles.splice(i,1);}}
  }
  function animate(){
    requestAnimationFrame(animate);
    const dt=Math.min(clock?clock.getDelta():.016,.04);elapsed+=dt;
    if(state==='playing'){
      const move=updatePlayer(dt);distance+=move;score+=Math.floor(move*1.2);
      updateWorld(dt,move);updateParticles(dt);updateHUD();
    }else if(state==='menu'||state==='loading'){
      menuAngle+=dt*.22;
      if(player){player.position.y=Math.sin(elapsed*1.4)*.035;player.rotation.y=Math.sin(menuAngle)*.06;camera.position.x=Math.sin(menuAngle)*.7;camera.position.y=5.1+Math.sin(menuAngle*.7)*.25;camera.lookAt(0,1,-2);}
      updateParticles(dt);
    }else if(state==='paused'){updateParticles(dt);}
    if(renderer&&scene&&camera){if(composer)composer.render(dt);else renderer.render(scene,camera);}
  }
  function boot(){
    if(!window.THREE){ui.loading.textContent='WEBGL ENGINE FAILED TO LOAD';return;}
    try{initScene();}catch(err){console.error(err);ui.loading.textContent='GRAPHICS INITIALIZATION FAILED';return;}
    let progress=0;
    const fakeLoad=setInterval(()=>{
      progress=Math.min(100,progress+rand(8,17));ui.progress.style.width=progress+'%';ui.loading.textContent='INITIALIZING NEURAL LINK... '+Math.floor(progress)+'%';
      if(progress>=100){clearInterval(fakeLoad);setTimeout(()=>{setScreen(ui.splash,false);state='menu';setScreen(ui.menu,true);},250);}
    },90);
    animate();
  }
  ui.start.addEventListener('click',startGame);
  ui.garage.addEventListener('click',()=>{
    garageVariant=(garageVariant+1)%3;
    const colors=[0x080c15,0x10101b,0x101c22],labels=['OBSIDIAN SPEC','MIDNIGHT VIOLET','ICE TITANIUM'];
    player.userData.bodyMaterial.color.setHex(colors[garageVariant]);ui.garageNote.textContent='GARAGE // '+labels[garageVariant]+' SELECTED';sound(430,.08,'triangle');
  });
  ui.pauseBtn.addEventListener('click',pauseGame);
  ui.resume.addEventListener('click',resumeGame);
  ui.quit.addEventListener('click',goMenu);
  ui.again.addEventListener('click',startGame);
  ui.menuBtn.addEventListener('click',goMenu);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pauseGame();});
  boot();
})();