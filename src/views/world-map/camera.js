// Local presentation state only. Map art, markers and timeline effects share
// this transform; fixed chrome and inspection panels stay outside it.
export function createMapCamera(viewport, world, rect, { onTap, onGesture } = {}) {
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
  const zoomAt = (factor, point) => {
    const next = Math.max(1, Math.min(2.5, zoom * factor));
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
    reset: () => { zoom = 1; x = 0; y = 0; apply(); },
    restore: pose => { zoom = pose.zoom; x = pose.x; y = pose.y; apply(); },
    cancel: () => { pointers.clear(); pinch = null; moved = false; viewport.cursor = 'grab'; },
    reveal: (point, right, mapLeft) => {
      x = Math.min(x, rect.x - mapLeft * zoom);
      const px = point.x * zoom + x;
      const py = point.y * zoom + y;
      x += Math.max(rect.x + 120, Math.min(right - 120, px)) - px;
      y += Math.max(rect.y + 170, Math.min(rect.y + rect.height - 100, py)) - py;
      apply();
    },
    snapshot: () => ({ zoom, x, y }),
  };
}
