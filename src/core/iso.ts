import { render } from '../config/render';

// The simulation is flat top-down world space. Isometric 2:1 is only a rendering projection.

export interface Vec2 {
  x: number;
  y: number;
}

export function toScreen(x: number, y: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const s = render.isoScale;
  out.x = (x - y) * s;
  out.y = (x + y) * s * 0.5;
  return out;
}

export function toWorld(sx: number, sy: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const s = render.isoScale;
  const a = sx / s;
  const b = (2 * sy) / s;
  out.x = (a + b) * 0.5;
  out.y = (b - a) * 0.5;
  return out;
}

// A world-space circle of radius r projects to an ellipse with these half extents.
export function ellipseHalfSize(r: number): Vec2 {
  const s = render.isoScale;
  return { x: r * s * Math.SQRT2, y: r * s * Math.SQRT1_2 };
}
