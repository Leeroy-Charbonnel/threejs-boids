varying vec2 vUv;
uniform float time;

void main() {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);

    //CIRCLE RADIUS
    float radius = 0.48;
    float lineWidth = 0.02;

    //CIRCLE EDGE
    float circle = smoothstep(radius - lineWidth, radius, dist) - smoothstep(radius, radius + lineWidth, dist);

    //DOTTED PATTERN
    float angle = atan(vUv.y - center.y, vUv.x - center.x);
    float normalizedAngle = (angle + 3.14159) / (2.0 * 3.14159);

    //ANIMATED DOTS
    float dotPattern = sin(normalizedAngle * 40.0 + time * 3.0) * 0.5 + 0.5;
    float dots = step(0.6, dotPattern);

    float finalAlpha = circle * dots * 0.8;

    gl_FragColor = vec4(1.0, 1.0, 1.0, finalAlpha);
}