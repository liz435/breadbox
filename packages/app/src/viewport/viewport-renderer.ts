import * as THREE from "three";
import { frameBus, type FrameSnapshot } from "@/runtime/frame-bus";

const CLEAR_COLOR = 0x1a1a2e;

type SpriteEntry = {
  mesh: THREE.Mesh;
  materialOwned: THREE.MeshBasicMaterial;
  loadedUri: string | null;
};

/**
 * Imperative Three.js renderer that reads from the frame bus each tick.
 * Completely outside React — no state, no re-renders.
 */
export function createViewportRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(CLEAR_COLOR);
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
  camera.position.z = 10;

  // Sprite mesh pool: nodeId → entry
  const sprites = new Map<string, SpriteEntry>();
  // Texture cache: uri → texture
  const textureCache = new Map<string, THREE.Texture>();
  const textureLoader = new THREE.TextureLoader();
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
    // Start loading (async, will appear next frame)
    textureLoader.load(
      uri,
      (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.NearestFilter;
        textureCache.set(uri, tex);
      },
      undefined,
      () => {
        // Load failed — ignore
      },
    );
    return null;
  }

  function syncSprites(snapshot: FrameSnapshot) {
    const { entityStore, nodes } = snapshot;
    const activeNodeIds = new Set<string>();

    for (const [nodeId, entity] of entityStore.entities) {
      if (!entity.visible) continue;
      activeNodeIds.add(nodeId);

      let entry = sprites.get(nodeId);
      if (!entry) {
        const material = new THREE.MeshBasicMaterial({ color: 0x4a9eff, transparent: true });
        const geometry = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        entry = { mesh, materialOwned: material, loadedUri: null };
        sprites.set(nodeId, entry);
      }

      // Position from entity store (written by code nodes)
      entry.mesh.position.set(entity.x, -entity.y, 0);

      // Scale from entity store
      const node = nodes[nodeId];
      const baseW = node && typeof node.data.width === "number" ? (node.data.width as number) : 64;
      const baseH = node && typeof node.data.height === "number" ? (node.data.height as number) : 64;
      entry.mesh.scale.set(baseW * entity.scaleX, baseH * entity.scaleY, 1);

      // Rotation
      entry.mesh.rotation.z = -entity.rotation;

      // Texture or tint — texture from entity URI (which may have been set at init)
      const uri = entity.uri;
      if (uri) {
        const tex = getOrLoadTexture(uri);
        if (tex && entry.loadedUri !== uri) {
          entry.materialOwned.map = tex;
          entry.materialOwned.color.set(0xffffff);
          entry.materialOwned.needsUpdate = true;
          entry.loadedUri = uri;
        }
      } else {
        if (entry.loadedUri !== null) {
          entry.materialOwned.map = null;
          entry.materialOwned.needsUpdate = true;
          entry.loadedUri = null;
        }
        entry.materialOwned.color.set(entity.tint);
      }
    }

    // Remove meshes for deleted entities
    for (const [nodeId, entry] of sprites) {
      if (!activeNodeIds.has(nodeId)) {
        scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.materialOwned.dispose();
        sprites.delete(nodeId);
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

      // Check if trigger input is active
      const outputs = evalResult.outputs[nodeId];
      const audioOut = outputs?.["audio_out"];
      if (!audioOut) continue;

      const volume = typeof node.data.volume === "number" ? (node.data.volume as number) : 1;
      const pitch = typeof node.data.pitch === "number" ? (node.data.pitch as number) : 1;
      const loop = node.data.loop === true;

      // Already playing — update gain/pitch
      const existing = audioSources.get(nodeId);
      if (existing) {
        existing.gainNode.gain.value = volume;
        existing.source.playbackRate.value = pitch;
        existing.source.loop = loop;
        continue;
      }

      // Need to start playing — load buffer if not cached
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

      // Play
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

    // Stop audio for removed nodes
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
    for (const [, entry] of sprites) {
      scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.materialOwned.dispose();
    }
    sprites.clear();
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
    } else if (!frameBus.playing && sprites.size > 0) {
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
      for (const [, tex] of textureCache) {
        tex.dispose();
      }
      textureCache.clear();
      renderer.dispose();
    },
  };
}

export type ViewportRenderer = ReturnType<typeof createViewportRenderer>;
