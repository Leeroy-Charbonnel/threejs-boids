import * as THREE from 'three';
import Stats from 'stats.js';
import GUI from 'lil-gui';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import positionFragmentShader from './shaders/positionFragment.glsl?raw';
import velocityFragmentShader from './shaders/velocityFragment.glsl?raw';
import boidVertexShader from './shaders/boidVertex.glsl?raw';
import boidFragmentShader from './shaders/boidFragment.glsl?raw';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer,AnimationClip } from 'three';

//CONST
let WIDTH=64;
let PARTICLES_COUNT=WIDTH*WIDTH;
const BOUNDS=300;
const BOUNDS_HALF=BOUNDS/2;

//VARIABLES
let gpuCompute: GPUComputationRenderer;
let positionVariable: any;
let velocityVariable: any;
let positionUniforms: any;
let velocityUniforms: any;
let boidsMesh: THREE.InstancedMesh;

let butterflyGeometry: THREE.BufferGeometry;
let sphereGeometry: THREE.BufferGeometry;
let coneGeometry: THREE.BufferGeometry;
let currentGeometry: THREE.BufferGeometry;
let butterflyAnimations: AnimationClip[]=[];
let animationMixers: AnimationMixer[]=[];
let clock=new THREE.Clock();


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

    separationDistance: BOUNDS_HALF/2,
    alignmentDistance: BOUNDS_HALF/4,
    cohesionDistance: BOUNDS_HALF/2,
    
    // Paramètres d'animation des ailes
    wingSpeed: 20.0,
    wingAmplitude: 0.4,
    
    // Taille des boids
    scale: 1.0,
    
    // Nombre de boids
    particleCount: 4096, // 64x64 par défaut
    
    // Sélection du modèle
    model: 'butterfly' // 'sphere', 'cone', 'butterfly'
};

