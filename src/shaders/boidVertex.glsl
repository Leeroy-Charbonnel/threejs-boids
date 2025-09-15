uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform float textureWidth;
uniform float time;
uniform float animationSpeed;
uniform float scale;
uniform float modelType;
uniform float skinType;

varying vec3 vColor;
varying float vModelType;
varying float vSkinType;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vOriginalPosition;
varying float vInstanceId;
varying float vTurnDirection;

attribute vec3 instanceColor;
attribute float instanceGroupId;

varying float vGroupId;

void main() {
    float instanceId = float(gl_InstanceID);

    //Limit time jumps to prevent animation breaks when switching windows
    float u = mod(instanceId, textureWidth) / textureWidth;
    float v = floor(instanceId / textureWidth) / textureWidth;
    vec2 uv = vec2(u, v);

    //CALCULATE GROUP ID
    float totalBoids = textureWidth * textureWidth;
    float boidsPerGroup = totalBoids / 10.0; // MAX_GROUP_COUNT
    vGroupId = floor(instanceId / boidsPerGroup);

    vec3 boidPosition = texture2D(texturePosition, uv).xyz;
    vec4 velocityData = texture2D(textureVelocity, uv);
    vec3 velocity = velocityData.xyz;
    vTurnDirection = velocityData.w / 10.0; // Get direction data from alpha channel

    float adjustedScale = scale * (1.0 + ((instanceId / textureWidth) / 24.0));
    vec3 animatedPosition = position * adjustedScale;
    float instancePhaseOffset = instanceId * 0.5;
    
    
    //BUTTERFLY ANIMATION
    if (modelType == 2.0) {
        float baseWingPhase = time * animationSpeed * 0.5 + instancePhaseOffset;
        
        //Body bobbing motion
        float mainFlap = sin(baseWingPhase) * 0.35;
        animatedPosition.y += mainFlap;
        
        //Wing flapping - detect wings based on X position (left/right)
        float distanceFromCenter = abs(animatedPosition.x) / adjustedScale;
        
        if (distanceFromCenter > 0.3) { //Only animate wing parts
            float wingFlap = sin(baseWingPhase * 1.8) * 0.5;
            
            //Wings go up and down
            animatedPosition.y += wingFlap * distanceFromCenter * 0.8;
            
            //Wings rotate slightly - reduced distortion
            float wingRotation = wingFlap * 0.2;
            if (animatedPosition.x < 0.0) wingRotation = -wingRotation; //Mirror for left wing
            
            float cosRot = cos(wingRotation);
            float sinRot = sin(wingRotation);
            
            vec3 tempPos = animatedPosition;
            animatedPosition.y = tempPos.y * cosRot - tempPos.z * sinRot;
            animatedPosition.z = tempPos.y * sinRot + tempPos.z * cosRot;
        }
        
        //Side-to-side flutter for whole body
        float flutter = sin(baseWingPhase * 1.3) * 0.1;
        animatedPosition.x += flutter;
    }

    //FISH ANIMATION
    if (modelType == 3.0) {
        float wavePhase = time * animationSpeed * 0.8 + instancePhaseOffset;

        float normalizedZ = (-animatedPosition.z) / adjustedScale;
        normalizedZ = clamp(normalizedZ, 0.0, 1.0);

        float amplitude = smoothstep(-0.1, 0.1, normalizedZ);
        amplitude = amplitude * amplitude;

        //BASE WIGGLE
        float strength = 1.0;
        float smoothness = 0.3;
        float waveInput = wavePhase + (animatedPosition.z / adjustedScale) * smoothness;
        float wave = sin(waveInput) * (amplitude * strength);

        float smoothWave = smoothstep(-1.0, 1.0, sin(waveInput)) * 2.0 - 1.0;
        smoothWave *= (amplitude * strength);

        animatedPosition.x += smoothWave * adjustedScale;
    }

    
    
    //JELLYFISH ANIMATION
    if (modelType == 4.0) {
        //VERTICAL
        float wavePhase = time * animationSpeed * 0.2 + instancePhaseOffset;

        float radialDistance = length(animatedPosition.xz) / adjustedScale;
        radialDistance = clamp(radialDistance, 0.0, 1.0);

        float zNorm = (animatedPosition.z + adjustedScale) / (2.0 * adjustedScale);
        float zPosition = smoothstep(0.0, 1.0, zNorm);

        //HEAD BOB
        float topMask = smoothstep(-0.2, 0.5, animatedPosition.z / adjustedScale);

        float amplitude = radialDistance * zPosition * 2.0 * topMask;
        float wave = sin(wavePhase + animatedPosition.z / adjustedScale * 0.5) * amplitude;

        animatedPosition.z += wave * adjustedScale;

        //TAILS
        float squigglePhase = time * animationSpeed * 0.6 + instancePhaseOffset;

        float normalizedZ = (-animatedPosition.z) / adjustedScale;
        normalizedZ = clamp(normalizedZ, 0.0, 1.0);

        float tailMask = smoothstep(-4.0, -6.0, animatedPosition.z / adjustedScale);

        amplitude = normalizedZ * normalizedZ * tailMask;

        float strength = 2.0;
        float smoothness = 0.2;
        wave = sin(squigglePhase + (animatedPosition.z / adjustedScale) * smoothness) * (amplitude * strength);

        animatedPosition.x += wave * adjustedScale;

        //BOB
        float bobAmplitude = 5.0 * adjustedScale;
        float bob = sin(wavePhase) * bobAmplitude;
        animatedPosition.z += bob;
    }

if (modelType != 2.0) {


    float normalizedZ = animatedPosition.z / 14.0; //-1 to 1

    float distanceFromTail = clamp((animatedPosition.z + 14.0) / 28.0, 0.0, 1.0);

    float bendAngle = vTurnDirection * distanceFromTail * distanceFromTail * 20.5;

    float cosAngle = cos(bendAngle);
    float sinAngle = sin(bendAngle);

    float newX = animatedPosition.x * cosAngle - animatedPosition.z * sinAngle;
    float newZ = animatedPosition.x * sinAngle + animatedPosition.z * cosAngle;

    animatedPosition.x = newX;
    animatedPosition.z = newZ;



}




    //ORIENT
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
    vSkinType = skinType;
    vWorldPosition = worldPos;
    vNormal = normalize(normalMatrix * normal);
    vLocalPosition = animatedPosition;
    vOriginalPosition = position;
    vInstanceId = instanceId;
}
