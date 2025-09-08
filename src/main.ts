import * as THREE from 'three';
import Stats from 'stats.js';
import GUI from 'lil-gui';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import positionFragmentShader from './shaders/positionFragment.glsl?raw';
import velocityFragmentShader from './shaders/velocityFragment.glsl?raw';
import boidVertexShader from './shaders/boidVertex.glsl?raw';
import boidFragmentShader from './shaders/boidFragment.glsl?raw';
import skyVertexShader from './shaders/skyVertex.glsl?raw';
import skyFragmentShader from './shaders/skyFragment.glsl?raw';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer,AnimationClip } from 'three';

//CONST
let WIDTH=64;
let PARTICLES_COUNT=WIDTH*WIDTH;
const BOUNDS=500;
const BOUNDS_HALF=BOUNDS/2;

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
let butterflyAnimations: AnimationClip[]=[];
let animationMixers: AnimationMixer[]=[];
let clock=new THREE.Clock();
let skyMesh: THREE.Mesh;


const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,5000);
const renderer=new THREE.WebGLRenderer();

const controls=new OrbitControls(camera,renderer.domElement);

var stats=new Stats();
document.body.appendChild(stats.dom);

const gui=new GUI();
// Valeurs maximales pour les forces
const MAX_ALIGNMENT_FORCE=0.25;
const MAX_COHESION_FORCE=0.04;
const MAX_SEPARATION_FORCE=5.0;

const params={
    alignmentForce: 40, // Pourcentage (0-100)
    cohesionForce: 50, // Pourcentage (0-100)
    separationForce: 10, // Pourcentage (0-100)
    minSpeed: 0.5,
    maxSpeed: 2.0,

    separationDistance: BOUNDS_HALF/2,
    alignmentDistance: BOUNDS_HALF/4,
    cohesionDistance: BOUNDS_HALF/2,

    // Paramètres d'animation
    animationSpeed: 30.0,

    // Taille des boids
    scale: 1.0,

    // Nombre de boids
    particleCount: 4096, // 64x64 par défaut

    // Sélection du modèle
    model: 'fish', // 'sphere', 'cone', 'butterfly', 'fish', 'jellyfish'

    // Groupes
    groupCount: 1,
    groupColors: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe'],

    // Sky sphere gradient
    skyColorTop: '#b3d9f2',    // Bleu clair (0.7, 0.85, 0.95)
    skyColorBottom: '#80b3d9', // Bleu plus clair (0.5, 0.7, 0.85)

};

//SPEED
const speedFolder=gui.addFolder('Vitesse');
speedFolder.add(params,'minSpeed',0.0,2.0).name('Min').onChange((value: number) => {
    velocityUniforms['minSpeed'].value=value;
});
speedFolder.add(params,'maxSpeed',0.001,20.0).name('Max').onChange((value: number) => {
    velocityUniforms['maxSpeed'].value=value;
});

//SEPARATION
const separationFolder=gui.addFolder('Séparation');
separationFolder.add(params,'separationDistance',0.1,BOUNDS_HALF)
    .name('Distance')
    .onChange((value: number) => {
        velocityUniforms['separationDistance'].value=value;
    });
separationFolder.add(params,'separationForce',0,100)
    .name('Force (%)')
    .onChange((value: number) => {
        velocityUniforms['separationForce'].value=(value/100)*MAX_SEPARATION_FORCE;
    });

//ALIGNEMENT
const alignmentFolder=gui.addFolder('Alignement');
alignmentFolder.add(params,'alignmentDistance',1.0,BOUNDS_HALF)
    .name('Distance')
    .onChange((value: number) => {
        velocityUniforms['alignmentDistance'].value=value;
    });
alignmentFolder.add(params,'alignmentForce',0,100)
    .name('Force (%)')
    .onChange((value: number) => {
        velocityUniforms['alignmentForce'].value=(value/100)*MAX_ALIGNMENT_FORCE;
    });

//COHÉSION
const cohesionFolder=gui.addFolder('Cohésion');
cohesionFolder.add(params,'cohesionDistance',1.0,BOUNDS_HALF)
    .name('Distance')
    .onChange((value) => {
        velocityUniforms['cohesionDistance'].value=value;
    });
cohesionFolder.add(params,'cohesionForce',0,100)
    .name('Force (%)')
    .onChange((value: number) => {
        velocityUniforms['cohesionForce'].value=(value/100)*MAX_COHESION_FORCE;
    });