//SPEED
const speedFolder=gui.addFolder('Vitesse');
speedFolder.add(params,'minSpeed',0.0,2.0).name('Min').onChange((value: number) => {
    velocityUniforms['minSpeed'].value=value;
});
speedFolder.add(params,'maxSpeed',0.0,10.0).name('Max').onChange((value: number) => {
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


//SÉLECTION DU MODÈLE
const modelFolder=gui.addFolder('Modèle');
modelFolder.add(params,'model',['sphere','cone','butterfly'])
    .name('Type')
    .onChange((value: string) => {
        changeModel(value);
    });
modelFolder.add(params,'scale',0.1,3.0)
    .name('Taille')
    .onChange((value: number) => {
        if (boidsMesh && boidsMesh.material && boidsMesh.material.uniforms) {
            boidsMesh.material.uniforms.scale.value = value;
        }
    });
modelFolder.add(params,'particleCount',[1024, 2048, 4096, 8192, 16384])
    .name('Nombre de boids')
    .onChange((value: number) => {
        updateParticleCount(value);
    });



renderer.setSize(window.innerWidth,window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometry=new THREE.BoxGeometry(BOUNDS,BOUNDS,BOUNDS);
const material=new THREE.MeshBasicMaterial({ color: 0xffffff,wireframe: true });
const cube=new THREE.Mesh(geometry,material);
//scene.add(cube);




// Fonction pour initialiser les géométries de base
function initializeGeometries() {
    // Sphere
    sphereGeometry = new THREE.SphereGeometry(3, 8, 6);
    
    // Cone  
    coneGeometry = new THREE.ConeGeometry(3, 8, 8);
    coneGeometry.rotateX(Math.PI / 2); // Orienter la pointe vers l'avant (axe Z+)
    
    // Définir la géométrie initiale
    currentGeometry = butterflyGeometry || coneGeometry;
}

// Fonction pour obtenir le type de modèle actuel
function getCurrentModelType(): number {
    if (currentGeometry === sphereGeometry) return 0.0; // Sphere
    if (currentGeometry === coneGeometry) return 1.0;   // Cone  
    if (currentGeometry === butterflyGeometry) return 2.0; // Butterfly
    return 1.0; // default Cone
}

// Fonction pour obtenir le nom du modèle actuel
function getCurrentModelName(): string {
    if (currentGeometry === sphereGeometry) return "SPHERE";
    if (currentGeometry === coneGeometry) return "CONE";
    if (currentGeometry === butterflyGeometry) return "BUTTERFLY";
    return "CONE"; // default
}

// Fonction pour mettre à jour le nombre de particules
function updateParticleCount(newCount: number) {
    PARTICLES_COUNT = newCount;
    WIDTH = Math.sqrt(PARTICLES_COUNT);
    
    // Supprimer l'ancien mesh
    if (boidsMesh) {
        scene.remove(boidsMesh);
    }
    
    // Réinitialiser le système GPU
    initComputeRenderer();
    boidsMesh = createBoids();
    console.log(`Nombre de boids mis à jour: ${PARTICLES_COUNT} (${WIDTH}x${WIDTH})`);
}

// Fonction pour changer de modèle
function changeModel(modelType: string) {
    let newGeometry: THREE.BufferGeometry;
    
    switch(modelType) {
        case 'sphere':
            newGeometry = sphereGeometry;
            break;
        case 'cone':
            newGeometry = coneGeometry;
            break;
        case 'butterfly':
            newGeometry = butterflyGeometry || coneGeometry; // Fallback si butterfly pas chargé
            break;
        default:
            newGeometry = coneGeometry;
    }
    
    if (boidsMesh && newGeometry) {
        // Supprimer l'ancien mesh
        scene.remove(boidsMesh);
        
        // Recréer avec la nouvelle géométrie
        currentGeometry = newGeometry;
        boidsMesh = createBoids();
    }
}

function createBoids() {
    // Utiliser la géométrie actuelle
    const geometry = currentGeometry.clone();

    const material=new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null },
            textureVelocity: { value: null },
            textureWidth: { value: WIDTH },
            time: { value: 0 },
            wingSpeed: { value: params.wingSpeed },
            wingAmplitude: { value: params.wingAmplitude },
            scale: { value: params.scale },
            modelType: { value: getCurrentModelType() } // 0.0=Sphere, 1.0=Cone, 2.0=Butterfly
        },
        vertexShader: boidVertexShader,
        fragmentShader: boidFragmentShader,
        side: THREE.DoubleSide // Afficher les deux côtés (pas de culling backface)
    });

    // Couleurs pour chaque instance
    const colors=new Float32Array(PARTICLES_COUNT*3);
    const color=new THREE.Color();

    for(let i=0;i<PARTICLES_COUNT;i++) {
        // Couleurs aléatoires sur toute la gamme HSL
        const h=Math.random(); // Teinte complète (0-1)
        const s=0.5+Math.random()*0.5; // Saturation (50-100%)
        const l=0.4+Math.random()*0.4; // Luminosité (40-80%)
        color.setHSL(h,s,l);

        colors[i*3+0]=color.r;
        colors[i*3+1]=color.g;
        colors[i*3+2]=color.b;
    }

    geometry.setAttribute("instanceColor",new THREE.InstancedBufferAttribute(colors,3));

    const instancedMesh=new THREE.InstancedMesh(geometry,material,PARTICLES_COUNT);

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

