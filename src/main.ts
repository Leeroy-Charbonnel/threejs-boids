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
const WIDTH=10;
const PARTICLES_COUNT=WIDTH*WIDTH;
const BOUNDS=50;
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

const geometry=new THREE.BoxGeometry(BOUNDS,BOUNDS,BOUNDS);
const material=new THREE.MeshBasicMaterial({ color: 0xffffff,wireframe: true });
const cube=new THREE.Mesh(geometry,material);
scene.add(cube);


initComputeRenderer();
boidsMesh=createBoids();

camera.position.z=10;
controls.update();

function createBoids() {
    const coneGeometry=new THREE.ConeGeometry(1,3,6);
    coneGeometry.rotateX(Math.PI/2);

    const material=new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null },
            textureVelocity: { value: null },
            textureWidth: { value: WIDTH }
        },
        vertexShader: boidVertexShader,
        fragmentShader: boidFragmentShader
    });
    const colors=new Float32Array(PARTICLES_COUNT*3);
    const color=new THREE.Color();

    for(let i=0;i<PARTICLES_COUNT;i++) {
        const h=Math.random();
        color.setHSL(h,0.5,0.5);

        colors[i*3+0]=color.r;
        colors[i*3+1]=color.g;
        colors[i*3+2]=color.b;
    }

    coneGeometry.setAttribute("instanceColor",new THREE.InstancedBufferAttribute(colors,3));

    const instancedMesh=new THREE.InstancedMesh(coneGeometry,material,PARTICLES_COUNT);

    //Init matrices, will be overwritten in shader
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

    positionUniforms['delta']={ value: 0.0 };
    positionUniforms['boundsHalf']={ value: BOUNDS_HALF };

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

        imageData[p+0]=x*0.5; //RED = X VELOCITY
        imageData[p+1]=y*0.5; //GREEN = Y VELOCITY
        imageData[p+2]=z*0.5; //BLUE = Z VELOCITY
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

    positionUniforms['delta'].value=delta;

    gpuCompute.compute();

    // NOUVEAU : Connecter la texture calculée aux boids
    boidsMesh.material.uniforms.texturePosition.value=gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    boidsMesh.material.uniforms.textureVelocity.value=gpuCompute.getCurrentRenderTarget(velocityVariable).texture;

    renderer.render(scene,camera);
    stats.end();
}