//SÉLECTION DU MODÈLE
const modelFolder=gui.addFolder('Modèle');
modelFolder.add(params,'model',['sphere','cone','butterfly','fish','jellyfish'])
    .name('Type')
    .onChange((value: string) => {
        changeModel(value);
    });
modelFolder.add(params,'scale',0,2.0)
    .name('Taille')
    .onChange((value: number) => {
        if(boidsMesh&&boidsMesh.material&&boidsMesh.material.uniforms) {
            boidsMesh.material.uniforms.scale.value=value/7.0;
        }
    });
modelFolder.add(params,'particleCount',[1024,2048,4096,8192,16384])
    .name('Nombre de boids')
    .onChange((value: number) => {
        updateParticleCount(value);
    });

// GROUPES
const groupFolder=gui.addFolder('Groupes');
groupFolder.add(params,'groupCount',1,8,1)
    .name('Nombre de groupes')
    .onChange((value: number) => {
        if(velocityUniforms) {
            velocityUniforms['groupCount'].value = value;
        }
        updateColorSystem();
        updateGroupControls();
    });

// Variables pour les contrôles de couleurs de groupe
let groupColorControls: any[] = [];

function updateGroupControls() {
    // Supprimer les anciens contrôles
    groupColorControls.forEach(control => {
        control.destroy();
    });
    groupColorControls = [];

    // Ajouter les nouveaux contrôles pour chaque groupe
    for(let i = 0; i < params.groupCount; i++) {
        const control = groupFolder.addColor(params.groupColors, i.toString())
            .name(`Couleur groupe ${i+1}`)
            .onChange(() => {
                updateColorSystem();
            });
        groupColorControls.push(control);
    }
}

// Ajouter le bouton régénérer couleurs dans le dossier groupes
groupFolder.add({ 
    regenerateColors: () => {
        // Générer des couleurs aléatoires pour chaque groupe
        for(let i = 0; i < params.groupCount; i++) {
            const hue = Math.random();
            const saturation = 0.6 + Math.random() * 0.4;
            const lightness = 0.5 + Math.random() * 0.3;
            const color = new THREE.Color().setHSL(hue, saturation, lightness);
            params.groupColors[i] = '#' + color.getHexString();
        }
        updateColorSystem();
        updateGroupControls(); // Rafraîchir l'affichage des contrôles
    }
}, 'regenerateColors').name('Régénérer couleurs aléatoires');

// SKY SPHERE
const skyFolder = gui.addFolder('Sky Sphere');
skyFolder.addColor(params, 'skyColorTop')
    .name('Couleur haut')
    .onChange((value: string) => {
        updateSkyColors();
    });
skyFolder.addColor(params, 'skyColorBottom')
    .name('Couleur bas')
    .onChange((value: string) => {
        updateSkyColors();
    });

function updateSkyColors() {
    if (skyMesh && skyMesh.material && skyMesh.material.uniforms) {
        const topColor = new THREE.Color(params.skyColorTop);
        const bottomColor = new THREE.Color(params.skyColorBottom);
        
        skyMesh.material.uniforms.topColor.value = topColor;
        skyMesh.material.uniforms.bottomColor.value = bottomColor;
    }
}



