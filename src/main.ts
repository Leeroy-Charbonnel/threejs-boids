import * as THREE from 'three';
import Stats from 'stats.js';
import GUI,{ Controller } from 'lil-gui';
import { createIcons,Copy,Trash2 } from 'lucide';
import './style.css';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import positionFragmentShader from './shaders/positionFragment.glsl?raw';
import velocityFragmentShader from './shaders/velocityFragment.glsl?raw';
import boidVertexShader from './shaders/boidVertex.glsl?raw';
import boidFragmentShader from './shaders/boidFragment.glsl?raw';
import skyVertexShader from './shaders/skyVertex.glsl?raw';
import skyFragmentShader from './shaders/skyFragment.glsl?raw';
import attractionCircleVertexShader from './shaders/attractionCircleVertex.glsl?raw';
import attractionCircleFragmentShader from './shaders/attractionCircleFragment.glsl?raw';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface Params {
    alignmentForce: number;
    cohesionForce: number;
    separationForce: number;
    separationDistance: number;
    alignmentDistance: number;
    cohesionDistance: number;
    speed: number;
    animationSpeed: number;
    scale: number;
    particleCount: number;
    model: string;
    skin: string;
    groupCount: number;
    groupColors: string[];
    skyColorTop: string;
    skyColorBottom: string;
    boundsHalf: number;
    cameraAutoRotate: boolean;
    cameraRotationSpeed: number;
    attractionCameraDistance: number;
    attractionForce: number;
    attractionDistance: number;
    showAttractionZone: boolean;
}

interface Preset {
    name: string;
    params: Partial<Params>;
}


const BOUNDS=200;
const BOUNDS_HALF=BOUNDS/2;
const MAX_GROUP_COUNT=10;

//PREDEFINED PRESETS
const predefinedPresets: Preset[]=[
    {
        name: 'Fish School',
        params: {
            alignmentForce: 35,
            cohesionForce: 45,
            separationForce: 25,
            speed: 0.8,
            scale: 1.0,
            model: 'fish',
            skin: 'shimmer',
            groupCount: 3,
            skyColorTop: '#87ceeb',
            skyColorBottom: '#4682b4'
        }
    },
    {
        name: 'Butterfly Garden',
        params: {
            alignmentForce: 10,
            cohesionForce: 70,
            separationForce: 35,
            speed: 0.5,
            scale: 1.1,
            model: 'butterfly',
            skin: 'spot',
            groupCount: 5,
            skyColorTop: '#f0e68c',
            skyColorBottom: '#dda0dd'
        }
    },
    {
        name: 'Jellyfish Drift',
        params: {
            alignmentForce: 20,
            cohesionForce: 30,
            separationForce: 40,
            speed: 0.3,
            scale: 1.5,
            model: 'jellyfish',
            skin: 'shimmer',
            groupCount: 3,
            skyColorTop: '#e0ffff',
            skyColorBottom: '#40e0d0'
        }
    }
];

const defaultParams: Params={
    //FORCES
    alignmentForce: 0,
    cohesionForce: 0,
    separationForce: 0,
    //DISTANCES
    separationDistance: BOUNDS_HALF/2,
    alignmentDistance: BOUNDS_HALF/4,
    cohesionDistance: BOUNDS_HALF/2,

    speed: 0,
    scale: 1.0,
    particleCount: 2048,
    model: 'fish',
    skin: 'nothing',
    //GROUPS
    groupCount: 2,
    groupColors: [],
    //SKY
    skyColorTop: '#000000',
    skyColorBottom: '#000000',

    //CAMERA
    cameraAutoRotate: false,
    cameraRotationSpeed: 0.5,

    //HIDDEN
    animationSpeed: 30.0,
    boundsHalf: BOUNDS_HALF,
    attractionCameraDistance: BOUNDS_HALF,
    attractionForce: 0,
    attractionDistance: BOUNDS_HALF,
    showAttractionZone: false,
};

const params: Params=JSON.parse(JSON.stringify(defaultParams));

//SETUP
let WIDTH=Math.round(Math.sqrt(params.particleCount));
let PARTICLES_COUNT=WIDTH*WIDTH;

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
let isGuiVisible: boolean=true;


