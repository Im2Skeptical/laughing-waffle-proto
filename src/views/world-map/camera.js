// Local presentation state only. Map art, markers and timeline effects share
// this transform; fixed chrome and inspection panels stay outside it.
export function createMapCamera(viewport, world, rect, { onTap, onGesture, now, reducedMotion } = {}) {
  let zoom = 1, x = 0, y = 0;
  const pointers = new Map();
  let moved = false, pinch = null;
  const local = event => viewport.toLocal(event.global);
  const apply = () => {
    x = Math.max(-rect.width * zoom, Math.min(rect.width, x));
    y = Math.max(-rect.height * zoom * .8, Math.min(rect.height * .8, y));
    world.position.set(x, y);
    world.scale.set(zoom);
  };
  const focus = createMapTransition({ now, reducedMotion, apply: pose => {
    ({ x, y, zoom } = pose);
    apply();
  } });
  const zoomAt = (factor, point) => {
    focus.cancel();
    const next = Math.max(Math.min(.35, zoom), Math.min(2.5, zoom * factor));
    x = point.x - (point.x - x) * next / zoom;
    y = point.y - (point.y - y) * next / zoom;
    zoom = next;
    apply();
  };
  const pinchPose = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2,
      distance: Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) };
  };
  viewport.eventMode = 'static';
  viewport.hitArea = new PIXI.Rectangle(rect.x, rect.y, rect.width, rect.height);
  viewport.cursor = 'grab';
  viewport.on('pointerdown', event => {
    if (event.button != null && event.button !== 0) return;
    focus.cancel();
    const point = local(event);
    if (!pointers.size) moved = false;
    pointers.set(event.pointerId, { point, start: point });
    if (pointers.size === 2) { pinch = pinchPose(); moved = true; }
    viewport.cursor = 'grabbing';
  });
  viewport.on('globalpointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const point = local(event), previous = pointer.point;
    pointer.point = point;
    if (Math.hypot(point.x - pointer.start.x, point.y - pointer.start.y) > 8) moved = true;
    if (!moved) return;
    onGesture?.();
    if (pointers.size === 2) {
      const next = pinchPose();
      if (pinch?.distance > 0) {
        zoomAt(next.distance / pinch.distance, pinch);
        x += next.x - pinch.x; y += next.y - pinch.y;
      }
      pinch = next;
    } else {
      x += point.x - previous.x; y += point.y - previous.y;
    }
    apply();
  });
  const release = event => {
    if (!pointers.has(event.pointerId)) return;
    const tapped = !moved && event.type === 'pointerup';
    pointers.delete(event.pointerId);
    pinch = null;
    if (!pointers.size) viewport.cursor = 'grab';
    if (tapped) onTap?.(event);
  };
  viewport.on('pointerup', release);
  viewport.on('pointerupoutside', release);
  viewport.on('pointercancel', release);
  viewport.on('wheel', event => {
    event.preventDefault();
    onGesture?.();
    zoomAt(Math.exp(-event.deltaY * .0015), local(event));
  });
  return {
    isActive: () => pointers.size > 0,
    project: point => ({ x: point.x * zoom + x, y: point.y * zoom + y }),
    zoomBy: (factor, right = rect.x + rect.width) => zoomAt(factor, { x: (rect.x + right) / 2, y: rect.y + rect.height / 2 }),
    reset: () => { focus.cancel(); zoom = 1; x = 0; y = 0; apply(); },
    restore: pose => { focus.cancel(); focus.start({ x, y, zoom }, pose); },
    cancel: () => { focus.cancel(); pointers.clear(); pinch = null; moved = false; viewport.cursor = 'grab'; },
    reveal: (point, right) => {
      focus.cancel();
      const targetZoom = Math.max(1.65, zoom);
      focus.start({ x, y, zoom }, {
        x: (rect.x + right) / 2 - point.x * targetZoom,
        y: rect.y + rect.height / 2 - point.y * targetZoom,
        zoom: targetZoom,
      });
    },
    frame: (points, bounds, point) => {
      if (!points.length) return;
      focus.cancel();
      const xs = points.map(point => point.x), ys = points.map(point => point.y);
      const left = Math.min(...xs), right = Math.max(...xs);
      const top = Math.min(...ys), bottom = Math.max(...ys);
      // Keep the settlement horizontally centered. Fit the actual vertical span
      // rather than reserving an equally large empty margin above and below it.
      const width = 2 * Math.max(Math.abs(left - point.x), Math.abs(right - point.x));
      const height = bottom - top;
      const fitZoom = Math.min(2.5, bounds.width / Math.max(1, width), bounds.height / Math.max(1, height));
      const targetZoom = Math.max(zoom, fitZoom);
      const centeredY = bounds.y + bounds.height / 2 - point.y * targetZoom;
      // Selection never zooms out. When the group cannot fit at the current zoom,
      // prioritize the selected settlement instead of trying to keep every edge visible.
      const targetY = targetZoom > fitZoom ? centeredY : Math.max(bounds.y - top * targetZoom,
        Math.min(bounds.y + bounds.height - bottom * targetZoom, centeredY));
      focus.start({x,y,zoom}, {
        x: bounds.x + bounds.width / 2 - point.x * targetZoom,
        y: targetY,
        zoom: targetZoom,
      });
    },
    update: focus.update,
    finish: focus.finish,
    isAnimating: focus.isActive,
    snapshot: () => ({ zoom, x, y }),
  };
}
import { createMapTransition } from './transitions.js';
