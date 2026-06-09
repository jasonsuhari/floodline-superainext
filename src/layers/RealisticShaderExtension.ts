import { LayerExtension } from '@deck.gl/core'
import type { Layer } from '@deck.gl/core'
import type { BillboardMaterial } from '@/types'

type ShaderMode = 'foliage' | 'selection' | BillboardMaterial

interface RealisticShaderOptions {
  mode: ShaderMode
}

const FOLIAGE_DECLARATIONS = /* glsl */ `
float faultline_hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float faultline_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(faultline_hash(i + vec2(0.0, 0.0)), faultline_hash(i + vec2(1.0, 0.0)), u.x),
    mix(faultline_hash(i + vec2(0.0, 1.0)), faultline_hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
`

const FOLIAGE_SHADER = /* glsl */ `
vec2 faultline_p = gl_FragCoord.xy * 0.045;
float faultline_canopy = faultline_noise(faultline_p);
float faultline_leaf = faultline_noise(faultline_p * 3.2 + vec2(11.3, 4.7));
float faultline_shadow = faultline_noise(faultline_p * 0.42 + vec2(2.0, 19.0));
float faultline_sun = smoothstep(0.18, 1.0, dot(normalize(vec2(0.55, 0.83)), normalize(fract(faultline_p * 0.28) - 0.5)));
float faultline_detail = faultline_canopy * 0.18 + faultline_leaf * 0.08 + faultline_sun * 0.12 - faultline_shadow * 0.1;
color.rgb *= vec3(0.78, 0.9, 0.72) + faultline_detail;
color.rgb += vec3(0.018, 0.035, 0.006) * smoothstep(0.55, 0.95, faultline_leaf);
color.rgb = clamp(color.rgb, vec3(0.0), vec3(1.0));
`

const SELECTION_SHADER = /* glsl */ `
float faultline_radius = length(geometry.uv);
float faultline_rim = smoothstep(0.72, 1.0, faultline_radius);
float faultline_core = 1.0 - smoothstep(0.0, 0.72, faultline_radius);
float faultline_scan = 1.0 - smoothstep(0.0, 0.018, abs(fract(faultline_radius * 7.0 + gl_FragCoord.x * 0.004) - 0.5));
color.rgb = mix(color.rgb, vec3(0.42, 0.78, 1.0), faultline_rim * 0.72 + faultline_scan * 0.18);
color.rgb += vec3(0.08, 0.18, 0.28) * faultline_core;
color.a *= 0.74 + faultline_rim * 0.45 + faultline_scan * 0.16;
`

const BILLBOARD_DIGITAL_DAY_SHADER = /* glsl */ `
vec2 faultline_uv = geometry.uv * 0.5 + 0.5;
float faultline_edge_x = smoothstep(0.0, 0.15, faultline_uv.x) * (1.0 - smoothstep(0.85, 1.0, faultline_uv.x));
float faultline_edge_y = smoothstep(0.0, 0.18, faultline_uv.y) * (1.0 - smoothstep(0.82, 1.0, faultline_uv.y));
float faultline_view_falloff = mix(0.58, 1.0, faultline_edge_x);
float faultline_vignette = mix(0.72, 1.0, faultline_edge_x * faultline_edge_y);
float faultline_scanline = 0.93 + 0.07 * smoothstep(0.14, 0.92, fract(gl_FragCoord.y * 0.72));
float faultline_pixel = 0.95 + 0.05 * smoothstep(0.08, 0.76, fract(gl_FragCoord.x * 0.48));
float faultline_reflection = 1.0 - smoothstep(0.0, 0.03, abs(faultline_uv.y - (0.78 - faultline_uv.x * 0.2)));
float faultline_day_wash = smoothstep(0.18, 0.92, dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)));
vec3 faultline_display = mix(vec3(0.58, 0.62, 0.6), pow(color.rgb, vec3(1.12)), 0.86);
faultline_display *= faultline_view_falloff * faultline_vignette * faultline_scanline * faultline_pixel;
faultline_display += vec3(0.2, 0.22, 0.2) * faultline_reflection;
faultline_display = mix(faultline_display, vec3(0.72, 0.76, 0.72), 0.12 * (1.0 - faultline_day_wash));
color.rgb = clamp(faultline_display, vec3(0.0), vec3(1.0));
color.a *= 0.96;
`

