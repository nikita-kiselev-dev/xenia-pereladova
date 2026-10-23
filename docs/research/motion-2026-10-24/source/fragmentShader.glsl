
        #define PI 3.1415926535897932384626433832795

        precision mediump float;
        
        uniform sampler2D uTexture;
        uniform vec2 uResolution;
        uniform float hoverProgress;
        uniform vec2 uZoomScale;
        uniform vec2 uImageRes;
        uniform float uOpacity;
        uniform sampler2D dispmap;

        mat2 rotation(float angle) {
          float s = sin(angle);
          float c = cos(angle);
          return mat2(c, -s, s, c);
        }


        /*------------------------------
        Background Cover UV
        --------------------------------
        u = basic UV
        s = screensize
        i = image size
        ------------------------------*/
        vec2 CoverUV(vec2 u, vec2 s, vec2 i) {
            float rs = s.x / s.y; // Aspect screen size
            float ri = i.x / i.y; // Aspect image size
            vec2 st = rs < ri ? vec2(i.x * s.y / i.y, s.y) : vec2(s.x, i.y * s.x / i.x); // New st
            vec2 o = (rs < ri ? vec2((st.x - s.x) / 2.0, 0.0) : vec2(0.0, (st.y - s.y) / 2.0)) / st; // Offset
            return u * s / st + o;
        }

        varying vec2 vUv;
        void main() {
          vec2 uv = CoverUV(vUv, uResolution, uImageRes);

          vec2 disp = texture2D(dispmap, uv).rg;
          vec2 pos1 = uv + rotation(PI / 4.0) * disp * .4 * hoverProgress;
          vec2 pos2 = uv + rotation(-(PI / 4.0) * 3.0) * disp * .4 * (1.0 - hoverProgress);
          vec4 color1 = texture2D(uTexture, pos1);
          vec4 color2 = texture2D(uTexture, pos2);
          vec3 color = mix(color1, color2, hoverProgress).rgb;
          gl_FragColor = vec4( color, uOpacity);


          // vec3 texture = texture2D(uTexture, uv).rgb;
          // gl_FragColor = vec4( texture, uOpacity);
        }
      