renderer.setSize(window.innerWidth,window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometry=new THREE.BoxGeometry(BOUNDS,BOUNDS,BOUNDS);
const material=new THREE.MeshBasicMaterial({ color: 0xffffff,wireframe: true });
const cube=new THREE.Mesh(geometry,material);
//scene.add(cube);




// Fonction pour initialiser les géométries de base
function initializeGeometries() {
    // Sphere
    sphereGeometry=new THREE.SphereGeometry(3,8,6);

    // Cone  
    coneGeometry=new THREE.ConeGeometry(3,8,8);
    coneGeometry.rotateX(Math.PI/2); // Orienter la pointe vers l'avant (axe Z+)

    // Définir la géométrie initiale
    currentGeometry=butterflyGeometry||coneGeometry;
}

// Fonction pour obtenir le type de modèle actuel
function getCurrentModelType(): number {
    if(currentGeometry===sphereGeometry) return 0.0; // Sphere
    if(currentGeometry===coneGeometry) return 1.0;   // Cone  
    if(currentGeometry===butterflyGeometry) return 2.0; // Butterfly
    if(currentGeometry===fishGeometry) return 3.0; // Fish
    if(currentGeometry===jellyfishGeometry) return 4.0; // Jellyfish
    return 1.0; // default Cone
}



// Fonction pour mettre à jour le nombre de particules
function updateParticleCount(newCount: number) {
    PARTICLES_COUNT=newCount;
    WIDTH=Math.sqrt(PARTICLES_COUNT);

    // Supprimer l'ancien mesh
    if(boidsMesh) {
        scene.remove(boidsMesh);
    }

    // Réinitialiser le système GPU
    initComputeRenderer();
    boidsMesh=createBoids();
    updateColorSystem();
    console.log(`Nombre de boids mis à jour: ${PARTICLES_COUNT} (${WIDTH}x${WIDTH})`);
}

// Fonction pour changer de modèle
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
            newGeometry=butterflyGeometry||coneGeometry; //Fallback
            break;
        case 'fish':
            newGeometry=fishGeometry||coneGeometry; //Fallback
            break;
        case 'jellyfish':
            newGeometry=jellyfishGeometry||coneGeometry; //Fallback
            break;
        default:
            newGeometry=coneGeometry;
    }

    if(boidsMesh&&newGeometry) {
        // Supprimer l'ancien mesh
        scene.remove(boidsMesh);

        // Recréer avec la nouvelle géométrie
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
    
    const boidsPerGroup = Math.floor(PARTICLES_COUNT / params.groupCount);

    for(let groupIndex = 0; groupIndex < params.groupCount; groupIndex++) {
        const startIndex = groupIndex * boidsPerGroup;
        const endIndex = (groupIndex === params.groupCount - 1) ? PARTICLES_COUNT : (groupIndex + 1) * boidsPerGroup;

        // Couleur fixe par groupe avec variations
        const groupColor = new THREE.Color(params.groupColors[groupIndex] || '#ff6b6b');
        const hsl={ h: 0,s: 0,l: 0 };
        groupColor.getHSL(hsl);

        for(let i = startIndex; i < endIndex; i++) {
            const lVariance=(Math.random()-0.25)*0.15;
            const newL=Math.max(0,Math.min(1,hsl.l+lVariance));

            const hVariance=(Math.random()-0.5)*0.15; 
            let newH=hsl.h+hVariance;
            if(newH<0) newH+=1;
            if(newH>1) newH-=1;

            color.setHSL(newH,hsl.s,newL);

            colors[i*3+0]=color.r;
            colors[i*3+1]=color.g;
            colors[i*3+2]=color.b;
            groupIds[i] = groupIndex;
        }
    }

    const geometry=boidsMesh.geometry;
    geometry.setAttribute("instanceColor",new THREE.InstancedBufferAttribute(colors,3));
    geometry.setAttribute("instanceGroupId",new THREE.InstancedBufferAttribute(groupIds,1));
    geometry.attributes.instanceColor.needsUpdate=true;
    geometry.attributes.instanceGroupId.needsUpdate=true;
}

function createBoids() {
    // Utiliser la géométrie actuelle
    const geometry=currentGeometry.clone();

    const material=new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null },
            textureVelocity: { value: null },
            textureWidth: { value: WIDTH },
            time: { value: 0 },
            animationSpeed: { value: params.animationSpeed },
            scale: { value: params.scale/7.0 },
            modelType: { value: getCurrentModelType() } // 0.0=Sphere, 1.0=Cone, 2.0=Butterfly
        },
        vertexShader: boidVertexShader,
        fragmentShader: boidFragmentShader,
        side: THREE.DoubleSide // Afficher les deux côtés (pas de culling backface)
    });

    // Initialiser les couleurs (sera mis à jour par updateColorSystem)
    const colors=new Float32Array(PARTICLES_COUNT*3);
    geometry.setAttribute("instanceColor",new THREE.InstancedBufferAttribute(colors,3));

    const instancedMesh=new THREE.InstancedMesh(geometry,material,PARTICLES_COUNT);
    instancedMesh.frustumCulled=false;
    // Init matrices
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

// Fonction pour finaliser la configuration du papillon
function finalizeButterflySetup(mergedGeometry: THREE.BufferGeometry,gltf: any,resolve: () => void) {
    butterflyGeometry=mergedGeometry;
    console.log('Géométrie fusionnée:',butterflyGeometry);
    console.log('Attributs:',Object.keys(butterflyGeometry.attributes));
    console.log('Vertices count:',butterflyGeometry.attributes.position.count);

    butterflyGeometry.scale(2,2,2);

    // Retourner le papillon pour qu'il avance dans le bon sens
    butterflyGeometry.rotateY(Math.PI); // 180 degrés


    butterflyGeometry.computeBoundingBox();
    const center=butterflyGeometry.boundingBox!.getCenter(new THREE.Vector3());
    butterflyGeometry.translate(-center.x,-center.y,-center.z);

    // Stocker les animations
    if(gltf.animations&&gltf.animations.length>0) {
        butterflyAnimations=gltf.animations;
        console.log(`${gltf.animations.length} animations trouvées:`,butterflyAnimations.map(a => a.name));
    } else {
        console.log('Aucune animation trouvée, on utilisera une animation procédurale');
    }

    resolve();
}

