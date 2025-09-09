varying vec3 vColor;
varying float vModelType;
varying float vSkinType;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vOriginalPosition;
varying float vInstanceId;

uniform float time;

void main() {
  vec3 finalColor = vColor;
  
  //SKIN PATTERNS
  if (vSkinType == 0.0) { //SPOT pattern
    //SPOTS
  
      vec3 spotColor = finalColor * 1.8;

    //GENERATE SPOTS
    float seed1 = sin(vInstanceId * 73.456) * 43758.5453;
    float seed2 = cos(vInstanceId * 91.234) * 12345.6789;
    
    for (int i = 0; i < 4; i++) {
      float spotSeed = seed1 + float(i) * seed2 + float(i) * 157.823;
      
      //SPOT POSITIONS
      vec3 spotCenter = vec3(
        sin(spotSeed * 3.7) * 4.5,
        cos(spotSeed * 2.3) * 3.5,
        sin(spotSeed * 1.9) * 6.0 - 1.0
      );
      
      //DISTANCE
      float distToSpot = distance(vOriginalPosition, spotCenter);
      
      //CREATE SPOTS
      float spotRadius = 2.8 + sin(spotSeed * 4.2) * 1.0;
      float spotIntensity = smoothstep(spotRadius, spotRadius * 0.9, distToSpot);
      
      //MIX SPOTS
      finalColor = mix(finalColor, spotColor, spotIntensity * 0.4);
    }
  } else if (vSkinType == 1.0) { //LINE pattern
    vec3 lineColor = finalColor * 1.6;
    
    //HORIZONTAL STRIPES
    float stripeFreq = 3.0 + sin(vInstanceId * 12.34) * 2.0;
    float stripePhase = vInstanceId * 0.5;
    float stripePattern = sin((vOriginalPosition.y + stripePhase) * stripeFreq);
    float stripeIntensity = smoothstep(-0.3, 0.3, stripePattern);
    
    //MIX STRIPES
    finalColor = mix(finalColor, lineColor, stripeIntensity * 0.5);
    
    //VERTICAL ACCENTS
    float verticalFreq = 2.0 + cos(vInstanceId * 23.45) * 1.5;
    float verticalPhase = vInstanceId * 0.3;
    float verticalPattern = sin((vOriginalPosition.x + verticalPhase) * verticalFreq);
    float verticalIntensity = smoothstep(-0.8, 0.8, verticalPattern);
    
    finalColor = mix(finalColor, lineColor * 0.9, verticalIntensity * 0.2);
  } else if (vSkinType == 2.0) { //PULSE pattern
    //PULSE FROM CENTER
    float distanceFromCenter = length(vWorldPosition);
    
    //WAVE PARAMS
    float waveSpeed = 50.0;
    float waveFrequency = 0.05;
    float pulseTime = time * waveSpeed;
    
    //OVERLAPPING WAVES
    float wave1 = sin((distanceFromCenter - pulseTime) * waveFrequency);
    float wave2 = sin((distanceFromCenter - pulseTime * 0.7) * waveFrequency * 1.3);
    float wave3 = sin((distanceFromCenter - pulseTime * 1.2) * waveFrequency * 0.8);
    
    //COMBINE WAVES
    float pulseIntensity = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2);
    
    //INDIVIDUAL VARIATION
    float instanceVariation = sin(vInstanceId * 12.34 + time * 2.0) * 0.3;
    pulseIntensity += instanceVariation;
    
    //NORMALIZE
    pulseIntensity = (pulseIntensity + 1.0) * 0.5;
    
    //PULSE COLOR
    vec3 pulseColor = vColor * (1.5 + pulseIntensity * 0.8);
    
    //MIX PULSE
    finalColor = mix(vColor, pulseColor, pulseIntensity * 0.7);
  }
  
  //FISH EFFECTS
  if (vModelType == 3.0) {
    //TAIL 
    float tail = smoothstep(-2.0,2.0, -vOriginalPosition.z -9.5);
    finalColor = mix(finalColor, finalColor * 0.7, tail * 0.4);
    
    //DORSAL FIN
    float dorsalFin = smoothstep(-0.5, 0.5, vOriginalPosition.y - 4.0);
    finalColor = mix(finalColor, finalColor * 0.8, dorsalFin * 0.4);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}