import * as THREE from 'three';
import Stats from 'stats.js';
import GUI,{ Controller } from 'lil-gui';
import './style.css';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import positionFragmentShader from './shaders/positionFragment.glsl?raw';
import velocityFragmentShader from './shaders/velocityFragment.glsl?raw';
import boidVertexShader from './shaders/boidVertex.glsl?raw';
import boidFragmentShader from './shaders/boidFragment.glsl?raw';
import skyVertexShader from './shaders/skyVertex.glsl?raw';
import skyFragmentShader from './shaders/skyFragment.glsl?raw';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { string } from 'three/tsl';
import { KeyboardController } from './controls/KeyboardController.js';

interface Params {
    alignmentForce: number;
    cohesionForce: number;
    separationForce: number;
    separationDistance: number;
    alignmentDistance: number;
    cohesionDistance: number;
    minSpeed: number;
    maxSpeed: number;
    animationSpeed: number;
    scale: number;
    particleCount: number;
    model: string;
    groupCount: number;
    groupColors: string[];
    skyColorTop: string;
    skyColorBottom: string;
    boundsHalf: number;
    cameraAutoRotate: boolean;
    cameraRotationSpeed: number;
}


const BOUNDS=200;
const BOUNDS_HALF=BOUNDS/2;
const MAX_GROUP_COUNT=10;

const params: Params={
    //FORCES
    alignmentForce: 40, //Percent
    cohesionForce: 50, //Percent
    separationForce: 27, //Percent
    //DISTANCES
    separationDistance: BOUNDS_HALF/2,
    alignmentDistance: BOUNDS_HALF/4,
    cohesionDistance: BOUNDS_HALF/2,
    //SPEED
    minSpeed: 0.5,
    maxSpeed: 2.0,
    animationSpeed: 30.0,

    scale: 1.0,
    particleCount: 2048,
    model: 'fish',

    groupCount: 2,
    groupColors: [],

    skyColorTop: '#b3d9f2',
    skyColorBottom: '#80b3d9',
    boundsHalf: BOUNDS_HALF,
    
    //CAMERA ROTATION
    cameraAutoRotate: false,
    cameraRotationSpeed: 0.5,
};

//CONST
let WIDTH=Math.round(Math.sqrt(params.particleCount));
let PARTICLES_COUNT=WIDTH*WIDTH;

//VARIABLES
let gpuCompute: GPUComputationRenderer;
let positionVariable: any;
let velocityVariable: any;
let positionUniforms: any;
let velocityUniforms: any;
let boidsMesh: THREE.InstancedMesh;

let butterflyGeometry: THREE.BufferGeometry;
let fishGeometry: THREE.BufferGeometry;
let jellyfishGeometry: THREE.BufferGeometry;
let sphereGeometry: THREE.BufferGeometry;
let coneGeometry: THREE.BufferGeometry;
let currentGeometry: THREE.BufferGeometry;
let clock=new THREE.Clock();
let skyMesh: THREE.Mesh;
let keyboardController: KeyboardController;
let isGuiVisible: boolean=true;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,5000);
const renderer=new THREE.WebGLRenderer();

const controls=new OrbitControls(camera,renderer.domElement);

var stats=new Stats();
document.body.appendChild(stats.dom);

const gui=new GUI();


const MAX_ALIGNMENT_FORCE=0.25;
const MAX_COHESION_FORCE=0.04;
const MAX_SEPARATION_FORCE=5.0;

//==============================//
//              GUI             //
//==============================//


//SPEED
const speedFolder=gui.addFolder('Vitesse');
speedFolder.add(params,'minSpeed',0.0,2.0).name('Min').onChange((value: number) => { velocityUniforms['minSpeed'].value=value; });
speedFolder.add(params,'maxSpeed',0.001,20.0).name('Max').onChange((value: number) => { velocityUniforms['maxSpeed'].value=value; });

//SEPARATION
const separationFolder=gui.addFolder('Séparation');
separationFolder.add(params,'separationDistance',0.1,BOUNDS_HALF).name('Distance').onChange((value: number) => { velocityUniforms['separationDistance'].value=value; });
separationFolder.add(params,'separationForce',0,100).name('Force (%)').onChange((value: number) => { velocityUniforms['separationForce'].value=(value/100)*MAX_SEPARATION_FORCE; });