// Nouvelle fonction à ajouter
async function loadButterflyModel(): Promise<void> {
    return new Promise((resolve,reject) => {
        const loader=new GLTFLoader();

        loader.load(
            '/models/butterfly.glb', // Chemin correct pour Vite
            (gltf) => {
                console.log('Modèle chargé:',gltf);

                // Collecter les géométries avec leurs noms
                const leftWingGeometry: THREE.BufferGeometry[]=[];
                const rightWingGeometry: THREE.BufferGeometry[]=[];
                const bodyGeometry: THREE.BufferGeometry[]=[];

                gltf.scene.traverse((child) => {
                    if(child instanceof THREE.Mesh&&child.geometry) {
                        console.log('Mesh trouvé:',child.name,child.geometry);
                        const geom=child.geometry.clone();

                        if(child.name==='LEFT_WING') {
                            leftWingGeometry.push(geom);
                        } else if(child.name==='RIGHT_WING') {
                            rightWingGeometry.push(geom);
                        } else {
                            bodyGeometry.push(geom);
                        }
                    }
                });

                if(leftWingGeometry.length>0||rightWingGeometry.length>0||bodyGeometry.length>0) {
                    console.log(`Géométries trouvées: ${leftWingGeometry.length} aile gauche, ${rightWingGeometry.length} aile droite, ${bodyGeometry.length} corps`);

                    // Créer une géométrie fusionnée avec des attributs pour identifier les parties
                    import('three/addons/utils/BufferGeometryUtils.js').then(({ mergeGeometries }) => {
                        const allGeometries: THREE.BufferGeometry[]=[];
                        const wingTypes: number[]=[]; // 0=corps, 1=aile gauche, 2=aile droite

                        // Ajouter les géométries du corps
                        bodyGeometry.forEach(geom => {
                            allGeometries.push(geom);
                            const vertexCount=geom.attributes.position.count;
                            for(let i=0;i<vertexCount;i++) {
                                wingTypes.push(0); // Corps
                            }
                        });

                        // Ajouter les géométries de l'aile gauche
                        leftWingGeometry.forEach(geom => {
                            allGeometries.push(geom);
                            const vertexCount=geom.attributes.position.count;
                            for(let i=0;i<vertexCount;i++) {
                                wingTypes.push(1); // Aile gauche
                            }
                        });

                        // Ajouter les géométries de l'aile droite
                        rightWingGeometry.forEach(geom => {
                            allGeometries.push(geom);
                            const vertexCount=geom.attributes.position.count;
                            for(let i=0;i<vertexCount;i++) {
                                wingTypes.push(2); // Aile droite
                            }
                        });

                        if(allGeometries.length>0) {
                            const mergedGeometry=mergeGeometries(allGeometries)!;

                            // Ajouter l'attribut wingType à la géométrie
                            mergedGeometry.setAttribute('wingType',new THREE.BufferAttribute(new Float32Array(wingTypes),1));

                            finalizeButterflySetup(mergedGeometry,gltf,resolve);
                        } else {
                            reject(new Error('Aucune géométrie valide trouvée'));
                        }
                    }).catch(reject);
                } else {
                    reject(new Error('Aucune géométrie trouvée dans le modèle'));
                }
            },
            (progress) => {
                console.log('Progression:',(progress.loaded/progress.total*100)+'%');
            },
            (error) => {
                console.error('Erreur de chargement:',error);
                reject(error);
            }
        );
    });
}