let attractionAxes: THREE.Group;
let attractionCircle: THREE.Mesh;
let mouse=new THREE.Vector2();
let isAttracting=false;
let isRepulsing=false;
let attractionLabel: HTMLElement;


//PRESET SYSTEM
function loadCustomPresets(): Preset[] {
    const saved=localStorage.getItem('boid-custom-presets');
    return saved? JSON.parse(saved):[];
}

function saveCustomPresets(presets: Preset[]) {
    localStorage.setItem('boid-custom-presets',JSON.stringify(presets));
}

function applyPreset(preset: Preset) {
    //APPLY PARAMS
    Object.assign(params,preset.params);

    //UPDATE UNIFORMS
    if(velocityUniforms) {
        velocityUniforms['alignmentForce'].value=(params.alignmentForce/100)*MAX_ALIGNMENT_FORCE;
        velocityUniforms['cohesionForce'].value=(params.cohesionForce/100)*MAX_COHESION_FORCE;
        velocityUniforms['separationForce'].value=(params.separationForce/100)*MAX_SEPARATION_FORCE;
        velocityUniforms['separationDistance'].value=params.separationDistance;
        velocityUniforms['alignmentDistance'].value=params.alignmentDistance;
        velocityUniforms['cohesionDistance'].value=params.cohesionDistance;
        velocityUniforms['speed'].value=params.speed;
        velocityUniforms['groupCount'].value=params.groupCount;
        velocityUniforms['boundsHalf'].value=params.boundsHalf;
    }

    //UPDATE VISUALS
    if(preset.params.model) {
        changeModel(preset.params.model);
    }
    if(preset.params.scale!==undefined&&boidsMesh&&boidsMesh.material&&boidsMesh.material.uniforms) {
        boidsMesh.material.uniforms.scale.value=preset.params.scale/7.0;
    }
    updateColorSystem();
    updateGroupControls();
    updateSkyColors();
    UpdateGUI();

    console.log(`Applied preset: ${preset.name}`);
}

function createPresetInterface() {
    const predefinedContainer=document.getElementById('predefined-presets')!;
    const customContainer=document.getElementById('custom-presets')!;
    const saveBtn=document.getElementById('save-preset-btn')!;
    const nameInput=document.getElementById('preset-name-input')! as HTMLInputElement;

    const predefinedTitle=document.querySelector('#preset-panel .lil-gui:nth-child(1) .title')! as HTMLButtonElement;
    const customTitle=document.querySelector('#preset-panel .lil-gui:nth-child(2) .title')! as HTMLButtonElement;

    predefinedTitle.addEventListener('click',() => {
        const isExpanded=predefinedTitle.getAttribute('aria-expanded')==='true';
        predefinedTitle.setAttribute('aria-expanded',(!isExpanded).toString());
        predefinedContainer.classList.toggle('collapsed',isExpanded);
    });

    customTitle.addEventListener('click',() => {
        const isExpanded=customTitle.getAttribute('aria-expanded')==='true';
        customTitle.setAttribute('aria-expanded',(!isExpanded).toString());
        const customChildren=customTitle.nextElementSibling as HTMLElement;
        customChildren.classList.toggle('collapsed',isExpanded);
    });

    //PREDEFINED
    predefinedPresets.forEach(preset => {
        const item=document.createElement('div');
        item.className='preset-item predefined-preset';
        item.innerHTML=`
            <div class="name">${preset.name}</div>
            <button class="preset-apply">Apply</button>
        `;
        item.querySelector('.preset-apply')!.addEventListener('click',() => applyPreset(preset));
        predefinedContainer.appendChild(item);
    });

    //CUSTOM PRESETS
    function updateCustomPresets() {
        customContainer.innerHTML='';
        const customPresets=loadCustomPresets();

        customPresets.forEach((preset,index) => {
            const item=document.createElement('div');
            item.className='preset-item custom-preset';
            item.innerHTML=`
                <div class="name">${preset.name}</div>
                <div class="preset-buttons">
                    <button class="preset-apply">Apply</button>
                    <div class="preset-actions">
                        <button class="preset-edit"></button>
                        <button class="preset-delete"></button>
                    </div>
                </div>
            `;

            item.querySelector('.preset-apply')!.addEventListener('click',() => applyPreset(preset));

            const editBtn=item.querySelector('.preset-edit')! as HTMLElement;
            const deleteBtn=item.querySelector('.preset-delete')! as HTMLElement;

            editBtn.innerHTML='<i data-lucide="copy"></i>';
            deleteBtn.innerHTML='<i data-lucide="trash-2"></i>';

            editBtn.addEventListener('click',(e) => {
                e.stopPropagation();
                editPreset(preset,index);
            });
            deleteBtn.addEventListener('click',(e) => {
                e.stopPropagation();
                customPresets.splice(index,1);
                saveCustomPresets(customPresets);
                updateCustomPresets();
            });

            customContainer.appendChild(item);
        });

        createIcons({ icons: { Copy,Trash2 } });
    }

    //SAVE PRESET
    saveBtn.addEventListener('click',() => {
        const name=nameInput.value.trim();
        if(!name) return;

        const customPresets=loadCustomPresets();
        const newPreset: Preset={
            name,
            params: {
                alignmentForce: params.alignmentForce,
                cohesionForce: params.cohesionForce,
                separationForce: params.separationForce,
                separationDistance: params.separationDistance,
                alignmentDistance: params.alignmentDistance,
                cohesionDistance: params.cohesionDistance,
                speed: params.speed,
                scale: params.scale,
                model: params.model,
                skin: params.skin,
                groupCount: params.groupCount,
                groupColors: [...params.groupColors],
                skyColorTop: params.skyColorTop,
                skyColorBottom: params.skyColorBottom
            }
        };

        customPresets.push(newPreset);
        saveCustomPresets(customPresets);
        updateCustomPresets();
        nameInput.value='';
    });

    updateCustomPresets();
    createIcons({ icons: { Copy,Trash2 } });
}

