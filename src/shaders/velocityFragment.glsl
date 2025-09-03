void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    
    gl_FragColor = vec4(velocity, 1.0);
}