// Fonction pour finaliser la configuration du papillon
function finalizeButterflySetup(mergedGeometry: THREE.BufferGeometry, gltf: any, resolve: () => void) {
    butterflyGeometry = mergedGeometry;
    console.log('Géométrie fusionnée:', butterflyGeometry);
    console.log('Attributs:', Object.keys(butterflyGeometry.attributes));
    console.log('Vertices count:', butterflyGeometry.attributes.position.count);

    butterflyGeometry.scale(2, 2, 2);

    // Retourner le papillon pour qu'il avance dans le bon sens
    butterflyGeometry.rotateY(Math.PI); // 180 degrés
    

    butterflyGeometry.computeBoundingBox();
    const center = butterflyGeometry.boundingBox!.getCenter(new THREE.Vector3());
    butterflyGeometry.translate(-center.x, -center.y, -center.z);

    // Stocker les animations
    if(gltf.animations && gltf.animations.length > 0) {
        butterflyAnimations = gltf.animations;
        console.log(`${gltf.animations.length} animations trouvées:`, butterflyAnimations.map(a => a.name));
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
                const leftWingGeometry: THREE.BufferGeometry[] = [];
                const rightWingGeometry: THREE.BufferGeometry[] = [];
                const bodyGeometry: THREE.BufferGeometry[] = [];
                
                gltf.scene.traverse((child) => {
                    if(child instanceof THREE.Mesh && child.geometry) {
                        console.log('Mesh trouvé:', child.name, child.geometry);
                        const geom = child.geometry.clone();
                        
                        if(child.name === 'LEFT_WING') {
                            leftWingGeometry.push(geom);
                        } else if(child.name === 'RIGHT_WING') {
                            rightWingGeometry.push(geom);
                        } else {
                            bodyGeometry.push(geom);
                        }
                    }
                });

                if(leftWingGeometry.length > 0 || rightWingGeometry.length > 0 || bodyGeometry.length > 0) {
                    console.log(`Géométries trouvées: ${leftWingGeometry.length} aile gauche, ${rightWingGeometry.length} aile droite, ${bodyGeometry.length} corps`);
                    
                    // Créer une géométrie fusionnée avec des attributs pour identifier les parties
                    import('three/addons/utils/BufferGeometryUtils.js').then(({ mergeGeometries }) => {
                        const allGeometries: THREE.BufferGeometry[] = [];
                        const wingTypes: number[] = []; // 0=corps, 1=aile gauche, 2=aile droite
                        
                        // Ajouter les géométries du corps
                        bodyGeometry.forEach(geom => {
                            allGeometries.push(geom);
                            const vertexCount = geom.attributes.position.count;
                            for(let i = 0; i < vertexCount; i++) {
                                wingTypes.push(0); // Corps
                            }
                        });
                        
                        // Ajouter les géométries de l'aile gauche
                        leftWingGeometry.forEach(geom => {
                            allGeometries.push(geom);
                            const vertexCount = geom.attributes.position.count;
                            for(let i = 0; i < vertexCount; i++) {
                                wingTypes.push(1); // Aile gauche
                            }
                        });
                        
                        // Ajouter les géométries de l'aile droite
                        rightWingGeometry.forEach(geom => {
                            allGeometries.push(geom);
                            const vertexCount = geom.attributes.position.count;
                            for(let i = 0; i < vertexCount; i++) {
                                wingTypes.push(2); // Aile droite
                            }
                        });
                        
                        if(allGeometries.length > 0) {
                            const mergedGeometry = mergeGeometries(allGeometries)!;
                            
                            // Ajouter l'attribut wingType à la géométrie
                            mergedGeometry.setAttribute('wingType', new THREE.BufferAttribute(new Float32Array(wingTypes), 1));
                            
                            finalizeButterflySetup(mergedGeometry, gltf, resolve);
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
    if (boidsMesh && boidsMesh.material && boidsMesh.material.uniforms) {
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


async function init() {
    // Initialiser les géométries de base d'abord
    initializeGeometries();
    
    try {
        // Charger le modèle papillon
        await loadButterflyModel();
        console.log('Modèle GLB chargé avec succès');
        currentGeometry = butterflyGeometry; // Utiliser le papillon par défaut
        
    } catch (error) {
        console.error('Erreur lors du chargement du papillon:', error);
        console.log('Utilisation du cone par défaut');
        butterflyGeometry = coneGeometry.clone(); // Fallback
        currentGeometry = coneGeometry;
    }

    initComputeRenderer();
    boidsMesh = createBoids();
    console.log('Boids créés avec succès');

    camera.position.z = BOUNDS_HALF * 4;
    controls.update();

    // Démarrer l'animation
    renderer.setAnimationLoop(animate);
    console.log('Animation démarrée');
}

// Appelez init() au lieu de l'ancien code
init();