function editPreset(preset: Preset,index: number) {
    preset.params={
        alignmentForce: params.alignmentForce,
        cohesionForce: params.cohesionForce,
        separationForce: params.separationForce,
        separationDistance: params.separationDistance,
        alignmentDistance: params.alignmentDistance,
        cohesionDistance: params.cohesionDistance,
        speed: params.speed,
        animationSpeed: params.animationSpeed,
        scale: params.scale,
        particleCount: params.particleCount,
        model: params.model,
        skin: params.skin,
        groupCount: params.groupCount,
        groupColors: [...params.groupColors],
        skyColorTop: params.skyColorTop,
        skyColorBottom: params.skyColorBottom,
        boundsHalf: params.boundsHalf,
        cameraAutoRotate: params.cameraAutoRotate,
        cameraRotationSpeed: params.cameraRotationSpeed
    };

    const customPresets=loadCustomPresets();
    customPresets[index]=preset;
    saveCustomPresets(customPresets);

    console.log(`Updated preset: ${preset.name}`,preset);
}

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,5000);
const renderer=new THREE.WebGLRenderer();

const controls=new OrbitControls(camera,renderer.domElement);

var stats=new Stats();
stats.dom.style.position='fixed';
stats.dom.style.bottom='0px';
stats.dom.style.left='0px';
stats.dom.style.top='auto';
document.body.appendChild(stats.dom);

const gui=new GUI();


//FORCE LIMITS
const MAX_ALIGNMENT_FORCE=0.25;
const MAX_COHESION_FORCE=0.04;
const MAX_SEPARATION_FORCE=5.0;

//GUI SETUP

//RANDOMIZE
const randomizeFolder=gui.addFolder('Randomize');
randomizeFolder.add({ randomizeAllParameters: randomizeAllParameters },'randomizeAllParameters').name('Randomize Everything');
randomizeFolder.add({ resetToDefaults: resetToDefaults },'resetToDefaults').name('Reset to Defaults');

//SPEED
const speedFolder=gui.addFolder('Speed');

