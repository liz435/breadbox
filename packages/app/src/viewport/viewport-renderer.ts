import * as THREE from "three";
import { frameBus, type FrameSnapshot } from "@/runtime/frame-bus";

const CLEAR_COLOR = 0x1a1a2e;
const MAX_INSTANCES = 1024;

/**
 * Imperative Three.js renderer that reads from the frame bus each tick.
 * Uses InstancedMesh for batched sprite rendering.
 * Completely outside React — no state, no re-renders.
 */
export function createViewportRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(CLEAR_COLOR);
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
  camera.position.z = 10;

  // Shared geometry for all sprites
  const sharedGeometry = new THREE.PlaneGeometry(1, 1);

  // Instanced mesh for solid-color (untextured) sprites
  const solidMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    vertexColors: false,
  });
  // We use per-instance color via InstancedMesh's setColorAt
  solidMaterial.onBeforeCompile = (shader) => {
    // Ensure instance colors work
    shader.fragmentShader = shader.fragmentShader;
  };

  const solidBatch = new THREE.InstancedMesh(sharedGeometry, solidMaterial, MAX_INSTANCES);
  solidBatch.count = 0;
  solidBatch.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_INSTANCES * 3),
    3,
  );
  scene.add(solidBatch);

  // Textured sprite batches: one InstancedMesh per unique texture
  type TextureBatch = {
    mesh: THREE.InstancedMesh;
    material: THREE.MeshBasicMaterial;
    count: number;
  };
  const textureBatches = new Map<string, TextureBatch>();

  // Texture cache: uri → texture
  const textureCache = new Map<string, THREE.Texture>();
  const textureLoader = new THREE.TextureLoader();

  // Temp objects for matrix computation (reuse to avoid GC pressure)
  const tmpMatrix = new THREE.Matrix4();
  const tmpPosition = new THREE.Vector3();
  const tmpQuaternion = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const tmpEuler = new THREE.Euler();

  // Track which nodeIds map to which batch slot
  type SpriteSlot = {
    batchKey: string; // "solid" or texture uri
    index: number;
  };
  const spriteSlots = new Map<string, SpriteSlot>();

  // Audio state
  let audioCtx: AudioContext | null = null;
  const audioBuffers = new Map<string, AudioBuffer>();
  const audioSources = new Map<string, { source: AudioBufferSourceNode; gainNode: GainNode }>();
  const audioLoading = new Set<string>();

  let rafId = 0;
  let mounted = false;
  let width = 800;
  let height = 600;

  function getOrLoadTexture(uri: string): THREE.Texture | null {
    const cached = textureCache.get(uri);
    if (cached) return cached;
    textureLoader.load(
      uri,
      (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.NearestFilter;
        textureCache.set(uri, tex);
      },
      undefined,
      () => { /* Load failed — ignore */ },
    );
    return null;
  }

  function getOrCreateTextureBatch(uri: string, texture: THREE.Texture): TextureBatch {
    let batch = textureBatches.get(uri);
    if (batch) return batch;

    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    const mesh = new THREE.InstancedMesh(sharedGeometry, mat, MAX_INSTANCES);
    mesh.count = 0;
    scene.add(mesh);
    batch = { mesh, material: mat, count: 0 };
    textureBatches.set(uri, batch);
    return batch;
  }

  function syncSprites(snapshot: FrameSnapshot) {
    const { entityStore, nodes } = snapshot;

    // Reset all batch counts
    solidBatch.count = 0;
    for (const batch of textureBatches.values()) {
      batch.count = 0;
    }
    spriteSlots.clear();

    // Counters for each batch
    let solidIndex = 0;
    const textureIndices = new Map<string, number>();

    for (const [nodeId, entity] of entityStore.entities) {
      if (!entity.visible) continue;

      const node = nodes[nodeId];
      const baseW = node && typeof node.data.width === "number" ? (node.data.width as number) : 64;
      const baseH = node && typeof node.data.height === "number" ? (node.data.height as number) : 64;

      // Build transform matrix
      tmpPosition.set(entity.x, -entity.y, 0);
      tmpEuler.set(0, 0, -entity.rotation);
      tmpQuaternion.setFromEuler(tmpEuler);
      tmpScale.set(baseW * entity.scaleX, baseH * entity.scaleY, 1);
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);

      const uri = entity.uri;

      if (uri) {
        // Textured sprite
        const texture = getOrLoadTexture(uri);
        if (!texture) {
          // Texture not loaded yet — render as solid
          if (solidIndex < MAX_INSTANCES) {
            solidBatch.setMatrixAt(solidIndex, tmpMatrix);
            tmpColor.set(entity.tint);
            solidBatch.setColorAt(solidIndex, tmpColor);
            spriteSlots.set(nodeId, { batchKey: "solid", index: solidIndex });
            solidIndex++;
          }
          continue;
        }

        const batch = getOrCreateTextureBatch(uri, texture);
        const idx = textureIndices.get(uri) ?? 0;
        if (idx < MAX_INSTANCES) {
          batch.mesh.setMatrixAt(idx, tmpMatrix);
          spriteSlots.set(nodeId, { batchKey: uri, index: idx });
          textureIndices.set(uri, idx + 1);
          batch.count = idx + 1;
        }
      } else {
        // Solid color sprite
        if (solidIndex < MAX_INSTANCES) {
          solidBatch.setMatrixAt(solidIndex, tmpMatrix);
          tmpColor.set(entity.tint);
          solidBatch.setColorAt(solidIndex, tmpColor);
          spriteSlots.set(nodeId, { batchKey: "solid", index: solidIndex });
          solidIndex++;
        }
      }
    }

    // Finalize batch counts and flag for GPU upload
    solidBatch.count = solidIndex;
    if (solidIndex > 0) {
      solidBatch.instanceMatrix.needsUpdate = true;
      if (solidBatch.instanceColor) solidBatch.instanceColor.needsUpdate = true;
    }

    for (const [uri, batch] of textureBatches) {
      const count = textureIndices.get(uri) ?? 0;
      batch.mesh.count = count;
      if (count > 0) {
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Remove texture batches with no instances (texture no longer in use)
    for (const [uri, batch] of textureBatches) {
      if (batch.mesh.count === 0) {
        scene.remove(batch.mesh);
        batch.mesh.dispose();
        batch.material.dispose();
        textureBatches.delete(uri);
      }
    }
  }

  function syncAudio(snapshot: FrameSnapshot) {
    const { evalResult, nodes } = snapshot;
    const activeAudioIds = new Set<string>();

    for (const nodeId of evalResult.order) {
      const node = nodes[nodeId];
      if (!node || node.type !== "audio") continue;

      const uri = typeof node.data.uri === "string" ? (node.data.uri as string) : null;
      if (!uri) continue;
      activeAudioIds.add(nodeId);

      const outputs = evalResult.outputs[nodeId];
      const audioOut = outputs?.["audio_out"];
      if (!audioOut) continue;

      const volume = typeof node.data.volume === "number" ? (node.data.volume as number) : 1;
      const pitch = typeof node.data.pitch === "number" ? (node.data.pitch as number) : 1;
      const loop = node.data.loop === true;

      const existing = audioSources.get(nodeId);
      if (existing) {
        existing.gainNode.gain.value = volume;
        existing.source.playbackRate.value = pitch;
        existing.source.loop = loop;
        continue;
      }

      if (!audioCtx) {
        audioCtx = new AudioContext();
      }
      const buffer = audioBuffers.get(uri);
      if (!buffer) {
        if (!audioLoading.has(uri)) {
          audioLoading.add(uri);
          fetch(uri)
            .then((res) => res.arrayBuffer())
            .then((ab) => audioCtx!.decodeAudioData(ab))
            .then((decoded) => {
              audioBuffers.set(uri, decoded);
              audioLoading.delete(uri);
            })
            .catch(() => audioLoading.delete(uri));
        }
        continue;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = pitch;
      source.loop = loop;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = volume;
      source.connect(gainNode).connect(audioCtx.destination);
      source.start();
      source.onended = () => {
        audioSources.delete(nodeId);
      };
      audioSources.set(nodeId, { source, gainNode });
    }

    for (const [nodeId, entry] of audioSources) {
      if (!activeAudioIds.has(nodeId)) {
        entry.source.stop();
        entry.source.disconnect();
        entry.gainNode.disconnect();
        audioSources.delete(nodeId);
      }
    }
  }

  function clearScene() {
    solidBatch.count = 0;
    for (const [, batch] of textureBatches) {
      scene.remove(batch.mesh);
      batch.mesh.dispose();
      batch.material.dispose();
    }
    textureBatches.clear();
    spriteSlots.clear();
    stopAllAudio();
  }

  function stopAllAudio() {
    for (const [, entry] of audioSources) {
      try {
        entry.source.stop();
        entry.source.disconnect();
        entry.gainNode.disconnect();
      } catch {
        // Already stopped
      }
    }
    audioSources.clear();
  }

  function tick() {
    if (!mounted) return;

    const snapshot = frameBus.current;
    if (snapshot && frameBus.playing) {
      syncSprites(snapshot);
      syncAudio(snapshot);
    } else if (!frameBus.playing && (solidBatch.count > 0 || textureBatches.size > 0)) {
      clearScene();
    }

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function updateCamera() {
    const halfW = width / 2;
    const halfH = height / 2;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }

  return {
    mount(container: HTMLElement) {
      width = container.clientWidth || 800;
      height = container.clientHeight || 600;
      renderer.setSize(width, height);
      updateCamera();
      container.appendChild(renderer.domElement);
      mounted = true;
      rafId = requestAnimationFrame(tick);
    },

    resize(w: number, h: number) {
      width = w;
      height = h;
      renderer.setSize(w, h);
      updateCamera();
    },

    unmount() {
      mounted = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      renderer.domElement.remove();
    },

    dispose() {
      mounted = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      clearScene();
      solidBatch.dispose();
      solidMaterial.dispose();
      sharedGeometry.dispose();
      for (const [, tex] of textureCache) {
        tex.dispose();
      }
      textureCache.clear();
      renderer.dispose();
    },
  };
}

export type ViewportRenderer = ReturnType<typeof createViewportRenderer>;
