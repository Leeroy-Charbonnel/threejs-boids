uniform sampler2D texturePosition;
varying vec3 vColor;

void main() {
    // Utiliser gl_InstanceID au lieu d'un attribut
    float instanceId = float(gl_InstanceID);
    
    // Coordonnées UV dans la texture 32x32
    float u = mod(instanceId, 32.0) / 32.0;
    float v = floor(instanceId / 32.0) / 32.0;
    vec2 uv = vec2(u, v);
    
    // Lire la position depuis la texture GPGPU
    vec3 boidPosition = texture2D(texturePosition, uv).xyz;
    
    // Appliquer la position du vertex + position du boid
    vec3 worldPos = position + boidPosition;
    
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    
    // Définir la couleur (exemple simple)
    vColor = vec3(1.0, 0.4, 0.0); // Orange
}