//ALIGNEMENT
const alignmentFolder=gui.addFolder('Alignement');
alignmentFolder.add(params,'alignmentDistance',1.0,BOUNDS_HALF).name('Distance').onChange((value: number) => { velocityUniforms['alignmentDistance'].value=value; });
alignmentFolder.add(params,'alignmentForce',0,100).name('Force (%)').onChange((value: number) => { velocityUniforms['alignmentForce'].value=(value/100)*MAX_ALIGNMENT_FORCE; });

//COHÉSION
const cohesionFolder=gui.addFolder('Cohésion');
cohesionFolder.add(params,'cohesionDistance',1.0,BOUNDS_HALF).name('Distance').onChange((value) => { velocityUniforms['cohesionDistance'].value=value; });
cohesionFolder.add(params,'cohesionForce',0,100).name('Force (%)').onChange((value: number) => { velocityUniforms['cohesionForce'].value=(value/100)*MAX_COHESION_FORCE; });


//MODELS
const modelFolder=gui.addFolder('Modèle');
modelFolder.add(params,'model',['sphere','cone','butterfly','fish','jellyfish']).name('Type').onChange((value: string) => { changeModel(value); });
modelFolder.add(params,'scale',0,2.0).name('Taille').onChange((value: number) => { if(boidsMesh&&boidsMesh.material&&boidsMesh.material.uniforms) { boidsMesh.material.uniforms.scale.value=value/7.0; } });
modelFolder.add(params,'particleCount',[625,1024,2048,4096,8192,16384]).name('Nombre de boids').onChange((value: number) => { updateParticleCount(value); });

//GROUPS
const groupFolder=gui.addFolder('Groupes');
groupFolder.add(params,'groupCount',1,MAX_GROUP_COUNT,1).name('Nombre de groupes')
    .onChange((value: number) => {
        if(velocityUniforms) { velocityUniforms['groupCount'].value=value; }
        updateColorSystem();
        updateGroupControls();
    });

let groupColorControls: Controller[]=[];
function updateGroupControls() {
    groupColorControls.forEach(control => { control.destroy(); });
    groupColorControls=[];
    for(let i: number=0;i<params.groupCount;i++) {
        const control=groupFolder.addColor(params.groupColors,i.toString()).name(`Couleur groupe ${i+1}`).onChange(() => { updateColorSystem(); });
        groupColorControls.push(control);
    }
}

groupFolder.add({ regenerateColors: regenerateColors },'regenerateColors').name('Régénérer couleurs aléatoires');


function getRandomColor() {
    const hue=Math.random();
    const saturation=0.6+Math.random()*0.4;
    const lightness=0.5+Math.random()*0.3;
    const color=new THREE.Color().setHSL(hue,saturation,lightness);
    return '#'+color.getHexString();
}

function regenerateColors() {
    for(let i=0;i<params.groupCount;i++) { params.groupColors[i]=getRandomColor(); }
    updateColorSystem();
    updateGroupControls();
}



//SKY SPHERE
const skyFolder=gui.addFolder('Sky Sphere');
skyFolder.addColor(params,'skyColorTop').name('Couleur haut').onChange((_value: string) => { updateSkyColors(); });
skyFolder.addColor(params,'skyColorBottom').name('Couleur bas').onChange((_value: string) => { updateSkyColors(); });

//BOUNDS
const boundsFolder=gui.addFolder('Limites');
boundsFolder.add(params,'boundsHalf',10,200).name('Rayon limite').onChange((value: number) => {
    if(velocityUniforms) {
        velocityUniforms['boundsHalf'].value=value;
    }
    // Update sky sphere size
    if(skyMesh) {
        skyMesh.scale.setScalar(value*0.05);
    }
});

//CAMERA ROTATION
const cameraFolder=gui.addFolder('Caméra');
cameraFolder.add(params,'cameraAutoRotate').name('Rotation automatique').onChange((value: boolean) => {
    controls.autoRotate = value;
});
cameraFolder.add(params,'cameraRotationSpeed',0.1,2.0).name('Vitesse rotation').onChange((value: number) => {
    controls.autoRotateSpeed = value;
});

function updateSkyColors() {
    if(skyMesh&&skyMesh.material&&skyMesh.material.uniforms) {
        const topColor=new THREE.Color(params.skyColorTop);
        const bottomColor=new THREE.Color(params.skyColorBottom);
        skyMesh.material.uniforms.topColor.value=topColor;
        skyMesh.material.uniforms.bottomColor.value=bottomColor;
    }
}
renderer.setSize(window.innerWidth,window.innerHeight);
document.body.appendChild(renderer.domElement);

