uniform float delta;
uniform float boundsHalf;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 tmpPos = texture2D(texturePosition, uv);
    vec3 velocity = texture2D(textureVelocity, uv).xyz;

    vec3 newPosition =  tmpPos.xyz + velocity * delta * 50.0;
    
    if (newPosition.x >= boundsHalf) {
        newPosition.x = -boundsHalf + (newPosition.x - boundsHalf);
    }
    if (newPosition.x <= -boundsHalf) {
        newPosition.x = boundsHalf + (newPosition.x + boundsHalf);
    }

    if (newPosition.y >= boundsHalf) {
        newPosition.y = -boundsHalf + (newPosition.y - boundsHalf);
    }
    if (newPosition.y <= -boundsHalf) {
        newPosition.y = boundsHalf + (newPosition.y + boundsHalf);
    }

    if (newPosition.z >= boundsHalf) {
        newPosition.z = -boundsHalf + (newPosition.z - boundsHalf);
    }
    if (newPosition.z <= -boundsHalf) {
        newPosition.z = boundsHalf + (newPosition.z + boundsHalf);
    }
    
    gl_FragColor = vec4(newPosition, tmpPos.w);
}