const speedController=speedFolder.add(params,'speed',0.1,5.0,0.1).name('Speed').onChange((value: number) => {
    velocityUniforms['speed'].value=value;
    let newAnimationSpeed=params.animationSpeed*value;
    boidsMesh.material.uniforms.animationSpeed.value=Math.max(newAnimationSpeed,20)
});
//SEPARATION
const separationFolder=gui.addFolder('Separation');
const separationDistanceController=separationFolder.add(params,'separationDistance',0.1,BOUNDS_HALF).name('Distance').onChange((value: number) => { velocityUniforms['separationDistance'].value=value; });
const separationForceController=separationFolder.add(params,'separationForce',0,100,1).name('Force (%)').onChange((value: number) => { velocityUniforms['separationForce'].value=(value/100)*MAX_SEPARATION_FORCE; });
//ALIGNMENT
const alignmentFolder=gui.addFolder('Alignment');
const alignmentDistanceController=alignmentFolder.add(params,'alignmentDistance',1.0,BOUNDS_HALF).name('Distance').onChange((value: number) => { velocityUniforms['alignmentDistance'].value=value; });
const alignmentForceController=alignmentFolder.add(params,'alignmentForce',0,100,1).name('Force (%)').onChange((value: number) => { velocityUniforms['alignmentForce'].value=(value/100)*MAX_ALIGNMENT_FORCE; });
//COHESION
const cohesionFolder=gui.addFolder('Cohesion');
const cohesionDistanceController=cohesionFolder.add(params,'cohesionDistance',1.0,BOUNDS_HALF).name('Distance').onChange((value: number) => { velocityUniforms['cohesionDistance'].value=value; });
const cohesionForceController=cohesionFolder.add(params,'cohesionForce',0,100,1).name('Force (%)').onChange((value: number) => { velocityUniforms['cohesionForce'].value=(value/100)*MAX_COHESION_FORCE; });
//MODELS
const modelFolder=gui.addFolder('Models');
const modelController=modelFolder.add(params,'model',['cone','butterfly','fish','jellyfish']).name('Type').onChange((value: string) => { changeModel(value); });
const scaleController=modelFolder.add(params,'scale',0,2.0).name('Taille').onChange((value: number) => { if(boidsMesh&&boidsMesh.material&&boidsMesh.material.uniforms) { boidsMesh.material.uniforms.scale.value=value/7.0; } });
const particleCountController=modelFolder.add(params,'particleCount',[625,1024,2048,4096,8192,16384]).name('Nombre de boids').onChange((value: number) => { updateParticleCount(value); });

//SKIN
const skinFolder=gui.addFolder('Skin');
const skinController=skinFolder.add(params,'skin',['nothing','spot','shimmer']).name('Pattern').onChange((value: string) => {
    if(boidsMesh&&boidsMesh.material&&boidsMesh.material.uniforms) {
        let skinValue=-1.0;
        if(value==='spot') skinValue=0.0;
        else if(value==='shimmer') skinValue=3.0;
        boidsMesh.material.uniforms.skinType.value=skinValue;
    }
});

//GROUPS
const groupFolder=gui.addFolder('Groups');
const groupCountController=groupFolder.add(params,'groupCount',1,MAX_GROUP_COUNT,1).name('Nombre de groupes')
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
        const control=groupFolder.addColor(params.groupColors,i.toString()).name(`Group ${i+1} Color`).onChange(() => { updateColorSystem(); });
        groupColorControls.push(control);
    }
}

groupFolder.add({ regenerateColors: regenerateColors },'regenerateColors').name('Regenerate Random Colors');


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

function getRandomSkyColors() {
    //BASE HUE
    const baseHue=Math.random();
    const saturation=0.2+Math.random()*0.3;
    const baseLightness=0.5+Math.random()*0.4;

    //TOP COLOR
    const topColor=new THREE.Color().setHSL(baseHue,saturation*0.8,Math.min(baseLightness+0.1,0.95));
    //BOTTOM COLOR
    const bottomHue=(baseHue+(Math.random()-0.5)*0.1)%1; //Close hue variation
    const bottomColor=new THREE.Color().setHSL(bottomHue,saturation,baseLightness-0.1);

    return {
        top: '#'+topColor.getHexString(),
        bottom: '#'+bottomColor.getHexString()
    };
}

function regenerateSkyColors() {
    const newColors=getRandomSkyColors();
    params.skyColorTop=newColors.top;
    params.skyColorBottom=newColors.bottom;
    updateSkyColors();
    UpdateGUI();
}

