uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform float textureWidth;
uniform float time;
uniform float wingSpeed;
uniform float wingAmplitude;
uniform float scale;
uniform float modelType; // 0.0=Sphere, 1.0=Cone, 2.0=Butterfly

varying vec3 vColor;

attribute vec3 instanceColor;
attribute float wingType; // 0=corps, 1=aile gauche, 2=aile droite

void main() {
    float instanceId = float(gl_InstanceID);

    float u = mod(instanceId, textureWidth) / textureWidth;
    float v = floor(instanceId / textureWidth) / textureWidth;
    vec2 uv = vec2(u, v);

    vec3 boidPosition = texture2D(texturePosition, uv).xyz;
    vec3 velocity     = texture2D(textureVelocity, uv).xyz;

    vec3 animatedPosition = position * scale;

    // === BUTTERFLY ANIMATION ===
    if (modelType == 2.0) {
        if (wingType > 0.5) { // si aile gauche/droite
            float instancePhaseOffset = instanceId * 0.1;
            float baseWingPhase = time * wingSpeed + instancePhaseOffset;

            // Les deux ailes battent en même temps → pas de phase opposée
            float finalPhase = baseWingPhase;

            // battement principal
            float mainFlap = sin(finalPhase) * wingAmplitude;
            // mouvement secondaire
            float secondaryFlap = sin(finalPhase * 1.5) * wingAmplitude * 0.8;

            animatedPosition.y += mainFlap;
            animatedPosition.x += secondaryFlap * 0.5;

            // === ROTATION DES AILES ===
            float wingRotation = mainFlap * 0.8;

            // inverser la rotation pour l’aile droite (symétrie)
            if (abs(wingType - 2.0) < 0.1) {
                wingRotation = -wingRotation;
            }

            float cosRot = cos(wingRotation);
            float sinRot = sin(wingRotation);

            vec3 tempPos = animatedPosition;
            // rotation autour de Z
            animatedPosition.x = tempPos.x * cosRot - tempPos.y * sinRot;
            animatedPosition.y = tempPos.x * sinRot + tempPos.y * cosRot;
        }
    }

    // === ORIENTATION DU BOID ===
    vec3 worldPos;
    if (modelType == 0.0) {
        // sphères = pas de rotation
        worldPos = animatedPosition + boidPosition;
    } else {
        // cônes & papillons orientés selon la vitesse
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
}