function onWindowResize() {
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
}

function toggleFullscreen() {
    if(!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

function toggleGui() {
    isGuiVisible=!isGuiVisible;
    const guiElement=gui.domElement;
    const statsElement=stats.dom;

    if(isGuiVisible) {
        guiElement.style.display='';
        statsElement.style.display='';
    } else {
        guiElement.style.display='none';
        statsElement.style.display='none';
    }
}

window.addEventListener('resize',onWindowResize);





function initializeGeometries() {
    sphereGeometry=new THREE.SphereGeometry(3,8,6);
    coneGeometry=new THREE.ConeGeometry(3,8,8);
    coneGeometry.rotateX(Math.PI/2);
    currentGeometry=butterflyGeometry||coneGeometry;
}

function getCurrentModelType(): number {
    if(currentGeometry===sphereGeometry) return 0.0;
    if(currentGeometry===coneGeometry) return 1.0;
    if(currentGeometry===butterflyGeometry) return 2.0;
    if(currentGeometry===fishGeometry) return 3.0;
    if(currentGeometry===jellyfishGeometry) return 4.0;
    return 1.0;
}


function updateParticleCount(newCount: number) {
    PARTICLES_COUNT=newCount;
    WIDTH=Math.sqrt(PARTICLES_COUNT);

    if(boidsMesh) { scene.remove(boidsMesh); }

    initComputeRenderer();
    boidsMesh=createBoids();
    updateColorSystem();
    console.log(`Boids updated: ${PARTICLES_COUNT} (${WIDTH}x${WIDTH})`);
}

function changeModel(modelType: string) {
    let newGeometry: THREE.BufferGeometry;

    switch(modelType) {
        case 'sphere':
            newGeometry=sphereGeometry;
            break;
        case 'cone':
            newGeometry=coneGeometry;
            break;
        case 'butterfly':
            newGeometry=butterflyGeometry||coneGeometry;
            break;
        case 'fish':
            newGeometry=fishGeometry||coneGeometry;
            break;
        case 'jellyfish':
            newGeometry=jellyfishGeometry||coneGeometry;
            break;
        default:
            newGeometry=coneGeometry;
    }

    if(boidsMesh&&newGeometry) {
        scene.remove(boidsMesh);
        currentGeometry=newGeometry;
        boidsMesh=createBoids();
        updateColorSystem();
    }
}

function updateColorSystem() {
    if(!boidsMesh) return;

    const colors=new Float32Array(PARTICLES_COUNT*3);
    const groupIds=new Float32Array(PARTICLES_COUNT);
    const color=new THREE.Color();

    const boidsPerGroup=Math.floor(PARTICLES_COUNT/params.groupCount);

    for(let groupIndex=0;groupIndex<params.groupCount;groupIndex++) {
        const startIndex=groupIndex*boidsPerGroup;
        const endIndex=(groupIndex===params.groupCount-1)? PARTICLES_COUNT:(groupIndex+1)*boidsPerGroup;

        const groupColor=new THREE.Color(params.groupColors[groupIndex]);
        const hsl={ h: 0,s: 0,l: 0 };
        groupColor.getHSL(hsl);

        for(let i=startIndex;i<endIndex;i++) {
            const lVariance=(Math.random()-0.25)*0.15;
            const newL=Math.max(0,Math.min(1,hsl.l+lVariance));

            const hVariance=(Math.random()-0.5)*0.15;
            let newH=hsl.h+hVariance;
            if(newH>1) newH-=1;
            if(newH<0) newH+=1;

            color.setHSL(newH,hsl.s,newL);

            colors[i*3+0]=color.r;
            colors[i*3+1]=color.g;
            colors[i*3+2]=color.b;
        }
    }

    const geometry=boidsMesh.geometry;
    geometry.setAttribute("instanceColor",new THREE.InstancedBufferAttribute(colors,3));
    geometry.setAttribute("instanceGroupId",new THREE.InstancedBufferAttribute(groupIds,1));
    geometry.attributes.instanceColor.needsUpdate=true;
    geometry.attributes.instanceGroupId.needsUpdate=true;
}

function createBoids() {
    const geometry=currentGeometry.clone();

    const material=new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null },
            textureVelocity: { value: null },
            textureWidth: { value: WIDTH },
            time: { value: 0 },
            animationSpeed: { value: params.animationSpeed },
            scale: { value: params.scale/7.0 },
            modelType: { value: getCurrentModelType() }
        },
        vertexShader: boidVertexShader,
        fragmentShader: boidFragmentShader,
        side: THREE.DoubleSide
    });

    const colors=new Float32Array(PARTICLES_COUNT*3);
    geometry.setAttribute("instanceColor",new THREE.InstancedBufferAttribute(colors,3));

    const instancedMesh=new THREE.InstancedMesh(geometry,material,PARTICLES_COUNT);
    instancedMesh.frustumCulled=false;

    //INIT MATRIX, WILL BE OVERWRITTEN
    const matrix=new THREE.Matrix4();
    for(let i=0;i<PARTICLES_COUNT;i++) {
        matrix.setPosition(0,0,0);
        instancedMesh.setMatrixAt(i,matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate=true;

    scene.add(instancedMesh);
    return instancedMesh;
}

function initComputeRenderer() {
    gpuCompute=new GPUComputationRenderer(WIDTH,WIDTH,renderer);

    const dtPosition=gpuCompute.createTexture();
    const dtVelocity=gpuCompute.createTexture();

    fillPositionTexture(dtPosition);
    fillVelocityTexture(dtVelocity);

    //ADD VARIABLES TO COMPUTE
    velocityVariable=gpuCompute.addVariable('textureVelocity',velocityFragmentShader,dtVelocity);
    positionVariable=gpuCompute.addVariable('texturePosition',positionFragmentShader,dtPosition);

    //LINK TEXTURES TO VARS
    gpuCompute.setVariableDependencies(velocityVariable,[positionVariable,velocityVariable]);
    gpuCompute.setVariableDependencies(positionVariable,[positionVariable,velocityVariable]);

    //GET UNIFORMS TO EDIT THEM
    positionUniforms=positionVariable.material.uniforms;
    velocityUniforms=velocityVariable.material.uniforms;

    positionUniforms['delta']={ value: 0.0 };
    positionUniforms['boundsHalf']={ value: BOUNDS_HALF };

    velocityUniforms['alignmentDistance']={ value: params.alignmentDistance };
    velocityUniforms['alignmentForce']={ value: (params.alignmentForce/100)*MAX_ALIGNMENT_FORCE };

    velocityUniforms['cohesionDistance']={ value: params.cohesionDistance };
    velocityUniforms['cohesionForce']={ value: (params.cohesionForce/100)*MAX_COHESION_FORCE };

    velocityUniforms['separationDistance']={ value: params.separationDistance };
    velocityUniforms['separationForce']={ value: (params.separationForce/100)*MAX_SEPARATION_FORCE };

    velocityUniforms['minSpeed']={ value: params.minSpeed };
    velocityUniforms['maxSpeed']={ value: params.maxSpeed };

    velocityUniforms['texturePosition']={ value: null };
    velocityUniforms['textureWidth']={ value: WIDTH };
    velocityUniforms['boundsHalf']={ value: BOUNDS_HALF };
    velocityUniforms['groupCount']={ value: params.groupCount };

    const error=gpuCompute.init();
    if(error!==null) { console.error('Erreur GPGPU:',error); }
}
function fillPositionTexture(texture: THREE.DataTexture) {
    const imageData=texture.image.data as Uint8Array;
    for(let p=0,length=imageData.length;p<length;p+=4) {
        imageData[p+0]=(Math.random()-0.5)*BOUNDS; //RED = X POS
        imageData[p+1]=(Math.random()-0.5)*BOUNDS; //GREEN = Y POS
        imageData[p+2]=(Math.random()-0.5)*BOUNDS; //BLUE = Z POS
    }
}

function fillVelocityTexture(texture: THREE.DataTexture) {
    const imageData=texture.image.data as Uint8Array;
    for(let p=0,length=imageData.length;p<length;p+=4) {
        imageData[p+0]=Math.random()-0.5; //RED = X VELOCITY
        imageData[p+1]=Math.random()-0.5; //GREEN = Y VELOCITY
        imageData[p+2]=Math.random()-0.5; //BLUE = Z VELOCITY
    }
}

async function loadButterflyModel(): Promise<void> {
    return new Promise((resolve,reject) => {
        const loader=new GLTFLoader();

        loader.load('/models/butterfly.glb',
            (gltf) => {
                console.log('Butterfly model loaded');
                butterflyGeometry=gltf.scene.children[0].geometry.clone();
                butterflyGeometry.rotateY(Math.PI);
                resolve();
            },
            (progress) => {
                console.log('Progression butterfly:',(progress.loaded/progress.total*100)+'%');
            },
            (error) => {
                console.error('Erreur de chargement fish:',error);
                reject(error);
            }
        );
    });
}

async function loadFishModel(): Promise<void> {
    return new Promise((resolve,reject) => {
        const loader=new GLTFLoader();

        loader.load('/models/fish.glb',
            (gltf) => {
                console.log('Fish model loaded');
                fishGeometry=gltf.scene.children[0].geometry.clone();
                fishGeometry.rotateY(Math.PI);
                resolve();
            },
            (progress) => {
                console.log('Progression fish:',(progress.loaded/progress.total*100)+'%');
            },
            (error) => {
                console.error('Erreur de chargement fish:',error);
                reject(error);
            }
        );
    });
}

async function loadJellyfishModel(): Promise<void> {
    return new Promise((resolve,reject) => {
        const loader=new GLTFLoader();

        loader.load('/models/jellyfish.glb',
            (gltf) => {
                console.log('Jellyfish model loaded:');
                jellyfishGeometry=gltf.scene.children[0].geometry.clone();
                jellyfishGeometry.rotateY(Math.PI);
                resolve();
            },
            (progress) => {
                console.log('Progression jellyfish:',(progress.loaded/progress.total*100)+'%');
            },
            (error) => {
                console.error('Erreur de chargement jellyfish:',error);
                reject(error);
            }
        );
    });
}

var last=0;

function animate() {
    controls.update();
    stats.begin();

    const now=performance.now();
    let delta=(now-last)/1000;
    last=now;

    // Limit delta to prevent boids from jumping too far when switching windows
    delta=Math.min(delta,0.016); // Cap at ~60fps (16ms)

    positionUniforms['delta'].value=delta;

    if(boidsMesh&&boidsMesh.material&&boidsMesh.material.uniforms) {
        const elapsedTime=clock.getElapsedTime();
        boidsMesh.material.uniforms.time.value=elapsedTime;
        boidsMesh.material.uniforms.texturePosition.value=gpuCompute.getCurrentRenderTarget(positionVariable).texture;
        boidsMesh.material.uniforms.textureVelocity.value=gpuCompute.getCurrentRenderTarget(velocityVariable).texture;
    }
    gpuCompute.compute();

    renderer.render(scene,camera);
    stats.end();
}


function createSkySphere() {
    const skyGeometry=new THREE.SphereGeometry(BOUNDS*2,32,32);
    const skyMaterial=new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(params.skyColorTop) },
            bottomColor: { value: new THREE.Color(params.skyColorBottom) }
        },
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        side: THREE.BackSide
    });

    skyMesh=new THREE.Mesh(skyGeometry,skyMaterial);
    scene.add(skyMesh);
    return skyMesh;
}

