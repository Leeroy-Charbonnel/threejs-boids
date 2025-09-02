uniform float time;
uniform float delta;
uniform float boundsHalf;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    vec3 position = texture2D(texturePosition, uv).xyz;
    
    // Rebond simple sur les bords
    if (abs(position.x) > boundsHalf) {
        velocity.x = -velocity.x;
    }
    if (abs(position.y) > boundsHalf) {
        velocity.y = -velocity.y;
    }
    if (abs(position.z) > boundsHalf) {
        velocity.z = -velocity.z;
    }
    
    gl_FragColor = vec4(velocity, 1.0);
}