const BILLBOARD_DIGITAL_NIGHT_SHADER = /* glsl */ `
vec2 faultline_uv = geometry.uv * 0.5 + 0.5;
float faultline_edge_x = smoothstep(0.0, 0.16, faultline_uv.x) * (1.0 - smoothstep(0.84, 1.0, faultline_uv.x));
float faultline_edge_y = smoothstep(0.0, 0.2, faultline_uv.y) * (1.0 - smoothstep(0.8, 1.0, faultline_uv.y));
float faultline_luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
float faultline_scanline = 0.86 + 0.14 * smoothstep(0.12, 0.9, fract(gl_FragCoord.y * 0.84));
float faultline_pixel = 0.9 + 0.1 * smoothstep(0.08, 0.72, fract(gl_FragCoord.x * 0.54));
float faultline_bloom = smoothstep(0.42, 1.0, faultline_luma);
float faultline_corner = faultline_edge_x * faultline_edge_y;
vec3 faultline_emission = pow(color.rgb, vec3(0.86)) * 1.18;
faultline_emission *= mix(0.7, 1.0, faultline_edge_x) * mix(0.78, 1.0, faultline_edge_y);
faultline_emission *= faultline_scanline * faultline_pixel;
faultline_emission += color.rgb * faultline_bloom * 0.34;
faultline_emission += vec3(0.045, 0.07, 0.08) * (1.0 - faultline_luma);
faultline_emission += vec3(0.08, 0.1, 0.12) * (1.0 - faultline_corner);
color.rgb = clamp(faultline_emission, vec3(0.0), vec3(1.0));
color.a *= 0.98;
`

const BILLBOARD_PRINTED_VINYL_SHADER = /* glsl */ `
vec2 faultline_uv = geometry.uv * 0.5 + 0.5;
float faultline_edge_x = smoothstep(0.0, 0.12, faultline_uv.x) * (1.0 - smoothstep(0.88, 1.0, faultline_uv.x));
float faultline_edge_y = smoothstep(0.0, 0.14, faultline_uv.y) * (1.0 - smoothstep(0.86, 1.0, faultline_uv.y));
float faultline_grain = fract(sin(dot(floor(gl_FragCoord.xy * 0.8), vec2(12.9898, 78.233))) * 43758.5453);
float faultline_fiber = 0.94 + 0.06 * sin((gl_FragCoord.x + gl_FragCoord.y * 0.35) * 0.18);
float faultline_sun_fade = smoothstep(0.1, 0.9, faultline_uv.y) * 0.1;
float faultline_surface = 0.88 + faultline_grain * 0.08;
vec3 faultline_ink = pow(color.rgb, vec3(1.22));
faultline_ink = mix(faultline_ink, vec3(dot(faultline_ink, vec3(0.3, 0.59, 0.11))), 0.08);
faultline_ink *= faultline_surface * faultline_fiber * mix(0.64, 1.0, faultline_edge_x * faultline_edge_y);
faultline_ink = mix(faultline_ink, vec3(0.72, 0.7, 0.64), faultline_sun_fade);
color.rgb = clamp(faultline_ink, vec3(0.0), vec3(0.92));
color.a *= 0.94;
`

export class RealisticShaderExtension extends LayerExtension<RealisticShaderOptions> {
  static extensionName = 'RealisticShaderExtension'

  getShaders(this: Layer, extension: RealisticShaderExtension) {
    if (extension.opts.mode === 'digital-day') {
      return {
        inject: {
          'fs:DECKGL_FILTER_COLOR': BILLBOARD_DIGITAL_DAY_SHADER,
        },
      }
    }

    if (extension.opts.mode === 'digital-night') {
      return {
        inject: {
          'fs:DECKGL_FILTER_COLOR': BILLBOARD_DIGITAL_NIGHT_SHADER,
        },
      }
    }

    if (extension.opts.mode === 'printed-vinyl') {
      return {
        inject: {
          'fs:DECKGL_FILTER_COLOR': BILLBOARD_PRINTED_VINYL_SHADER,
        },
      }
    }

    if (extension.opts.mode === 'selection') {
      return {
        inject: {
          'fs:DECKGL_FILTER_COLOR': SELECTION_SHADER,
        },
      }
    }

    return {
      inject: {
        'fs:#decl': FOLIAGE_DECLARATIONS,
        'fs:DECKGL_FILTER_COLOR': FOLIAGE_SHADER,
      },
    }
  }
}

export const foliageShaderExtension = new RealisticShaderExtension({ mode: 'foliage' })
export const selectionShaderExtension = new RealisticShaderExtension({ mode: 'selection' })
export const billboardShaderExtensions: Record<BillboardMaterial, RealisticShaderExtension> = {
  'digital-day': new RealisticShaderExtension({ mode: 'digital-day' }),
  'digital-night': new RealisticShaderExtension({ mode: 'digital-night' }),
  'printed-vinyl': new RealisticShaderExtension({ mode: 'printed-vinyl' }),
}