async function loadFishModel(): Promise<void> {
    return new Promise((resolve,reject) => {
        const loader=new GLTFLoader();

        loader.load(
            '/models/fish.glb',
            (gltf) => {
                console.log('Modèle fish chargé:',gltf);

                let mergedGeometry: THREE.BufferGeometry|null=null;

                gltf.scene.traverse((child) => {
                    if(child instanceof THREE.Mesh&&child.geometry) {
                        console.log('Fish mesh trouvé:',child.name,child.geometry);
                        const geom=child.geometry.clone();
                        geom.applyMatrix4(child.matrixWorld);

                        if(!mergedGeometry) {
                            mergedGeometry=geom;
                        } else {
                            const tempGeometry=BufferGeometryUtils.mergeGeometries([mergedGeometry,geom]);
                            if(tempGeometry) {
                                mergedGeometry=tempGeometry;
                            }
                        }
                    }
                });

                if(mergedGeometry) {
                    fishGeometry=mergedGeometry;
                    console.log('Géométrie fish fusionnée:',fishGeometry);

                    // Ajustements de taille et orientation
                    fishGeometry.scale(1.5,1.5,1.5);
                    fishGeometry.rotateY(Math.PI); // 180 degrés

                    // Centrer la géométrie
                    fishGeometry.computeBoundingBox();
                    const center=fishGeometry.boundingBox!.getCenter(new THREE.Vector3());
                    fishGeometry.translate(-center.x,-center.y,-center.z);

                    resolve();
                } else {
                    reject(new Error('Aucune géométrie fish trouvée'));
                }
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

        loader.load(
            '/models/jellyfish.glb',
            (gltf) => {
                console.log('Modèle jellyfish chargé:',gltf);

                let mergedGeometry: THREE.BufferGeometry|null=null;

                gltf.scene.traverse((child) => {
                    if(child instanceof THREE.Mesh&&child.geometry) {
                        console.log('Jellyfish mesh trouvé:',child.name,child.geometry);
                        const geom=child.geometry.clone();
                        geom.applyMatrix4(child.matrixWorld);

                        if(!mergedGeometry) {
                            mergedGeometry=geom;
                        } else {
                            const tempGeometry=BufferGeometryUtils.mergeGeometries([mergedGeometry,geom]);
                            if(tempGeometry) {
                                mergedGeometry=tempGeometry;
                            }
                        }
                    }
                });

                if(mergedGeometry) {
                    jellyfishGeometry=mergedGeometry;
                    console.log('Géométrie jellyfish fusionnée:',jellyfishGeometry);

                    // Ajustements de taille et orientation
                    jellyfishGeometry.scale(1.5,1.5,1.5);

                    // Centrer la géométrie
                    jellyfishGeometry.computeBoundingBox();
                    const center=jellyfishGeometry.boundingBox!.getCenter(new THREE.Vector3());
                    jellyfishGeometry.translate(-center.x,-center.y,-center.z);

                    resolve();
                } else {
                    reject(new Error('Aucune géométrie jellyfish trouvée'));
                }
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

    // Calcul du delta time
    const now=performance.now();
    let delta=(now-last)/1000;
    last=now;

    positionUniforms['delta'].value=delta;

    // Mise à jour du temps pour l'animation
    if(boidsMesh&&boidsMesh.material&&boidsMesh.material.uniforms) {
        const elapsedTime=clock.getElapsedTime();
        boidsMesh.material.uniforms.time.value=elapsedTime;

        // Connecter les textures calculées aux boids
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
    // Initialiser les géométries de base d'abord
    initializeGeometries();

    // Créer la sky sphere
    createSkySphere();

    try {
        // Charger les modèles
        await Promise.all([
            loadButterflyModel(),
            loadFishModel(),
            loadJellyfishModel()
        ]);
        console.log('Modèles GLB chargés avec succès');
        currentGeometry=fishGeometry; // Utiliser le poisson par défaut

    } catch(error) {
        console.error('Erreur lors du chargement des modèles:',error);
        console.log('Utilisation du cone par défaut');
        butterflyGeometry=coneGeometry.clone(); // Fallback
        fishGeometry=coneGeometry.clone(); // Fallback
        jellyfishGeometry=coneGeometry.clone(); // Fallback
        currentGeometry=coneGeometry;
    }

    initComputeRenderer();
    boidsMesh=createBoids();
    
    // Générer des couleurs aléatoires au chargement
    for(let i = 0; i < params.groupCount; i++) {
        const hue = Math.random();
        const saturation = 0.6 + Math.random() * 0.4;
        const lightness = 0.5 + Math.random() * 0.3;
        const color = new THREE.Color().setHSL(hue, saturation, lightness);
        params.groupColors[i] = '#' + color.getHexString();
    }
    
    updateColorSystem();
    updateGroupControls(); // Initialiser les contrôles de groupe
    console.log('Boids créés avec succès');

    camera.position.z=BOUNDS;
    controls.update();

    // Démarrer l'animation
    renderer.setAnimationLoop(animate);
    console.log('Animation démarrée');
}

// Appelez init() au lieu de l'ancien code
(async () => {
    await init();
})();