async function init() {
    initializeGeometries();
    createSkySphere();

    try {
        await Promise.all([
            loadButterflyModel(),
            loadFishModel(),
            loadJellyfishModel()
        ]);
        console.log('GLB models loaded successfully');
        currentGeometry=fishGeometry; //DEFAULT GEOMETRY IS FISH

    } catch(error) {
        console.error('Erreur lors du chargement des modèles:',error);
        butterflyGeometry=coneGeometry.clone(); // Fallback
        fishGeometry=coneGeometry.clone(); // Fallback
        jellyfishGeometry=coneGeometry.clone(); // Fallback
        currentGeometry=coneGeometry;
    }

    initComputeRenderer();
    boidsMesh=createBoids();

    params.groupColors=Array.from({ length: MAX_GROUP_COUNT },() => getRandomColor());
    updateColorSystem();
    updateGroupControls();

    camera.position.z=BOUNDS;
    
    // Initialize camera rotation settings
    controls.autoRotate = params.cameraAutoRotate;
    controls.autoRotateSpeed = params.cameraRotationSpeed;
    controls.target.set(0, 0, 0);
    
    controls.update();

    keyboardController=new KeyboardController();
    keyboardController.onKeyPress('keyf',() => {
        toggleFullscreen();
        toggleGui();
    });

    renderer.setAnimationLoop(animate);
    console.log('Animation started');
}

(async () => { await init(); })();