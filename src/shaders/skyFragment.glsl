varying vec3 vWorldPosition;
varying vec3 vNormal;

uniform vec3 topColor;
uniform vec3 bottomColor;

void main() {
    float gradient = normalize(vWorldPosition).y * 0.5 + 0.5;
    
    vec3 color = mix(bottomColor, topColor, gradient);
    
    gl_FragColor = vec4(color, 1.0);
}