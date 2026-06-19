import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

// Adds Figma-style trackpad panning to an OrbitControls scene:
//  • two-finger swipe (wheel, no ctrl) -> pan (truck/pedestal)
//  • pinch / Ctrl+wheel -> passed through to OrbitControls (zoom-to-cursor)
//  • drag -> rotate (OrbitControls), right-drag -> pan (OrbitControls)
// Panning moves the camera and the controls target together, so the orbit offset
// is preserved and OrbitControls keeps it.
export default function PanGesture() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as any;

  useEffect(() => {
    const el = gl.domElement;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const pan = new THREE.Vector3();

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // let OrbitControls handle zoom
      if (!controls?.target) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = controls.target as THREE.Vector3;
      const dist = camera.position.distanceTo(target);
      const cam = camera as THREE.PerspectiveCamera;
      const fov = ((cam.fov || 50) * Math.PI) / 180;
      const worldPerPixel = (2 * Math.tan(fov / 2) * dist) / el.clientHeight;
      right.setFromMatrixColumn(camera.matrix, 0);
      up.setFromMatrixColumn(camera.matrix, 1);
      pan.set(0, 0, 0);
      pan.addScaledVector(right, -e.deltaX * worldPerPixel);
      pan.addScaledVector(up, e.deltaY * worldPerPixel);
      camera.position.add(pan);
      target.add(pan);
      controls.update();
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true } as any);
  }, [camera, gl, controls]);

  return null;
}
