uniform float alignmentDistance;
uniform float alignmentForce;
uniform float cohesionDistance;
uniform float cohesionForce;
uniform float separationDistance;
uniform float separationForce;

uniform float textureWidth;
uniform float minSpeed;
uniform float maxSpeed;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 velocity = texture2D(textureVelocity, uv).xyz;
  vec3 position = texture2D(texturePosition, uv).xyz;

  //ALIGNMENT
  vec3 averageVelocity = vec3(0.0);
  float alignmentNeighbors = 0.0;
  //COHESION
  vec3 centerOfMass = vec3(0.0);
  float cohesionNeighbors = 0.0;
  //SEPARATION
  vec3 separationVector = vec3(0.0);
  float separationNeighbors = 0.0;
  
  float influenced = 0.0;
  float maxDistance = separationDistance;
    
  for (float i = 0.0; i < textureWidth; i++) {
    for (float j = 0.0; j < textureWidth; j++) {
        
      if (influenced > 20.0) {
        break;
      }
        
      vec2 neighborUV = vec2(i, j) / textureWidth;
      vec3 neighborPos = texture2D(texturePosition, neighborUV).xyz;
      vec3 neighborVel = texture2D(textureVelocity, neighborUV).xyz;

      vec3 diff = position - neighborPos;
      float distance = length(diff);
      
      if ( distance < 0.01 ) continue;

      //SEPARATION
      if (distance < separationDistance) {
        separationVector += normalize(diff) / distance; //Nearer, stronger
        separationNeighbors += 1.0;
      }

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
      
      maxDistance = max(maxDistance, alignmentDistance);
      maxDistance = max(maxDistance, cohesionDistance);
      if (distance < maxDistance) {
        influenced = influenced + 1.0;
      }
      
    }
  }

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

  float individualMinSpeed = minSpeed + minSpeed * ((sin(boidSeed.x) * 0.5 + 0.5) * 0.25);
  float individualMaxSpeed = maxSpeed + maxSpeed * ((cos(boidSeed.y) * 0.5 + 0.5) * 0.25);

  individualMinSpeed = min(individualMinSpeed, individualMaxSpeed - 0.1);

  float speed = length(newVelocity);

  //NOISE TO BREAK LINEARITY
  vec3 noise = vec3(
    sin(uv.x * 157.0 + uv.y * 113.0) * 0.03,
    cos(uv.x * 241.0 + uv.y * 197.0) * 0.03,
    sin(uv.x * 311.0 + uv.y * 283.0) * 0.03
  );

  newVelocity += noise;

  speed = length(newVelocity);

  if (speed < individualMinSpeed) {
    if (speed > 0.0) {
      newVelocity = normalize(newVelocity) * individualMinSpeed;
    } else {
      newVelocity = normalize(velocity + vec3(0.1, 0.1, 0.1)) * individualMinSpeed;
    }
  } else if (speed > individualMaxSpeed) {
    newVelocity = normalize(newVelocity) * individualMaxSpeed;
  }

  gl_FragColor = vec4(newVelocity, 1.0);
}
