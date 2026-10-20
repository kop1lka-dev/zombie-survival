import * as THREE from 'three';

// ==========================================
// 1. БАЗОВАЯ СЦЕНА И СВЕТ
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2a2a);
scene.fog = new THREE.FogExp2(0x2a3f3a, 0.004);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xaabbcc, 1.1);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xbdd7ff, 0x4a6b3a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2cc, 1.4);
sun.position.set(80, 120, 40);
scene.add(sun);

// ==========================================
// 2. ГЕНЕРАЦИЯ МИРА
// ==========================================
function makeNoise(seed) {
  const p = new Uint8Array(512); let s = seed;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  return function(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const A = p[X] + Y, B = p[X + 1] + Y;
    return lerp(lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u), lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), v);
  };
}

const noise = makeNoise(1337);
function heightAt(x, z) {
  let h = 0, amp = 1, freq = 0.002, sum = 0;
  for (let o = 0; o < 5; o++) { h += noise(x * freq, z * freq) * amp; sum += amp; amp *= 0.5; freq *= 2; }
  return Math.pow(Math.abs(h / sum), 1.2) * 35; 
}
function swampAt(x, z) { return noise(x * 0.0015 + 100, z * 0.0015 + 100); }
function riverAt(x, z) { const curve = Math.sin(z * 0.015) * 30; return Math.abs(x - curve) < 20; }
const lakeCenter = { x: -150, z: 150 };
function lakeAt(x, z) { return Math.hypot(x - lakeCenter.x, z - lakeCenter.z) < 60; }
function islandAt(x, z) { return Math.hypot(x - lakeCenter.x, z - lakeCenter.z) < 25; }

const SIZE = 600; const SEG = 200;
const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
geo.rotateX(-Math.PI / 2);
const pos = geo.attributes.position;
const colors = [];

for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i);
  let h = heightAt(x, z);
  const isRiver = riverAt(x, z); const isLake = lakeAt(x, z); const isIsland = islandAt(x, z);

  if ((isRiver || isLake) && !isIsland) h = -8;
  pos.setY(i, h);

  const sw = swampAt(x, z);
  let col;
  if ((isRiver || isLake) && !isIsland) col = new THREE.Color(0x2a3a5a);
  else if (h > 25) col = new THREE.Color(0x888888);
  else if (h > 15) col = new THREE.Color(0x5a6b4a);
  else if (isIsland) col = new THREE.Color(0x4a6b3a);
  else if (sw > 0.35 && h < 3) col = new THREE.Color(0x3a4a38);
  else if (h < -3) col = new THREE.Color(0x2e4a30);
  else col = new THREE.Color(0x3a5a36);

  const v = (noise(x * 0.1, z * 0.1) + 1) * 0.5;
  col.offsetHSL(0, 0, (v - 0.5) * 0.08);
  colors.push(col.r, col.g, col.b);
}

geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
geo.computeVertexNormals();
const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
scene.add(new THREE.Mesh(geo, groundMat));

const waterGeo = new THREE.PlaneGeometry(SIZE, SIZE);
waterGeo.rotateX(-Math.PI / 2);
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a5a8a, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.3 });
const waterMesh = new THREE.Mesh(waterGeo, waterMat);
waterMesh.position.y = -2.5;
scene.add(waterMesh);

// ==========================================
// 3. АРОЧНЫЙ МОСТ
// ==========================================
const bridgeGroup = new THREE.Group();
const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x6b4c30 });
const railMat = new THREE.MeshStandardMaterial({ color: 0x4a3525 });
const bridgeZ = 0; const bridgeLength = 60; const bridgeHeight = 8; const bridgeY_base = 0;

for (let i = -bridgeLength/2; i <= bridgeLength/2; i += 1.5) {
  const progress = i / (bridgeLength / 2);
  const archY = bridgeY_base + (1 - progress * progress) * bridgeHeight;
  const plank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 12), bridgeMat);
  plank.position.set(i, archY, bridgeZ); plank.rotation.z = -progress * 0.4;
  bridgeGroup.add(plank);
  if (Math.round(i * 10) % 30 === 0) {
    const poleL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), railMat); poleL.position.set(i, archY + 1, bridgeZ - 6); bridgeGroup.add(poleL);
    const poleR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), railMat); poleR.position.set(i, archY + 1, bridgeZ + 6); bridgeGroup.add(poleR);
  }
}
const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222 }); const lightMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
for (let i = -24; i <= 24; i += 12) {
  const progress = i / (bridgeLength / 2); const archY = bridgeY_base + (1 - progress * progress) * bridgeHeight;
  const lampL = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), lightMat); lampL.position.set(i, archY + 3, bridgeZ - 6); bridgeGroup.add(lampL);
  const poleL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 8), lampMat); poleL.position.set(i, archY + 1.5, bridgeZ - 6); bridgeGroup.add(poleL);
  const lightPointL = new THREE.PointLight(0xffaa55, 2, 25, 2); lightPointL.position.copy(lampL.position); bridgeGroup.add(lightPointL);
  const lampR = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), lightMat); lampR.position.set(i, archY + 3, bridgeZ + 6); bridgeGroup.add(lampR);
  const poleR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 8), lampMat); poleR.position.set(i, archY + 1.5, bridgeZ + 6); bridgeGroup.add(poleR);
  const lightPointR = new THREE.PointLight(0xffaa55, 2, 25, 2); lightPointR.position.copy(lampR.position); bridgeGroup.add(lightPointR);
}
scene.add(bridgeGroup);

// ==========================================
// 4. РЕСУРСЫ
// ==========================================
const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 5, 6); trunkGeo.translate(0, 2.5, 0);
const crownGeo = new THREE.ConeGeometry(3, 7, 7); crownGeo.translate(0, 8, 0);
const treeData = [];
for (let i = 0; i < 1500; i++) {
  const x = (Math.random() - 0.5) * SIZE * 0.95; const z = (Math.random() - 0.5) * SIZE * 0.95;
  if (swampAt(x, z) > 0.35 || riverAt(x, z) || lakeAt(x, z) || islandAt(x, z)) continue;
  if (Math.abs(z) < 15 && Math.abs(x) < 45) continue;
  const h = heightAt(x, z); if (h < -2 || h > 22) continue;
  treeData.push({ x, y: h, z, hp: 4 });
}
const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a3f26 }), treeData.length);
const crownMesh = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x3a7a3a }), treeData.length);
const tempM = new THREE.Matrix4();
treeData.forEach((t, i) => {
  const s = 0.8 + Math.random() * 0.7; tempM.makeScale(s, s, s); tempM.setPosition(t.x, t.y, t.z);
  trunkMesh.setMatrixAt(i, tempM); crownMesh.setMatrixAt(i, tempM);
});
scene.add(trunkMesh, crownMesh);