function randomizeAllParameters() {
    //RANDOMIZE FORCES
    params.alignmentForce=Math.round(Math.random()*100);
    params.cohesionForce=Math.round(Math.random()*100);
    params.separationForce=Math.round(Math.random()*100);

    //RANDOMIZE GROUPS
    params.groupCount=Math.floor(Math.random()*10)+1;

    //RANDOMIZE MODEL
    const models=['cone','butterfly','fish','jellyfish'];
    params.model=models[Math.floor(Math.random()*models.length)];

    //UPDATE UNIFORMS
    if(velocityUniforms) {
        velocityUniforms['alignmentForce'].value=(params.alignmentForce/100)*MAX_ALIGNMENT_FORCE;
        velocityUniforms['cohesionForce'].value=(params.cohesionForce/100)*MAX_COHESION_FORCE;
        velocityUniforms['separationForce'].value=(params.separationForce/100)*MAX_SEPARATION_FORCE;
        velocityUniforms['groupCount'].value=params.groupCount;
    }

    //REGENERATE COLORS
    regenerateColors();
    regenerateSkyColors();

    //CHANGE MODEL
    changeModel(params.model);
    UpdateGUI();
}

function UpdateGUI() {
    separationForceController.updateDisplay();
    alignmentForceController.updateDisplay();
    cohesionForceController.updateDisplay();
    groupCountController.updateDisplay();
    modelController.updateDisplay();
    speedController.updateDisplay();
    separationDistanceController.updateDisplay();
    alignmentDistanceController.updateDisplay();
    cohesionDistanceController.updateDisplay();
    scaleController.updateDisplay();
    particleCountController.updateDisplay();
    skinController.updateDisplay();
    skyTopColorController.updateDisplay();
    skyBottomColorController.updateDisplay();
}

function resetToDefaults() {
    //RESTORE DEFAULTS
    Object.assign(params,JSON.parse(JSON.stringify(defaultParams)));

    //UPDATE UNIFORMS
    if(velocityUniforms) {
        velocityUniforms['alignmentForce'].value=(params.alignmentForce/100)*MAX_ALIGNMENT_FORCE;
        velocityUniforms['cohesionForce'].value=(params.cohesionForce/100)*MAX_COHESION_FORCE;
        velocityUniforms['separationForce'].value=(params.separationForce/100)*MAX_SEPARATION_FORCE;
        velocityUniforms['separationDistance'].value=params.separationDistance;
        velocityUniforms['alignmentDistance'].value=params.alignmentDistance;
        velocityUniforms['cohesionDistance'].value=params.cohesionDistance;
        velocityUniforms['speed'].value=params.speed;
        velocityUniforms['groupCount'].value=params.groupCount;
        velocityUniforms['boundsHalf'].value=params.boundsHalf;
    }

    //RESET COLORS
    params.groupColors=Array.from({ length: MAX_GROUP_COUNT },() => getRandomColor());
    updateColorSystem();
    updateGroupControls();
    updateSkyColors();
    changeModel(params.model);
    UpdateGUI();

    //UPDATE CAMERA
    controls.autoRotate=params.cameraAutoRotate;
    controls.autoRotateSpeed=params.cameraRotationSpeed;

    console.log('Parameters reset to defaults!');
}



//SKY
const skyFolder=gui.addFolder('Sky Sphere');
const skyTopColorController=skyFolder.addColor(params,'skyColorTop').name('Top Color').onChange((_value: string) => { updateSkyColors(); });
const skyBottomColorController=skyFolder.addColor(params,'skyColorBottom').name('Bottom Color').onChange((_value: string) => { updateSkyColors(); });
skyFolder.add({ regenerateSkyColors: regenerateSkyColors },'regenerateSkyColors').name('Randomize Sky Colors');

//BOUNDS
const boundsFolder=gui.addFolder('Bounds');
boundsFolder.add(params,'boundsHalf',10,200).name('Rayon limite').onChange((value: number) => {
    if(velocityUniforms) {
        velocityUniforms['boundsHalf'].value=value;
    }
    //UPDATE SIZE
    if(skyMesh) {
        skyMesh.scale.setScalar(value*0.05);
    }
});

//CAMERA
const cameraFolder=gui.addFolder('Camera');
cameraFolder.add(params,'cameraAutoRotate').name('Rotation automatique').onChange((value: boolean) => {
    controls.autoRotate=value;
});
cameraFolder.add(params,'cameraRotationSpeed',0.1,2.0).name('Speed').onChange((value: number) => {
    controls.autoRotateSpeed=value;
});

