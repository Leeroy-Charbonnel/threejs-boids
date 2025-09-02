import * as THREE from 'three';
import Stats from 'stats.js';
import GUI from 'lil-gui';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import positionFragmentShader from './shaders/positionFragment.glsl?raw';
import velocityFragmentShader from './shaders/velocityFragment.glsl?raw';
import boidVertexShader from './shaders/boidVertex.glsl?raw';
import boidFragmentShader from './shaders/boidFragment.glsl?raw';

//CONST
const WIDTH=16;
const PARTICLES_COUNT=WIDTH*WIDTH;
const BOUNDS=100;
const BOUNDS_HALF=BOUNDS/2;

//VARIABLES
let gpuCompute: GPUComputationRenderer;
let positionVariable: any;
let velocityVariable: any;
let positionUniforms: any;
let velocityUniforms: any;
let boidsMesh: THREE.InstancedMesh;


const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
const renderer=new THREE.WebGLRenderer();

const controls=new OrbitControls(camera,renderer.domElement);

var stats=new Stats();
document.body.appendChild(stats.dom);

const gui=new GUI();
gui.add(document,'title');


renderer.setSize(window.innerWidth,window.innerHeight);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

const geometry=new THREE.BoxGeometry(1,1,1);
const material=new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube=new THREE.Mesh(geometry,material);
scene.add(cube);


initComputeRenderer();
boidsMesh=createBoids();

camera.position.z=10;
controls.update();

function createBoids() {
    const coneGeometry=new THREE.ConeGeometry(1,3,6);
    coneGeometry.rotateX(Math.PI/2);

    // Ajouter l'attribut instanceId pour chaque vertex
    const vertexCount=coneGeometry.attributes.position.count;
    const instanceIds=new Float32Array(vertexCount);

    // Chaque vertex du cône aura le même instanceId (sera différencié par gl_InstanceID)
    for(let i=0;i<vertexCount;i++) {
        instanceIds[i]=0; // Sera remplacé par gl_InstanceID dans le shader
    }

    coneGeometry.setAttribute('instanceId',new THREE.InstancedBufferAttribute(instanceIds,1));

    // Shader material personnalisé
   const material = new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null },
            textureWidth: { value: WIDTH } // AJOUTER CETTE LIGNE
        },
        vertexShader: boidVertexShader,
        fragmentShader: boidFragmentShader
    });

    // Créer l'InstancedMesh avec le shader personnalisé
    const instancedMesh=new THREE.InstancedMesh(coneGeometry,material,PARTICLES_COUNT);

    // Initialiser les matrices (seront ignorées par notre shader)
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

    //Init texture
    fillPositionTexture(dtPosition);
    fillVelocityTexture(dtVelocity);

    //Add variables to compute
    velocityVariable=gpuCompute.addVariable('textureVelocity',velocityFragmentShader,dtVelocity);
    positionVariable=gpuCompute.addVariable('texturePosition',positionFragmentShader,dtPosition);

    //Link created textures to vars
    gpuCompute.setVariableDependencies(velocityVariable,[positionVariable,velocityVariable]);
    gpuCompute.setVariableDependencies(positionVariable,[positionVariable,velocityVariable]);

    //Get uniform to edit them
    positionUniforms=positionVariable.material.uniforms;
    velocityUniforms=velocityVariable.material.uniforms;

    positionUniforms['time']={ value: 0.0 };
    positionUniforms['delta']={ value: 0.0 };
    velocityUniforms['time']={ value: 1.0 };
    velocityUniforms['delta']={ value: 0.0 };
    velocityUniforms['boundsHalf']={ value: BOUNDS_HALF };

    const error=gpuCompute.init();
    if(error!==null) {
        console.error('Erreur GPGPU:',error);
    }
}
function fillPositionTexture(texture: THREE.DataTexture) {
    const imageData=texture.image.data;
    for(let p=0,length=imageData.length;p<length;p+=4) {
        imageData[p+0]=0; //RED = X POS
        imageData[p+1]=0; //GREEN = Y POS
        imageData[p+2]=0; //BLUE = Z POS
        imageData[p+3]=1; //ALPHA = FREE
    }
}

function fillVelocityTexture(texture: THREE.DataTexture) {
    const imageData=texture.image.data;
    for(let p=0,length=imageData.length;p<length;p+=4) {
        const x=Math.random()-0.5;
        const y=Math.random()-0.5;
        const z=Math.random()-0.5;

        imageData[p+0]=x * 0.1; //RED = X VELOCITY
        imageData[p+1]=y * 0.1; //GREEN = Y VELOCITY
        imageData[p+2]=z * 0.1; //BLUE = Z VELOCITY
        imageData[p+3]=1;      //ALPHA = FREE
    }
}



var last=0;

function animate() {
    controls.update();
    stats.begin();

    // Calcul du delta time
    const now=performance.now();
    let delta=(now-last)/1000;
    last=now;

    positionUniforms['time'].value=now;
    positionUniforms['delta'].value=delta;
    velocityUniforms['time'].value=now;
    velocityUniforms['delta'].value=delta;

    gpuCompute.compute();

    // NOUVEAU : Connecter la texture calculée aux boids
    boidsMesh.material.uniforms.texturePosition.value=gpuCompute.getCurrentRenderTarget(positionVariable).texture;

    renderer.render(scene,camera);
    stats.end();
}