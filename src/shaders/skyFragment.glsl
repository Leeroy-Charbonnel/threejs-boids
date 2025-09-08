varying vec3 vWorldPosition;
varying vec3 vNormal;

void main() {
    vec3 lightBlue = vec3(0.7, 0.85, 0.95);
    vec3 darkBlue = vec3(0.2, 0.4, 0.7);
    
    float gradient = normalize(vWorldPosition).y * 0.5 + 0.5;
    
    vec3 color = mix(lightBlue, darkBlue, gradient);
    
    gl_FragColor = vec4(color, 1.0);
}