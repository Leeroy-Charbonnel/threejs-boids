varying vec3 vColor;
varying float vModelType;
varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vOriginalPosition;
varying float vInstanceId;

void main() {
  vec3 finalColor = vColor;
  
  //FISH EFFECTS
  if (vModelType == 3.0) {
    // Darken the tail area 
    float tail = smoothstep(-2.0,2.0, -vOriginalPosition.z -9.5);
    finalColor = mix(finalColor, finalColor * 0.7, tail * 0.4);
    
    // Darken the dorsal fin (top part)
    float dorsalFin = smoothstep(-0.5, 0.5, vOriginalPosition.y - 4.0);
    finalColor = mix(finalColor, finalColor * 0.8, dorsalFin * 0.4);
  }
  
  gl_FragColor = vec4(finalColor, 1.0);
}