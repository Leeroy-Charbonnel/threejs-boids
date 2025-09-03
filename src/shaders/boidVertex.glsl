uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform float textureWidth;
varying vec3 vColor;
attribute vec3 instanceColor; 

void main() {
    float instanceId = float(gl_InstanceID);
    
    //Get coord on texture for current instance
    float u = mod(instanceId, textureWidth) / textureWidth;
    float v = floor(instanceId / textureWidth) / textureWidth;
    vec2 uv = vec2(u, v);
    
    //Read texture good instances
    vec3 boidPosition = texture2D(texturePosition, uv).xyz;
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    
    //Rotation
    vec3 rotatedPos = position;
    
    vec3 forward = normalize(velocity);
    vec3 up = vec3(0.0, 1.0, 0.0);
    
    vec3 right = normalize(cross(forward, up));
    up = normalize(cross(right, forward));
    
    mat3 rotationMatrix = mat3(right, up, forward);
    rotatedPos = rotationMatrix * position;

    vec3 worldPos = rotatedPos + boidPosition;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    
    vColor = instanceColor;
}