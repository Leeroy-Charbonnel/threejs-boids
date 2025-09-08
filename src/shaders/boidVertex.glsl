uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform float textureWidth;
uniform float time;
uniform float animationSpeed;
uniform float scale;
uniform float modelType; // 0.0=Sphere, 1.0=Cone, 2.0=Butterfly

varying vec3 vColor;
varying float vModelType;
varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vOriginalPosition;
varying float vInstanceId;

attribute vec3 instanceColor;

void main() {
    float instanceId = float(gl_InstanceID);

    float u = mod(instanceId, textureWidth) / textureWidth;
    float v = floor(instanceId / textureWidth) / textureWidth;
    vec2 uv = vec2(u, v);

    vec3 boidPosition = texture2D(texturePosition, uv).xyz;
    vec4 velocityData = texture2D(textureVelocity, uv);
    vec3 velocity = velocityData.xyz;

    float adjustedScale = scale * (1.0 + ((instanceId / textureWidth) / 24.0));
    vec3 animatedPosition = position * adjustedScale;
    float instancePhaseOffset = instanceId * 0.5;
    
    
    //BUTTERFLY ANIMATION
    if (modelType == 2.0) {
        float baseWingPhase = time * animationSpeed * 0.5 + instancePhaseOffset;
        
        // Body bobbing motion
        float mainFlap = sin(baseWingPhase) * 0.35;
        animatedPosition.y += mainFlap;
        
        // Wing flapping - detect wings based on X position (left/right)
        float distanceFromCenter = abs(animatedPosition.x) / adjustedScale;
        
        if (distanceFromCenter > 0.3) { // Only animate wing parts
            float wingFlap = sin(baseWingPhase * 1.8) * 0.5;
            
            // Wings go up and down
            animatedPosition.y += wingFlap * distanceFromCenter * 0.8;
            
            // Wings rotate slightly - reduced distortion
            float wingRotation = wingFlap * 0.2;
            if (animatedPosition.x < 0.0) wingRotation = -wingRotation; // Mirror for left wing
            
            float cosRot = cos(wingRotation);
            float sinRot = sin(wingRotation);
            
            vec3 tempPos = animatedPosition;
            animatedPosition.y = tempPos.y * cosRot - tempPos.z * sinRot;
            animatedPosition.z = tempPos.y * sinRot + tempPos.z * cosRot;
        }
        
        // Side-to-side flutter for whole body
        float flutter = sin(baseWingPhase * 1.3) * 0.1;
        animatedPosition.x += flutter;
    }

    //FISH ANIMATION
    if (modelType == 3.0) { 
        float wavePhase = time * animationSpeed * 0.8 + instancePhaseOffset;

        float normalizedZ = (-animatedPosition.z) / adjustedScale;
        normalizedZ = clamp(normalizedZ, 0.0, 1.0);

        float amplitude = normalizedZ * normalizedZ;

        //BASE WIGGLE
        float strength = 2.0;
        float smoothness = 0.2; 
        float wave = sin(wavePhase + (animatedPosition.z / adjustedScale) * smoothness) * (amplitude * strength);

        animatedPosition.x += wave * adjustedScale;
    }
    
    
    //JELLYFISH ANIMATION
    if (modelType == 4.0) {
        //VERTICAL
        float wavePhase = time * animationSpeed * 0.4 + instancePhaseOffset;

        float radialDistance = length(animatedPosition.xz) / adjustedScale;
        radialDistance = clamp(radialDistance, 0.0, 1.0);

        float zNorm = (animatedPosition.z + adjustedScale) / (2.0 * adjustedScale);
        float zPosition = smoothstep(0.0, 1.0, zNorm);

        float amplitude = radialDistance * zPosition * 2.0;
        float wave = sin(wavePhase + animatedPosition.z / adjustedScale * 0.5) * amplitude;

        animatedPosition.z += wave * adjustedScale;
        
        //HORIZONTAL MOVEMENT
        float squigglePhase = time * animationSpeed * 0.6 + instancePhaseOffset;

        float normalizedZ = (-animatedPosition.z) / adjustedScale;
        normalizedZ = clamp(normalizedZ, 0.0, 1.0);

        amplitude = normalizedZ * normalizedZ;

        float strength = 2.0;
        float smoothness = 0.2; 
        wave = sin(squigglePhase + (animatedPosition.z / adjustedScale) * smoothness) * (amplitude * strength);

        animatedPosition.x += wave * adjustedScale;

        //BOBBING
        float bobAmplitude = 5.0 * adjustedScale; // ajuste l’intensité du bobbing
        float bob = sin(wavePhase) * bobAmplitude;
        animatedPosition.z += bob;
    }



    //ORIENTATION
    vec3 worldPos;
    if (modelType == 0.0) {
        worldPos = animatedPosition + boidPosition;
    } else {
        vec3 forward = normalize(velocity);
        vec3 up      = vec3(0.0, 1.0, 0.0);
        vec3 right   = normalize(cross(forward, up));
        up           = normalize(cross(right, forward));

        mat3 rotationMatrix = mat3(right, up, forward);
        vec3 rotatedPos = rotationMatrix * animatedPosition;

        worldPos = rotatedPos + boidPosition;
    }

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);

    vColor = instanceColor;
    vModelType = modelType;
    vNormal = normalize(normalMatrix * normal);
    vLocalPosition = animatedPosition;
    vOriginalPosition = position;
    vInstanceId = instanceId;
}
