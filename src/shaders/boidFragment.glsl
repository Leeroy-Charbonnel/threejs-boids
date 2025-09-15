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

  //DARKEN BASE COLOR FOR PULSE EFFECT
  if (vSkinType == 2.0) {
    finalColor = finalColor * 0.6; // Darker base for better contrast
  }

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
  } else if (vSkinType == 2.0) { //GROUP WAVE PULSE pattern
    //WAVE PROPAGATION BY GROUP
    float groupPhase = vGroupId * 2.0; // Different phase for each group
    float waveSpeed = 25.0; // Slightly faster waves
    float waveTime = time * waveSpeed + groupPhase;

    //GROUP-SPECIFIC WAVE ORIGIN - each group has its own wave starting point
    vec3 groupWaveOrigin = vec3(
      sin(vGroupId * 3.7) * 50.0,  // X offset based on group
      cos(vGroupId * 2.1) * 50.0,  // Y offset based on group
      sin(vGroupId * 4.3) * 30.0   // Z offset based on group
    );

    //DISTANCE FROM GROUP WAVE ORIGIN
    float distanceFromOrigin = length(vWorldPosition - groupWaveOrigin);

    //MAIN WAVE - travels outward from group-specific origin
    float mainWave = sin((distanceFromOrigin - waveTime) * 0.04) * 0.5 + 0.5;

    //SECONDARY WAVE - creates broader ripple effect from same origin
    float rippleWave = sin((distanceFromOrigin - waveTime * 0.9) * 0.06) * 0.3 + 0.7;

    //GROUP SYNCHRONIZATION WAVE - slow wave that synchronizes the group
    float syncWave = sin(waveTime * 0.2 + vGroupId * 2.5) * 0.4 + 0.6;

    //INDIVIDUAL VARIATION - slight offset per boid to avoid perfect sync
    float individualOffset = sin(vInstanceId * 7.89 + time * 1.2) * 0.2;

    //COMBINE ALL WAVES
    float totalWave = mainWave * rippleWave * syncWave + individualOffset;
    totalWave = clamp(totalWave, 0.0, 1.0);

    //ENHANCED COLOR WITH WAVE
    vec3 waveColor = finalColor * (1.0 + totalWave * 1.5);

    //MIX WAVE PULSE
    finalColor = mix(finalColor, waveColor, totalWave * 0.9);
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