//ATTRACTION
const attractionFolder=gui.addFolder('Attraction');
attractionFolder.add(params,'attractionForce',0,100,1).name('Force (%)').onChange((value: number) => {
    if(velocityUniforms) {
        velocityUniforms['attractionForce'].value=value/200;
    }
});
attractionFolder.add(params,'attractionDistance',10,200).name('Distance').onChange((value: number) => {
    if(velocityUniforms) {
        velocityUniforms['attractionDistance'].value=value;
    }
    updateAttractionCircleSize();
});
attractionFolder.add(params,'showAttractionZone').name('Show attraction zone');

function updateAttractionCircleSize() {
    if(attractionCircle) {
        attractionCircle.scale.setScalar(params.attractionDistance/50);
    }
}

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

function onMouseMove(event: MouseEvent) {
    mouse.x=(event.clientX/window.innerWidth)*2-1;
    mouse.y=-(event.clientY/window.innerHeight)*2+1;
}

function onKeyDown(event: KeyboardEvent) {
    if(event.key==='Control') {
        attractionAxes.visible=true;
        attractionCircle.visible=params.showAttractionZone;
        controls.enableZoom=false;
        attractionLabel.style.display='block';
        controls.enabled=false;
    }
}



function onKeyUp(event: KeyboardEvent) {
    if(event.key==='Control') {
        if(!isAttracting&&!isRepulsing) {
            attractionAxes.visible=false;
            attractionCircle.visible=false;
            controls.enableZoom=true;
            attractionLabel.style.display='none';
            controls.enabled=true;
        }
    }
}

function onMouseDown(event: MouseEvent) {
    if(event.ctrlKey) {
        attractionLabel.style.display='block';
    } else {
        isRepulsing=false;
        isAttracting=false;
    }

    if(event.ctrlKey&&event.button===0) {
        isAttracting=true;
        attractionLabel.textContent='ATTRACTION ON';
    } else if(event.ctrlKey&&event.button===2) {
        isRepulsing=true;
        attractionLabel.textContent='REPULSION ON';
    }
}

function onMouseUp(event: MouseEvent) {
    if(event.button===0||event.button===2) {
        controls.enabled=true;
        isAttracting=false;
        isRepulsing=false;
        if(!event.ctrlKey) {
            attractionAxes.visible=false;
        }
        attractionLabel.style.display='none';
    }
}

function toggleFullscreen() {
    if(!document.fullscreenElement) {
        enterFullscreen();
    } else {
        exitFullscreen();
    }
}

function enterFullscreen() {
    const presetPanel=document.getElementById('preset-panel');
    const guiElement=gui.domElement;
    const statsElement=stats.dom;
    document.documentElement.requestFullscreen().catch(err => {
        console.log(`Error attempting to enable fullscreen: ${err.message}`);
    });

    presetPanel!.classList.add('hidden');
    guiElement.classList.add('hidden');
    statsElement.classList.add('hidden');
}

function exitFullscreen() {
    const presetPanel=document.getElementById('preset-panel');
    const guiElement=gui.domElement;
    const statsElement=stats.dom;

    if(document.fullscreenElement) document.exitFullscreen();

    presetPanel!.classList.remove('hidden');
    if(isGuiVisible) {
        guiElement.classList.remove('hidden');
        statsElement.classList.remove('hidden');
        statsElement.classList.remove('hidden');
    }
}



window.addEventListener('resize',onWindowResize);
window.addEventListener('mousemove',onMouseMove);
window.addEventListener('mousedown',onMouseDown);
window.addEventListener('mouseup',onMouseUp);
window.addEventListener('keydown',onKeyDown);
window.addEventListener('keyup',onKeyUp);
window.addEventListener('contextmenu',(e) => e.preventDefault());

function onWheel(event: WheelEvent) {
    if(event.ctrlKey) {
        event.preventDefault();
        const delta=event.deltaY<0? 5:-5;
        params.attractionCameraDistance=Math.max(10,Math.min(300,params.attractionCameraDistance+delta));

    }
}

window.addEventListener('wheel',onWheel,{ passive: false });

renderer.domElement.addEventListener('keydown',(event) => {
    event.preventDefault();
    if(event.key==='f'||event.key==='F') {
        toggleFullscreen();
    }
});

renderer.domElement.tabIndex=0;
document.addEventListener("fullscreenchange",(event) => {
    console.log(document.fullscreenElement);
    if(!document.fullscreenElement) {
        exitFullscreen();
    }
})