const bushes = []; const bushGeo = new THREE.DodecahedronGeometry(0.8, 0); const bushMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
for (let i = 0; i < 250; i++) {
  const x = (Math.random() - 0.5) * SIZE * 0.9; const z = (Math.random() - 0.5) * SIZE * 0.9;
  if (swampAt(x, z) > 0.35 || riverAt(x, z) || lakeAt(x, z) || islandAt(x, z)) continue;
  if (Math.abs(z) < 15 && Math.abs(x) < 45) continue;
  const h = heightAt(x, z); if (h < -2 || h > 20) continue;
  const mesh = new THREE.Mesh(bushGeo, bushMat); mesh.scale.set(1, 0.5, 1); mesh.position.set(x, h, z); scene.add(mesh); bushes.push({ mesh, x, z, hp: 1 });
}
const rocks = []; const rockGeo = new THREE.DodecahedronGeometry(1, 0); const rockMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
for (let i = 0; i < 200; i++) {
  const x = (Math.random() - 0.5) * SIZE * 0.9; const z = (Math.random() - 0.5) * SIZE * 0.9;
  if (swampAt(x, z) > 0.35 || riverAt(x, z) || lakeAt(x, z) || islandAt(x, z)) continue;
  if (Math.abs(z) < 15 && Math.abs(x) < 45) continue;
  const h = heightAt(x, z); if (h < -2 || h > 25) continue;
  const mesh = new THREE.Mesh(rockGeo, rockMat); const s = 0.5 + Math.random() * 0.8; mesh.scale.set(s, s, s);
  mesh.position.set(x, h, z); mesh.rotation.set(Math.random(), Math.random(), Math.random()); scene.add(mesh); rocks.push({ mesh, x, z, hp: 3 });
}
const coalNodes = []; const coalGeo = new THREE.DodecahedronGeometry(1.2, 0); const coalMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
for (let i = 0; i < 80; i++) {
  const x = (Math.random() - 0.5) * SIZE * 0.9; const z = (Math.random() - 0.5) * SIZE * 0.9;
  if (swampAt(x, z) > 0.35 || riverAt(x, z) || lakeAt(x, z) || islandAt(x, z)) continue;
  if (Math.abs(z) < 15 && Math.abs(x) < 45) continue;
  const h = heightAt(x, z); if (h < -2) continue;
  const mesh = new THREE.Mesh(coalGeo, coalMat); const s = 0.6 + Math.random() * 0.5; mesh.scale.set(s, s, s);
  mesh.position.set(x, h, z); mesh.rotation.set(Math.random(), Math.random(), Math.random()); scene.add(mesh); coalNodes.push({ mesh, x, z, hp: 2 });
}
const grassCount = 10000; const bladeGeo = new THREE.PlaneGeometry(0.18, 1.4); bladeGeo.translate(0, 0.7, 0);
const grassMat = new THREE.MeshStandardMaterial({ color: 0x6aa84f, side: THREE.DoubleSide, transparent: true, alphaTest: 0.1 });
grassMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = { value: 0 }; grassMat.userData.shader = shader;
  shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n float sway = sin(uTime * 2.0 + position.x * 3.0 + position.z * 3.0) * 0.25;\n transformed.x += sway * position.y;`);
};
const grassMesh = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
for (let i = 0; i < grassCount; i++) {
  let x, z, h;
  do { x = (Math.random() - 0.5) * SIZE * 0.95; z = (Math.random() - 0.5) * SIZE * 0.95; h = heightAt(x, z); } while (swampAt(x, z) > 0.35 || riverAt(x, z) || lakeAt(x, z) || h < -2 || h > 18 || islandAt(x, z) || (Math.abs(z) < 15 && Math.abs(x) < 45));
  tempM.makeRotationY(Math.random() * Math.PI); tempM.setPosition(x, h, z); grassMesh.setMatrixAt(i, tempM);
}
scene.add(grassMesh);

// ==========================================
// 5. ХИЖИНЫ И ВЫШКА
// ==========================================
const colliders = [];
const huts = [];
const woodDark = new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 1 });
const woodLight = new THREE.MeshStandardMaterial({ color: 0x5a3f26, roughness: 1 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x1a100a, roughness: 1 });
const clothMat = new THREE.MeshStandardMaterial({ color: 0xaa3333, roughness: 1 });

let spawnedHuts = 0; let attempts = 0;
while (spawnedHuts < 4 && attempts < 100) {
  attempts++;
  const x = (Math.random() - 0.5) * SIZE * 0.8; const z = (Math.random() - 0.5) * SIZE * 0.8;
  const h = heightAt(x, z);
  if (riverAt(x, z) || lakeAt(x, z) || h < 0 || h > 20) continue;
  let tooClose = false;
  for (let hut of huts) { if (Math.hypot(hut.x - x, hut.z - z) < 120) { tooClose = true; break; } }
  if (tooClose) continue;

  const hutGroup = new THREE.Group(); hutGroup.position.set(x, h, z);
  const wallW = 14, wallH = 5, wallD = 14;

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(wallW + 1, 0.5, wallD + 1), new THREE.MeshStandardMaterial({ color: 0x555555 })); foundation.position.y = 0.25; hutGroup.add(foundation);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(wallW - 0.5, 0.2, wallD - 0.5), woodLight); floor.position.y = 0.5; hutGroup.add(floor);

  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, 0.5), woodDark); wallBack.position.set(0, wallH / 2 + 0.5, -wallD / 2); hutGroup.add(wallBack); colliders.push({ x, z: z - wallD / 2, w: wallW, d: 0.5, active: true });
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallH, wallD), woodDark); wallLeft.position.set(-wallW / 2, wallH / 2 + 0.5, 0); hutGroup.add(wallLeft); colliders.push({ x: x - wallW / 2, z, w: 0.5, d: wallD, active: true });
  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallH, wallD), woodDark); wallRight.position.set(wallW / 2, wallH / 2 + 0.5, 0); hutGroup.add(wallRight); colliders.push({ x: x + wallW / 2, z, w: 0.5, d: wallD, active: true });

  const doorWidth = 4; const sideWallWidth = (wallW - doorWidth) / 2;
  const wallFrontL = new THREE.Mesh(new THREE.BoxGeometry(sideWallWidth, wallH, 0.5), woodDark); wallFrontL.position.set(-(doorWidth/2 + sideWallWidth/2), wallH / 2 + 0.5, wallD / 2); hutGroup.add(wallFrontL); colliders.push({ x: x - (doorWidth/2 + sideWallWidth/2), z: z + wallD / 2, w: sideWallWidth, d: 0.5, active: true });
  const wallFrontR = new THREE.Mesh(new THREE.BoxGeometry(sideWallWidth, wallH, 0.5), woodDark); wallFrontR.position.set(doorWidth/2 + sideWallWidth/2, wallH / 2 + 0.5, wallD / 2); hutGroup.add(wallFrontR); colliders.push({ x: x + (doorWidth/2 + sideWallWidth/2), z: z + wallD / 2, w: sideWallWidth, d: 0.5, active: true });
  const wallFrontTop = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, 1, 0.5), woodDark); wallFrontTop.position.set(0, wallH - 0.5 + 0.5, wallD / 2); hutGroup.add(wallFrontTop);

  const doorGeo = new THREE.BoxGeometry(doorWidth - 0.1, wallH - 1, 0.3); doorGeo.translate((doorWidth - 0.1) / 2, (wallH - 1) / 2, 0);
  const doorMesh = new THREE.Mesh(doorGeo, woodLight); doorMesh.position.set(-(doorWidth - 0.1) / 2, 0.5, wallD / 2); hutGroup.add(doorMesh);
  const doorCollider = { x, z: z + wallD / 2, w: doorWidth, d: 0.5, active: true }; colliders.push(doorCollider);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(11, 3, 4), roofMat); roof.position.y = wallH + 2; roof.rotation.y = Math.PI / 4; hutGroup.add(roof);
  const light = new THREE.PointLight(0xffaa55, 1.5, 20, 2); light.position.set(0, wallH - 1, 0); hutGroup.add(light);

  const tableGroup = new THREE.Group(); tableGroup.position.set(-4.5, 0.5, 0);
  const tTop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 2), woodLight); tTop.position.y = 1.2; tableGroup.add(tTop);
  for(let tx of [-1.4, 1.4]) for(let tz of [-0.9, 0.9]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), woodDark); leg.position.set(tx, 0.6, tz); tableGroup.add(leg); }
  hutGroup.add(tableGroup);

  const bedGroup = new THREE.Group(); bedGroup.position.set(4.5, 0.5, -4.5);
  const bFrame = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 4), woodDark); bFrame.position.y = 0.3; bedGroup.add(bFrame);
  const bMattress = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 3.8), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); bMattress.position.y = 0.6; bedGroup.add(bMattress);
  const bPillow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 1), clothMat); bPillow.position.set(0, 0.9, -1.2); bedGroup.add(bPillow);
  hutGroup.add(bedGroup);

  const chestGroup = new THREE.Group(); chestGroup.position.set(-4.5, 0.5, -5); chestGroup.rotation.y = Math.PI / 4;
  const chestWood = new THREE.MeshStandardMaterial({ color: 0x6b4226 }); const chestMetal = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 });
  const cBase = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 1.5), chestWood); cBase.position.y = 0.75; chestGroup.add(cBase);
  const cLid = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.5, 1.6), chestWood); cLid.position.y = 1.75; chestGroup.add(cLid);
  const cLock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.1), chestMetal); cLock.position.set(0, 1.25, 0.8); chestGroup.add(cLock);
  hutGroup.add(chestGroup);
  
  scene.add(hutGroup);
  huts.push({ group: hutGroup, door: doorMesh, chest: chestGroup, lid: cLid, doorOpen: false, looted: false, x, z, doorCollider });
  spawnedHuts++;
}

// Вышка на острове
const towerGroup = new THREE.Group();
towerGroup.position.set(lakeCenter.x, heightAt(lakeCenter.x, lakeCenter.z), lakeCenter.z);
const towerBase = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 8), woodDark); towerBase.position.y = 6; towerGroup.add(towerBase);
const towerPlatform = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 12), woodDark); towerPlatform.position.y = 12; towerGroup.add(towerPlatform);
const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(9, 4, 4), roofMat); towerRoof.position.y = 14; towerRoof.rotation.y = Math.PI / 4; towerGroup.add(towerRoof);
const ladderMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
for (let y = 1; y < 12; y += 1) { const rung = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.1), ladderMat); rung.position.set(-4.1, y, 0); towerGroup.add(rung); }
colliders.push({ x: lakeCenter.x, z: lakeCenter.z, w: 8, d: 8, active: true, isTower: true });
scene.add(towerGroup);

// ==========================================
// 6. ИГРОК И РУКИ
// ==========================================
const player = { x: 0, z: 0, y: 0, yaw: 0, pitch: 0, speed: 8, vy: 0, isGrounded: true, hp: 100, isClimbing: false, armor: 0, air: 100, inWater: false };
camera.position.set(0, heightAt(0, 0) + 2.2, 0);
const hpBarFill = document.querySelector('#hpBar > i');

const statsDiv = document.getElementById('stats');
const airBarDiv = document.createElement('div');
airBarDiv.className = 'stat-bar'; airBarDiv.id = 'airBar'; airBarDiv.style.marginTop = '10px'; airBarDiv.style.display = 'none';
airBarDiv.innerHTML = '<i style="background:#4fd1ff; width:100%"></i><div class="stat-label">Воздух</div>';
statsDiv.appendChild(airBarDiv);
const airBarFill = document.querySelector('#airBar > i');

const viewmodel = new THREE.Group(); camera.add(viewmodel); scene.add(camera);
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc99b6e, roughness: 0.9 }); const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 1 });
function makeArm(side) {
  const g = new THREE.Group();
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.45, 10), sleeveMat); forearm.rotation.x = Math.PI / 2; forearm.position.set(0, 0, -0.22); g.add(forearm);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), skinMat); hand.scale.set(1, 1, 1.25); hand.position.set(0, 0, -0.48); g.add(hand);
  return g;
}
const rightArm = makeArm(1); rightArm.position.set(0.28, -0.26, -0.05); rightArm.rotation.set(-0.15, -0.15, 0); viewmodel.add(rightArm);
const leftArm = makeArm(-1); leftArm.position.set(-0.30, -0.30, 0.05); leftArm.rotation.set(-0.25, 0.2, 0); viewmodel.add(leftArm);

const itemModels = new THREE.Group(); rightArm.add(itemModels);
const flashlightGroup = new THREE.Group(); itemModels.add(flashlightGroup);
const flashBody = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 })); flashBody.rotation.x = Math.PI / 2; flashBody.position.set(0, 0, -0.48); flashlightGroup.add(flashBody);
const lensMat = new THREE.MeshBasicMaterial({ color: 0x333322 }); const lens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), lensMat); lens.position.set(0, 0, -0.59); flashlightGroup.add(lens);
const flashlight = new THREE.SpotLight(0xfff1c9, 0, 40, Math.PI / 5, 0.5, 1.2); flashlight.position.set(0, 0, -0.59); flashlight.target.position.set(0, 0, -5); flashlightGroup.add(flashlight); flashlightGroup.add(flashlight.target);

const axeGroup = new THREE.Group(); itemModels.add(axeGroup);
const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x5a3f26 })); axeHandle.rotation.x = Math.PI / 2; axeHandle.position.set(0, 0, -0.4); axeGroup.add(axeHandle);
const axeHead = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.7 })); axeHead.position.set(0, 0.05, -0.65); axeGroup.add(axeHead);

const pickaxeGroup = new THREE.Group(); itemModels.add(pickaxeGroup);
const pickHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x5a3f26 })); pickHandle.rotation.x = Math.PI / 2; pickHandle.position.set(0, 0, -0.4); pickaxeGroup.add(pickHandle);
const pickHead = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 })); pickHead.rotation.z = Math.PI / 2; pickHead.position.set(0, 0, -0.65); pickaxeGroup.add(pickHead);

const swordGroup = new THREE.Group(); itemModels.add(swordGroup);
const swordHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6), new THREE.MeshStandardMaterial({ color: 0x3a2515 })); swordHandle.rotation.x = Math.PI / 2; swordHandle.position.set(0, 0, -0.35); swordGroup.add(swordHandle);
const swordGuard = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0xaaaaaa })); swordGuard.position.set(0, 0, -0.43); swordGroup.add(swordGuard);
const swordBlade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.6), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 })); swordBlade.position.set(0, 0, -0.73); swordGroup.add(swordBlade);

const gunGroup = new THREE.Group(); itemModels.add(gunGroup);
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 })); gunBody.rotation.x = Math.PI / 2; gunBody.position.set(0, 0.05, -0.35); gunGroup.add(gunBody);
const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8 })); gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.set(0, 0.05, -0.7); gunGroup.add(gunBarrel);
const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0x5a3f26 })); gunStock.position.set(0, 0.05, -0.15); gunGroup.add(gunStock);

// ==========================================
// 7. ВРЕМЯ И БАЗА ДАННЫХ
// ==========================================
const SECONDS_PER_GAME_HOUR = 10; const DAY_LENGTH = SECONDS_PER_GAME_HOUR * 24; let timeOfDay = 12 * SECONDS_PER_GAME_HOUR;
function getTimeInfo() { const totalHours = (timeOfDay / SECONDS_PER_GAME_HOUR) % 24; const hours = Math.floor(totalHours); const minutes = Math.floor((totalHours - hours) * 60); return { hours, minutes }; }
function dayFactor(hours) { const rad = (hours - 12) / 12 * Math.PI; const c = Math.cos(rad); return Math.max(0, Math.min(1, (c + 0.35) / 1.35)); }
const flashState = { on: false, battery: 100, drainPerSec: 3.5 };

const ITEMS_DB = {
  'Фонарик': { icon: '🔦', desc: 'Светит в темноте. Тратит заряд.' },
  'Топор': { icon: '🪓', desc: 'Рубит деревья. Наносит 25 урона.' },
  'Кирка': { icon: '⛏️', desc: 'Добывает камни и уголь. 15 урона.' },
  'Меч': { icon: '🗡️', desc: 'Острые ощущения. Наносит 50 урона.' },
  'Ружьё': { icon: '🔫', desc: 'Громкая смерть. Наносит 100 урона.' },
  'Дерево': { icon: '🪵', desc: 'Основной строительный материал.' },
  'Камень': { icon: '🪨', desc: 'Нужен для инструментов и костра.' },
  'Железо': { icon: '⚙️', desc: 'Металлические детали для оружия.' },
  'Ткань': { icon: '🧵', desc: 'Используется для бинтов и одежды.' },
  'Волокно': { icon: '🌿', desc: 'Растительное волокно.' },
  'Консервы': { icon: '🥫', desc: 'Восстанавливает здоровье.' },
  'Вода': { icon: '💧', desc: 'Утоляет жажду.' },
  'Ягоды': { icon: '🫐', desc: 'Немного еды.' },
  'Порох': { icon: '💥', desc: 'Для создания патронов.' },
  'Бинт': { icon: '🩹', desc: 'Останавливает кровотечение.' },
  'Патроны': { icon: '🧨', desc: 'Нужны для стрельбы.' },
  'Уголь': { icon: '🪨', desc: 'Черный, как ночь. Топливо для печи.' },
  'Кожа': { icon: '🟫', desc: 'Материал для крафта одежды.' },
  'Мясо': { icon: '🥩', desc: 'Сырое мясо. Можно съесть.' },
  'Кожаная куртка': { icon: '🧥', desc: 'Дает +5 брони.' },
  'Кожаные штаны': { icon: '👖', desc: 'Дает +5 брони.' },
  'Печь': { icon: '🏭', desc: 'Ставится на землю. Плавит руду.' },
  'Верстак': { icon: '🛠️', desc: 'Ставится на землю. Улучшает оружие.' }
};

const RECIPES = [
  { id: 'axe', name: 'Топор', cost: { 'Дерево': 3, 'Камень': 2 } },
  { id: 'pickaxe', name: 'Кирка', cost: { 'Дерево': 3, 'Камень': 4 } },
  { id: 'sword', name: 'Меч', cost: { 'Дерево': 1, 'Камень': 2, 'Железо': 2 } },
  { id: 'gun', name: 'Ружьё', cost: { 'Дерево': 2, 'Железо': 5, 'Ткань': 2 } },
  { id: 'ammo', name: 'Патроны', cost: { 'Порох': 1, 'Железо': 1 } },
  { id: 'bandage', name: 'Бинт', cost: { 'Ткань': 2 } },
  { id: 'jacket', name: 'Кожаная куртка', cost: { 'Кожа': 5, 'Ткань': 2 } },
  { id: 'pants', name: 'Кожаные штаны', cost: { 'Кожа': 4, 'Ткань': 2 } },
  { id: 'workbench', name: 'Верстак', cost: { 'Дерево': 10, 'Камень': 5, 'Железо': 2 } },
  { id: 'furnace', name: 'Печь', cost: { 'Камень': 20 } }
];

// ==========================================
// 8. UI: ИНВЕНТАРЬ, КРАФТ, СУНДУК
// ==========================================
let allSlots = new Array(32).fill(null);
let currentChestSlots = new Array(27).fill(null);
let selectedSlot = 0;

const hotbarWrap = document.getElementById('hotbarWrap');
const invGrid = document.getElementById('invGrid');
const invOverlay = document.getElementById('invOverlay');
const invCloseBtn = document.getElementById('invClose');
const craftOverlay = document.getElementById('craftOverlay');
const craftCloseBtn = document.getElementById('craftClose');
const recipesList = document.getElementById('recipesList');
let invOpen = false, craftOpen = false, mapOpen = false;

const style = document.createElement('style');
style.innerHTML = `
  .tooltip { position: fixed; background: rgba(10, 15, 12, 0.95); border: 2px solid #555; padding: 8px 12px; border-radius: 6px; pointer-events: none; z-index: 9999; color: #fff; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.8); display: none; flex-direction: column; gap: 4px; max-width: 250px; }
  .tooltip-name { font-weight: bold; color: #9fe08f; font-size: 14px; margin-bottom: 2px; }
  .tooltip-desc { color: #ccc; font-style: italic; }
  .tooltip-craft { color: #ffd166; margin-top: 4px; border-top: 1px solid #333; padding-top: 4px; }
  
  #chestOverlay, #benchOverlay, #furnaceOverlay { position: fixed; inset: 0; background: rgba(6, 10, 8, 0.85); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 130; }
  #chestOverlay.open, #benchOverlay.open, #furnaceOverlay.open { display: flex; }
  #chestPanel, #benchPanel, #furnacePanel { background: linear-gradient(160deg, rgba(24, 34, 28, 0.98), rgba(14, 20, 16, 0.98)); border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 24px; box-shadow: 0 30px 80px rgba(0,0,0,0.8); display: flex; flex-direction: column; gap: 20px; position: relative; }
  .chest-split { display: flex; gap: 24px; }
  .chest-col { display: flex; flex-direction: column; gap: 10px; }
  .chest-col h3 { margin: 0; font-size: 12px; letter-spacing: 1.5px; color: rgba(200,220,200,0.6); text-transform: uppercase; }
  .chest-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 6px; }
  .chest-cell { width: 44px; height: 44px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 22px; position: relative; cursor: grab; transition: 0.15s; }
  .chest-cell:hover { background: rgba(255,255,255,0.1); }
  .chest-cell:active { cursor: grabbing; }
  .chest-cell:hover { border-color: rgba(255, 255, 255, 0.3); }
  .chest-cell.dragover { background: rgba(159,224,143,0.3); border-color: #9fe08f; }
  .chest-cell .ct { position: absolute; bottom: 1px; right: 3px; font-size: 10px; font-weight: bold; text-shadow: 0 1px 2px #000; }
`;
document.head.appendChild(style);

const chestOverlay = document.createElement('div'); chestOverlay.id = 'chestOverlay';
chestOverlay.innerHTML = `<div id="chestPanel"><button class="closeBtn" id="chestClose" style="position:absolute; top:16px; right:16px;">✕</button><h2 style="margin:0 0 10px; font-size:16px; letter-spacing:3px; text-transform:uppercase; color:#cfe5cf;">Сундук</h2><div class="chest-split"><div class="chest-col"><h3>Содержимое</h3><div class="chest-grid" id="chestGridLeft"></div></div><div class="chest-col"><h3>Инвентарь</h3><div class="chest-grid" id="chestGridRight"></div></div></div></div>`;
document.body.appendChild(chestOverlay);

const benchOverlay = document.createElement('div'); benchOverlay.id = 'benchOverlay';
benchOverlay.innerHTML = `<div id="benchPanel"><button class="closeBtn" id="benchClose" style="position:absolute; top:16px; right:16px;">✕</button><h2 style="margin:0 0 10px; font-size:16px; letter-spacing:3px; text-transform:uppercase; color:#cfe5cf;">Улучшение оружия</h2><div id="benchList" style="display:flex; flex-direction:column; gap:10px;"></div></div>`;
document.body.appendChild(benchOverlay);

const furnaceOverlay = document.createElement('div'); furnaceOverlay.id = 'furnaceOverlay';
furnaceOverlay.innerHTML = `<div id="furnacePanel"><button class="closeBtn" id="furnaceClose" style="position:absolute; top:16px; right:16px;">✕</button><h2 style="margin:0 0 10px; font-size:16px; letter-spacing:3px; text-transform:uppercase; color:#cfe5cf;">Печь</h2><div id="furnaceList" style="display:flex; flex-direction:column; gap:10px;"></div></div>`;
document.body.appendChild(furnaceOverlay);

const chestGridLeft = document.getElementById('chestGridLeft');
const chestGridRight = document.getElementById('chestGridRight');
const benchList = document.getElementById('benchList');
const furnaceList = document.getElementById('furnaceList');
const tooltip = document.createElement('div'); tooltip.className = 'tooltip'; document.body.appendChild(tooltip);

function showTooltip(e, item) {
  if (!item) return;
  const db = ITEMS_DB[item.name] || { desc: 'Нет описания' };
  let craftInfo = '';
  const crafts = RECIPES.filter(r => Object.keys(r.cost).includes(item.name));
  if (crafts.length > 0) craftInfo = `<div class="tooltip-craft">Нужно для:<br>${crafts.map(c => c.name).join(', ')}</div>`;
  tooltip.innerHTML = `<div class="tooltip-name">${item.icon} ${item.name}</div><div class="tooltip-desc">${db.desc}</div>${craftInfo}`;
  tooltip.style.display = 'flex'; tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px';
}
function hideTooltip() { tooltip.style.display = 'none'; }

function renderHotbarHUD() {
  hotbarWrap.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div'); el.className = 'slot' + (i === selectedSlot ? ' selected' : '');
    const hk = document.createElement('span'); hk.className = 'hotkey'; hk.textContent = i + 1; el.appendChild(hk);
    const it = allSlots[i];
    if (it) {
      const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = it.icon; icon.style.pointerEvents = 'none'; el.appendChild(icon);
      if (it.count > 1) { const cnt = document.createElement('span'); cnt.className = 'count'; cnt.textContent = it.count; el.appendChild(cnt); }
      if (it.name === 'Фонарик') { const bar = document.createElement('span'); bar.className = 'bar'; bar.innerHTML = '<i style="width:100%"></i>'; el.appendChild(bar); }
      el.addEventListener('mouseenter', (e) => showTooltip(e, it));
      el.addEventListener('mousemove', (e) => { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; });
      el.addEventListener('mouseleave', hideTooltip);
    }
    el.addEventListener('click', () => selectSlot(i));
    hotbarWrap.appendChild(el);
  }
}
function selectSlot(i) { selectedSlot = i; renderHotbarHUD(); updateHandsVisibility(); }

function renderInvMenu() {
  invGrid.innerHTML = '';
  for (let i = 0; i < 32; i++) {
    const cell = document.createElement('div'); cell.className = 'cell' + (i < 6 ? ' hotbar-slot' : '');
    const it = allSlots[i];
    const num = document.createElement('div'); num.className = 'slot-num'; num.textContent = i < 6 ? i + 1 : ''; cell.appendChild(num);
    if (it) {
      cell.draggable = true; cell.innerHTML += `<div class="ic">${it.icon}</div>` + (it.count > 1 ? `<div class="ct">${it.count}</div>` : '');
      cell.addEventListener('mouseenter', (e) => showTooltip(e, it));
      cell.addEventListener('mousemove', (e) => { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; });
      cell.addEventListener('mouseleave', hideTooltip);
      cell.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'inv', index: i })));
    } else cell.classList.add('empty');
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('dragover'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault(); cell.classList.remove('dragover');
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.source === 'inv') { const temp = allSlots[i]; allSlots[i] = allSlots[data.index]; allSlots[data.index] = temp; renderInvMenu(); renderHotbarHUD(); updateHandsVisibility(); }
      else if (data.source === 'chest') { const item = currentChestSlots[data.index]; if (item) { currentChestSlots[data.index] = allSlots[i]; allSlots[i] = item; renderInvMenu(); renderHotbarHUD(); renderChestMenu(); updateHandsVisibility(); } }
    });
    invGrid.appendChild(cell);
  }
}

function renderChestMenu() {
  chestGridLeft.innerHTML = ''; chestGridRight.innerHTML = '';

  // --- ЛЕВАЯ КОЛОНКА (СУНДУК) ---
  for (let i = 0; i < 27; i++) {
    const cell = document.createElement('div'); cell.className = 'chest-cell'; const it = currentChestSlots[i];
    if (it) {
      cell.draggable = true; cell.innerHTML = `<div>${it.icon}</div>` + (it.count > 1 ? `<div class="ct">${it.count}</div>` : '');
      
      cell.addEventListener('mouseenter', (e) => showTooltip(e, it));
      cell.addEventListener('mousemove', (e) => { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; });
      cell.addEventListener('mouseleave', hideTooltip);
      cell.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'chest', index: i })));
      
      // БЫСТРЫЙ ПЕРЕНОС (Shift + Клик)
      cell.addEventListener('click', (e) => {
        if (e.shiftKey) {
          // Ищем пустой слот в инвентаре
          let emptyIdx = allSlots.findIndex(s => s === null);
          // Или слот с таким же предметом
          let sameIdx = allSlots.findIndex(s => s && s.name === it.name);

          if (sameIdx !== -1) {
            allSlots[sameIdx].count += it.count;
            currentChestSlots[i] = null;
          } else if (emptyIdx !== -1) {
            allSlots[emptyIdx] = { ...it };
            currentChestSlots[i] = null;
          }
          renderChestMenu(); renderHotbarHUD(); renderInvMenu(); updateHandsVisibility();
        }
      });
    }
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('dragover'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault(); cell.classList.remove('dragover');
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.source === 'chest') { const temp = currentChestSlots[i]; currentChestSlots[i] = currentChestSlots[data.index]; currentChestSlots[data.index] = temp; renderChestMenu(); }
      else if (data.source === 'inv') { const item = allSlots[data.index]; if (item) { allSlots[data.index] = currentChestSlots[i]; currentChestSlots[i] = item; renderInvMenu(); renderHotbarHUD(); renderChestMenu(); updateHandsVisibility(); } }
    });
    chestGridLeft.appendChild(cell);
  }

  // --- ПРАВАЯ КОЛОНКА (ИНВЕНТАРЬ) ---
  for (let i = 0; i < 27; i++) {
    const cell = document.createElement('div'); cell.className = 'chest-cell'; const it = allSlots[i];
    if (it) {
      cell.draggable = true; cell.innerHTML = `<div>${it.icon}</div>` + (it.count > 1 ? `<div class="ct">${it.count}</div>` : '');
      
      cell.addEventListener('mouseenter', (e) => showTooltip(e, it));
      cell.addEventListener('mousemove', (e) => { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; });
      cell.addEventListener('mouseleave', hideTooltip);
      cell.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'inv', index: i })));
      
      // БЫСТРЫЙ ПЕРЕНОС В СУНДУК (Shift + Клик)
      cell.addEventListener('click', (e) => {
        if (e.shiftKey) {
          let emptyIdx = currentChestSlots.findIndex(s => s === null);
          let sameIdx = currentChestSlots.findIndex(s => s && s.name === it.name);

          if (sameIdx !== -1) {
            currentChestSlots[sameIdx].count += it.count;
            allSlots[i] = null;
          } else if (emptyIdx !== -1) {
            currentChestSlots[emptyIdx] = { ...it };
            allSlots[i] = null;
          }
          renderChestMenu(); renderHotbarHUD(); renderInvMenu(); updateHandsVisibility();
        }
      });
    }
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('dragover'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault(); cell.classList.remove('dragover');
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.source === 'inv') { const temp = allSlots[i]; allSlots[i] = allSlots[data.index]; allSlots[data.index] = temp; renderChestMenu(); renderHotbarHUD(); updateHandsVisibility(); }
      else if (data.source === 'chest') { const item = currentChestSlots[data.index]; if (item) { currentChestSlots[data.index] = allSlots[i]; allSlots[i] = item; renderInvMenu(); renderHotbarHUD(); renderChestMenu(); updateHandsVisibility(); } }
    });
    chestGridRight.appendChild(cell);
  }
}

function renderCraftMenu() {
  recipesList.innerHTML = '';
  RECIPES.forEach(recipe => {
    let canCraft = true; let costHtml = '';
    for (const [mat, count] of Object.entries(recipe.cost)) {
      let has = 0; allSlots.forEach(s => { if (s && s.name === mat) has += s.count; });
      const ok = has >= count; if (!ok) canCraft = false;
      costHtml += `<span class="${ok ? 'ok' : 'no'}">${mat}: ${has}/${count}</span>`;
    }
    const div = document.createElement('div'); div.className = 'recipe';
    div.innerHTML = `<div class="recipe-info"><div class="recipe-title"><span>${ITEMS_DB[recipe.name]?.icon || '❓'}</span> ${recipe.name}</div><div class="recipe-cost">${costHtml}</div></div><button class="craft-btn" ${canCraft ? '' : 'disabled'} data-id="${recipe.id}">Создать</button>`;
    recipesList.appendChild(div);
  });
  document.querySelectorAll('.craft-btn').forEach(btn => btn.addEventListener('click', (e) => craftItem(e.target.getAttribute('data-id'))));
}

function craftItem(id) {
  const recipe = RECIPES.find(r => r.id === id); if (!recipe) return;
  for (const [mat, count] of Object.entries(recipe.cost)) { let has = 0; allSlots.forEach(s => { if (s && s.name === mat) has += s.count; }); if (has < count) return; }
  for (const [mat, count] of Object.entries(recipe.cost)) {
    let toRemove = count;
    for (let i = 0; i < allSlots.length && toRemove > 0; i++) {
      const s = allSlots[i];
      if (s && s.name === mat) { const take = Math.min(s.count, toRemove); s.count -= take; toRemove -= take; if (s.count <= 0) allSlots[i] = null; }
    }
  }
  addItemToInv(recipe.name, ITEMS_DB[recipe.name].icon, 1); renderCraftMenu();
}

function openInv() { invOpen = true; document.exitPointerLock?.(); invOverlay.classList.add('open'); renderInvMenu(); }
function closeInv() { invOpen = false; invOverlay.classList.remove('open'); renderHotbarHUD(); updateHandsVisibility(); }
invCloseBtn.addEventListener('click', closeInv);
invOverlay.addEventListener('click', (e) => { if (e.target === invOverlay) closeInv(); });

function openCraft() { craftOpen = true; document.exitPointerLock?.(); craftOverlay.classList.add('open'); renderCraftMenu(); }
function closeCraft() { craftOpen = false; craftOverlay.classList.remove('open'); renderHotbarHUD(); updateHandsVisibility(); }
craftCloseBtn.addEventListener('click', closeCraft);
craftOverlay.addEventListener('click', (e) => { if (e.target === craftOverlay) closeCraft(); });

function openChest(hut) {
  document.exitPointerLock?.(); chestOverlay.classList.add('open');
  if (!hut.looted) {
    hut.looted = true; hut.lid.rotation.x = -Math.PI / 2; hut.lid.position.y = 1.75; hut.lid.position.z = -0.5;
    const lootCategories = [
      [{ name: 'Консервы', min: 1, max: 3 }, { name: 'Вода', min: 1, max: 3 }, { name: 'Мясо', min: 1, max: 2 }],
      [{ name: 'Железо', min: 2, max: 5 }, { name: 'Уголь', min: 2, max: 4 }, { name: 'Порох', min: 1, max: 3 }],
      [{ name: 'Кожа', min: 2, max: 5 }, { name: 'Ткань', min: 2, max: 4 }]
    ];
    for (let i = 0; i < 27; i++) currentChestSlots[i] = null;
    let itemsAdded = 0;
    while (itemsAdded < 5) {
      const cat = lootCategories[Math.floor(Math.random() * lootCategories.length)];
      const drop = cat[Math.floor(Math.random() * cat.length)];
      const amount = Math.floor(Math.random() * (drop.max - drop.min + 1)) + drop.min;
      const emptyIdx = currentChestSlots.findIndex(s => s === null);
      if (emptyIdx !== -1) { currentChestSlots[emptyIdx] = { name: drop.name, icon: ITEMS_DB[drop.name].icon, count: amount }; itemsAdded++; } else break;
    }
  }
  renderChestMenu();
}
function closeChest() { chestOverlay.classList.remove('open'); renderHotbarHUD(); updateHandsVisibility(); }
document.getElementById('chestClose').addEventListener('click', closeChest);
chestOverlay.addEventListener('click', (e) => { if (e.target === chestOverlay) closeChest(); });

function renderBenchMenu() {
  benchList.innerHTML = '';
  const upgrades = [{ name: 'Улучшить меч', cost: { 'Меч': 1, 'Железо': 5, 'Камень': 5 }, result: 'Улучшенный меч' }];
  upgrades.forEach(recipe => {
    let canCraft = true; let costHtml = '';
    for (const [mat, count] of Object.entries(recipe.cost)) {
      let has = 0; allSlots.forEach(s => { if (s && s.name === mat) has += s.count; });
      const ok = has >= count; if (!ok) canCraft = false;
      costHtml += `<span class="${ok ? 'ok' : 'no'}">${mat}: ${has}/${count}</span>`;
    }
    const div = document.createElement('div'); div.className = 'recipe';
    div.innerHTML = `<div class="recipe-info"><div class="recipe-title">${recipe.name}</div><div class="recipe-cost">${costHtml}</div></div><button class="craft-btn" ${canCraft ? '' : 'disabled'}>Улучшить</button>`;
    div.querySelector('button').addEventListener('click', () => {
      if (!canCraft) return;
      for (const [mat, count] of Object.entries(recipe.cost)) {
        let toRemove = count;
        for (let i = 0; i < allSlots.length && toRemove > 0; i++) {
          const s = allSlots[i];
          if (s && s.name === mat) { const take = Math.min(s.count, toRemove); s.count -= take; toRemove -= take; if (s.count <= 0) allSlots[i] = null; }
        }
      }
      addItemToInv(recipe.result, ITEMS_DB[recipe.result]?.icon || '❓', 1); renderBenchMenu(); renderHotbarHUD();
    });
    benchList.appendChild(div);
  });
}
function openBench() { document.exitPointerLock?.(); benchOverlay.classList.add('open'); renderBenchMenu(); }
function closeBench() { benchOverlay.classList.remove('open'); renderHotbarHUD(); updateHandsVisibility(); }
document.getElementById('benchClose').addEventListener('click', closeBench);
benchOverlay.addEventListener('click', (e) => { if (e.target === benchOverlay) closeBench(); });

function renderFurnaceMenu() {
  furnaceList.innerHTML = '';
  const smelts = [{ name: 'Переплавить дерево в уголь', cost: { 'Дерево': 3 }, result: 'Уголь' }];
  smelts.forEach(recipe => {
    let canCraft = true; let costHtml = '';
    for (const [mat, count] of Object.entries(recipe.cost)) {
      let has = 0; allSlots.forEach(s => { if (s && s.name === mat) has += s.count; });
      const ok = has >= count; if (!ok) canCraft = false;
      costHtml += `<span class="${ok ? 'ok' : 'no'}">${mat}: ${has}/${count}</span>`;
    }
    const div = document.createElement('div'); div.className = 'recipe';
    div.innerHTML = `<div class="recipe-info"><div class="recipe-title">${recipe.name}</div><div class="recipe-cost">${costHtml}</div></div><button class="craft-btn" ${canCraft ? '' : 'disabled'}>Создать</button>`;
    div.querySelector('button').addEventListener('click', () => {
      if (!canCraft) return;
      for (const [mat, count] of Object.entries(recipe.cost)) {
        let toRemove = count;
        for (let i = 0; i < allSlots.length && toRemove > 0; i++) {
          const s = allSlots[i];
          if (s && s.name === mat) { const take = Math.min(s.count, toRemove); s.count -= take; toRemove -= take; if (s.count <= 0) allSlots[i] = null; }
        }
      }
      addItemToInv(recipe.result, ITEMS_DB[recipe.result]?.icon || '❓', 1); renderFurnaceMenu(); renderHotbarHUD();
    });
    furnaceList.appendChild(div);
  });
}
function openFurnace() { document.exitPointerLock?.(); furnaceOverlay.classList.add('open'); renderFurnaceMenu(); }
function closeFurnace() { furnaceOverlay.classList.remove('open'); renderHotbarHUD(); updateHandsVisibility(); }
document.getElementById('furnaceClose').addEventListener('click', closeFurnace);
furnaceOverlay.addEventListener('click', (e) => { if (e.target === furnaceOverlay) closeFurnace(); });

function updateHandsVisibility() {
  const sel = allSlots[selectedSlot];
  viewmodel.visible = false; flashlightGroup.visible = false; axeGroup.visible = false; pickaxeGroup.visible = false; swordGroup.visible = false; gunGroup.visible = false; flashState.on = false;
  if (!sel) return;
  viewmodel.visible = true;
  if (sel.name === 'Фонарик') flashlightGroup.visible = true;
  else if (sel.name === 'Топор') axeGroup.visible = true;
  else if (sel.name === 'Кирка') pickaxeGroup.visible = true;
  else if (sel.name === 'Меч' || sel.name === 'Улучшенный меч') swordGroup.visible = true;
  else if (sel.name === 'Ружьё') gunGroup.visible = true;
}

allSlots[0] = { icon: ITEMS_DB['Фонарик'].icon, name: 'Фонарик', count: 1 };
allSlots[1] = { icon: ITEMS_DB['Топор'].icon, name: 'Топор', count: 1 };
allSlots[2] = { icon: ITEMS_DB['Ружьё'].icon, name: 'Ружьё', count: 1 };
allSlots[6] = { icon: ITEMS_DB['Дерево'].icon, name: 'Дерево', count: 10 };
allSlots[7] = { icon: ITEMS_DB['Камень'].icon, name: 'Камень', count: 10 };
selectSlot(0);

// ==========================================
// 9. МОДЕЛИ ЖИВОТНЫХ И ЗОМБИ
// ==========================================
const placedObjects = [];
function placeObject(itemName) {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const pos = camera.position.clone().add(dir.multiplyScalar(3)); pos.y = heightAt(pos.x, pos.z);
  if (itemName === 'Верстак') {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), woodDark); bench.position.copy(pos); scene.add(bench);
    placedObjects.push({ type: 'bench', mesh: bench, x: pos.x, z: pos.z });
  } else if (itemName === 'Печь') {
    const furnace = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), new THREE.MeshStandardMaterial({ color: 0x555555 })); furnace.position.copy(pos); scene.add(furnace);
    placedObjects.push({ type: 'furnace', mesh: furnace, x: pos.x, z: pos.z });
  }
}

const zombies = [];
function createZombieModel() {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x5a7a5a, roughness: 0.8 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 1 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.3), clothMat); torso.position.y = 1.1; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat); head.position.y = 1.7; g.add(head);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), skinMat); armL.rotation.x = Math.PI / 2; armL.position.set(-0.35, 1.3, -0.3); g.add(armL);
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), skinMat); armR.rotation.x = Math.PI / 2; armR.position.set(0.35, 1.3, -0.3); g.add(armR);
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), clothMat); legL.position.set(-0.15, 0.4, 0); g.add(legL);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), clothMat); legR.position.set(0.15, 0.4, 0); g.add(legR);
  return g;
}

function spawnZombie() {
  const angle = Math.random() * Math.PI * 2; const dist = 30 + Math.random() * 20;
  const zx = player.x + Math.cos(angle) * dist; const zz = player.z + Math.sin(angle) * dist;
  const h = heightAt(zx, zz); if (h < -2) return;
  const mesh = createZombieModel(); mesh.position.set(zx, h, zz); scene.add(mesh);
  zombies.push({ mesh, x: zx, z: zz, hp: 30, maxHp: 30, speed: 2 + Math.random() * 1.5, walkTime: Math.random() * 10, lastStep: 0 });
}

const animals = [];
function createAnimalModel(type) {
  const g = new THREE.Group();
  if (type === 'rabbit') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0xcccccc })); body.position.y = 0.2; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff })); head.position.set(0, 0.35, -0.25); g.add(head);
  } else if (type === 'moose') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 1.8), new THREE.MeshStandardMaterial({ color: 0x5a3f26 })); body.position.y = 1.2; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x4a2f16 })); head.position.set(0, 1.6, -1.1); g.add(head);
    const hornL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0xaaaaaa })); hornL.rotation.z = Math.PI / 4; hornL.position.set(-0.3, 1.9, -1.1); g.add(hornL);
    const hornR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0xaaaaaa })); hornR.rotation.z = -Math.PI / 4; hornR.position.set(0.3, 1.9, -1.1); g.add(hornR);
  } else if (type === 'bear') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 2), new THREE.MeshStandardMaterial({ color: 0x2a1a0a })); body.position.y = 1.2; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x1a0a00 })); head.position.set(0, 1.8, -1); g.add(head);
    const legFL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a0a })); legFL.position.set(-0.35, 0.4, -0.6); g.add(legFL);
    const legFR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a0a })); legFR.position.set(0.35, 0.4, -0.6); g.add(legFR);
    const legBL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a0a })); legBL.position.set(-0.35, 0.4, 0.6); g.add(legBL);
    const legBR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a0a })); legBR.position.set(0.35, 0.4, 0.6); g.add(legBR);
  }
  return g;
}

function spawnAnimal(type) {
  let speed, hp, loot;
  if (type === 'rabbit') { speed = 6; hp = 10; loot = 'Мясо'; }
  else if (type === 'moose') { speed = 3; hp = 50; loot = 'Кожа'; }
  else { speed = 4; hp = 100; loot = 'Кожа'; }
  const angle = Math.random() * Math.PI * 2; const dist = 40 + Math.random() * 20;
  const ax = player.x + Math.cos(angle) * dist; const az = player.z + Math.sin(angle) * dist;
  const h = heightAt(ax, az); if (h < -2) return;
  const mesh = createAnimalModel(type); mesh.position.set(ax, h, az); scene.add(mesh);
  animals.push({ mesh, type, x: ax, z: az, hp, speed, loot, state: 'idle', timer: 0 });
}

const raycaster = new THREE.Raycaster(); const centerScreen = new THREE.Vector2(0, 0);
const interactHint = document.getElementById('interactHint');

function updateInteractionHint() {
  if (invOpen || mapOpen || craftOpen || chestOverlay.classList.contains('open') || benchOverlay.classList.contains('open') || furnaceOverlay.classList.contains('open')) { 
    interactHint.style.display = 'none'; 
    return; 
  }
  
  raycaster.setFromCamera(centerScreen, camera);
  let hintText = '';

  // 1. Сначала проверяем сундуки (они важнее)
  const chestMeshes = huts.map(h => h.chest);
  const chestHits = raycaster.intersectObjects(chestMeshes, true); // true = проверять дочерние элементы
  if (chestHits.length > 0 && chestHits[0].distance < 4) {
    const hut = huts.find(h => chestHits[0].object.parent === h.chest || chestHits[0].object === h.chest);
    if (hut && !hut.looted) {
      hintText = '[E] Открыть сундук';
    } else if (hut && hut.looted) {
      hintText = 'Сундук пуст';
    }
  }

  // 2. Если сундук не найден, проверяем двери
  if (!hintText) {
    const doorMeshes = huts.map(h => h.door);
    const doorHits = raycaster.intersectObjects(doorMeshes, true);
    if (doorHits.length > 0 && doorHits[0].distance < 4) {
      hintText = '[E] Открыть/Закрыть дверь';
    }
  }

  // 3. Проверяем верстаки и печи
  if (!hintText) {
    const placedMeshes = placedObjects.map(o => o.mesh);
    const placedHits = raycaster.intersectObjects(placedMeshes, true);
    if (placedHits.length > 0 && placedHits[0].distance < 4) {
      const placed = placedObjects.find(o => o.mesh === placedHits[0].object || o.mesh.children.includes(placedHits[0].object));
      if (placed) {
        if (placed.type === 'bench') hintText = '[E] Использовать верстак';
        else if (placed.type === 'furnace') hintText = '[E] Использовать печь';
      }
    }
  }

  // 4. Лестница
  const distToTower = Math.hypot(player.x - lakeCenter.x, player.z - lakeCenter.z);
  if (distToTower < 8 && player.y < 12) { 
    hintText = 'Смотрите на лестницу и жмите [W] чтобы залезть'; 
  }

  if (hintText) { interactHint.textContent = hintText; interactHint.style.display = 'block'; } 
  else { interactHint.style.display = 'none'; }
}

function pressE() {
  if (invOpen || mapOpen || craftOpen || chestOverlay.classList.contains('open') || benchOverlay.classList.contains('open') || furnaceOverlay.classList.contains('open')) return;
  
  raycaster.setFromCamera(centerScreen, camera);
  
  // 1. Сундуки
  const chestMeshes = huts.map(h => h.chest);
  const chestHits = raycaster.intersectObjects(chestMeshes, true);
  if (chestHits.length > 0 && chestHits[0].distance < 4) {
    const hut = huts.find(h => chestHits[0].object.parent === h.chest || chestHits[0].object === h.chest);
    if (hut) {
      openChest(hut);
      return;
    }
  }

  // 2. Двери
  const doorMeshes = huts.map(h => h.door);
  const doorHits = raycaster.intersectObjects(doorMeshes, true);
  if (doorHits.length > 0 && doorHits[0].distance < 4) {
    const hut = huts.find(h => h.door === doorHits[0].object);
    if (hut) {
      hut.doorOpen = !hut.doorOpen; 
      hut.doorCollider.active = !hut.doorOpen;
      return;
    }
  }

  // 3. Верстаки и печи
  const placedMeshes = placedObjects.map(o => o.mesh);
  const placedHits = raycaster.intersectObjects(placedMeshes, true);
  if (placedHits.length > 0 && placedHits[0].distance < 4) {
    const placed = placedObjects.find(o => o.mesh === placedHits[0].object || o.mesh.children.includes(placedHits[0].object));
    if (placed) {
      if (placed.type === 'bench') openBench();
      else if (placed.type === 'furnace') openFurnace();
      return;
    }
  }
}

function interact() {
  if (invOpen || mapOpen || craftOpen || chestOverlay.classList.contains('open') || benchOverlay.classList.contains('open') || furnaceOverlay.classList.contains('open')) return;
  raycaster.setFromCamera(centerScreen, camera);
  const sel = allSlots[selectedSlot];
  if (sel && (sel.name === 'Верстак' || sel.name === 'Печь')) { placeObject(sel.name); addItemToInv(sel.name, sel.icon, -1); return; }
  const hitZombie = raycaster.intersectObjects(zombies.map(z => z.mesh), true)[0];
  if (hitZombie && hitZombie.distance < 5) {
    const z = zombies.find(x => x.mesh === hitZombie.object || x.mesh.children.includes(hitZombie.object));
    if (z && sel) {
      let dmg = 10; if (sel.name === 'Ружьё') dmg = 100; else if (sel.name === 'Улучшенный меч') dmg = 75; else if (sel.name === 'Меч') dmg = 50; else if (sel.name === 'Топор') dmg = 25;
      z.hp -= dmg;
      if (z.hp <= 0) { scene.remove(z.mesh); zombies.splice(zombies.indexOf(z), 1); addItemToInv('Ткань', ITEMS_DB['Ткань'].icon, 1); }
      return;
    }
  }
  const hitAnimal = raycaster.intersectObjects(animals.map(a => a.mesh), true)[0];
  if (hitAnimal && hitAnimal.distance < 5) {
    const a = animals.find(x => x.mesh === hitAnimal.object || x.mesh.children.includes(hitAnimal.object));
    if (a && sel) {
      let dmg = 10; if (sel.name === 'Ружьё') dmg = 100; else if (sel.name === 'Улучшенный меч') dmg = 75; else if (sel.name === 'Меч') dmg = 50; else if (sel.name === 'Топор') dmg = 25;
      a.hp -= dmg;
      if (a.hp <= 0) { scene.remove(a.mesh); animals.splice(animals.indexOf(a), 1); addItemToInv(a.loot, ITEMS_DB[a.loot].icon, 2); if (a.type !== 'rabbit') addItemToInv('Мясо', ITEMS_DB['Мясо'].icon, 3); }
      return;
    }
  }
  const hitBush = raycaster.intersectObjects(bushes.map(b => b.mesh))[0];
  if (hitBush && hitBush.distance < 3.5) { const b = bushes.find(x => x.mesh === hitBush.object); if (b) { scene.remove(b.mesh); bushes.splice(bushes.indexOf(b), 1); addItemToInv('Волокно', ITEMS_DB['Волокно'].icon, 1 + Math.floor(Math.random() * 2)); return; } }
  const hitCoal = raycaster.intersectObjects(coalNodes.map(c => c.mesh))[0];
  if (hitCoal && hitCoal.distance < 4) {
    const c = coalNodes.find(x => x.mesh === hitCoal.object);
    if (c && sel && sel.name === 'Кирка') { c.hp -= 1; if (c.hp <= 0) { scene.remove(c.mesh); coalNodes.splice(coalNodes.indexOf(c), 1); addItemToInv('Уголь', ITEMS_DB['Уголь'].icon, 2); } return; }
  }
  const hitRock = raycaster.intersectObjects(rocks.map(r => r.mesh))[0];
  if (hitRock && hitRock.distance < 4) {
    const r = rocks.find(x => x.mesh === hitRock.object);
    if (r) { if (sel && (sel.name === 'Кирка' || sel.name === 'Топор')) { r.hp -= 1; if (r.hp <= 0) { scene.remove(r.mesh); rocks.splice(rocks.indexOf(r), 1); addItemToInv('Камень', ITEMS_DB['Камень'].icon, 2); } } return; }
  }
  if (sel && sel.name === 'Топор') {
    const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir); const targetPos = camera.position.clone().add(camDir.multiplyScalar(2));
    for (let t of treeData) {
      if (t.hp <= 0) continue;
      const dx = targetPos.x - t.x, dz = targetPos.z - t.z;
      if (Math.hypot(dx, dz) < 2.5) {
        t.hp -= 1; addItemToInv('Дерево', ITEMS_DB['Дерево'].icon, 1);
        if (t.hp <= 0) { const m = new THREE.Matrix4(); m.makeScale(0, 0, 0); m.setPosition(0, -999, 0); trunkMesh.setMatrixAt(treeData.indexOf(t), m); crownMesh.setMatrixAt(treeData.indexOf(t), m); trunkMesh.instanceMatrix.needsUpdate = true; crownMesh.instanceMatrix.needsUpdate = true; }
        return;
      }
    }
  }
}

function addItemToInv(name, icon, count) {
  for (let i = 0; i < allSlots.length; i++) { if (allSlots[i] && allSlots[i].name === name) { allSlots[i].count += count; if (allSlots[i].count <= 0) allSlots[i] = null; renderHotbarHUD(); return; } }
  if (count > 0) for (let i = 0; i < allSlots.length; i++) { if (!allSlots[i]) { allSlots[i] = { icon, name, count }; renderHotbarHUD(); return; } }
}

// ==========================================
// 10. ФИЗИКА И УПРАВЛЕНИЕ
// ==========================================
function resolveCollisions(nx, nz) {
  const pRadius = 0.8; let rx = nx, rz = nz;
  for (let col of colliders) {
    if (col.active === false) continue;
    const closestX = Math.max(col.x - col.w / 2, Math.min(rx, col.x + col.w / 2)); const closestZ = Math.max(col.z - col.d / 2, Math.min(rz, col.z + col.d / 2));
    const dx = rx - closestX, dz = rz - closestZ; const distSq = dx * dx + dz * dz;
    if (distSq < pRadius * pRadius) { const dist = Math.sqrt(distSq); if (dist === 0) { rx += pRadius; rz += pRadius; } else { const overlap = pRadius - dist; rx += (dx / dist) * overlap; rz += (dz / dist) * overlap; } }
  }
  return { x: rx, z: rz };
}

const keys = {};
// --- УПРАВЛЕНИЕ МЫШЬЮ ---
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0 && !mapOpen && !invOpen && !craftOpen && !chestOverlay.classList.contains('open') && !benchOverlay.classList.contains('open') && !furnaceOverlay.classList.contains('open')) {
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock(); 
    } else {
      interact(); 
    }
  }
});

window.addEventListener('mousemove', (e) => { 
  if (document.pointerLockElement === renderer.domElement) { 
    player.yaw -= e.movementX * 0.002; 
    player.pitch -= e.movementY * 0.002; 
    player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch)); 
  } 
});
// -------------------------
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') pressE();
  if (e.code === 'KeyF') { if (allSlots[selectedSlot] && allSlots[selectedSlot].name === 'Фонарик') { if (flashState.battery > 0) flashState.on = !flashState.on; } }
  if (e.code === 'Tab') { e.preventDefault(); invOpen ? closeInv() : openInv(); }
  if (e.code === 'KeyC') { e.preventDefault(); craftOpen ? closeCraft() : openCraft(); }
  if (e.code === 'KeyN') { e.preventDefault(); mapOpen ? closeMap() : openMap(); }
  if (e.code === 'Escape') { if (invOpen) closeInv(); if (craftOpen) closeCraft(); if (mapOpen) closeMap(); if (chestOverlay.classList.contains('open')) closeChest(); if (benchOverlay.classList.contains('open')) closeBench(); if (furnaceOverlay.classList.contains('open')) closeFurnace(); }
  if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5), 10) - 1; if (n >= 0 && n < 6) selectSlot(n); }
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0 && !mapOpen && !invOpen && !craftOpen && !chestOverlay.classList.contains('open') && !benchOverlay.classList.contains('open') && !furnaceOverlay.classList.contains('open') && !isPaused) {
    if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock(); else interact();
  }
});
window.addEventListener('mousemove', (e) => { if (document.pointerLockElement === renderer.domElement) { player.yaw -= e.movementX * 0.002; player.pitch -= e.movementY * 0.002; player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch)); } });

renderHotbarHUD();

// ==========================================
// 11. МИНИ-КАРТА И ПОЛНАЯ КАРТА
// ==========================================
const mini = document.getElementById('minimap'); const miniCtx = mini.getContext('2d'); const MINI_SIZE = mini.width, MINI_RANGE = 180;
let markers = []; try { const saved = localStorage.getItem('forestMarkers'); if (saved) markers = JSON.parse(saved); } catch (e) {}
function drawMinimap() {
  const w = MINI_SIZE, h = MINI_SIZE, cx = w / 2, cy = h / 2, R = w / 2;
  miniCtx.clearRect(0, 0, w, h); miniCtx.save(); miniCtx.beginPath(); miniCtx.arc(cx, cy, R, 0, Math.PI * 2); miniCtx.clip();
  miniCtx.fillStyle = 'rgba(10,16,12,0.95)'; miniCtx.fillRect(0, 0, w, h);
  const step = 4; const img = miniCtx.createImageData(w, h);
  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      const wx = player.x + (px - cx) / (w / 2) * MINI_RANGE, wz = player.z + (py - cy) / (h / 2) * MINI_RANGE;
      let r, g, b;
      if ((riverAt(wx, wz) || lakeAt(wx, wz)) && !islandAt(wx, wz)) { r = 42; g = 74; b = 120; }
      else {
        const hh = heightAt(wx, wz), sw = swampAt(wx, wz);
        if (sw > 0.35 && hh < 3) { r = 52; g = 68; b = 52; }
        else if (hh > 25) { r = 136; g = 136; b = 136; }
        else if (hh > 15) { r = 90; g = 107; b = 74; }
        else { r = 58; g = 90; b = 54; }
        const sh = 1 - Math.max(0, Math.min(1, (hh + 25) / 50)) * 0.3; r *= sh; g *= sh; b *= sh;
      }
      for (let yy = 0; yy < step; yy++) for (let xx = 0; xx < step; xx++) {
        const idx = ((py + yy) * w + (px + xx)) * 4; if (idx + 3 >= img.data.length) continue;
        img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
      }
    }
  }
  miniCtx.putImageData(img, 0, 0);
  miniCtx.fillStyle = 'rgba(18,44,18,0.8)';
  for (const t of treeData) { if (t.hp <= 0) continue; const dx = t.x - player.x, dz = t.z - player.z; if (Math.abs(dx) > MINI_RANGE || Math.abs(dz) > MINI_RANGE) continue; miniCtx.fillRect(cx + dx / MINI_RANGE * (w / 2), cy + dz / MINI_RANGE * (h / 2), 1.5, 1.5); }
  miniCtx.fillStyle = '#ff9f43';
  for (const h of huts) { const dx = h.x - player.x, dz = h.z - player.z; if (Math.abs(dx) > MINI_RANGE || Math.abs(dz) > MINI_RANGE) continue; miniCtx.fillRect(cx + dx / MINI_RANGE * (w / 2) - 2, cy + dz / MINI_RANGE * (h / 2) - 2, 4, 4); }
  miniCtx.fillStyle = '#ff0000';
  for (const z of zombies) { const dx = z.mesh.position.x - player.x, dz = z.mesh.position.z - player.z; if (Math.abs(dx) > MINI_RANGE || Math.abs(dz) > MINI_RANGE) continue; miniCtx.fillRect(cx + dx / MINI_RANGE * (w / 2) - 1.5, cy + dz / MINI_RANGE * (h / 2) - 1.5, 3, 3); }
  miniCtx.fillStyle = '#00ff00';
  for (const a of animals) { const dx = a.mesh.position.x - player.x, dz = a.mesh.position.z - player.z; if (Math.abs(dx) > MINI_RANGE || Math.abs(dz) > MINI_RANGE) continue; miniCtx.fillRect(cx + dx / MINI_RANGE * (w / 2) - 1.5, cy + dz / MINI_RANGE * (h / 2) - 1.5, 3, 3); }
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), a = Math.atan2(fx, -fz);
  miniCtx.save(); miniCtx.translate(cx, cy); miniCtx.rotate(a);
  miniCtx.fillStyle = '#4fd1ff'; miniCtx.strokeStyle = '#001018'; miniCtx.lineWidth = 1.5;
  miniCtx.beginPath(); miniCtx.moveTo(0, -8); miniCtx.lineTo(5.5, 6); miniCtx.lineTo(0, 3); miniCtx.lineTo(-5.5, 6); miniCtx.closePath();
  miniCtx.fill(); miniCtx.stroke(); miniCtx.restore();
  const grad = miniCtx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  miniCtx.fillStyle = grad; miniCtx.fillRect(0, 0, w, h);
  miniCtx.restore();
}

const mapOverlay = document.getElementById('mapOverlay'); const mapCanvas = document.getElementById('mapCanvas'); const mapCtx = mapCanvas.getContext('2d');
let mapScale = 1;
function worldToMap(x, z) { return { mx: mapCanvas.width / 2 + x * mapScale, my: mapCanvas.height / 2 + z * mapScale }; }
function mapToWorld(mx, my) { return { x: (mx - mapCanvas.width / 2) / mapScale, z: (my - mapCanvas.height / 2) / mapScale }; }
function resizeMap() { const maxW = Math.min(window.innerWidth * 0.8, 900), maxH = Math.min(window.innerHeight * 0.8, 900), side = Math.min(maxW, maxH); mapCanvas.width = side; mapCanvas.height = side; mapScale = (side * 0.92) / SIZE; }
let staticMap = null;
function buildStaticMap() {
  resizeMap(); const c = document.createElement('canvas'); c.width = mapCanvas.width; c.height = mapCanvas.height; const g = c.getContext('2d');
  g.fillStyle = '#0d1410'; g.fillRect(0, 0, c.width, c.height);
  const img = g.createImageData(c.width, c.height);
  for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
    const { x, z } = mapToWorld(px, py); if (Math.abs(x) > SIZE / 2 || Math.abs(z) > SIZE / 2) continue;
    let r, gg, b;
    if ((riverAt(x, z) || lakeAt(x, z)) && !islandAt(x, z)) { r = 42; gg = 74; b = 120; }
    else {
      const h = heightAt(x, z), sw = swampAt(x, z);
      if (sw > 0.35 && h < 3) { r = 58; gg = 74; b = 56; }
      else if (h > 25) { r = 136; gg = 136; b = 136; }
      else if (h > 15) { r = 90; gg = 107; b = 74; }
      else { r = 58; gg = 90; b = 54; }
      const shade = 1 - Math.max(0, Math.min(1, (h + 25) / 50)) * 0.35; r *= shade; gg *= shade; b *= shade;
    }
    const idx = (py * c.width + px) * 4; img.data[idx] = r; img.data[idx + 1] = gg; img.data[idx + 2] = b; img.data[idx + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tl = worldToMap(-SIZE / 2, -SIZE / 2), br = worldToMap(SIZE / 2, SIZE / 2);
  g.strokeStyle = 'rgba(200,220,200,0.25)'; g.lineWidth = 1; g.strokeRect(tl.mx, tl.my, br.mx - tl.mx, br.my - tl.my);
  g.fillStyle = 'rgba(20,50,20,0.7)'; for (const t of treeData) { const p = worldToMap(t.x, t.z); g.fillRect(p.mx, p.my, 2, 2); }
  g.fillStyle = '#ff9f43'; for (const h of huts) { const p = worldToMap(h.x, h.z); g.fillRect(p.mx - 3, p.my - 3, 6, 6); }
  g.fillStyle = '#111111'; for (const col of colliders) { const p = worldToMap(col.x, col.z); g.fillRect(p.mx - 3, p.my - 3, 6, 6); }
  g.fillStyle = '#000000'; for (const c of coalNodes) { const p = worldToMap(c.x, c.z); g.fillRect(p.mx - 2, p.my - 2, 4, 4); }
  g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    const p1 = worldToMap(i * 100, -SIZE / 2), p2 = worldToMap(i * 100, SIZE / 2); g.beginPath(); g.moveTo(p1.mx, p1.my); g.lineTo(p2.mx, p2.my); g.stroke();
    const q1 = worldToMap(-SIZE / 2, i * 100), q2 = worldToMap(SIZE / 2, i * 100); g.beginPath(); g.moveTo(q1.mx, q1.my); g.lineTo(q2.mx, q2.my); g.stroke();
  }
  staticMap = c;
}
function drawMap() {
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height); if (staticMap) mapCtx.drawImage(staticMap, 0, 0);
  for (const mk of markers) {
    const p = worldToMap(mk.x, mk.z);
    mapCtx.fillStyle = '#ffcc33'; mapCtx.strokeStyle = '#000'; mapCtx.lineWidth = 1.5;
    mapCtx.beginPath(); mapCtx.arc(p.mx, p.my, 5, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke();
    mapCtx.font = 'bold 12px monospace'; mapCtx.textAlign = 'left'; mapCtx.textBaseline = 'middle';
    const tw = mapCtx.measureText(mk.name).width; mapCtx.fillStyle = 'rgba(0,0,0,0.65)'; mapCtx.fillRect(p.mx + 8, p.my - 8, tw + 8, 16); mapCtx.fillStyle = '#ffe8a0'; mapCtx.fillText(mk.name, p.mx + 12, p.my);
  }
  const pp = worldToMap(player.x, player.z), fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), a = Math.atan2(fx, -fz);
  mapCtx.save(); mapCtx.translate(pp.mx, pp.my); mapCtx.rotate(a);
  mapCtx.fillStyle = '#4fd1ff'; mapCtx.strokeStyle = '#001018'; mapCtx.lineWidth = 1.5;
  mapCtx.beginPath(); mapCtx.moveTo(0, -10); mapCtx.lineTo(7, 8); mapCtx.lineTo(0, 4); mapCtx.lineTo(-7, 8); mapCtx.closePath();
  mapCtx.fill(); mapCtx.stroke(); mapCtx.restore();
}
function openMap() { if (mapOpen) return; mapOpen = true; document.exitPointerLock?.(); mapOverlay.classList.add('open'); buildStaticMap(); drawMap(); }
function closeMap() { if (!mapOpen) return; mapOpen = false; mapOverlay.classList.remove('open'); }
mapCanvas.addEventListener('contextmenu', e => e.preventDefault());
mapCanvas.addEventListener('mousedown', (e) => {
  const rect = mapCanvas.getBoundingClientRect(), mx = (e.clientX - rect.left) * (mapCanvas.width / rect.width), my = (e.clientY - rect.top) * (mapCanvas.height / rect.height);
  if (e.button === 2) {
    const { x, z } = mapToWorld(mx, my); let best = -1, bestDist = 999;
    markers.forEach((mk, i) => { const d = Math.hypot(mk.x - x, mk.z - z); if (d < bestDist) { bestDist = d; best = i; } });
    if (best >= 0 && bestDist < 8) { markers.splice(best, 1); saveMarkers(); drawMap(); } return;
  }
  if (e.button === 0) {
    const { x, z } = mapToWorld(mx, my); if (Math.abs(x) > SIZE / 2 || Math.abs(z) > SIZE / 2) return;
    const name = prompt('Название метки:', ''); if (name === null) return;
    markers.push({ x, z, name: name.trim() || 'Метка' }); saveMarkers(); drawMap();
  }
});
function saveMarkers() { try { localStorage.setItem('forestMarkers', JSON.stringify(markers)); } catch (e) {} }

// ==========================================
// 12. ЦИКЛ ИГРЫ (RENDER LOOP)
// ==========================================
const clock = new THREE.Clock();
let miniTimer = 0, bobT = 0, hintTimer = 0, spawnTimer = 0, animalTimer = 0;
const clockIcon = document.getElementById('clockIcon'); const clockTimeEl = document.getElementById('clockTime'); const clockPhase = document.getElementById('clockPhase');

function updateDayNight(dt) {
  timeOfDay = (timeOfDay + dt) % DAY_LENGTH;
  const { hours, minutes } = getTimeInfo(); const day = dayFactor(hours + minutes / 60);
  ambient.intensity = 0.15 + day * 0.95; hemi.intensity = 0.10 + day * 0.80; sun.intensity = 0.05 + day * 1.35;
  const nightSky = new THREE.Color(0x0a1220); const daySky = new THREE.Color(0x1a2a2a); scene.background.copy(nightSky).lerp(daySky, day);
  const nightFog = new THREE.Color(0x0d1520); const dayFog = new THREE.Color(0x2a3f3a); scene.fog.color.copy(nightFog).lerp(dayFog, day); scene.fog.density = 0.014 - day * 0.010;
  ambient.color.setHSL(0.6, 0.3, 0.5 + day * 0.3); sun.color.setHSL(0.12, 0.4, 0.55 + day * 0.35);

  const nightBoost = 1 - day; const targetIntensity = flashState.on ? (2.5 + nightBoost * 6.0) : 0;
  flashlight.intensity += (targetIntensity - flashlight.intensity) * Math.min(1, dt * 10);
  const targetLens = flashState.on ? 1 : 0.15; lensMat.color.setRGB(1 * targetLens, 0.95 * targetLens, 0.6 * targetLens);

  if (flashState.on) { flashState.battery -= flashState.drainPerSec * dt; if (flashState.battery <= 0) { flashState.battery = 0; flashState.on = false; } }
  else if (day > 0.6) flashState.battery = Math.min(100, flashState.battery + 1.5 * dt);

  const flashBar = document.querySelector('.slot.selected .bar > i');
  if (flashBar) { flashBar.style.width = flashState.battery + '%'; flashBar.style.background = flashState.battery > 40 ? '#ffd166' : flashState.battery > 15 ? '#ff9f43' : '#ff5e5e'; }

  const hh = String(hours).padStart(2, '0'), mm = String(minutes).padStart(2, '0'); clockTimeEl.textContent = `${hh}:${mm}`;
  let icon = '☀️', phase = 'День';
  if (day < 0.15) { icon = '🌙'; phase = 'Ночь'; } else if (day < 0.4) { icon = hours < 12 ? '🌅' : '🌇'; phase = hours < 12 ? 'Рассвет' : 'Закат'; } else if (day < 0.75) { icon = '⛅'; phase = hours < 12 ? 'Утро' : 'Вечер'; }
  clockIcon.textContent = icon; clockPhase.textContent = phase;
  return day;
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05); const t = clock.elapsedTime;
  const locked = !mapOpen && !invOpen && !craftOpen && !chestOverlay.classList.contains('open') && !benchOverlay.classList.contains('open') && !furnaceOverlay.classList.contains('open');

  if (locked) {
    let forward = 0, strafe = 0;
    if (keys['KeyW']) forward += 1; if (keys['KeyS']) forward -= 1; if (keys['KeyD']) strafe += 1; if (keys['KeyA']) strafe -= 1;
    let moving = false;

    const distToTower = Math.hypot(player.x - lakeCenter.x, player.z - lakeCenter.z);
    if (distToTower < 6 && keys['KeyW'] && !player.isClimbing) { if (player.y < heightAt(lakeCenter.x, lakeCenter.z) + 12) player.isClimbing = true; }
    if (player.isClimbing) {
      player.x += (lakeCenter.x - player.x) * 0.1; player.z += (lakeCenter.z - player.z) * 0.1; player.y += 3 * dt;
      if (player.y >= heightAt(lakeCenter.x, lakeCenter.z) + 12.2 || keys['KeyS']) { player.isClimbing = false; player.y = heightAt(lakeCenter.x, lakeCenter.z) + 12.2; }
    } else {
      if (forward !== 0 || strafe !== 0) {
        moving = true;
        const sp = player.speed * (keys['ShiftLeft'] ? 1.8 : 1) * (player.inWater ? 0.5 : 1);
        const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
        const dx = fx * forward + rx * strafe, dz = fz * forward + rz * strafe, l = Math.hypot(dx, dz) || 1;
        const targetX = player.x + (dx / l) * sp * dt; const targetZ = player.z + (dz / l) * sp * dt;
        const resolved = resolveCollisions(targetX, targetZ); player.x = resolved.x; player.z = resolved.z;
        const lim = SIZE * 0.47; player.x = Math.max(-lim, Math.min(lim, player.x)); player.z = Math.max(-lim, Math.min(lim, player.z));
      }
    }

    const isOnBridge = Math.abs(player.z - bridgeZ) < 6 && Math.abs(player.x) < bridgeLength / 2;
    let groundY;
    if (isOnBridge) { const progress = player.x / (bridgeLength / 2); groundY = bridgeY_base + (1 - progress * progress) * bridgeHeight + 2.2; }
    else { groundY = heightAt(player.x, player.z) + 2.2; }

    if (groundY < -2.5 + 2.2) { player.inWater = true; groundY = -2.5 + 2.2; }
    else { player.inWater = false; }

    if (keys['Space'] && player.isGrounded && !player.inWater) { player.vy = 10; player.isGrounded = false; }
    if (!player.isGrounded) {
      player.vy -= 30 * dt; player.y += player.vy * dt;
      if (player.y <= groundY) { player.y = groundY; player.vy = 0; player.isGrounded = true; }
    } else { player.y = groundY; }

    if (player.inWater) {
      airBarDiv.style.display = 'block'; player.air -= 10 * dt;
      if (player.air <= 0) { player.air = 0; player.hp -= 10 * dt; }
      airBarFill.style.width = player.air + '%';
      if (player.hp <= 0) { player.hp = 100; player.air = 100; player.x = 0; player.z = 0; }
    } else { airBarDiv.style.display = 'none'; player.air = Math.min(100, player.air + 20 * dt); }
    hpBarFill.style.width = player.hp + '%';

    camera.position.set(player.x, player.y, player.z);
    camera.rotation.order = 'YXZ'; camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;

    if (grassMat.userData.shader) grassMat.userData.shader.uniforms.uTime.value = t;
    const day = updateDayNight(dt);

    spawnTimer += dt; const maxZombies = day < 0.3 ? 15 : 5;
    if (spawnTimer > (day < 0.3 ? 4 : 10) && zombies.length < maxZombies) { spawnTimer = 0; spawnZombie(); }
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i]; const dx = player.x - z.mesh.position.x, dz = player.z - z.mesh.position.z; const dist = Math.hypot(dx, dz);
      if (dist < 2) {
        player.hp -= (10 - player.armor) * dt; if (player.hp < 0) player.hp = 0;
        if (player.hp <= 0) { player.hp = 100; player.x = 0; player.z = 0; }
      } else if (dist < 40) {
        const move = z.speed * dt; const newX = z.mesh.position.x + (dx / dist) * move, newZ = z.mesh.position.z + (dz / dist) * move;
        let blocked = false;
        for(let col of colliders) { if(col.active === false) continue; if (newX > col.x - col.w/2 - 0.4 && newX < col.x + col.w/2 + 0.4 && newZ > col.z - col.d/2 - 0.4 && newZ < col.z + col.d/2 + 0.4) blocked = true; }
        if(!blocked) { z.mesh.position.x = newX; z.mesh.position.z = newZ; }
        z.mesh.position.y = heightAt(z.mesh.position.x, z.mesh.position.z) + 0.1; z.mesh.lookAt(player.x, z.mesh.position.y, player.z);
        z.walkTime += dt * z.speed; 
        z.mesh.children[3].rotation.x = Math.sin(z.walkTime * 5) * 0.5;
        z.mesh.children[4].rotation.x = -Math.sin(z.walkTime * 5) * 0.5;
      }
    }

    animalTimer += dt;
    if (animalTimer > 15 && animals.length < 10) { animalTimer = 0; const types = ['rabbit', 'moose', 'bear']; spawnAnimal(types[Math.floor(Math.random()*types.length)]); }
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i]; const dx = player.x - a.mesh.position.x, dz = player.z - a.mesh.position.z; const dist = Math.hypot(dx, dz);
      a.timer -= dt;
      if (a.type === 'bear' && dist < 15) a.state = 'chase';
      else if (a.type !== 'bear' && dist < 10) a.state = 'flee';
      else if (a.timer <= 0) { a.state = 'idle'; a.timer = 2 + Math.random() * 3; }

      let speed = a.speed;
      if (a.state === 'flee') speed *= 1.5; else if (a.state === 'chase') speed *= 1.2;
      
      if (dist < 50 && a.state !== 'idle') {
        const dirX = (a.state === 'chase' ? dx / dist : -dx / dist) * speed * dt;
        const dirZ = (a.state === 'chase' ? dz / dist : -dz / dist) * speed * dt;
        a.mesh.position.x += dirX; a.mesh.position.z += dirZ;
        a.mesh.lookAt(player.x, a.mesh.position.y, player.z);
        a.mesh.position.y = heightAt(a.mesh.position.x, a.mesh.position.z);
        a.mesh.rotation.x = Math.sin(t * 10) * 0.1;
        if (a.type === 'bear' && dist < 2.5) { player.hp -= 15 * dt; }
      }
    }

    huts.forEach(hut => { const targetRot = hut.doorOpen ? -Math.PI / 2 : 0; hut.door.rotation.y += (targetRot - hut.door.rotation.y) * Math.min(1, dt * 10); });

    if (viewmodel.visible) {
      bobT += dt * (moving ? (keys['ShiftLeft'] ? 12 : 8) : 2);
      const bobX = Math.sin(bobT) * 0.012 * (moving ? 1 : 0.2), bobY = Math.abs(Math.cos(bobT)) * 0.015 * (moving ? 1 : 0.2);
      viewmodel.position.set(bobX, -bobY, 0);
      rightArm.rotation.x = -0.15 + Math.sin(bobT) * 0.04 * (moving ? 1 : 0.15);
      leftArm.rotation.x = -0.25 - Math.sin(bobT) * 0.06 * (moving ? 1 : 0.15);
    }

    hintTimer += dt; if (hintTimer > 0.1) { hintTimer = 0; updateInteractionHint(); }
    miniTimer += dt; if (miniTimer > 0.1) { miniTimer = 0; drawMinimap(); }
  }
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
  if (mapOpen) { buildStaticMap(); drawMap(); }
});