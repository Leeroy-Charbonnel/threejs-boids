// Dans boidVertex.glsl, remplacez le contenu par :
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
    
    // Get coord on texture for current instance
    float u = mod(instanceId, textureWidth) / textureWidth;
    float v = floor(instanceId / textureWidth) / textureWidth;
    vec2 uv = vec2(u, v);
    
    // Read texture for instances
    vec3 boidPosition = texture2D(texturePosition, uv).xyz;
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    
    // Animation selon le type de modèle
    vec3 animatedPosition = position * scale;
    
    // Animation des ailes uniquement pour les papillons (modelType == 2.0)
    if (abs(modelType - 2.0) < 0.1) {
        // Animation basée sur le type d'aile (wingType)
        if (wingType > 0.5) { // Si c'est une aile (gauche ou droite)
            // Phase de base avec désynchronisation par papillon
            float instancePhaseOffset = instanceId * 0.1; // Chaque papillon a une phase légèrement différente
            float baseWingPhase = time * wingSpeed * 1.5 + instancePhaseOffset; // 1.5x plus rapide
            
            // Phase différente pour chaque aile (alternance)
            float wingPhaseOffset = 0.0;
            if (abs(wingType - 1.0) < 0.1) { // Aile gauche
                wingPhaseOffset = 0.0; // Phase normale
            } else if (abs(wingType - 2.0) < 0.1) { // Aile droite  
                wingPhaseOffset = 3.14159; // Phase opposée (π radians = 180°)
            }
            
            float finalPhase = baseWingPhase + wingPhaseOffset;
            
            // Battement principal des ailes avec plus d'amplitude
            float mainFlap = sin(finalPhase) * wingAmplitude * 3.0; // 3x plus d'amplitude
            
            // Mouvement secondaire pour plus de réalisme
            float secondaryFlap = sin(finalPhase * 1.5) * wingAmplitude * 0.8;
            
            // Appliquer l'animation uniquement sur les ailes - battement haut/bas
            animatedPosition.y += mainFlap;
            animatedPosition.x += secondaryFlap * 0.5; // Mouvement secondaire sur X au lieu de Z
            
            // Rotation des ailes autour de leur attache au corps - battement vertical avec plus d'amplitude
            float wingRotation = mainFlap * 0.8; // Plus de rotation
            float cosRot = cos(wingRotation);
            float sinRot = sin(wingRotation);
            
            // Rotation autour de l'axe Z (battement haut-bas) au lieu de l'axe X
            vec3 tempPos = animatedPosition;
            animatedPosition.x = tempPos.x * cosRot - tempPos.y * sinRot;
            animatedPosition.y = tempPos.x * sinRot + tempPos.y * cosRot;
        }
        // Le corps (wingType == 0) reste immobile
    }
    
    // Rotation basée sur la vélocité selon le type de modèle
    vec3 worldPos;
    
    // Spheres (modelType == 0.0) : pas de rotation, position statique
    if (abs(modelType - 0.0) < 0.1) {
        worldPos = animatedPosition + boidPosition;
    } 
    // Cones et Papillons : orientation vers la direction de vol
    else {
        vec3 forward = normalize(velocity);
        vec3 up = vec3(0.0, 1.0, 0.0);
        
        vec3 right = normalize(cross(forward, up));
        up = normalize(cross(right, forward));
        
        mat3 rotationMatrix = mat3(right, up, forward);
        vec3 rotatedPos = rotationMatrix * animatedPosition;
        
        worldPos = rotatedPos + boidPosition;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    
    vColor = instanceColor;
}