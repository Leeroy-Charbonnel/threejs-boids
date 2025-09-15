uniform float alignmentDistance;
uniform float alignmentForce;
uniform float cohesionDistance;
uniform float cohesionForce;
uniform float separationDistance;
uniform float separationForce;

uniform float textureWidth;
uniform float speed;
uniform float boundsHalf;
uniform float groupCount;
uniform float time;
uniform float attractionForce;
uniform vec3 attractionPoint;
uniform float attractionDistance;
uniform bool isAttracting;
uniform bool isRepulsing;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 velocity = texture2D(textureVelocity, uv).xyz;
  vec3 position = texture2D(texturePosition, uv).xyz;

  //GROUP
  float totalBoids = textureWidth * textureWidth;
  float boidsPerGroup = totalBoids / groupCount;
  float boidIndex = gl_FragCoord.x + gl_FragCoord.y * textureWidth;
  float currentGroup = floor(boidIndex / boidsPerGroup);

  vec3 averageVelocity = vec3(0.0);
  float alignmentNeighbors = 0.0;
  vec3 centerOfMass = vec3(0.0);
  float cohesionNeighbors = 0.0;
  vec3 separationVector = vec3(0.0);
  float separationNeighbors = 0.0;
  
  float influenced = 0.0;

  float groupStartIndex = currentGroup * boidsPerGroup;
  float groupEndIndex = min((currentGroup + 1.0) * boidsPerGroup, totalBoids - 1.0);
  for (float idx = groupStartIndex; idx <= groupEndIndex; idx += 1.0) {
    if (influenced > 20.0) {
      break;
    }
    
    float i = mod(idx, textureWidth);
    float j = floor(idx / textureWidth);
    vec2 neighborUV = vec2(i + 0.5, j + 0.5) / textureWidth;
    vec3 neighborPos = texture2D(texturePosition, neighborUV).xyz;
    vec3 neighborVel = texture2D(textureVelocity, neighborUV).xyz;

    vec3 diff = position - neighborPos;
    float distance = length(diff);
    
    if (distance < 0.01) continue;

    //ALIGNMENT
    if (distance < alignmentDistance) {
      averageVelocity += neighborVel;
      alignmentNeighbors += 1.0;
    }

    //COHESION
    if (distance < cohesionDistance) {
      centerOfMass += neighborPos;
      cohesionNeighbors += 1.0;
    }
    
    if (distance < max(alignmentDistance, cohesionDistance)) {
      influenced += 1.0;
    }
  }

  influenced = 0.0;

  //SEPARATION
  for (float j = 0.0; j < textureWidth; j += 1.0) {
    for (float i = 0.0; i < textureWidth; i += 1.0) {
      vec2 neighborUV = vec2(i + 0.5, j + 0.5) / textureWidth;
      vec3 neighborPos = texture2D(texturePosition, neighborUV).xyz;

      if (influenced > 50.0) {
        break;
      }
      
      vec3 diff = position - neighborPos;
      float distance = length(diff);
    
      if (distance < 0.01 || distance >= separationDistance) continue;

      influenced += 1.0;
      separationVector += normalize(diff) / distance;
      separationNeighbors += 1.0;
    }
  }

  vec3 previousVelocity = velocity;
  vec3 newVelocity = velocity;

  //SEPARATION
  if (separationNeighbors > 0.0) {
    separationVector /= separationNeighbors;

    vec3 desiredDirection = normalize(velocity + separationVector * separationForce);
    float currentSpeed = length(velocity);

    vec3 separationVelocity = desiredDirection * currentSpeed;
    newVelocity = mix(velocity, separationVelocity, separationForce * 0.5); 
  }

  //ALIGNMENT
  if (alignmentNeighbors > 0.0) {
    averageVelocity /= alignmentNeighbors;
    newVelocity = mix(newVelocity, averageVelocity, alignmentForce);
  }

  //COHESION
  if (cohesionNeighbors > 0.0) {
    centerOfMass /= cohesionNeighbors;
    vec3 toCenter = centerOfMass - position;
    vec3 cohesionVelocity = newVelocity + toCenter * cohesionForce;
    newVelocity = mix(newVelocity, cohesionVelocity, cohesionForce);
  }

  vec2 boidSeed = uv * 12345.6789;

  float individualSpeed = speed + speed * ((sin(boidSeed.x) * 0.5 + 0.5) * 0.6);

  float speed = length(newVelocity);

  //NOISE
  vec3 noise = vec3(
    sin(position.x * 0.1 + position.y * 0.13) * 0.02,
    cos(position.y * 0.11 + position.z * 0.17) * 0.02,
    sin(position.z * 0.12 + position.x * 0.19) * 0.02
  );

  newVelocity += noise;

  //ATTRACTION FORCE
  if (isAttracting) {
    vec3 toAttraction = attractionPoint - position;
    float distanceToAttraction = length(toAttraction);

    if (distanceToAttraction < attractionDistance && distanceToAttraction > 0.1) {
      vec3 attractionDirection = normalize(toAttraction);
      float attractionStrength = attractionForce * (1.0 - distanceToAttraction / attractionDistance);
      newVelocity += attractionDirection * attractionStrength;
    }
  }

  //REPULSION FORCE
  if (isRepulsing) {
    vec3 toRepulsion = attractionPoint - position;
    float distanceToRepulsion = length(toRepulsion);

    if (distanceToRepulsion < attractionDistance && distanceToRepulsion > 0.1) {
      vec3 repulsionDirection = -normalize(toRepulsion);
      float repulsionStrength = attractionForce * (1.0 - distanceToRepulsion / attractionDistance);
      newVelocity += repulsionDirection * repulsionStrength;
    }
  }

  //CENTER FORCE
  float distanceFromCenter = length(position);
  vec3 toCenter = -normalize(position);
  float currentSpeed = length(newVelocity);
  float centerForce = (distanceFromCenter / (boundsHalf * 2.0)) * 0.007 * currentSpeed ;
  newVelocity += toCenter * centerForce;
  
  speed = length(newVelocity);

  //NORMALIZE SPEED
  if (speed > 0.0) {
    newVelocity = normalize(newVelocity) * individualSpeed;
  } else {
    newVelocity = normalize(velocity + vec3(0.1, 0.1, 0.1)) * individualSpeed;
  }

  //CALCULATE LOCAL HORIZONTAL DIRECTION BEFORE SMOOTHING
  vec3 previousForward = normalize(previousVelocity);
  vec3 currentForward = normalize(newVelocity);

  //TURN DIRECTION
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(previousForward, up));

  vec3 turnVector = cross(previousForward, currentForward);
  float newTurnDirection = clamp(dot(turnVector, up) * 10.0, -1.0, 1.0);

  float previousTurnDirection = texture2D(textureVelocity, uv).w / 10.0;


  //SMOOTH
  float smoothingFactor = 0.7;
  float directionSmoothingFactor = 0.9;


  newVelocity = mix(newVelocity, previousVelocity, smoothingFactor);
  newTurnDirection = mix(newTurnDirection, previousTurnDirection, directionSmoothingFactor);

  //turnDirection = sin(time * 2.3);
  gl_FragColor = vec4(newVelocity, newTurnDirection * 5.0); 
}
