

        #define PI 3.1415926535897932384626433832795
  
        precision mediump float;

        varying vec2 vUv;
        uniform float uProgress;
        uniform float hoverProgress;
        uniform float uTime;
        uniform float uCurl;
        uniform float uSpeed;
        uniform vec2 uZoomScale;
        uniform vec2 uImageRes;
        uniform vec2 uViewportSizes;
        uniform vec2 uResolution;
        uniform float uAnim;

        void main() {
          vUv = uv;
          vec3 p = position;
          p.z = (cos(p.y + uTime) * 1.5) * (0.1 * .9) * (0.2 - uProgress);
          vec4 newPosition = modelViewMatrix * vec4(p, 1.0);
          newPosition.z += cos(newPosition.x / uViewportSizes.x * PI * 1.8) * (uSpeed);
          // newPosition.z += cos(newPosition.x / uViewportSizes.x * PI + uSpeed * 5.0) * (1.0 - uProgress); //with mouse power
          newPosition.x += cos(newPosition.y * 1.0 + uTime * 5.) * .3 * uAnim;
          newPosition.z += sin(newPosition.x / uViewportSizes.x * PI + uTime) * 2.0 * uCurl;
          gl_Position = projectionMatrix * newPosition;

        } 
      