function initializeGeometries() {
    sphereGeometry=new THREE.SphereGeometry(3,8,6);
    coneGeometry=new THREE.ConeGeometry(3,8,8);
    coneGeometry.rotateX(Math.PI/2);
    currentGeometry=butterflyGeometry||coneGeometry;
}

function getCurrentModelType(): number {
    if(currentGeometry===coneGeometry) return 1.0;
    if(currentGeometry===butterflyGeometry) return 2.0;
    if(currentGeometry===fishGeometry) return 3.0;
    if(currentGeometry===jellyfishGeometry) return 4.0;
    return 1.0;
}
function getSkinType(): number {
    if(params.skin==="spot") return 0.0;
    if(params.skin==="shimmer") return 3.0;
    return -1.0;
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
            modelType: { value: getCurrentModelType() },
            skinType: { value: getSkinType() }
        },
        vertexShader: boidVertexShader,
        fragmentShader: boidFragmentShader,
        side: THREE.DoubleSide
    });

    const colors=new Float32Array(PARTICLES_COUNT*3);
    geometry.setAttribute("instanceColor",new THREE.InstancedBufferAttribute(colors,3));

    const instancedMesh=new THREE.InstancedMesh(geometry,material,PARTICLES_COUNT);
    instancedMesh.frustumCulled=false;

    //INIT MATRIX
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

    //ADD VARIABLES
    velocityVariable=gpuCompute.addVariable('textureVelocity',velocityFragmentShader,dtVelocity);
    positionVariable=gpuCompute.addVariable('texturePosition',positionFragmentShader,dtPosition);

    //LINK TEXTURES
    gpuCompute.setVariableDependencies(velocityVariable,[positionVariable,velocityVariable]);
    gpuCompute.setVariableDependencies(positionVariable,[positionVariable,velocityVariable]);

    //GET UNIFORMS
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

    velocityUniforms['speed']={ value: params.speed };

    velocityUniforms['texturePosition']={ value: null };
    velocityUniforms['textureWidth']={ value: WIDTH };
    velocityUniforms['boundsHalf']={ value: BOUNDS_HALF };
    velocityUniforms['groupCount']={ value: params.groupCount };
    velocityUniforms['time']={ value: 0.0 };
    velocityUniforms['attractionForce']={ value: params.attractionForce };
    velocityUniforms['attractionPoint']={ value: new THREE.Vector3() };
    velocityUniforms['attractionDistance']={ value: params.attractionDistance };
    velocityUniforms['isAttracting']={ value: false };
    velocityUniforms['isRepulsing']={ value: false };

    const error=gpuCompute.init();
    if(error!==null) { console.error('Erreur GPGPU:',error); }
}
function fillPositionTexture(texture: THREE.DataTexture) {
    const imageData=texture.image.data as Uint8Array;
    for(let p=0,length=imageData.length;p<length;p+=4) {
        const theta=Math.random()*Math.PI*2;
        const phi=Math.acos(2*Math.random()-1);
        const radius=BOUNDS/2;

        imageData[p+0]=radius*Math.sin(phi)*Math.cos(theta); // X
        imageData[p+1]=radius*Math.sin(phi)*Math.sin(theta); // Y
        imageData[p+2]=radius*Math.cos(phi); // Z
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


    //ATTRACTION SPHERE MOUSE FOLLOW
    const vector=new THREE.Vector3(mouse.x,mouse.y,0.5);
    vector.unproject(camera);
    const dir=vector.sub(camera.position).normalize();
    attractionAxes.position.copy(camera.position);
    attractionAxes.position.add(dir.multiplyScalar(params.attractionCameraDistance));

    //UPDATE ATTRACTION CIRCLE POSITION AND ROTATION
    attractionCircle.position.copy(attractionAxes.position);
    attractionCircle.lookAt(camera.position);

    //UPDATE ATTRACTION UNIFORMS
    if(velocityUniforms) {
        velocityUniforms['attractionPoint'].value.copy(attractionAxes.position);
        velocityUniforms['isAttracting'].value=isAttracting;
        velocityUniforms['isRepulsing'].value=isRepulsing;
    }




    const now=performance.now();
    let delta=(now-last)/1000;
    last=now;

    //LIMIT DELTA
    delta=Math.min(delta,0.016);

    positionUniforms['delta'].value=delta;

    if(boidsMesh&&boidsMesh.material&&boidsMesh.material.uniforms) {
        const elapsedTime=clock.getElapsedTime();
        boidsMesh.material.uniforms.time.value=elapsedTime;
        boidsMesh.material.uniforms.texturePosition.value=gpuCompute.getCurrentRenderTarget(positionVariable).texture;
        boidsMesh.material.uniforms.textureVelocity.value=gpuCompute.getCurrentRenderTarget(velocityVariable).texture;
    }

    //UPDATE ATTRACTION CIRCLE ANIMATION
    if(attractionCircle&&attractionCircle.material&&attractionCircle.material.uniforms) {
        attractionCircle.material.uniforms.time.value=clock.getElapsedTime();
    }

    // Update time in velocity shader
    if(velocityUniforms) {
        velocityUniforms['time'].value=clock.getElapsedTime();
    }
    gpuCompute.compute();

    updateSkySphereSize();

    renderer.render(scene,camera);
    stats.end();
}


function updateSkySphereSize() {
    if(skyMesh) {
        const cameraDistance=camera.position.distanceTo(controls.target);
        const dynamicSize=Math.max(cameraDistance*3,BOUNDS*2);
        skyMesh.scale.setScalar(dynamicSize/(BOUNDS*2));
    }
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

function createAttractionAxes() {
    attractionAxes=new THREE.Group();

    const axisLength=5;
    const whiteMaterial=new THREE.MeshBasicMaterial({ color: 0xffffff });

    const cylinderGeometry=new THREE.CylinderGeometry(0.2,0.2,axisLength*2,8);

    const xAxis=new THREE.Mesh(cylinderGeometry,whiteMaterial);
    xAxis.rotation.z=Math.PI/2;
    attractionAxes.add(xAxis);

    const yAxis=new THREE.Mesh(cylinderGeometry,whiteMaterial);
    attractionAxes.add(yAxis);

    const zAxis=new THREE.Mesh(cylinderGeometry,whiteMaterial);
    zAxis.rotation.x=Math.PI/2;
    attractionAxes.add(zAxis);

    attractionAxes.position.set(0,0,0);
    attractionAxes.visible=false;
    scene.add(attractionAxes);

    //CREATE ATTRACTION CIRCLE
    createAttractionCircle();

    attractionLabel=document.createElement('div');
    attractionLabel.textContent='ATTRACTION ON';
    attractionLabel.style.cssText=`
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        background: rgba(0, 0, 0, 0.7);
        padding: 8px 16px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 16px;
        font-weight: bold;
        z-index: 1000;
        display: none;
        pointer-events: none;
    `;
    document.body.appendChild(attractionLabel);
}

function createAttractionCircle() {
    const circleGeometry=new THREE.PlaneGeometry(100,100);
    const circleMaterial=new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: attractionCircleVertexShader,
        fragmentShader: attractionCircleFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    attractionCircle=new THREE.Mesh(circleGeometry,circleMaterial);
    attractionCircle.visible=params.showAttractionZone;
    updateAttractionCircleSize();
    scene.add(attractionCircle);
}


async function init() {
    initializeGeometries();
    createSkySphere();
    createAttractionAxes();

    //INIT COLORS
    params.groupColors=Array.from({ length: MAX_GROUP_COUNT },() => getRandomColor());

    createPresetInterface();

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
        butterflyGeometry=coneGeometry.clone(); //Fallback
        fishGeometry=coneGeometry.clone(); //Fallback
        jellyfishGeometry=coneGeometry.clone(); //Fallback
        currentGeometry=coneGeometry;
    }

    applyPreset(predefinedPresets[0]); //APPLY FIRST PRESET AS DEFAULT
    initComputeRenderer();
    boidsMesh=createBoids();

    updateColorSystem();
    updateGroupControls();

    camera.position.z=BOUNDS;

    //INIT CAMERA
    controls.autoRotate=params.cameraAutoRotate;
    controls.autoRotateSpeed=params.cameraRotationSpeed;
    controls.target.set(0,0,0);

    controls.update();


    renderer.setAnimationLoop(animate);
    console.log('Animation started');
}

(async () => { await init(); })();