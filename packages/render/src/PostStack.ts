import { RenderPipeline } from 'three/webgpu';
import type { Camera, Scene } from 'three';
import {
  pass,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  mix,
  clamp,
  pow,
  length,
  screenUV,
  saturation,
  exp,
  oneMinus,
} from 'three/tsl';
import { bayerDither } from 'three/addons/tsl/math/Bayer.js';
import type { SLRenderer } from './Renderer';
import type { RenderProfile } from './RenderProfile';

function buildUniforms(profile: RenderProfile) {
  return {
    /** Output exposure multiplier. */
    exposure: uniform(1.0),
    /** Saturation amount (1 = neutral; <1 desaturates toward the cold grade). */
    saturation: uniform(0.8),
    /** Analytic distance-fog density. */
    fogDensity: uniform(0.06),
    /** Fog / draw-distance-curtain colour. */
    fogColor: uniform(vec3(0.02, 0.03, 0.05)),
    /** Vignette strength (the Director closes this in under dread). */
    vignette: uniform(0.55),
    /** Posterize levels — the PS1 palette crush (5-6 normal, 3-4 at low Resolve). */
    posterizeLevels: uniform(profile.tier === 'low' ? 4 : 6),
    /** Ordered Bayer dither blend (0 = clean posterized image, 1 = full PS1 grit). */
    ditherAmount: uniform(profile.tier === 'low' ? 0.75 : 0.55),
  };
}

export type PostUniformsBank = ReturnType<typeof buildUniforms>;

export interface PostStack {
  readonly post: RenderPipeline;
  readonly uniforms: PostUniformsBank;
  /** Render the post-processed frame (drives the underlying scene pass). */
  render(): void;
}

/**
 * The PS1 post-processing stack (T28 PostUniforms + locked-order TSL graph). Wraps a scene `pass`
 * and assembles the mood-defining passes — analytic fog, exposure/saturation grade, vignette,
 * posterize — into the PostProcessing.outputNode. Every PostUniforms value is Director-animatable
 * (write `.value`) and visibly changes the image. The heavier passes already ship as three TSL addon
 * nodes (BloomNode, GTAONode, ChromaticAberrationNode, SMAANode, CRT) and slot into this same chain
 * as they're tuned; emissive-only bloom additionally needs the T27 MRT pass (output+emissive),
 * deferred until the corridor has emissive geometry to mask.
 */
export function createPostStack(
  renderer: SLRenderer,
  scene: Scene,
  camera: Camera,
  profile: RenderProfile,
): PostStack {
  const scenePass = pass(scene, camera);
  const uniforms = buildUniforms(profile);

  const sceneColor = scenePass.getTextureNode();
  const viewDist = scenePass.getViewZNode().negate();

  // ── locked-order mood chain ──────────────────────────────────────────────
  // fog: 1 - exp(-dist*density), blended toward the cold fog colour (the near-black curtain)
  const fogFactor = clamp(oneMinus(exp(viewDist.mul(uniforms.fogDensity).negate())), float(0), float(1));
  let c = mix(sceneColor.rgb, uniforms.fogColor, fogFactor);

  // grade: exposure then saturation
  c = c.mul(uniforms.exposure);
  c = saturation(c, uniforms.saturation);

  // vignette: radial darken from screen centre
  const vignetteDist = length(screenUV.sub(vec2(0.5, 0.5)));
  c = c.mul(clamp(oneMinus(uniforms.vignette.mul(pow(vignetteDist, float(2.0)))), float(0), float(1)));

  // Posterize + ordered Bayer dither: keep the quantised PS1 register, but blend the stipple in
  // rather than forcing it globally. The Director can raise ditherAmount under fear without making
  // the clean baseline fight silhouettes and co-op callouts.
  const dithered = bayerDither(c, uniforms.posterizeLevels);
  c = mix(c, dithered, clamp(uniforms.ditherAmount, float(0), float(1)));

  const post = new RenderPipeline(renderer.three, vec4(c, float(1)));

  return {
    post,
    uniforms,
    render: () => post.render(),
  };
}
