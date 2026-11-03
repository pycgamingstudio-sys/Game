import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const ui = {
  menu:$('main-menu'),hud:$('hud'),pause:$('pause-screen'),over:$('game-over-screen'),
  speed:$('speed-value'),distance:$('distance-value'),score:$('score-value'),
  nitro:$('nitro-fill'),nitroValue:$('nitro-value'),toast:$('toast'),
  loading:$('loading-screen'),loadProgress:$('load-progress'),loadLabel:$('load-label'),
  quality:$('quality-select'),garageNote:$('garage-note')
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const choose=(a)=>a[Math.floor(Math.random()*a.length)];
const isTouch=matchMedia('(pointer:coarse)').matches;
const lanes=[-4.4,0,4.4];
const state={mode:'loading',elapsed:0,distance:0,score:0,nitro:100,lane:1,steer:0,accelerate:false,brake:false,boost:false,finish:0,garage:0,spawn:0,nextSpawn:100};
let scene,camera,renderer,composer,bloom,clock,world,vehicle,chassis,carRoot,keyLight;
let roadSegments=[],buildings=[],traffic=[],wheelMeshes=[],headlights=[];
let roadTexture,roadMaterial,quality='ultra',lastHud=0;
const mats={};

function material(color,roughness=.5,metalness=.2,extra={}) {
  const key=[color,roughness,metalness,JSON.stringify(extra)].join(':');
  if(!mats[key]) mats[key]=new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
  return mats[key];
}
function addBox(parent,w,h,d,mat,x=0,y=0,z=0,cast=true) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z);mesh.castShadow=cast;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function glow(parent,color,intensity,distance,position) {
  const light=new THREE.PointLight(color,intensity,distance,2);light.position.set(...position);parent.add(light);return light;
}
function makeRoadTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#171a22';ctx.fillRect(0,0,512,512);
  const pixels=ctx.createImageData(512,512);
  for(let i=0;i<pixels.data.length;i+=4){const n=20+Math.floor(Math.random()*18);pixels.data[i]=n;pixels.data[i+1]=n+1;pixels.data[i+2]=n+5;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);
  for(let i=0;i<900;i++){ctx.fillStyle=Math.random()>.5?'rgba(180,205,225,.055)':'rgba(0,0,0,.13)';ctx.fillRect(Math.random()*512,Math.random()*512,rand(.5,3),rand(.5,2));}
  const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2,14);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();return tex;
}
function makeCar(){
  carRoot=new THREE.Group();
  const paint=new THREE.MeshPhysicalMaterial({color:0x101a27,metalness:.92,roughness:.18,clearcoat:1,clearcoatRoughness:.08});
  const carbon=material(0x080b11,.28,.86);
  const glass=new THREE.MeshPhysicalMaterial({color:0x071521,metalness:.72,roughness:.07,clearcoat:1,transparent:true,opacity:.92});
  const rubber=material(0x050609,.86,.08);
  const rim=new THREE.MeshStandardMaterial({color:0x9baab8,metalness:1,roughness:.2});
  const cyan=new THREE.MeshBasicMaterial({color:0x70f7ff});
  const red=new THREE.MeshBasicMaterial({color:0xff174c});
  addBox(carRoot,2.15,.52,4.5,paint,0,.65,0);
  const hood=addBox(carRoot,2.02,.2,1.55,paint,0,.96,-1.35);hood.rotation.x=-.035;
  const cabin=addBox(carRoot,1.58,.68,1.85,glass,0,1.25,.12);cabin.rotation.x=-.08;
  addBox(carRoot,1.5,.12,1.25,paint,0,1.62,.05);
  addBox(carRoot,2.02,.15,.7,paint,0,.72,1.92);
  addBox(carRoot,2.18,.1,.2,carbon,0,.38,2.16);
  addBox(carRoot,1.85,.1,.16,carbon,0,1.19,2.13);
  for(const s of [-1,1]){
    addBox(carRoot,.13,.22,3.3,carbon,s*1.05,.43,.05);
    const intake=addBox(carRoot,.06,.26,.5,carbon,s*1.05,.66,.58);intake.rotation.z=s*.12;
    addBox(carRoot,.78,.055,.08,cyan,s*.57,.88,-2.15,false);
    addBox(carRoot,.62,.06,.08,red,s*.53,.84,2.23,false);
    for(const z of [-1.45,1.45]){
      const wheel=new THREE.Group();wheel.position.set(s*1.05,.45,z);carRoot.add(wheel);
      const tyre=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.3,24),rubber);tyre.rotation.z=Math.PI/2;wheel.add(tyre);
      const disc=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.31,20),rim);disc.rotation.z=Math.PI/2;wheel.add(disc);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.32,16),material(0x17212c,.24,.95));hub.rotation.z=Math.PI/2;wheel.add(hub);
      for(let k=0;k<10;k++){const spoke=addBox(wheel,.035,.045,.46,rim,0,0,0,false);spoke.rotation.x=k*Math.PI/5;}
      wheelMeshes.push(wheel);
    }
  }
  const under=glow(carRoot,0x00dfff,2.4,8,[0,.16,0]);
  const headL=glow(carRoot,0xa9f8ff,2.1,32,[-.55,.75,-2.2]);
  const headR=glow(carRoot,0xa9f8ff,2.1,32,[.55,.75,-2.2]);
  headlights.push(headL,headR);
  return carRoot;
}
function buildCity(){
  const towerMat=[0x101724,0x171523,0x101e28,0x1c1a2a].map(c=>material(c,.65,.55));
  const windowMats=[0x18d9f4,0xffb85c,0xff398f,0x24384b].map(c=>new THREE.MeshBasicMaterial({color:c}));
  const windowGeometry=new THREE.BoxGeometry(.65,.82,.035);
  const dummy=new THREE.Object3D();
  for(let side of [-1,1]){
    for(let i=0;i<22;i++){
      const h=rand(25,95),w=rand(7,14),d=rand(8,16);
      const g=new THREE.Group();g.position.set(side*rand(16,26),0,-i*28-rand(0,20));
      addBox(g,w,h,d,choose(towerMat),0,h/2,0);
      addBox(g,.1,h,.12,new THREE.MeshBasicMaterial({color:choose([0x19eaff,0xff3e9e,0x8cff70])}),side===-1?w/2+.04:-w/2-.04,h/2,-d/2-.08,false);
      const windows=[];
      const rows=Math.min(12,Math.floor(h/7)),cols=Math.min(5,Math.floor(w/2.4));
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        if(Math.random()<.3)continue;
        windows.push([(col-(cols-1)/2)*1.65,h*.14+row*5.6,-d/2-.08]);
      }
      if(windows.length){
        const windowMesh=new THREE.InstancedMesh(windowGeometry,choose(windowMats),windows.length);
        windowMesh.castShadow=false;windowMesh.receiveShadow=false;
        windows.forEach((p,index)=>{dummy.position.set(p[0],p[1],p[2]);dummy.updateMatrix();windowMesh.setMatrixAt(index,dummy.matrix);});
        windowMesh.instanceMatrix.needsUpdate=true;g.add(windowMesh);
      }
      addBox(g,w*.42,.15,d*.4,material(0x293246,.5,.65),0,h+.08,0,false);
      const beacon=new THREE.Mesh(new THREE.SphereGeometry(.13,8,8),new THREE.MeshBasicMaterial({color:0xff315c}));beacon.position.y=h+.28;g.add(beacon);
      scene.add(g);buildings.push(g);
    }
  }
}
function makeRoad(){
  roadTexture=makeRoadTexture();
  roadMaterial=new THREE.MeshPhysicalMaterial({map:roadTexture,color:0x858b99,roughness:.38,metalness:.2,clearcoat:.75,clearcoatRoughness:.24});
  for(let i=0;i<6;i++){
    const g=new THREE.Group();g.position.z=-i*100;
    const road=new THREE.Mesh(new THREE.BoxGeometry(18,.2,100),roadMaterial);road.position.y=-.12;road.receiveShadow=true;g.add(road);
    for(const s of [-1,1]){
      addBox(g,.35,.55,100,material(0x151923,.55,.65),s*9.1,.12,0);
      addBox(g,.12,.12,100,new THREE.MeshBasicMaterial({color:0xff288f}),s*8.94,.5,0,false);
    }
    for(let z=-48;z<50;z+=10)for(const x of [-3,3])addBox(g,.055,.025,4,new THREE.MeshBasicMaterial({color:0x39eaff}),x,.005,z,false);
    for(let z=-45;z<50;z+=15)for(const s of [-1,1])addBox(g,.13,.07,.6,new THREE.MeshBasicMaterial({color:0xff3b9d}),s*8.65,.04,z,false);
    scene.add(g);roadSegments.push(g);
  }
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),material(0x070a13,.9,.05));ground.rotation.x=-Math.PI/2;ground.position.y=-.3;ground.position.z=-300;ground.receiveShadow=true;scene.add(ground);
}
function setupPhysics(){
  world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});
  world.broadphase=new CANNON.SAPBroadphase(world);world.allowSleep=true;
  world.defaultContactMaterial.friction=.42;world.defaultContactMaterial.restitution=.02;
  const ground=new CANNON.Body({mass:0,material:new CANNON.Material('road')});
  ground.addShape(new CANNON.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
  for(const s of [-1,1]){
    const barrier=new CANNON.Body({mass:0});barrier.addShape(new CANNON.Box(new CANNON.Vec3(.25,1,600)));barrier.position.set(s*9.7,.5,-260);world.addBody(barrier);
  }
  chassis=new CANNON.Body({mass:1380,linearDamping:.08,angularDamping:.38,allowSleep:false});
  chassis.addShape(new CANNON.Box(new CANNON.Vec3(1.02,.36,2.12)));
  chassis.position.set(0,1.1,3);chassis.updateMassProperties();world.addBody(chassis);
  vehicle=new CANNON.RaycastVehicle({chassisBody:chassis,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
  const wheelOptions={
    radius:.43,directionLocal:new CANNON.Vec3(0,-1,0),axleLocal:new CANNON.Vec3(-1,0,0),
    suspensionStiffness:34,suspensionRestLength:.58,frictionSlip:4.2,
    dampingRelaxation:2.4,dampingCompression:4.6,maxSuspensionForce:100000,
    rollInfluence:.08,customSlidingRotationalSpeed:-30,useCustomSlidingRotationalSpeed:true
  };
  for(const x of [-.83,.83])for(const z of [-1.38,1.38]){
    vehicle.addWheel({...wheelOptions, chassisConnectionPointLocal:new CANNON.Vec3(x,-.12,z)});
  }
  vehicle.addToWorld(world);
  chassis.addEventListener('collide',e=>{
    if(e.body?.userData?.traffic && state.mode==='playing')endRun();
  });
}
function setupScene(){
  scene=new THREE.Scene();scene.background=new THREE.Color(0x050711);scene.fog=new THREE.FogExp2(0x0c0c20,.0048);
  camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,900);camera.position.set(0,5.2,12);
  renderer=new THREE.WebGLRenderer({antialias:!isTouch,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('canvas-container').appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0x7772b0,0x090b14,1.1));
  keyLight=new THREE.DirectionalLight(0xb6d2ff,2.1);keyLight.position.set(-35,55,-45);keyLight.castShadow=true;keyLight.shadow.mapSize.set(2048,2048);keyLight.shadow.camera.left=-35;keyLight.shadow.camera.right=35;keyLight.shadow.camera.top=45;keyLight.shadow.camera.bottom=-25;keyLight.shadow.bias=-.0002;scene.add(keyLight);
  const blue=glow(scene,0x322cff,2.2,150,[-25,14,-90]);const pink=glow(scene,0xff258c,2.1,140,[26,10,-140]);
  const starGeo=new THREE.BufferGeometry(),stars=[];
  for(let i=0;i<900;i++)stars.push(rand(-320,320),rand(20,150),rand(-650,80));
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
  scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xaacfff,size:.75,transparent:true,opacity:.8})));
  makeRoad();buildCity();carRoot=makeCar();scene.add(carRoot);
  setupPhysics();
  composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.78,.55,.78);composer.addPass(bloom);composer.addPass(new OutputPass());
  applyQuality(ui.quality.value);
  clock=new THREE.Clock();
  addEventListener('resize',resize,{passive:true});
}
function applyQuality(value){
  quality=value;
  const config={
    ultra:{ratio:2,bloom:.9,shadows:2048,exposure:1.18},
    high:{ratio:1.65,bloom:.68,shadows:1536,exposure:1.15},
    balanced:{ratio:1.25,bloom:.48,shadows:1024,exposure:1.1},
    performance:{ratio:1,bloom:.25,shadows:512,exposure:1.05}
  }[value]||{ratio:1.25,bloom:.48,shadows:1024,exposure:1.1};
  renderer.setPixelRatio(Math.min(devicePixelRatio,config.ratio));renderer.setSize(innerWidth,innerHeight);
  composer.setSize(innerWidth,innerHeight);bloom.strength=config.bloom;renderer.toneMappingExposure=config.exposure;
  renderer.shadowMap.enabled=value!=='performance';
  if(keyLight){keyLight.shadow.mapSize.set(config.shadows,config.shadows);if(keyLight.shadow.map)keyLight.shadow.map.dispose();keyLight.shadow.needsUpdate=true;}
  renderer.shadowMap.needsUpdate=true;
  $('quality-select').value=value;
}
function resize(){
  if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio,({ultra:2,high:1.65,balanced:1.25,performance:1}[quality]||1.25)));
  renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
}
function setScreen(el,on){el.classList.toggle('active',on);el.classList.toggle('hidden',!on);}
function toast(text){ui.toast.textContent=text;ui.toast.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>ui.toast.classList.remove('show'),1600);}
function resetRun(){
  state.distance=0;state.score=0;state.nitro=100;state.lane=1;state.steer=0;state.spawn=0;state.nextSpawn=95;
  chassis.position.set(0,1.1,3);chassis.quaternion.set(0,0,0,1);chassis.velocity.set(0,0,0);chassis.angularVelocity.set(0,0,0);chassis.force.set(0,0,0);chassis.torque.set(0,0,0);
  traffic.forEach(t=>{world.removeBody(t.body);scene.remove(t.mesh);});traffic=[];
  roadSegments.forEach((g,i)=>g.position.z=-i*100);
  buildings.forEach((b,i)=>b.position.z=-Math.floor(i/2)*28-(i%2)*14);
  vehicle.wheelInfos.forEach(w=>{w.engineForce=0;w.brake=0;w.steering=0;});
  syncCar();updateHud();
}
function syncCar(){
  carRoot.position.set(chassis.position.x,chassis.position.y-.45,chassis.position.z);
  carRoot.quaternion.set(chassis.quaternion.x,chassis.quaternion.y,chassis.quaternion.z,chassis.quaternion.w);
  for(let i=0;i<4;i++){
    vehicle.updateWheelTransform(i);const t=vehicle.wheelInfos[i].worldTransform;
    wheelMeshes[i].position.set(t.position.x-chassis.position.x,t.position.y-(chassis.position.y-.45),t.position.z-chassis.position.z);
    wheelMeshes[i].quaternion.set(t.quaternion.x,t.quaternion.y,t.quaternion.z,t.quaternion.w);
  }
}
function startRun(){
  resetRun();state.mode='playing';setScreen(ui.menu,false);setScreen(ui.pause,false);setScreen(ui.over,false);ui.hud.classList.remove('hidden');toast('SYSTEM ONLINE // DRIVE SAFE');
}
function endRun(){
  if(state.mode!=='playing')return;state.mode='over';ui.hud.classList.add('hidden');
  $('final-distance').textContent=Math.floor(state.distance)+' M';$('final-score').textContent=state.score.toLocaleString('en-IN');
  setScreen(ui.over,true);
}
function pauseRun(){if(state.mode!=='playing')return;state.mode='paused';setScreen(ui.pause,true);}
function resumeRun(){if(state.mode!=='paused')return;state.mode='playing';setScreen(ui.pause,false);clock.getDelta();}
function goMenu(){state.mode='menu';ui.hud.classList.add('hidden');setScreen(ui.pause,false);setScreen(ui.over,false);setScreen(ui.menu,true);}
function spawnTraffic(){
  const lane=Math.floor(Math.random()*3),z=-205;
  const body=new CANNON.Body({mass:170,shape:new CANNON.Box(new CANNON.Vec3(.9,.48,1.75)),linearDamping:.08});
  body.position.set(lanes[lane],.56,z);body.userData.traffic=true;body.velocity.set(0,0,rand(13,22));world.addBody(body);
  const mesh=new THREE.Group();const paint=material(choose([0x17202c,0x20202c,0x182b36,0x2a1b2a]),.28,.75);
  addBox(mesh,1.8,.75,3.5,paint,0,.5,0);addBox(mesh,1.2,.45,1.35,material(0x08131d,.12,.85),0,.95,-.1);
  addBox(mesh,.5,.08,.06,new THREE.MeshBasicMaterial({color:0xff284f}),-.52,.55,1.78,false);addBox(mesh,.5,.08,.06,new THREE.MeshBasicMaterial({color:0xff284f}),.52,.55,1.78,false);
  scene.add(mesh);traffic.push({body,mesh});
}
function updateTraffic(dt,move){
  for(let i=traffic.length-1;i>=0;i--){
    const t=traffic[i];t.body.position.z+=move;
    t.mesh.position.set(t.body.position.x,t.body.position.y,t.body.position.z);
    t.mesh.quaternion.set(t.body.quaternion.x,t.body.quaternion.y,t.body.quaternion.z,t.body.quaternion.w);
    if(t.body.position.z>24){world.removeBody(t.body);scene.remove(t.mesh);traffic.splice(i,1);state.score+=200;state.nitro=clamp(state.nitro+5,0,100);}
  }
  state.spawn+=move;
  if(state.spawn>state.nextSpawn){spawnTraffic();state.nextSpawn=state.spawn+rand(100,155);}
}
function updateDriving(dt){
  const left=keys.has('ArrowLeft')||keys.has('KeyA'),right=keys.has('ArrowRight')||keys.has('KeyD');
  const accelerate=keys.has('ArrowUp')||keys.has('KeyW')||state.accelerate;
  const braking=keys.has('ArrowDown')||keys.has('KeyS')||state.brake;
  const nitro=(keys.has('Space')||keys.has('ShiftLeft')||keys.has('ShiftRight')||state.boost)&&state.nitro>0&&!braking;
  const steer=(right?1:0)-(left?1:0);
  const maxSteer=.42;const steering=steer*maxSteer;
  vehicle.setSteeringValue(steering,0);vehicle.setSteeringValue(steering,2);
  const speed=chassis.velocity.length();
  const force=accelerate||speed<3?(nitro?9200:6500):0;
  vehicle.applyEngineForce(force,1);vehicle.applyEngineForce(force,3);
  for(let i=0;i<4;i++)vehicle.setBrake(braking?240:0,i);
  if(nitro)state.nitro=clamp(state.nitro-dt*24,0,100);else state.nitro=clamp(state.nitro+dt*6,0,100);
  if(!accelerate&&!braking&&speed>1){vehicle.applyEngineForce(Math.min(900,speed*18),1);vehicle.applyEngineForce(Math.min(900,speed*18),3);}
  const drag=Math.min(18000,speed*speed*2.2);chassis.applyForce(new CANNON.Vec3(0,0,drag),chassis.position);
  world.step(1/60,dt,4);
  if(-chassis.velocity.z>88)chassis.velocity.z=-88;
  const forwardSpeed=Math.max(0,-chassis.velocity.z);
  state.distance+=forwardSpeed*dt;
  state.score+=Math.floor(forwardSpeed*dt*.6);
  // Keep the car within the playable carriageway without teleporting it.
  if(Math.abs(chassis.position.x)>8.3){chassis.applyForce(new CANNON.Vec3(-chassis.position.x*1100,0,0),chassis.position);}
  if(chassis.position.y<-.4||Math.abs(chassis.position.x)>13||forwardSpeed<0.1&&state.distance>10)endRun();
  const move=forwardSpeed*dt;
  roadSegments.forEach(g=>{g.position.z+=move;if(g.position.z>100)g.position.z-=600;});
  buildings.forEach(g=>{g.position.z+=move;if(g.position.z>55){g.position.z-=616;g.position.x=(g.position.x<0?-1:1)*rand(16,27);}});
  updateTraffic(dt,move);
  syncCar();
  const target=new THREE.Vector3(chassis.position.x*.45,3.8,chassis.position.z+10.5);
  camera.position.lerp(target,1-Math.exp(-dt*3.2));
  camera.lookAt(chassis.position.x*.35,1.05,chassis.position.z-8);
  const targetFov=nitro?70:62;camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-dt*3));camera.updateProjectionMatrix();
  if(performance.now()-lastHud>90){updateHud();lastHud=performance.now();}
}
function updateHud(){
  const kmh=Math.round(chassis?Math.max(0,-chassis.velocity.z)*3.6:0);
  ui.speed.textContent=String(kmh).padStart(3,'0');
  ui.distance.innerHTML=Math.floor(state.distance).toString().padStart(5,'0')+' <em>M</em>';
  ui.score.textContent='SCORE '+state.score.toString().padStart(6,'0');
  ui.nitro.style.width=state.nitro+'%';ui.nitroValue.textContent=Math.round(state.nitro)+'%';
}
const keys=new Set();
addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.code==='Escape'){if(state.mode==='playing')pauseRun();else if(state.mode==='paused')resumeRun();}
});
addEventListener('keyup',e=>keys.delete(e.code));
function bindHold(id,key){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();state[key]=true;el.setPointerCapture(e.pointerId);});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>el.addEventListener(ev,()=>state[key]=false));}
bindHold('brake-button','brake');bindHold('boost-button','boost');
let touchX=null;
rendererTouchSetup();
function rendererTouchSetup(){
  const canvas=$('canvas-container');
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')touchX=e.clientX;});
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&touchX!==null){const dx=e.clientX-touchX;if(Math.abs(dx)>24){if(dx>0)keys.add('ArrowRight');else keys.add('ArrowLeft');touchX=e.clientX;}}});
  ['pointerup','pointercancel'].forEach(ev=>canvas.addEventListener(ev,()=>{touchX=null;keys.delete('ArrowLeft');keys.delete('ArrowRight');}));
}
$('start-button').addEventListener('click',startRun);
$('garage-button').addEventListener('click',()=>{
  state.garage=(state.garage+1)%3;
  const finishes=[0x101a27,0x29102d,0x8c9aa8],names=['OBSIDIAN','VIOLET CHROME','ICE TITANIUM'];
  carRoot.traverse(o=>{if(o.isMesh&&o.material?.isMeshPhysicalMaterial&&o.material.clearcoat>0)o.material.color.setHex(finishes[state.garage]);});
  ui.garageNote.textContent=names[state.garage]+' // SELECTED';
});
$('pause-button').addEventListener('click',pauseRun);
$('resume-button').addEventListener('click',resumeRun);
$('quit-button').addEventListener('click',goMenu);
$('play-again-button').addEventListener('click',startRun);
$('menu-button').addEventListener('click',goMenu);
ui.quality.addEventListener('change',()=>applyQuality(ui.quality.value));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing')pauseRun();});
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);state.elapsed+=dt;
  if(state.mode==='playing')updateDriving(dt);
  else if(state.mode==='menu'){
    carRoot.position.y=Math.sin(state.elapsed*1.5)*.035;carRoot.rotation.y=Math.sin(state.elapsed*.28)*.045;
    camera.position.x=Math.sin(state.elapsed*.18)*.6;camera.lookAt(0,1,-8);
  }
  composer.render();
}
window.__NH_DEBUG__=()=>({mode:state.mode,position:{x:chassis.position.x,y:chassis.position.y,z:chassis.position.z},velocity:{x:chassis.velocity.x,y:chassis.velocity.y,z:chassis.velocity.z},wheels:vehicle.wheelInfos.map(w=>({contact:w.isInContact,suspension:w.suspensionForce,engine:w.engineForce}))});
function boot(){
  try{
    setupScene();
    let progress=0;const timer=setInterval(()=>{
      progress=Math.min(100,progress+rand(13,22));ui.loadProgress.style.width=progress+'%';
      ui.loadLabel.textContent=progress<60?'INITIALIZING WORLD':'PREPARING VEHICLE PHYSICS';
      if(progress>=100){clearInterval(timer);ui.loading.style.opacity='0';setTimeout(()=>ui.loading.remove(),500);state.mode='menu';animate();}
    },75);
  }catch(error){console.error(error);ui.loadLabel.textContent='GRAPHICS INITIALIZATION FAILED';}
}
boot();
