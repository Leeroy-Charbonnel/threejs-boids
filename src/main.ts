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
const WIDTH=192;
const PARTICLES_COUNT=WIDTH*WIDTH;
const BOUNDS=500;
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
const params={
    alignmentForce: 0.1,
    cohesionForce: 0.02,
    separationForce: 0.2,
    minSpeed: 0.5,
    maxSpeed: 2.0,


    separationDistance: BOUNDS_HALF / 2,
    alignmentDistance: BOUNDS_HALF / 4,
    cohesionDistance: BOUNDS_HALF/2,
};

//SPEED
const speedFolder=gui.addFolder('Vitesse');
speedFolder.add(params,'minSpeed',0.1,2.0).name('Min').onChange((value: number) => {
    velocityUniforms['minSpeed'].value=value;
});
speedFolder.add(params,'maxSpeed',1.0,10.0).name('Max').onChange((value: number) => {
    velocityUniforms['maxSpeed'].value=value;
});

//SEPARATION
const separationFolder=gui.addFolder('Séparation');
separationFolder.add(params,'separationDistance',0.1,BOUNDS_HALF)
    .name('Distance')
    .onChange((value: number) => {
        velocityUniforms['separationDistance'].value=value;
    });
separationFolder.add(params,'separationForce',0,2.0)
    .name('Force')
    .onChange((value: number) => {
        velocityUniforms['separationForce'].value=value;
    });

//ALIGNEMENT
const alignmentFolder=gui.addFolder('Alignement');
alignmentFolder.add(params,'alignmentDistance',1.0,BOUNDS_HALF)
    .name('Distance')
    .onChange((value: number) => {
        velocityUniforms['alignmentDistance'].value=value;
    });
alignmentFolder.add(params,'alignmentForce',0,0.25)
    .name('Force')
    .onChange((value: number) => {
        velocityUniforms['alignmentForce'].value=value;
    });

//COHÉSION
const cohesionFolder=gui.addFolder('Cohésion');
cohesionFolder.add(params,'cohesionDistance',1.0,BOUNDS_HALF)
    .name('Distance')
    .onChange((value) => {
        velocityUniforms['cohesionDistance'].value=value;
    });
cohesionFolder.add(params,'cohesionForce',0,0.25)
    .name('Force')
    .onChange((value) => {
        velocityUniforms['cohesionForce'].value=value;
    });



renderer.setSize(window.innerWidth,window.innerHeight);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

const geometry=new THREE.BoxGeometry(BOUNDS,BOUNDS,BOUNDS);
const material=new THREE.MeshBasicMaterial({ color: 0xffffff,wireframe: true });
const cube=new THREE.Mesh(geometry,material);
//scene.add(cube);


initComputeRenderer();
boidsMesh=createBoids();

camera.position.z=BOUNDS_HALF*4;
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


    velocityUniforms['alignmentDistance']={ value: params.alignmentDistance };
    velocityUniforms['alignmentForce']={ value: params.alignmentForce };

    velocityUniforms['cohesionDistance']={ value: params.cohesionDistance };
    velocityUniforms['cohesionForce']={ value: params.cohesionForce };

    velocityUniforms['separationDistance']={ value: params.separationDistance };
    velocityUniforms['separationForce']={ value: params.separationForce };


    velocityUniforms['minSpeed']={ value: params.minSpeed };
    velocityUniforms['maxSpeed']={ value: params.maxSpeed };

    velocityUniforms['texturePosition']={ value: null };
    velocityUniforms['textureWidth']={ value: WIDTH };


    const error=gpuCompute.init();
    if(error!==null) {
        console.error('Erreur GPGPU:',error);
    }
}
function fillPositionTexture(texture: THREE.DataTexture) {
    const imageData=texture.image.data;
    for(let p=0,length=imageData.length;p<length;p+=4) {
        imageData[p+0]=(Math.random()-0.5)*BOUNDS; //RED = X POS
        imageData[p+1]=(Math.random()-0.5)*BOUNDS; //GREEN = Y POS
        imageData[p+2]=(Math.random()-0.5)*BOUNDS; //BLUE = Z POS
        imageData[p+3]=1; //ALPHA = FREE
    }
}

function fillVelocityTexture(texture: THREE.DataTexture) {
    const imageData=texture.image.data;
    for(let p=0,length=imageData.length;p<length;p+=4) {
        imageData[p+0]=Math.random()-0.5; //RED = X VELOCITY
        imageData[p+1]=Math.random()-0.5; //GREEN = Y VELOCITY
        imageData[p+2]=Math.random()-0.5; //BLUE = Z VELOCITY
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