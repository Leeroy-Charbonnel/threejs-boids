uniform float delta;
uniform float boundsHalf;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 tmpPos = texture2D(texturePosition, uv);
    vec3 velocity = texture2D(textureVelocity, uv).xyz;

    vec3 newPosition = tmpPos.xyz + velocity * delta * 50.0;
    
    gl_FragColor = vec4(newPosition, tmpPos.w);
}