varying vec3 vColor;
varying float vModelType;
varying float vSkinType;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vOriginalPosition;
varying float vInstanceId;
varying float vGroupId;
varying float vTurnDirection;

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
    
    float totalSpotIntensity = 0.0;

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

      //ACCUMULATE SPOT INTENSITY
      totalSpotIntensity += spotIntensity;
    }

    //CLAMP TO PREVENT OVER-BRIGHTNESS FROM OVERLAPPING SPOTS
    totalSpotIntensity = clamp(totalSpotIntensity, 0.0, 1.0);

    //MIX SPOTS WITH CLAMPED INTENSITY
    finalColor = mix(finalColor, spotColor, totalSpotIntensity * 0.4);
  } else if (vSkinType == 3.0) {

    //SHIMMER
    finalColor = finalColor * 0.7;
    float shimmerIntensity = abs(vTurnDirection) * 10.0;
    vec3 shimmerColor = finalColor * (2.0 + shimmerIntensity);
    finalColor = mix(finalColor, shimmerColor, clamp(shimmerIntensity, 0.0, 1.0));

    // DIRECTION SHIFT - RED/GREEN
    // if (vTurnDirection < -0.01) {
    //     vec3 redShift = vec3(1.0, 0.0, 0.0);
    //     finalColor = mix(finalColor, redShift, abs(vTurnDirection) * 5.0);
    // } else if (vTurnDirection > 0.01) {
    //     vec3 greenShift = vec3(0.0, 1.0, 0.0);
    //     finalColor = mix(finalColor, greenShift, vTurnDirection * 5.0);
    // }

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
  
  //JELLYFISH EFFECTS
  if (vModelType == 4.0) {
    //TENTACLES DARKENING (bottom part only)
    float tentacleMask = smoothstep(1.5, -0.8, vOriginalPosition.z);
    finalColor = mix(finalColor, finalColor * 0.9, tentacleMask * 0.8);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}